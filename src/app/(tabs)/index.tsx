import { tapHaptic } from "../../utils/tapHaptics";
import { TourAnchor, TourScrollView } from "../../components/FeatureTour";
import DailyGoalSheet from "../../components/DailyGoalSheet";
import type { Task } from "../../services/taskService";
import { floatingDockKey, useFloatingDockHeight } from "../../context/FloatingDockContext";
import TouchableOpacity from "../../components/MotionPressable";
import { floatingTabInset } from "../../utils/floatingTabInset";
import { Text } from "../../components/AppText";
import InitialsAvatar from "../../components/InitialsAvatar";
import ContentReveal from "../../components/ContentReveal";
import { creditedDailySeconds } from "../../utils/progressionAccounting";
import { dailyGoalRatio } from "../../utils/dailyGoalPresentation";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { homeWelcome } from "../../utils/homeWelcome";
import { singleFlight } from "../../utils/singleFlight";
import { useHomeLifecycle } from "../../hooks/useHomeLifecycle";
import SavedRoutinesCard from "../../components/SavedRoutinesCard";
import { HomeCircle } from "../../components/HomeSections";
import TodaySheet from "../../components/TodaySheet";
import MoreMenu from "../../components/MoreMenu";
import { CircleButton } from "../../components/SectionHeader";
import { useStudyPlan } from "../../hooks/useStudyPlan";
import { useStudyLauncher } from "../../hooks/useStudyLauncher";
import { useJustFocus } from "../../hooks/useJustFocus";
import { courseColor, daysUntil, upcomingExams } from "../../utils/studyPlan";
import { rememberSettingsOrigin } from "../../utils/settingsOrigin";
import { useAuth } from "../../context/AuthContext";
import { useQuests } from "../../context/QuestContext";
import { colors } from "../../constants/theme";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { useWindowDimensions, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTimer } from "../../context/TimerContext";
import { useUser } from "../../context/UserContext";
import { getFocusStreakDetail } from "../../services/progressService";
import { DEFAULT_TIMEZONE, dateKey, shiftDay } from "../../utils/progressAnalytics";
import { readHomeSnapshot, saveHomeSnapshot } from "../../services/homeSnapshot";
import { getTodayProgress } from "../../services/dailyProgressService";
import { prefetchCharacterData } from "../../hooks/useCharacterData";
import { prefetchProgress } from "../../hooks/useProgressData";

