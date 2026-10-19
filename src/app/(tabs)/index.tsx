import { tapHaptic } from "../../utils/tapHaptics";
import { TourAnchor, TourScrollView } from "../../components/FeatureTour";
import LevelTierSheet from "../../components/LevelTierSheet";
import DailyGoalSheet from "../../components/DailyGoalSheet";
import type { Task } from "../../services/taskService";
import { floatingDockKey, useFloatingDockHeight } from "../../context/FloatingDockContext";
import TouchableOpacity from "../../components/MotionPressable";
import { floatingTabInset } from "../../utils/floatingTabInset";
import { Text } from "../../components/AppText";
import CharacterMark from "../../components/CharacterMark";
import ContentReveal from "../../components/ContentReveal";
import ProgressRing from "../../components/ProgressRing";
import { levelTierProgress, requiredCharacterXP } from "../../utils/levelTiers";
import { creditedDailySeconds } from "../../utils/progressionAccounting";
import { dailyGoalRatio } from "../../utils/dailyGoalPresentation";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { homeWelcome } from "../../utils/homeWelcome";
import { singleFlight } from "../../utils/singleFlight";
import { useHomeLifecycle } from "../../hooks/useHomeLifecycle";
import SavedRoutinesCard from "../../components/SavedRoutinesCard";
import { HomeExams, HomeMilestones, HomeSquad, HomeWeek } from "../../components/HomeSections";
import TodaySheet from "../../components/TodaySheet";
import MoreMenu from "../../components/MoreMenu";
import { CircleButton } from "../../components/SectionHeader";
import { useStudyPlan } from "../../hooks/useStudyPlan";
import { useStudyLauncher } from "../../hooks/useStudyLauncher";
import { useJustFocus } from "../../hooks/useJustFocus";
import { daysUntil, upcomingExams } from "../../utils/studyPlan";
import { rememberSettingsOrigin } from "../../utils/settingsOrigin";
import { useAuth } from "../../context/AuthContext";
import { useQuests } from "../../context/QuestContext";
import { colors, radius, edge } from "../../constants/theme";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { useWindowDimensions, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTimer } from "../../context/TimerContext";
import { useUser } from "../../context/UserContext";
import { getFocusStreak } from "../../services/progressService";
import { DEFAULT_TIMEZONE, dateKey } from "../../utils/progressAnalytics";
import { readHomeSnapshot, saveHomeSnapshot } from "../../services/homeSnapshot";
import { getTodayProgress } from "../../services/dailyProgressService";
import { prefetchCharacterData } from "../../hooks/useCharacterData";
import { prefetchProgress } from "../../hooks/useProgressData";

/**
 * Home is a dashboard: today's goal, what's coming up and how the week is
 * going. Sessions are set up in Routines and Study; Home links to both.
 */
