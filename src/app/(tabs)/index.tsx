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
  // Set once the server has answered, so a late on-phone copy never covers fresher numbers.
  const serverLoaded = useRef(false);
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
      const [progress, profileOK, , streak] = await Promise.all([getTodayProgress(timeZone), reloadProfile(), refreshQuests(), getFocusStreak(timeZone, undefined, owner || undefined).catch(() => undefined)]);
      if (currentDataScope.current !== expectedScope) return;
      serverLoaded.current = true;
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
  // Show today's numbers as last saved on this phone at once (offline, or
  // while the server is still answering after signing in), never a false 0.
  useEffect(() => {
    if (!owner || updatedAt !== null) return;
    let live = true;
    void readHomeSnapshot(owner, dateKey(new Date(), timeZone)).then(snapshot => {
      if (!live || !snapshot || serverLoaded.current) return;
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
  // Until today's numbers arrive (from this phone or the server), show a dash, not a 0.
  const known = updatedAt !== null;
  const isGoalComplete = known && (goalCompleted || remainingSeconds === 0);
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
  // A session that just finished keeps the card in its session shape until its
  // result is closed, so nothing jumps under the saving screen and the card.
  const settling = accessMode === "online" && !hasOpenSession && !timer.summaryViewed && !timer.restoreError && !timer.actionError
    && timer.syncStatus !== "rejected" && (timer.isCompleted || timer.endingSession || timer.sessionEnded);
  const needsReview = !settling && !!(timer.restoreError || (timer.endingSession && timer.actionError) || (timer.isCompleted && !sessionSummary));
  const goalShare = Math.min(1, safeCompletedSeconds / Math.max(1, dailyGoalMinutes * 60));

  // An exam within a week puts "Revise" first in the Start row.
  const nextExam = upcomingExams(plan.exams).find(exam => daysUntil(exam.examDate) <= 7 && plan.courses.some(course => course.id === exam.courseId));
  const nextCourse = nextExam ? plan.courses.find(course => course.id === nextExam.courseId) ?? null : null;
  const examDays = nextExam ? daysUntil(nextExam.examDate) : 0;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <TourScrollView testID="home-viewport" tourRoute="/" tourBottomInset={dockHeight} style={styles.viewport} showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: dockHeight + 16 }]}>
        <ContentReveal>
        <View testID="home-layout" style={styles.layout}>
          {/* You: your companion and level on the left, Settings on the right. */}
          <TourAnchor id="home-identity"><View style={styles.identityRow}>
            <View ref={avatar} collapsable={false}>
              <TouchableOpacity testID="home-avatar" style={styles.avatarFrame} onPress={openProfile} accessibilityRole="button" accessibilityLabel="Open Profile" accessibilityHint="Your companion, level, badges and categories">
                <ProgressRing size={64} stroke={3} progress={levelShare / 100} color={colors.level} track={colors.levelSoft}>
                  <View style={styles.avatarDisc}><CharacterMark size={42} avatar={profile?.avatar ?? "🌱"} /></View>
                </ProgressRing>
              </TouchableOpacity>
            </View>
            <View style={styles.identity}>
              <View accessible accessibilityRole="header" accessibilityLabel={homeWelcome(hour < 5 ? 18 : hour, profile?.username)}>
                <Text style={styles.greeting} numberOfLines={1}>{greeting},</Text>
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
            <View ref={settingsIcon} collapsable={false}><CircleButton icon="settings-outline" size={44} label="Open Settings" onPress={() => openFrom(settingsIcon, "/settings")} testID="home-settings" /></View>
          </View></TourAnchor>
          {(loadError || questsError) && <TouchableOpacity onPress={() => void loadData()} disabled={refreshing}
            accessibilityRole="button" accessibilityLabel="Retry loading Home" style={styles.retry}>
            <Text style={styles.retryText}>{refreshing ? "Refreshing…" : "Couldn't refresh Home. Tap to retry."}</Text>
          </TouchableOpacity>}

          {/* Today: minutes done against the goal, the streak, and one bar. */}
          <TourAnchor id="home-focus"><View style={[styles.today, isGoalComplete && styles.todayDone]} testID="home-today">
            <View style={styles.todayHead}>
              <View style={[styles.statusPill, isGoalComplete && styles.statusPillDone]}><Text style={[styles.statusText, isGoalComplete && styles.statusTextDone]}>{isGoalComplete ? "Goal reached" : "Today"}</Text></View>
              <View style={styles.streakRow}><Ionicons name="flame" size={16} color={streakDays > 0 ? colors.streak : colors.tertiary} /><Text style={[styles.streakText, streakDays > 0 && styles.streakOn]} numberOfLines={1}>{streakDays > 0 ? `${streakDays}-day streak` : known ? "A fresh start" : "Checking your streak"}</Text></View>
              <MoreMenu label="Today options" testID="home-today-menu" options={[
                { label: accessMode === "online" ? "Change daily goal" : "Change goal · needs internet", icon: "flag-outline", onPress: openGoal, disabled: accessMode !== "online" },
                { label: "Open Progress", icon: "stats-chart-outline", onPress: openProgress },
              ]} />
            </View>
            <TouchableOpacity testID="home-compact-goal" onPress={() => setTodayOpen(true)} style={styles.goalBody} accessibilityRole="button"
              accessibilityLabel={`Daily effort goal. ${dailyGoalRatio(safeCompletedSeconds, dailyGoalMinutes)}${isGoalComplete ? ", goal reached" : ""}. Show today`}>
              <View accessible accessibilityRole="progressbar" accessibilityLabel="Today's goal" accessibilityValue={{ min: 0, max: dailyGoalMinutes * 60, now: Math.min(safeCompletedSeconds, dailyGoalMinutes * 60), text: dailyGoalRatio(safeCompletedSeconds, dailyGoalMinutes) }} style={styles.goalNumbers}>
                <Text style={styles.ringValue} numberOfLines={1}>{known ? Math.floor(safeCompletedSeconds / 60) : "–"}</Text>
                <Text style={styles.ringUnit} numberOfLines={1}>/ {dailyGoalMinutes} min</Text>
              </View>
              <Text style={styles.goalHeadline} numberOfLines={2}>{!known ? `${dailyGoalMinutes} min goal` : isGoalComplete ? "Nicely done today" : `${Math.max(1, Math.ceil(remainingSeconds / 60))} min to go`}</Text>
              <View style={styles.goalTrack}><View style={[styles.goalFill, { width: `${known ? Math.max(goalShare > 0 ? 3 : 0, Math.round(goalShare * 100)) : 0}%` }, isGoalComplete && { backgroundColor: colors.success }]} /></View>
              {/* The floating session bar is the one way back, so the card only says so. */}
              {(hasOpenSession || settling) && !needsReview && <Text style={styles.offlineNote} numberOfLines={1} testID="home-session-note">{settling ? "Session finished" : timer.isRunning ? "Session in progress" : "Session paused"}</Text>}
              {accessMode !== "online" && <Text style={styles.offlineNote} numberOfLines={1} testID="home-offline-note">{updatedAt ? `Updated ${clockTime(updatedAt)}` : "Updates when you're online"}</Text>}
            </TouchableOpacity>
            {needsReview && <TouchableOpacity onPress={openSession} accessibilityRole="button" accessibilityLabel="Review saved session" style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Review saved session</Text>
            </TouchableOpacity>}
          </View></TourAnchor>

          {/* Start: your routines as chips, then Any activity. An exam this week leads. */}
          <TourAnchor id="home-quests"><SavedRoutinesCard layout="start" subjects={subjects} active={accessMode === "online" || subjects.length > 0} legacyTasks={tasks} onStartLegacy={openQuestSession}
            limit={3} suggestions={false} onSeeAll={() => router.navigate("/routines")} onAnyActivity={justFocus}
            lead={nextCourse && !hasOpenSession && !settling && !needsReview ? <TouchableOpacity testID="home-revise" onPress={() => launcher.study(nextCourse)} accessibilityRole="button"
              accessibilityLabel={`Revise ${nextCourse.name}. ${examDays === 0 ? "Exam today" : examDays === 1 ? "Exam tomorrow" : `Exam in ${examDays} days`}`} style={styles.reviseChip}>
              <View style={styles.revisePlay}><Ionicons name="play" size={14} color={colors.primary} style={styles.nudge} /></View>
              <View style={styles.goalCopy}><Text style={styles.reviseTitle} numberOfLines={1}>Revise {nextCourse.name}</Text><Text style={styles.reviseDetail} numberOfLines={1}>{examDays === 0 ? "Exam today" : examDays === 1 ? "Exam tomorrow" : `Exam in ${examDays} days`}</Text></View>
            </TouchableOpacity> : undefined} /></TourAnchor>

          {/* The rest of the week, quieter: two tiles side by side, then exams and milestones. */}
          <View style={styles.pair}><HomeWeek tile /><HomeSquad tile /></View>
          <HomeExams />
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
  layout: { gap: 16 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 },
  identity: { flex: 1, minWidth: 0, gap: 6 },
  greeting: { color: colors.secondary, fontSize: 15, lineHeight: 20 },
  name: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.6 },
  levelChip: { alignSelf: "flex-start", maxWidth: "100%", minHeight: 30, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4, paddingRight: 10, borderRadius: 15, backgroundColor: colors.levelSoft },
  levelBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.level },
  levelNumber: { color: "#2B2200", fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  levelTitle: { flexShrink: 1, color: colors.level, fontSize: 14, lineHeight: 18, fontWeight: "700" },
  levelTrack: { width: 36, height: 5, borderRadius: 3, backgroundColor: "rgba(251,191,36,0.22)", overflow: "hidden" },
  levelFill: { height: 5, borderRadius: 3, backgroundColor: colors.level },
  avatarFrame: { width: 68, height: 68, alignItems: "center", justifyContent: "center" },
  avatarDisc: { ...edge, width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised },
  today: { ...edge, padding: 18, gap: 12, borderRadius: radius.card, backgroundColor: colors.surface },
  todayDone: { borderColor: "rgba(52,211,153,0.28)" },
  todayHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusPill: { minHeight: 28, paddingHorizontal: 12, borderRadius: 14, justifyContent: "center", backgroundColor: colors.accentSoft },
  statusPillDone: { backgroundColor: "rgba(52,211,153,0.16)" },
  statusText: { color: colors.neutral, fontSize: 14, lineHeight: 18, fontWeight: "600" },
  statusTextDone: { color: colors.success },
  goalBody: { gap: 8 },
  goalNumbers: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  goalCopy: { flex: 1, minWidth: 0, gap: 2 },
  goalHeadline: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: "600" },
  goalTrack: { height: 8, borderRadius: 4, backgroundColor: colors.accentSoft, overflow: "hidden", marginTop: 4 },
  goalFill: { height: 8, borderRadius: 4, backgroundColor: colors.progress },
  streakRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  streakText: { flexShrink: 1, color: colors.secondary, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  streakOn: { color: colors.streak },
  offlineNote: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  ringValue: { color: colors.text, fontSize: 44, lineHeight: 50, fontWeight: "800", letterSpacing: -1.2, fontVariant: ["tabular-nums"] },
  ringUnit: { color: colors.secondary, fontSize: 17, lineHeight: 22, fontWeight: "500" },
  reviseChip: { flexBasis: "100%", flexGrow: 1, minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingLeft: 10, paddingRight: 14, borderRadius: radius.row, backgroundColor: colors.primary },
  revisePlay: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryText },
  reviseTitle: { color: colors.primaryText, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  reviseDetail: { color: colors.primaryText, opacity: 0.8, fontSize: 13, lineHeight: 17, fontWeight: "500" },
  nudge: { marginLeft: 2 },
  pair: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  primaryButton: { backgroundColor: colors.primary, minHeight: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", padding: 14 },
  primaryButtonText: { color: colors.primaryText, fontSize: 16, lineHeight: 22, fontWeight: "600", textAlign: "center" },
  retry: { paddingVertical: 4 },
  retryText: { color: colors.danger, fontSize: 13 },
});

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