/**
 * Today is home and there is no tab bar: today's goal, one-tap starts, the
 * week, and a short list that opens Routines, Study, Squads and Your rhythm.
 * Each of those comes back here.
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
  const { hasOpenSession, sessionSummary, cloudSaveVersion = 0 } = timer;
  const { tasks, subjects = [], error: questsError, refresh: refreshQuests } = useQuests();
  const [goalSettings, setGoalSettings] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);
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
  // Rest days ready, and whether one kept the streak going yesterday.
  const [rest, setRest] = useState({ days: 0, yesterday: false });
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
  const [todayGoal, setTodayGoal] = useState<{ owner: string; day: string; minutes: number | null } | null>(null);
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
      const [progress, profileOK, , streak] = await Promise.all([getTodayProgress(timeZone), reloadProfile(), refreshQuests(), getFocusStreakDetail(timeZone, undefined, owner || undefined).catch(() => undefined)]);
      if (currentDataScope.current !== expectedScope) return;
      serverLoaded.current = true;
      if (streak !== undefined) { setFocusStreak(streak.current); setRest({ days: streak.restDays, yesterday: streak.rested.includes(shiftDay(dateKey(new Date(), timeZone), -1)) }); }
      const seconds = progress ? creditedDailySeconds(progress) : 0, savedAtMs = Date.now();
      setTodayGoal({ owner, day: progress?.progress_date ?? dateKey(new Date(), timeZone), minutes: progress?.goal_minutes ?? null });
      setCompletedSeconds(seconds);
      setGoalCompleted(progress?.goal_completed ?? false);
      setUpdatedAt(savedAtMs);
      setLoadError(profileOK === false || streak === undefined);
      if (owner) void saveHomeSnapshot(owner, { day: dateKey(new Date(), timeZone), completedSeconds: seconds, goalMinutes: progress?.goal_minutes ?? null,
        goalCompleted: progress?.goal_completed ?? false, streak: streak?.current ?? null, savedAtMs });
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
      setCompletedSeconds(snapshot.completedSeconds); setTodayGoal({ owner, day: snapshot.day, minutes: snapshot.goalMinutes }); setGoalCompleted(snapshot.goalCompleted);
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
  const lastSaved = useRef<{ owner: string; summary: unknown; cloud: number } | null>(null);
  useEffect(() => {
    const previous = lastSaved.current;
    lastSaved.current = { owner, summary: sessionSummary, cloud: cloudSaveVersion };
    if (sessionSummary && (previous?.owner !== owner || previous.summary !== sessionSummary)
      || cloudSaveVersion > 0 && (previous?.owner !== owner || previous.cloud !== cloudSaveVersion)) void loadData(true);
  }, [owner, sessionSummary, cloudSaveVersion, loadData]);

  // The profile keeps the original baseline after a scheduled change. Only
  // today's ledger or saved daily snapshot can establish the current target.
  const verifiedGoal = todayGoal?.owner === owner && todayGoal.day === dateKey(new Date(), timeZone) ? todayGoal.minutes : null;
  const goalKnown = verifiedGoal != null;
  const dailyGoalMinutes = verifiedGoal ?? 0;
  const safeCompletedSeconds = Math.max(0, completedSeconds);
  const remainingSeconds = Math.max(0, dailyGoalMinutes * 60 - safeCompletedSeconds);
  const displayName = profile?.username?.trim() || "You";
  // Until today's numbers arrive (from this phone or the server), show a dash, not a 0.
  const known = updatedAt !== null;
  const isGoalComplete = known && goalKnown && (goalCompleted || remainingSeconds === 0);
  const streakDays = Math.max(0, focusStreak ?? 0);

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
  // Start holds routines and study subjects together: up to two subjects,
  // the ones you studied most recently first, and routines fill the rest, so
  // with Any activity the chips stay an even two by two. A subject with an
  // exam this week already leads as Revise.
  const lastStudied = new Map<string, number>();
  for (const item of plan.recent) lastStudied.set(item.courseId, Math.max(lastStudied.get(item.courseId) ?? 0, item.completedAt));
  const studyCourses = plan.courses.filter(course => course.deletedAt == null && course.id !== nextCourse?.id)
    .sort((a, b) => (lastStudied.get(b.id) ?? 0) - (lastStudied.get(a.id) ?? 0) || a.name.localeCompare(b.name)).slice(0, 2);
  const studyChips = studyCourses.map(course => ({ key: course.id, name: course.name, caption: "Study", color: courseColor(course.id), onPress: () => launcher.study(course) }));
  // Every subject, for See all.
  const allStudyChips = plan.courses.filter(course => course.deletedAt == null)
    .sort((a, b) => (lastStudied.get(b.id) ?? 0) - (lastStudied.get(a.id) ?? 0) || a.name.localeCompare(b.name))
    .map(course => ({ key: course.id, name: course.name, caption: course.id === nextCourse?.id ? `Revise · ${examDays === 0 ? "exam today" : examDays === 1 ? "exam tomorrow" : `exam in ${examDays} days`}` : "Study",
      color: courseColor(course.id), onPress: () => launcher.study(course) }));

  // An exam this week becomes Up next when no routine is due later today.
  const examUpNext = nextCourse && !hasOpenSession && !settling && !needsReview ? {
    label: `Revise · ${examDays === 0 ? "exam today" : examDays === 1 ? "exam tomorrow" : `exam in ${examDays} days`}`, title: nextCourse.name,
    detail: "Study · Revision", action: `Revise ${nextCourse.name}`, onPress: () => launcher.study(nextCourse), testID: "home-revise",
  } : null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <TourScrollView testID="home-viewport" tourRoute="/" tourBottomInset={dockHeight} style={styles.viewport} showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: dockHeight + 24 }]}>
        <ContentReveal>
        <View testID="home-layout" style={styles.layout}>
          {/* The name, then Settings and you. */}
          <TourAnchor id="home-identity"><View style={styles.topRow}>
            <Text style={styles.wordmark} accessibilityRole="header">LifeRPG.</Text>
            <View ref={settingsIcon} collapsable={false}><CircleButton icon="options-outline" size={44} label="Open Settings" onPress={() => openFrom(settingsIcon, "/settings")} testID="home-settings" /></View>
            <View ref={avatar} collapsable={false}>
              <TouchableOpacity testID="home-avatar" style={styles.avatarFrame} onPress={openProfile} accessibilityRole="button" accessibilityLabel="Open Profile" accessibilityHint="Your name, categories and account">
                <InitialsAvatar name={displayName} id={profile?.id} size={44} />
              </TouchableOpacity>
            </View>
          </View></TourAnchor>
          {/* The day, and the way to your rhythm. */}
          <View style={styles.titleRow}>
            <TouchableOpacity testID="home-name" style={styles.nameButton} onPress={openProfile} accessibilityRole="button" accessibilityLabel={`${homeWelcome(hour < 5 ? 18 : hour, profile?.username)}. Open Profile`}>
              <Text style={styles.dateLabel} numberOfLines={1}>{todayLabel(timeZone)}</Text>
              <Text style={styles.title} numberOfLines={1}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="home-open-rhythm" onPress={openProgress} accessibilityRole="button" accessibilityLabel="Your rhythm" style={styles.link}>
              <Text style={styles.linkText}>Your rhythm</Text><Ionicons name="arrow-up-outline" size={15} color={colors.accent} style={styles.northEast} />
            </TouchableOpacity>
          </View>
          {(loadError || questsError) && <TouchableOpacity onPress={() => void loadData()} disabled={refreshing}
            accessibilityRole="button" accessibilityLabel="Retry loading Home" style={styles.retry}>
            <Text style={styles.retryText}>{refreshing ? "Refreshing…" : "Couldn't refresh Today. Tap to retry."}</Text>
          </TouchableOpacity>}
          {needsReview && <TouchableOpacity onPress={openSession} accessibilityRole="button" accessibilityLabel="Review saved session" style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Review saved session</Text>
          </TouchableOpacity>}

          {/* Up next, then the rest of today: one tap from a session. */}
          <TourAnchor id="home-quests"><SavedRoutinesCard layout="today" subjects={subjects} active={accessMode === "online" || subjects.length > 0} legacyTasks={tasks} onStartLegacy={openQuestSession}
            limit={4} suggestions={false} studyChips={studyChips} allStudyChips={allStudyChips} onSeeAll={() => router.navigate("/routines")} onAnyActivity={justFocus} upNext={examUpNext} /></TourAnchor>

          {/* Time for yourself today: minutes against the goal, and the streak. */}
          <TourAnchor id="home-focus"><View style={styles.today} testID="home-today">
            <TouchableOpacity testID="home-compact-goal" onPress={() => setTodayOpen(true)} style={styles.goalBody} accessibilityRole="button"
              accessibilityLabel={goalKnown ? `Daily effort goal. ${dailyGoalRatio(safeCompletedSeconds, dailyGoalMinutes)}${isGoalComplete ? ", goal reached" : ""}. Show today` : `Daily effort goal. ${loadError || known ? "Today’s goal is unavailable" : "Checking today’s goal"}. Show today`}>
              <View style={styles.goalHead}>
                <Text style={styles.goalLabel} numberOfLines={1}>{!goalKnown ? loadError || known ? "Goal unavailable" : "Time for yourself today" : isGoalComplete ? "Time for yourself today · goal reached" : "Time for yourself today"}</Text>
                <View accessible accessibilityRole="progressbar" accessibilityLabel="Today's goal" accessibilityValue={goalKnown ? { min: 0, max: dailyGoalMinutes * 60, now: Math.min(safeCompletedSeconds, dailyGoalMinutes * 60), text: dailyGoalRatio(safeCompletedSeconds, dailyGoalMinutes) } : { text: "Today’s goal is not available yet" }} style={styles.goalNumbers}>
                  <Text style={styles.ringValue} numberOfLines={1}>{known ? Math.floor(safeCompletedSeconds / 60) : "–"}</Text>
                  <Text style={styles.ringUnit} numberOfLines={1}>/ {goalKnown ? dailyGoalMinutes : "–"} min</Text>
                </View>
              </View>
              <View style={styles.goalTrack}><View style={[styles.goalFill, { width: `${known && goalKnown ? Math.max(goalShare > 0 ? 3 : 0, Math.round(goalShare * 100)) : 0}%` }, isGoalComplete && { backgroundColor: colors.success }]} /></View>
            </TouchableOpacity>
            <View style={styles.todayFoot}>
              <View style={styles.streakRow}><Ionicons name="flame" size={15} color={streakDays > 0 ? colors.streak : colors.tertiary} /><Text style={[styles.streakText, streakDays > 0 && styles.streakOn]} numberOfLines={1}>{streakDays > 0 ? `${streakDays}-day streak${rest.days ? ` · ${rest.days} rest` : ""}` : known ? "A fresh start" : "Checking your streak"}</Text></View>
              {/* The floating session bar is the one way back, so this only says so. */}
              {(hasOpenSession || settling) && !needsReview && <Text style={styles.offlineNote} numberOfLines={1} testID="home-session-note">{settling ? "Session finished" : timer.isRunning ? "Session in progress" : "Session paused"}</Text>}
              {accessMode !== "online" && <Text style={styles.offlineNote} numberOfLines={1} testID="home-offline-note">{updatedAt ? `Updated ${clockTime(updatedAt)}` : "Updates when you're online"}</Text>}
              <MoreMenu label="Today options" testID="home-today-menu" options={[
                { label: accessMode === "online" ? "Change daily goal" : "Change goal · needs internet", icon: "flag-outline", onPress: openGoal, disabled: accessMode !== "online" },
                { label: "Open your rhythm", icon: "stats-chart-outline", onPress: openProgress },
              ]} />
            </View>
          </View></TourAnchor>

          {/* Your circle: who's focusing, one tap from the whole squad. */}
          <TourAnchor id="home-places"><HomeCircle /></TourAnchor>
        </View>
        </ContentReveal>
      </TourScrollView>
      <TodaySheet visible={todayOpen} canChangeGoal={accessMode === "online"} onClose={() => setTodayOpen(false)} completedSeconds={safeCompletedSeconds} goalMinutes={dailyGoalMinutes} goalKnown={goalKnown} todayKnown={known} streakKnown={focusStreak !== null}
        streak={streakDays} restDays={rest.days} restedYesterday={rest.yesterday} complete={isGoalComplete} onChangeGoal={openGoal} onOpenProgress={openProgress} />
      <DailyGoalSheet todayGoalMinutes={verifiedGoal ?? undefined} visible={accessMode === "online" && goalSettings} onClose={() => setGoalSettings(false)} onSaved={() => void loadData()} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  viewport: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 16, maxWidth: 600, width: "100%", alignSelf: "center" },
  layout: { gap: 22 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8 },
  wordmark: { flex: 1, color: colors.text, fontSize: 28, lineHeight: 34, fontFamily: "display", letterSpacing: -0.5 },
  avatarFrame: { width: 44, alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: -6 },
  nameButton: { flexShrink: 1, minWidth: 0, gap: 2 },
  dateLabel: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 54, lineHeight: 60, fontFamily: "display", letterSpacing: -1.4 },
  link: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 3, paddingBottom: 6 },
  linkText: { color: colors.accent, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  northEast: { transform: [{ rotate: "45deg" }] },
  today: { gap: 10 },
  goalBody: { gap: 10 },
  goalHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  goalLabel: { flexShrink: 1, color: colors.text, fontSize: 16, lineHeight: 21 },
  goalNumbers: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  goalCopy: { flex: 1, minWidth: 0, gap: 2 },
  goalTrack: { height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: "hidden" },
  goalFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  todayFoot: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 10 },
  streakRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  streakText: { flexShrink: 1, color: colors.secondary, fontSize: 14, lineHeight: 19, fontWeight: "500" },
  streakOn: { color: colors.streak },
  offlineNote: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  ringValue: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "700", fontVariant: ["tabular-nums"] },
  ringUnit: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "700" },
  primaryButton: { backgroundColor: colors.primary, minHeight: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", padding: 14 },
  primaryButtonText: { color: colors.primaryText, fontSize: 16, lineHeight: 22, fontWeight: "600", textAlign: "center" },
  retry: { paddingVertical: 4 },
  retryText: { color: colors.danger, fontSize: 13 },
});

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
/** "FRIDAY, 30 OCTOBER" for today in your time zone, without relying on the phone's date formats. */
function todayLabel(timeZone: string) {
  const [year, month, day] = dateKey(new Date(), timeZone).split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}, ${day} ${MONTHS[month - 1]}`;
}
const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
