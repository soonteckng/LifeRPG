import type { Task } from "../../services/taskService";
import { floatingDockKey, useFloatingDockHeight } from "../../context/FloatingDockContext";
import { questLists } from "../../utils/questLists";
import TouchableOpacity from "../../components/MotionPressable";
import { floatingTabInset } from "../../utils/floatingTabInset";
import { Text } from "../../components/AppText";
import { lifeAreaColor } from "../../utils/lifeAreaColor";
import { validSessionSeconds, durationLabel as sessionDurationLabel } from "../../utils/sessionSetup";
import GoalRing from "../../components/GoalRing";
import CharacterMark from "../../components/CharacterMark";
import ContentReveal from "../../components/ContentReveal";
import { creditedDailySeconds, hasExactDailyCredit } from "../../utils/progressionAccounting";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { homeWelcome } from "../../utils/homeWelcome";
import { singleFlight } from "../../utils/singleFlight";
import { useHomeLifecycle } from "../../hooks/useHomeLifecycle";
import QuestSheet from "../../components/QuestSheet";
import { useQuests } from "../../context/QuestContext";
import { colors } from "../../constants/theme";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { ScrollView, useWindowDimensions, StyleSheet, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useTimer } from "../../context/TimerContext";
import { useUser } from "../../context/UserContext";
import { getLastFreeSession, type QuickStartSession, getFocusStreak } from "../../services/progressService";
import { DEFAULT_TIMEZONE, durationLabel } from "../../utils/progressAnalytics";
import { getTodayProgress } from "../../services/dailyProgressService";

