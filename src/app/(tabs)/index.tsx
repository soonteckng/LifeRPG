import GuidedFocusCard from "../../components/GuidedFocusCard";
import GuidedPreferenceSheet from "../../components/GuidedPreferenceSheet";
import { useGuidedPreference } from "../../hooks/useGuidedPreference";
import type { Task } from "../../services/taskService";
import { floatingDockKey, useFloatingDockHeight } from "../../context/FloatingDockContext";
import { questLists } from "../../utils/questLists";
import TouchableOpacity from "../../components/MotionPressable";
import { floatingTabInset } from "../../utils/floatingTabInset";
import { Text } from "../../components/AppText";
import { lifeAreaColor } from "../../utils/lifeAreaColor";
import { validSessionSeconds, durationLabel as sessionDurationLabel } from "../../utils/sessionSetup";
import CharacterMark from "../../components/CharacterMark";
import ContentReveal from "../../components/ContentReveal";
import { creditedDailySeconds } from "../../utils/progressionAccounting";
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
  const guided = useGuidedPreference(owner);
  const [guidedSettings, setGuidedSettings] = useState(false);
  const useGuidance = guided.ready && guided.value.enabled;
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
  const loadData = useMemo(() => singleFlight(async () => {
    setRefreshing(true);
    try {
      const [progress, profileOK, , streak] = await Promise.all([getTodayProgress(timeZone), reloadProfile(), refreshQuests(), getFocusStreak(timeZone).catch(() => undefined)]);
      if (streak !== undefined) setFocusStreak(streak);
      setTodayGoal(progress?.goal_minutes ?? null);
      setCompletedSeconds(progress ? creditedDailySeconds(progress) : 0);
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

  const firstName = profile?.username?.trim().split(/\s+/)[0] || "Hero";
  const greeting = homeWelcome(hour < 5 ? 18 : hour, firstName).split(",")[0];
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
      timer.setNotes("");
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
        <View testID="home-layout" style={[styles.layout, { minHeight: Math.max(0, viewportHeight - dockHeight - 44) }]}>
          <View style={styles.headerBlock}>
            <View style={styles.identityRow}>
              <View style={styles.identity} accessible accessibilityRole="header" accessibilityLabel={homeWelcome(hour < 5 ? 18 : hour, profile?.username)}>
                <Text style={styles.greeting}>{greeting}</Text>
                <Text style={styles.name} numberOfLines={1}>{firstName}</Text>
              </View>
              <View style={styles.avatarFrame}><CharacterMark size={50} avatar={profile?.avatar ?? "🌱"} /></View>
            </View>
            <View style={styles.identityMeta}>
              <View style={styles.identityStat}><Ionicons name="flame-outline" size={15} color={colors.accent} /><Text style={styles.metaText}>{streakDays > 0 ? `${streakDays}-day focus streak` : "A fresh start"}</Text></View>
              <View style={styles.metaDivider} />
              <Text style={styles.metaText}>Level {level}</Text>
            </View>
          </View>
          {(loadError || questsError) && <TouchableOpacity onPress={() => void loadData()} disabled={refreshing}
            accessibilityRole="button" accessibilityLabel="Retry loading Home" style={styles.retry}>
            <Text style={styles.retryText}>{refreshing ? "Refreshing…" : "Couldn't refresh Home. Tap to retry."}</Text>
          </TouchableOpacity>}
          <View style={[styles.goalSection, styles.guidedGoalSection]}>
            <View testID="home-compact-goal" style={styles.guidedGoal} accessible accessibilityRole="progressbar" accessibilityLabel="Today's goal" accessibilityValue={{ min: 0, max: dailyGoalMinutes * 60, now: Math.min(safeCompletedSeconds, dailyGoalMinutes * 60), text: `${durationLabel(safeCompletedSeconds)} of ${dailyGoalMinutes} minutes` }}>
              <View style={styles.guidedGoalHeading}><Text style={styles.focusHeading}>Today’s focus</Text><Text style={styles.questMeta}>{`${durationLabel(safeCompletedSeconds)} / ${dailyGoalMinutes} min`}</Text></View>
              <View style={styles.guidedTrack}><View style={[styles.guidedFill, { width: `${Math.min(100, safeCompletedSeconds / Math.max(1, dailyGoalMinutes * 60) * 100)}%` }]} /></View>
              {isGoalComplete && <Text style={styles.questMeta}>Goal reached. Your effort counts.</Text>}
            </View>
          {!guided.ready ? <View style={styles.focusCard} testID="home-preference-loading">
            <Text style={styles.focusHeading}>{guided.error ? "Your focus preferences need a retry." : "Getting your focus ready…"}</Text>
            {hasOpenSession && <TouchableOpacity onPress={openSession} accessibilityRole="button" style={styles.primaryButton}><Text style={styles.primaryButtonText}>Continue session</Text></TouchableOpacity>}
            {guided.error && <TouchableOpacity onPress={() => void guided.retry()} accessibilityRole="button" style={styles.changeButton}><Text style={styles.link}>Retry loading preferences</Text></TouchableOpacity>}
          </View> : useGuidance ? <GuidedFocusCard key={owner} owner={owner} subjects={subjects} activeTitle={tasks.find(task => task.id === timer.linkedTaskId)?.title} disabled={blocked || areasLoading}
            onStarted={openSession} onFree={changeSession} onPreferences={() => setGuidedSettings(true)} /> : <View style={styles.focusCard} testID="home-quick-start">
            <View style={styles.focusTopRow}>
              <View style={styles.focusInfo}>
                <Text style={styles.focusHeading}>{hasOpenSession ? (timer.isRunning ? "In focus" : "Paused") : "Ready to focus"}</Text>
                <View style={styles.focusChoice}>
                  <View style={[styles.focusDot, { backgroundColor: lifeAreaColor(hasOpenSession ? timer.targetAttributeId : quickAreaId, (hasOpenSession ? activeSubject : subjects.find(area => area.id === quickAreaId))?.color_code) }]} />
                  <Text style={styles.focusValue}>{hasOpenSession ? sessionDurationLabel(timer.timeLeft) : sessionDurationLabel(quickSeconds)}</Text>
                  <Text style={styles.focusArea}>· {hasOpenSession ? activeArea : quickTitle}</Text>
                </View>
              </View>
              {!hasOpenSession && <TouchableOpacity testID="home-change-focus" style={styles.changeButton} onPress={changeSession}
                disabled={quickStarting || !!timer.actionBusy} accessibilityRole="button" accessibilityLabel={blocked ? "Check session status" : "Change duration or area"}>
                <Ionicons name={blocked ? "alert-circle-outline" : "options-outline"} size={17} color={colors.accent} />
                <Text style={styles.link}>{blocked ? "Check" : "Change"}</Text>
              </TouchableOpacity>}
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={() => void startFreeSession()}
              testID="home-start-focus" disabled={quickStarting || (!hasOpenSession && (blocked || !!areasLoading))}
              accessibilityRole="button" accessibilityState={{ disabled: quickStarting || (!hasOpenSession && (blocked || !!areasLoading)), busy: quickStarting }}
              accessibilityLabel={hasOpenSession ? "Continue session" : `Start ${sessionDurationLabel(quickSeconds)}, ${quickTitle}`}>
              <Ionicons name="play-outline" size={22} color="#171827" />
              <Text style={styles.primaryButtonText}>{hasOpenSession ? "Continue session" : quickStarting ? "Starting…" : quickError ? "Retry start" : timer.isRestoring ? "Restoring session…" : "Start focus"}</Text>
            </TouchableOpacity>
            {quickError && <Text accessibilityRole="alert" style={styles.quickError}>{timer.actionError ?? "Couldn't start. Please try again."}</Text>}
          </View>}
          </View>
          {guided.ready && !guided.value.invited && !hasOpenSession && <View style={styles.invitation}>
            <TouchableOpacity onPress={() => setGuidedSettings(true)} accessibilityRole="button" style={styles.invitationMain}>
              <Text style={styles.link}>Want help choosing your next step?</Text><Text style={styles.questMeta}>Try a few study suggestions.</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={guided.busy} onPress={() => void guided.save({ ...guided.value, invited: true })} accessibilityRole="button" accessibilityLabel="Dismiss suggestion invitation" style={styles.changeButton}><Ionicons name="close" size={18} color={colors.secondary} /></TouchableOpacity>
          </View>}
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
            {activeTasks.slice(0, availableHeight < 600 || fontScale > 1.3 ? 1 : 2).map((task, index) => {
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
        </View>
        </ContentReveal>
      </ScrollView>
      <GuidedPreferenceSheet owner={owner} visible={guidedSettings} onClose={() => setGuidedSettings(false)} />
      <QuestSheet visible={questsVisible} onClose={() => setQuestsVisible(false)} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  guidedGoalSection: { flexGrow: 0, paddingTop: 20, gap: 16 },
  guidedGoal: { width: "100%", gap: 8 },
  guidedGoalHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" },
  guidedTrack: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden" },
  guidedFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  invitation: { marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 8 },
  invitationMain: { flex: 1, gap: 4, minHeight: 44, justifyContent: "center" },
  container: { flex: 1, backgroundColor: colors.background },
  viewport: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  layout: { flexGrow: 1 },
  identityRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  identity: { flex: 1, minWidth: 0 },
  headerBlock: { gap: 12, paddingTop: 4 },
  greeting: { color: colors.secondary, fontSize: 15, lineHeight: 21, fontWeight: "400" },
  name: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "500", letterSpacing: -0.6, marginTop: 2 },
  avatarFrame: { width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  identityMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  identityStat: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: "500" },
  metaDivider: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.muted },
  goalSection: { flexGrow: 1, flexShrink: 0, justifyContent: "center", alignItems: "center", paddingTop: 24, paddingBottom: 8, gap: 12 },
  goalHint: { textAlign: "center", color: colors.secondary, fontSize: 16, lineHeight: 22, maxWidth: 340 },
  focusCard: { width: "100%", borderRadius: 22, backgroundColor: "#171E2B", padding: 14, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(225,235,255,0.12)" },
  focusTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  focusInfo: { flex: 1, minWidth: 0, gap: 4 },
  focusHeading: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  focusChoice: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  focusDot: { width: 7, height: 7, borderRadius: 4 },
  focusValue: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "500", fontVariant: ["tabular-nums"] },
  focusArea: { color: colors.secondary, fontSize: 16, lineHeight: 22, flexShrink: 1 },
  changeButton: { minHeight: 44, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.accentSoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
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
  retry: { marginTop: 12, paddingVertical: 10 },
  retryText: { color: colors.danger, fontSize: 13 },
});