export default function HomeScreen() {
  const { accessMode, admissionEpoch } = useAuth();
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const timer = useTimer({ live: false });
  const dockEstimate = floatingTabInset(useBottomTabBarHeight(), insets.bottom, timer);
  const bannerVisible = !!(timer.hasOpenSession || (timer.sessionSummary && !timer.summaryViewed));
  const dockHeight = useFloatingDockHeight(floatingDockKey(bannerVisible, insets.bottom, width, fontScale), dockEstimate);
  const { profile, reloadProfile, hapticsEnabled } = useUser();
  const owner = profile?.id ?? "";
  const { hasOpenSession, sessionSummary } = timer;
  const { tasks, subjects = [], error: questsError, refresh: refreshQuests } = useQuests();
  const [goalSettings, setGoalSettings] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);
  const [tiersOpen, setTiersOpen] = useState(false);
  const plan = useStudyPlan(), launcher = useStudyLauncher(plan.exams), justFocus = useJustFocus();
  const avatar = useRef<View>(null), settingsIcon = useRef<View>(null);
  // Profile and Settings grow out of their button, then shrink back into it.
  const openFrom = (source: RefObject<View | null>, path: "/profile" | "/settings") => {
    let opened = false;
    const open = () => { if (!opened) { opened = true; router.navigate(path); } };
    const fallback = setTimeout(open, 100);
    source.current?.measureInWindow((x, y, width, height) => { if (opened) return; clearTimeout(fallback); rememberSettingsOrigin({ x, y, width, height }); open(); });
  };
  const openProfile = () => openFrom(avatar, "/profile");
  const [surfaceMode, setSurfaceMode] = useState(accessMode);
  if (surfaceMode !== accessMode) {
    setSurfaceMode(accessMode);
    // Changing the goal needs the server; everything else on Home stays open offline.
    if (accessMode !== "online") setGoalSettings(false);
  }

  const [completedSeconds, setCompletedSeconds] = useState(0);
  const [focusStreak, setFocusStreak] = useState<number | null>(null);
  const timeZone = profile?.timezone || DEFAULT_TIMEZONE;
  // Once Home has settled, ready Profile and Progress quietly so their first
  // visit is already drawn. Each loads at most once until it goes stale.
  useEffect(() => {
    if (!owner || accessMode !== "online") return;
    const later = setTimeout(() => { prefetchCharacterData(owner, sessionSummary); prefetchProgress(owner, timeZone); }, 1500);
    return () => clearTimeout(later);
    // Only an account, mode or zone change asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, accessMode, timeZone]);
  const [goalCompleted, setGoalCompleted] = useState(false);
  const [todayGoal, setTodayGoal] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // When today's numbers were last read from the server; shown while offline.
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const dataScope = JSON.stringify([owner, accessMode, admissionEpoch, timeZone]);
  const menuView = useMemo(() => ({ dataScope }), [dataScope]);
  const currentMenuView = useRef<typeof menuView | null>(menuView);
  const currentDataScope = useRef<string | null>(dataScope);
  useLayoutEffect(() => {
    currentMenuView.current = menuView;
    currentDataScope.current = dataScope;
    return () => { currentDataScope.current = null; currentMenuView.current = null; };
  }, [dataScope, menuView]);
  const openGoal = () => { if (accessMode === "online" && currentMenuView.current === menuView) setGoalSettings(true); };
  const openProgress = () => { if (currentMenuView.current === menuView) router.navigate("/progress"); };
  const loadHomeData = useCallback(async () => {
    if (accessMode !== "online") return;
    const expectedScope = dataScope;
    setRefreshing(true);
    try {
      const [progress, profileOK, , streak] = await Promise.all([getTodayProgress(timeZone), reloadProfile(), refreshQuests(), getFocusStreak(timeZone).catch(() => undefined)]);
      if (currentDataScope.current !== expectedScope) return;
      if (streak !== undefined) setFocusStreak(streak);
      const seconds = progress ? creditedDailySeconds(progress) : 0, savedAtMs = Date.now();
      setTodayGoal(progress?.goal_minutes ?? null);
      setCompletedSeconds(seconds);
      setGoalCompleted(progress?.goal_completed ?? false);
      setUpdatedAt(savedAtMs);
      setLoadError(profileOK === false || streak === undefined);
      if (owner) void saveHomeSnapshot(owner, { day: dateKey(new Date(), timeZone), completedSeconds: seconds, goalMinutes: progress?.goal_minutes ?? null,
        goalCompleted: progress?.goal_completed ?? false, streak: streak ?? null, savedAtMs });
    } catch {
      if (currentDataScope.current === expectedScope) setLoadError(true);
    } finally { if (currentDataScope.current === expectedScope) setRefreshing(false); }
  }, [reloadProfile, refreshQuests, timeZone, accessMode, dataScope, owner]);
  // Opened offline: show today's numbers as last saved on this phone.
  useEffect(() => {
    if (accessMode === "online" || !owner || updatedAt !== null) return;
    let live = true;
    void readHomeSnapshot(owner, dateKey(new Date(), timeZone)).then(snapshot => {
      if (!live || !snapshot) return;
      setCompletedSeconds(snapshot.completedSeconds); setTodayGoal(snapshot.goalMinutes); setGoalCompleted(snapshot.goalCompleted);
      if (snapshot.streak !== null) setFocusStreak(snapshot.streak);
      setUpdatedAt(snapshot.savedAtMs);
    });
    return () => { live = false; };
  }, [accessMode, owner, timeZone, updatedAt]);
  // singleFlight stores this callback; it only invokes it from lifecycle events, never during render.
  // eslint-disable-next-line react-hooks/refs
  const loadData = useMemo(() => singleFlight(loadHomeData), [loadHomeData]);
  const hour = useHomeLifecycle(loadData);
  const previousAccess = useRef(accessMode);
  useEffect(() => {
    const previous = previousAccess.current; previousAccess.current = accessMode;
    if (previous === "local-only" && accessMode === "online") void loadData();
  }, [accessMode, loadData]);

  // A successful completion updates the saved session summary before this fires.
  // Refresh goal progress even while Home was covered by Session/rewards.
  useEffect(() => {
    if (sessionSummary) void loadData(true);
  }, [sessionSummary, loadData]);

  const dailyGoalMinutes = todayGoal ?? profile?.daily_goal_minutes ?? 60;
  const safeCompletedSeconds = Math.max(0, completedSeconds);
  const remainingSeconds = Math.max(0, dailyGoalMinutes * 60 - safeCompletedSeconds);
  const level = profile?.level ?? 1;
  const levelShare = Math.max(0, Math.min(99, Math.floor(((profile?.current_xp ?? 0) / requiredCharacterXP(level)) * 100)));
  const tier = levelTierProgress(level, profile?.current_xp ?? 0).current;
  const displayName = profile?.username?.trim() || "Hero";
  const greeting = homeWelcome(hour < 5 ? 18 : hour, displayName).split(",")[0];
  const isGoalComplete = goalCompleted || remainingSeconds === 0;
  const streakDays = Math.max(0, focusStreak ?? 0);
  const feedback = () => { if (hapticsEnabled) tapHaptic(); };

  const openSession = () => {
    timer.reviewSummary?.();
    if (hapticsEnabled) tapHaptic("medium");
    router.navigate("/session");
  };
  // Old routines keep their task link; the setup screen confirms before starting.
  const openQuestSession = (task: Task) => {
    if (!hasOpenSession && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !(timer.isCompleted && !sessionSummary)) {
      timer.setNotes(""); timer.setLinkedTaskId(task.id);
      timer.setDurationInMinutes(task.target_minutes || 30); timer.setTargetAttributeId(task.subject_id ?? null);
    }
    openSession();
  };
  const needsReview = !!(timer.restoreError || (timer.endingSession && timer.actionError) || (timer.isCompleted && !sessionSummary));
  const goalShare = Math.min(1, safeCompletedSeconds / Math.max(1, dailyGoalMinutes * 60));

  // The Today card suggests one next step: revise for an exam this week, or just focus.
  const nextExam = upcomingExams(plan.exams).find(exam => daysUntil(exam.examDate) <= 7 && plan.courses.some(course => course.id === exam.courseId));
  const nextCourse = nextExam ? plan.courses.find(course => course.id === nextExam.courseId) ?? null : null;
  const examDays = nextExam ? daysUntil(nextExam.examDate) : 0;
  const primary = nextCourse ? { title: `Revise ${nextCourse.name}`, detail: examDays === 0 ? "Exam today" : examDays === 1 ? "Exam tomorrow" : `Exam in ${examDays} days`, onPress: () => launcher.study(nextCourse), testID: "home-revise" }
    : { title: "Start focusing", detail: "Any activity, your time", onPress: justFocus, testID: "home-just-focus" };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <TourScrollView testID="home-viewport" tourRoute="/" tourBottomInset={dockHeight} style={styles.viewport} showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: dockHeight + 16 }]}>
        <ContentReveal>
        <View testID="home-layout" style={styles.layout}>
          <TourAnchor id="home-identity"><View style={styles.identityRow}>
            <View style={styles.identity}>
              <View accessible accessibilityRole="header" accessibilityLabel={homeWelcome(hour < 5 ? 18 : hour, profile?.username)}>
                <Text style={styles.greeting}>{greeting},</Text>
                <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{displayName}</Text>
              </View>
              {/* The level reads as a badge you can open, not a line of small print. */}
              <TouchableOpacity testID="home-level" style={styles.levelChip} hitSlop={8} onPress={() => { feedback(); setTiersOpen(true); }} accessibilityRole="button"
                accessibilityLabel={`Level ${level}, ${tier.title}, ${levelShare}% of the way to level ${level + 1}. See your level journey`} haptic={false}>
                <View style={styles.levelBadge}><Text style={styles.levelNumber}>{level}</Text></View>
                <Text style={styles.levelTitle} numberOfLines={1}>{tier.title}</Text>
                <View style={styles.levelTrack}><View style={[styles.levelFill, { width: `${Math.max(4, levelShare)}%` }]} /></View>
                <Ionicons name="chevron-forward" size={13} color={colors.level} />
              </TouchableOpacity>
            </View>
            <View style={styles.headerActions}>
              <View ref={settingsIcon} collapsable={false}><CircleButton icon="settings-outline" size={40} label="Open Settings" onPress={() => openFrom(settingsIcon, "/settings")} testID="home-settings" /></View>
              <View ref={avatar} collapsable={false}>
                <TouchableOpacity testID="home-avatar" style={styles.avatarFrame} onPress={openProfile} accessibilityRole="button" accessibilityLabel="Open Profile" accessibilityHint="Your companion, level, badges and categories">
                  <ProgressRing size={60} stroke={3} progress={levelShare / 100} color={colors.level} track={colors.levelSoft}>
                    <View style={styles.avatarDisc}><CharacterMark size={40} avatar={profile?.avatar ?? "🌱"} /></View>
                  </ProgressRing>
                </TouchableOpacity>
              </View>
            </View>
          </View></TourAnchor>
          {(loadError || questsError) && <TouchableOpacity onPress={() => void loadData()} disabled={refreshing}
            accessibilityRole="button" accessibilityLabel="Retry loading Home" style={styles.retry}>
            <Text style={styles.retryText}>{refreshing ? "Refreshing…" : "Couldn't refresh Home. Tap to retry."}</Text>
          </TouchableOpacity>}

          <TourAnchor id="home-focus"><View style={styles.today} testID="home-today">
            <View style={styles.todayMenu}><MoreMenu label="Today options" testID="home-today-menu" options={[
              { label: accessMode === "online" ? "Change daily goal" : "Change goal · needs internet", icon: "flag-outline", onPress: openGoal, disabled: accessMode !== "online" },
              { label: "Open Progress", icon: "stats-chart-outline", onPress: openProgress },
            ]} /></View>
            <TouchableOpacity testID="home-compact-goal" onPress={() => setTodayOpen(true)} style={styles.goalRow} accessibilityRole="button"
              accessibilityLabel={`Daily effort goal. ${dailyGoalRatio(safeCompletedSeconds, dailyGoalMinutes)}${isGoalComplete ? ", goal reached" : ""}. Show today`}>
              <View accessible accessibilityRole="progressbar" accessibilityLabel="Today's goal" accessibilityValue={{ min: 0, max: dailyGoalMinutes * 60, now: Math.min(safeCompletedSeconds, dailyGoalMinutes * 60), text: dailyGoalRatio(safeCompletedSeconds, dailyGoalMinutes) }}>
                <ProgressRing size={108} stroke={9} progress={goalShare} color={isGoalComplete ? colors.success : colors.accent} track={colors.accentSoft}>
                  <Text style={styles.ringValue} numberOfLines={1} adjustsFontSizeToFit>{Math.floor(safeCompletedSeconds / 60)}</Text>
                  <Text style={styles.ringUnit} numberOfLines={1} adjustsFontSizeToFit>of {dailyGoalMinutes} min</Text>
                </ProgressRing>
              </View>
              <View style={[styles.goalCopy, styles.todayCopy]}>
                <Text style={styles.goalLabel}>{isGoalComplete ? "Goal reached" : "Today"}</Text>
                <Text style={styles.goalHeadline} numberOfLines={2}>{isGoalComplete ? "Nicely done today" : `${Math.max(1, Math.ceil(remainingSeconds / 60))} min to go`}</Text>
                <View style={styles.streakRow}><Ionicons name="flame" size={14} color={streakDays > 0 ? colors.streak : colors.tertiary} /><Text style={styles.streakText}>{streakDays > 0 ? `${streakDays}-day streak` : "A fresh start"}</Text></View>
                {/* The floating session bar is the one way back, so the card only says so. */}
                {hasOpenSession && !needsReview && <Text style={styles.offlineNote} numberOfLines={1} testID="home-session-note">{timer.isRunning ? "Session in progress" : "Session paused"}</Text>}
                {accessMode !== "online" && <Text style={styles.offlineNote} numberOfLines={1} testID="home-offline-note">{updatedAt ? `Updated ${clockTime(updatedAt)}` : "Updates when you're online"}</Text>}
              </View>
            </TouchableOpacity>
            {needsReview ? <TouchableOpacity onPress={openSession} accessibilityRole="button" accessibilityLabel="Review saved session" style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Review saved session</Text>
            </TouchableOpacity> : hasOpenSession ? null : <View style={styles.starts}>
              <TouchableOpacity testID={primary.testID} onPress={primary.onPress} accessibilityRole="button" accessibilityLabel={`${primary.title}. ${primary.detail}`} style={styles.nextButton}>
                <View style={styles.goalCopy}><Text style={styles.nextTitle} numberOfLines={1}>{primary.title}</Text><Text style={styles.nextDetail} numberOfLines={1}>{primary.detail}</Text></View>
                <View style={styles.nextPlay}><Ionicons name="play" size={17} color={colors.primary} /></View>
              </TouchableOpacity>
              <TouchableOpacity testID="home-other-session" onPress={nextCourse ? justFocus : () => router.navigate("/routines")} accessibilityRole="button"
                accessibilityLabel={nextCourse ? "Other session. Choose any activity" : "Choose a routine. Opens Routines"} style={styles.otherButton}>
                <Text style={styles.startText} numberOfLines={1}>{nextCourse ? "Other session" : "Choose a routine"}</Text>
                <View style={styles.otherIcon}><Ionicons name={nextCourse ? "add" : "repeat"} size={17} color={colors.accent} /></View>
              </TouchableOpacity>
            </View>}
          </View></TourAnchor>

          <TourAnchor id="home-quests"><SavedRoutinesCard subjects={subjects} active={accessMode === "online" || subjects.length > 0} legacyTasks={tasks} onStartLegacy={openQuestSession}
            limit={2} suggestions={false} onSeeAll={() => router.navigate("/routines")} /></TourAnchor>
          <HomeExams />
          <HomeSquad />
          <HomeWeek />
          <HomeMilestones />
        </View>
        </ContentReveal>
      </TourScrollView>
      <LevelTierSheet level={level} currentXP={profile?.current_xp ?? 0} visible={tiersOpen} onClose={() => setTiersOpen(false)} />
      <TodaySheet visible={todayOpen} canChangeGoal={accessMode === "online"} onClose={() => setTodayOpen(false)} completedSeconds={safeCompletedSeconds} goalMinutes={dailyGoalMinutes}
        streak={streakDays} complete={isGoalComplete} onChangeGoal={openGoal} onOpenProgress={openProgress} />
      <DailyGoalSheet todayGoalMinutes={dailyGoalMinutes} visible={accessMode === "online" && goalSettings} onClose={() => setGoalSettings(false)} onSaved={() => void loadData()} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  viewport: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, maxWidth: 600, width: "100%", alignSelf: "center" },
  layout: { gap: 26 },
  identityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  identity: { flex: 1, minWidth: 0, gap: 8 },
  greeting: { color: colors.secondary, fontSize: 15, lineHeight: 20 },
  name: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: "700", letterSpacing: -0.8 },
  levelChip: { alignSelf: "flex-start", maxWidth: "100%", minHeight: 32, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4, paddingRight: 10, borderRadius: 16, backgroundColor: colors.levelSoft },
  levelBadge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.level },
  levelNumber: { color: "#2B2200", fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  levelTitle: { flexShrink: 1, color: colors.level, fontSize: 14, lineHeight: 18, fontWeight: "700" },
  levelTrack: { width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(255,214,10,0.22)", overflow: "hidden" },
  levelFill: { height: 5, borderRadius: 3, backgroundColor: colors.level },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarFrame: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  todayCopy: { paddingRight: 30 },
  todayMenu: { position: "absolute", top: 12, right: 12, zIndex: 2 },
  avatarDisc: { ...edge, width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  today: { ...edge, padding: 16, gap: 16, borderRadius: radius.card, backgroundColor: colors.surface },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  goalCopy: { flex: 1, minWidth: 0, gap: 4 },
  goalLabel: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.9, textTransform: "uppercase" },
  goalHeadline: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  offlineNote: { color: colors.tertiary, fontSize: 12, lineHeight: 16 },
  streakText: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  ringValue: { color: colors.text, fontSize: 30, lineHeight: 34, fontWeight: "700", letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  ringUnit: { maxWidth: 70, color: colors.secondary, fontSize: 12, lineHeight: 16 },
  starts: { gap: 10 },
  // One suggested next step, and a quieter way to do something else. Both
  // read from the same left edge, with their icon on the right.
  nextButton: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 20, paddingRight: 8, borderRadius: 29, backgroundColor: colors.primary },
  nextTitle: { color: colors.primaryText, fontSize: 16, lineHeight: 21, fontWeight: "700" },
  nextDetail: { color: colors.primaryText, opacity: 0.7, fontSize: 12, lineHeight: 16, fontWeight: "600" },
  nextPlay: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryText },
  otherButton: { ...edge, minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 20, paddingRight: 8, borderRadius: 26, backgroundColor: colors.sheetCard },
  otherIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  startText: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  primaryButton: { backgroundColor: colors.primary, minHeight: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", padding: 14 },
  primaryButtonText: { color: colors.primaryText, fontSize: 16, lineHeight: 22, fontWeight: "600", textAlign: "center" },
  retry: { paddingVertical: 4 },
  retryText: { color: colors.danger, fontSize: 13 },
});

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