export default function HomeScreen() {
  const router = useRouter();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const timer = useTimer();
  const dockEstimate = floatingTabInset(useBottomTabBarHeight(), insets.bottom, timer);
  const bannerVisible = !!(timer.hasOpenSession || (timer.sessionSummary && !timer.summaryViewed));
  const dockKey = floatingDockKey(bannerVisible, insets.bottom, width, fontScale);
  const dockHeight = useFloatingDockHeight(dockKey, dockEstimate);
  const { profile, reloadProfile, hapticsEnabled } = useUser();

  const { setLinkedTaskId, setDurationInMinutes, setTargetAttributeId, hasOpenSession, sessionSummary } = timer;
  const { tasks, subjects = [], loading: areasLoading, error: questsError, refresh: refreshQuests } = useQuests();

  const [lastFree, setLastFree] = useState<{ owner: string; session: QuickStartSession | null } | null>(null);
  const [quickStarting, setQuickStarting] = useState(false);
  const [attempt, setAttempt] = useState<{ owner: string; seconds: number; areaId: number | null; title: string } | null>(null);
  const [quickError, setQuickError] = useState(false);
  const quickLock = useRef(false);
  const owner = profile?.id ?? "";
  useEffect(() => {
    let cancelled = false;
    if (owner) void getLastFreeSession(owner).then(session => {
      if (!cancelled) setLastFree({ owner, session });
    }).catch(() => { /* A history outage leaves the explicit 30-minute default usable. */ });
    return () => { cancelled = true; };
  }, [owner, sessionSummary]);
  const candidate = lastFree?.owner === owner ? lastFree.session : null;
  const previous = candidate && candidate.task_id == null && candidate.duration_seconds >= 300 && validSessionSeconds(candidate.duration_seconds) ? candidate : null;
  const rememberedSeconds = previous?.duration_seconds ?? 1800;
  const general = subjects.find(area => area.title.trim().toLowerCase() === "general");
  const quickArea = subjects.find(area => area.id === previous?.subject_id) ?? general;
  const retainedAttempt = (quickError || quickStarting) && attempt?.owner === owner ? attempt : null;
  const quickSeconds = retainedAttempt?.seconds ?? rememberedSeconds;
  const quickAreaId = retainedAttempt ? retainedAttempt.areaId : quickArea?.id ?? null;
  const quickTitle = retainedAttempt?.title ?? quickArea?.title ?? "General";
  const activeSubject = subjects.find(area => area.id === timer.targetAttributeId);
  const activeArea = activeSubject?.title ?? "General";
  const blocked = !!(timer.actionBusy || timer.isRestoring || timer.restoreError || (timer.isCompleted && !sessionSummary));

  const [completedSeconds, setCompletedSeconds] = useState(0);
  const [exactCredit, setExactCredit] = useState(false);
  const [focusStreak, setFocusStreak] = useState<number | null>(null);
  const timeZone = profile?.timezone || DEFAULT_TIMEZONE;
  const [goalCompleted, setGoalCompleted] = useState(false);
  const [todayGoal, setTodayGoal] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [questsVisible, setQuestsVisible] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  // Content paints behind the floating dock; only scroll padding reserves
  // clearance for the final row. Size the hero against the unobstructed space.
  const availableHeight = Math.max(280, (viewportHeight || height - insets.top) - dockHeight - 8);
  const goalSize = Math.round(Math.max(144, Math.min(
    (width - 40) * 0.60, availableHeight * 0.29, fontScale > 1.5 ? 160 : 232,
  )));
  const loadData = useMemo(() => singleFlight(async () => {
    setRefreshing(true);
    try {
      const [progress, profileOK, , streak] = await Promise.all([getTodayProgress(timeZone), reloadProfile(), refreshQuests(), getFocusStreak(timeZone).catch(() => undefined)]);
      if (streak !== undefined) setFocusStreak(streak);
      setTodayGoal(progress?.goal_minutes ?? null);
      setCompletedSeconds(progress ? creditedDailySeconds(progress) : 0);
      setExactCredit(progress ? hasExactDailyCredit(progress) : false);
      setGoalCompleted(progress?.goal_completed ?? false);
      setLoadError(profileOK === false || streak === undefined);
    } catch {
      setLoadError(true);
    } finally { setRefreshing(false); }
  }), [reloadProfile, refreshQuests, timeZone]);
  const hour = useHomeLifecycle(loadData);

  // A successful completion updates the saved session summary before this fires.
  // Refresh goal progress even while Home was covered by Session/rewards.
  useEffect(() => {
    if (sessionSummary) void loadData(true);
  }, [sessionSummary, loadData]);

  const dailyGoalMinutes = todayGoal ?? profile?.daily_goal_minutes ?? 60;
  const safeCompletedSeconds = Math.max(0, completedSeconds);
  const remainingSeconds = Math.max(0, dailyGoalMinutes * 60 - safeCompletedSeconds);

  const level = profile?.level ?? 1;

  const activeTasks = useMemo(
    () => questLists(tasks).today,
    [tasks],
  );

  const greeting = homeWelcome(hour < 5 ? 18 : hour, profile?.username?.trim().split(/\s+/)[0]);
  const isGoalComplete = goalCompleted || remainingSeconds === 0;
  const streakDays = Math.max(0, focusStreak ?? 0);

  const openSession = () => {
    setQuestsVisible(false);
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    router.navigate("/session");
  };

  const openQuestSession = (task: Task) => {
    // Existing sessions and unresolved completion/restoration always win.
    if (!hasOpenSession && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !(timer.isCompleted && !sessionSummary)) {
      setLinkedTaskId(task.id);
      setDurationInMinutes(task.target_minutes || 30);
      setTargetAttributeId(task.subject_id ?? null);
    }
    openSession();
  };

  const changeSession = () => {
    setQuickError(false);
    setAttempt(null);
    if (!hasOpenSession && !blocked && !quickLock.current) {
      setLinkedTaskId(null);
      setTargetAttributeId(quickAreaId);
      timer.setActivityType("other");
      timer.setNotes("");
      timer.setDurationInSeconds(quickSeconds);
    }
    openSession();
  };
  const startFreeSession = async () => {
    if (hasOpenSession) { openSession(); return; }
    if (quickLock.current || blocked || areasLoading) return;
    quickLock.current = true;
    setAttempt({ owner, seconds: quickSeconds, areaId: quickAreaId, title: quickTitle });
    setQuickStarting(true);
    setQuickError(false);
    try {
      const started = await timer.startFreeTimer(quickSeconds, quickAreaId);
      if (started) openSession();
      else setQuickError(true);
    } catch { setQuickError(true); }
    finally { quickLock.current = false; setQuickStarting(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView testID="home-viewport" style={styles.viewport} scrollEnabled={contentHeight > viewportHeight + 1}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, nextHeight) => setContentHeight(nextHeight)}
        contentContainerStyle={[styles.content, { paddingBottom: dockHeight + 16 }]}>
        <ContentReveal>
        <View testID="home-layout" style={[styles.layout, { minHeight: Math.max(0, viewportHeight - dockHeight - 28) }]}>
          <View style={styles.identityRow}>
            <CharacterMark size={44} avatar={profile?.avatar ?? "🌱"} />
            <View style={styles.identity}>
              <Text style={styles.greeting} accessibilityLabel={homeWelcome(hour < 5 ? 18 : hour, profile?.username)} accessibilityRole="header" numberOfLines={1}>{greeting}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{profile?.class_title || "Growing through focus"}</Text>
            </View>
          </View>
          {(loadError || questsError) && <TouchableOpacity onPress={() => void loadData()} disabled={refreshing}
            accessibilityRole="button" accessibilityLabel="Retry loading Home" style={styles.retry}>
            <Text style={styles.retryText}>{refreshing ? "Refreshing…" : "Couldn't refresh Home. Tap to retry."}</Text>
          </TouchableOpacity>}
          <View style={styles.goalSection}>
            <GoalRing seconds={safeCompletedSeconds} targetMinutes={dailyGoalMinutes} size={goalSize}
              label={exactCredit ? `${durationLabel(safeCompletedSeconds)} / ${dailyGoalMinutes} min` : `${safeCompletedSeconds / 60} / ${dailyGoalMinutes} min`} />
            <Text style={styles.goalHint}>{isGoalComplete ? "Goal reached. You made time for what matters." : safeCompletedSeconds > 0
              ? `You showed up. ${durationLabel(remainingSeconds)} to today's goal.` : "One small session is a good place to start."}</Text>
          <View style={styles.focusCard} testID="home-quick-start">
            <Text style={styles.focusHeading}>{hasOpenSession ? (timer.isRunning ? "In focus" : "Paused") : "Ready to focus"}</Text>
            <View style={styles.focusChoice}>
              <View style={[styles.focusDot, { backgroundColor: lifeAreaColor(hasOpenSession ? timer.targetAttributeId : quickAreaId, (hasOpenSession ? activeSubject : subjects.find(area => area.id === quickAreaId))?.color_code) }]} />
              <Text style={styles.focusValue}>{hasOpenSession ? sessionDurationLabel(timer.timeLeft) : sessionDurationLabel(quickSeconds)}</Text>
              <Text style={styles.focusArea}>· {hasOpenSession ? activeArea : quickTitle}</Text>
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={() => void startFreeSession()}
              testID="home-start-focus" disabled={quickStarting || (!hasOpenSession && (blocked || !!areasLoading))}
              accessibilityRole="button" accessibilityState={{ disabled: quickStarting || (!hasOpenSession && (blocked || !!areasLoading)), busy: quickStarting }}
              accessibilityLabel={hasOpenSession ? "Continue session" : `Start ${sessionDurationLabel(quickSeconds)}, ${quickTitle}`}>
              <Ionicons name="play-outline" size={22} color="#171827" />
              <Text style={styles.primaryButtonText}>{hasOpenSession ? "Continue session" : quickStarting ? "Starting…" : quickError ? "Retry start" : timer.isRestoring ? "Restoring session…" : "Start focus"}</Text>
            </TouchableOpacity>
            {!hasOpenSession && <TouchableOpacity testID="home-change-focus" style={styles.changeButton} onPress={changeSession}
              disabled={quickStarting || !!timer.actionBusy} accessibilityRole="button" accessibilityLabel={blocked ? "Check session status" : "Change duration or area"}>
              <Text style={styles.link}>{blocked ? "Check session status" : "Change duration or area"}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accent} />
            </TouchableOpacity>}
            {quickError && <Text accessibilityRole="alert" style={styles.quickError}>{timer.actionError ?? "Couldn't start. Please try again."}</Text>}
          </View>
          </View>
          <View style={styles.questCard} testID="home-quest-card">
            <View style={styles.questHeading}>
              <View style={styles.questHeadingText}>
                <Text style={styles.sectionTitle} accessibilityRole="header">{"Today's quests"}</Text>
                <Text style={styles.questCount}>{activeTasks.length ? `${activeTasks.length} remaining` : "Make room for what matters"}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Today's quests, ${activeTasks.length} pending`}
                onPress={() => setQuestsVisible(true)} style={styles.allButton}>
                <Text style={styles.link}>{activeTasks.length ? "View all" : "Add quest"}</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.accent} />
              </TouchableOpacity>
            </View>
            {activeTasks.slice(0, 3).map((task, index) => {
              const area = subjects.find(subject => subject.id === task.subject_id);
              const tint = lifeAreaColor(task.subject_id, area?.color_code);
              return <TouchableOpacity key={task.id} style={[styles.questRow, index > 0 && styles.questDivider]}
                testID={`home-quest-${task.id}`} accessibilityRole="button"
                accessibilityLabel={`${task.title}. ${task.target_minutes || 30} minutes, ${area?.title ?? "General"}. ${hasOpenSession ? "Continue current session" : "Open session setup"}`}
                onPress={() => openQuestSession(task)}>
                <View style={[styles.questIcon, { backgroundColor: `${tint}18` }]}>
                  <Ionicons name="flag-outline" size={20} color={tint} />
                </View>
                <View style={styles.questDetail}>
                  <Text style={styles.questTitle} numberOfLines={2}>{task.title}</Text>
                  <Text style={styles.questMeta} numberOfLines={1}>{task.target_minutes || 30} min · {area?.title ?? "General"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.secondary} />
              </TouchableOpacity>;
            })}
            {activeTasks.length === 0 && <TouchableOpacity style={styles.emptyQuest} onPress={() => setQuestsVisible(true)} accessibilityRole="button" accessibilityLabel="Open today's quests">
              <View style={styles.questIcon}><Ionicons name="flag-outline" size={20} color={colors.accent} /></View>
              <Text style={styles.emptyText}>Choose one thing to focus on.
Your quests will appear here.</Text>
              <Ionicons name="chevron-forward" size={17} color={colors.secondary} />
            </TouchableOpacity>}
          </View>
          <View style={styles.footer}>
            <View style={styles.chip}><Ionicons name="flame-outline" size={16} color={colors.accent} />
              <Text style={styles.chipText}>{streakDays > 0 ? `${streakDays} days` : "A fresh start"}</Text></View>
            <View style={styles.chip}><Text style={styles.chipText}>Level {level}</Text></View>
          </View>
        </View>
        </ContentReveal>
      </ScrollView>
      <QuestSheet visible={questsVisible} onClose={() => setQuestsVisible(false)} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  viewport: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  layout: { flexGrow: 1 },
  identityRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  identity: { flex: 1, minWidth: 0 },
  greeting: { color: colors.text, fontSize: 20, fontWeight: "500", letterSpacing: -0.4 },
  subtitle: { color: colors.secondary, fontSize: 14, lineHeight: 20, marginTop: 4 },
  goalSection: { flexGrow: 1, flexShrink: 0, justifyContent: "center", alignItems: "center", paddingTop: 16, paddingBottom: 16, gap: 12 },
  goalHint: { textAlign: "center", color: colors.secondary, fontSize: 16, lineHeight: 22, maxWidth: 340 },
  focusCard: { width: "100%", borderRadius: 22, backgroundColor: "#171E2B", padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(225,235,255,0.12)" },
  focusHeading: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  focusChoice: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, paddingBottom: 4 },
  focusDot: { width: 7, height: 7, borderRadius: 4 },
  focusValue: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "500", fontVariant: ["tabular-nums"] },
  focusArea: { color: colors.secondary, fontSize: 16, lineHeight: 22, flexShrink: 1 },
  changeButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  quickError: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  primaryButton: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.28)", backgroundColor: "#E5E4FF", width: "100%", minHeight: 52, borderRadius: 16, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", padding: 14 },
  primaryButtonText: { color: "#171827", fontSize: 16, fontWeight: "500" },
  questCard: { marginTop: 12, borderRadius: 22, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, backgroundColor: "#171E2B", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(225,235,255,0.12)" },
  questHeading: { flexDirection: "row", gap: 8, justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  questHeadingText: { flex: 1, minWidth: 0, gap: 4 },
  sectionTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "500", letterSpacing: -0.3 },
  questCount: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  allButton: { flexDirection: "row", gap: 3, alignItems: "center", minHeight: 44, paddingLeft: 4 },
  link: { color: colors.accent, fontSize: 15, fontWeight: "500" },
  questRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  questDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(225,235,255,0.08)" },
  questIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(175,169,236,0.10)", alignItems: "center", justifyContent: "center" },
  questDetail: { flex: 1, minWidth: 0, gap: 3 },
  questTitle: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: "500" },
  questMeta: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  emptyQuest: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 12 },
  emptyText: { flex: 1, color: colors.secondary, fontSize: 14, lineHeight: 21 },
  footer: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 16 },
  chip: { flexDirection: "row", gap: 6, alignItems: "center", borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: 12, minHeight: 36, paddingVertical: 8 },
  chipText: { color: colors.secondary, fontSize: 14, fontWeight: "500" },
  retry: { marginTop: 12, paddingVertical: 10 },
  retryText: { color: colors.danger, fontSize: 13 },
});
