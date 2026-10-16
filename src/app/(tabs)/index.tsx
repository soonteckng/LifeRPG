import { generalArea } from "../../utils/focusAreas";
import FreeFocusCard from "../../components/FreeFocusCard";
import GuidedFocusCard from "../../components/GuidedFocusCard";
import { TourAnchor, TourScrollView } from "../../components/FeatureTour";
import LevelTierSheet from "../../components/LevelTierSheet";
import DailyGoalSheet from "../../components/DailyGoalSheet";
import GuidedPreferenceSheet from "../../components/GuidedPreferenceSheet";
import { useGuidedPreference } from "../../hooks/useGuidedPreference";
import { useFocusDurationPreference } from "../../hooks/useFocusDurationPreference";
import { preferenceForFocusArea } from "../../utils/focusPreference";
import type { Task } from "../../services/taskService";
import { floatingDockKey, useFloatingDockHeight } from "../../context/FloatingDockContext";
import TouchableOpacity from "../../components/MotionPressable";
import { floatingTabInset } from "../../utils/floatingTabInset";
import { Text } from "../../components/AppText";
import { lifeAreaColor } from "../../utils/lifeAreaColor";
import { validSessionSeconds } from "../../utils/sessionSetup";
import CharacterMark from "../../components/CharacterMark";
import ContentReveal from "../../components/ContentReveal";
import { creditedDailySeconds } from "../../utils/progressionAccounting";
import { dailyGoalRatio } from "../../utils/dailyGoalPresentation";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { homeWelcome } from "../../utils/homeWelcome";
import { singleFlight } from "../../utils/singleFlight";
import { useHomeLifecycle } from "../../hooks/useHomeLifecycle";
import SavedRoutinesCard from "../../components/SavedRoutinesCard";
import SessionProtectionControl from "../../components/SessionProtectionControl";
import { useAuth } from "../../context/AuthContext";
import { useQuests } from "../../context/QuestContext";
import { colors } from "../../constants/theme";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { useWindowDimensions, StyleSheet, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useTimer } from "../../context/TimerContext";
import { useUser } from "../../context/UserContext";
import { getFocusStreak } from "../../services/progressService";
import { DEFAULT_TIMEZONE } from "../../utils/progressAnalytics";
import { getTodayProgress } from "../../services/dailyProgressService";

export default function HomeScreen() {
  const { accessMode, admissionEpoch } = useAuth();
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const timer = useTimer();
  const dockEstimate = floatingTabInset(useBottomTabBarHeight(), insets.bottom, timer);
  const bannerVisible = !!(timer.hasOpenSession || (timer.sessionSummary && !timer.summaryViewed));
  const dockKey = floatingDockKey(bannerVisible, insets.bottom, width, fontScale);
  const dockHeight = useFloatingDockHeight(dockKey, dockEstimate);
  const { profile, reloadProfile, hapticsEnabled } = useUser();

  const { setLinkedTaskId, setDurationInMinutes, setTargetAttributeId, hasOpenSession, sessionSummary } = timer;
  const { tasks, subjects = [], loading: areasLoading, error: questsError, refresh: refreshQuests } = useQuests();

  const [quickStarting, setQuickStarting] = useState(false);
  const [attempt, setAttempt] = useState<{ owner: string; seconds: number; areaId: number | null; title: string } | null>(null);
  const [quickError, setQuickError] = useState(false);
  const quickLock = useRef(false);
  const owner = profile?.id ?? "";
  const guided = useGuidedPreference(owner);
  const durationPreference = useFocusDurationPreference(owner);
  const [guidedSettings, setGuidedSettings] = useState(false);
  const [goalSettings, setGoalSettings] = useState(false);
  const [tiersOpen, setTiersOpen] = useState(false);
  const [surfaceMode, setSurfaceMode] = useState(accessMode);
  if (surfaceMode !== accessMode) {
    setSurfaceMode(accessMode);
    if (accessMode !== "online") { setGuidedSettings(false); setGoalSettings(false); setTiersOpen(false); }
  }
  const useGuidance = guided.ready && guided.value.enabled;
  const general = generalArea(subjects);
  const quickArea = guided.value.areaId !== undefined ? subjects.find(area => area.id === guided.value.areaId) ?? general : general;
  const retainedAttempt = (quickError || quickStarting) && attempt?.owner === owner ? attempt : null;
  const quickSeconds = retainedAttempt?.seconds ?? durationPreference.selectedSeconds;
  const quickAreaId = retainedAttempt ? retainedAttempt.areaId : quickArea?.id ?? null;
  const quickTitle = retainedAttempt?.title ?? quickArea?.title ?? "General";
  const activeSubject = subjects.find(area => area.id === timer.targetAttributeId);
  const activeArea = activeSubject?.title ?? "General";
  const blocked = !!(timer.actionBusy || timer.endingSession || timer.isRestoring || timer.restoreError || (timer.isCompleted && !sessionSummary));

  const [completedSeconds, setCompletedSeconds] = useState(0);
  const [focusStreak, setFocusStreak] = useState<number | null>(null);
  const timeZone = profile?.timezone || DEFAULT_TIMEZONE;
  const [goalCompleted, setGoalCompleted] = useState(false);
  const [todayGoal, setTodayGoal] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const dataScope = JSON.stringify([owner, accessMode, admissionEpoch, timeZone]);
  const currentDataScope = useRef<string | null>(dataScope);
  useLayoutEffect(() => {
    currentDataScope.current = dataScope;
    return () => { currentDataScope.current = null; };
  }, [dataScope]);
  const loadHomeData = useCallback(async () => {
    if (accessMode !== "online") return;
    const expectedScope = dataScope;
    setRefreshing(true);
    try {
      const [progress, profileOK, , streak] = await Promise.all([getTodayProgress(timeZone), reloadProfile(), refreshQuests(), getFocusStreak(timeZone).catch(() => undefined)]);
      if (currentDataScope.current !== expectedScope) return;
      if (streak !== undefined) setFocusStreak(streak);
      setTodayGoal(progress?.goal_minutes ?? null);
      setCompletedSeconds(progress ? creditedDailySeconds(progress) : 0);
      setGoalCompleted(progress?.goal_completed ?? false);
      setLoadError(profileOK === false || streak === undefined);
    } catch {
      if (currentDataScope.current === expectedScope) setLoadError(true);
    } finally { if (currentDataScope.current === expectedScope) setRefreshing(false); }
  }, [reloadProfile, refreshQuests, timeZone, accessMode, dataScope]);
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


  const displayName = profile?.username?.trim() || "Hero";
  const greeting = homeWelcome(hour < 5 ? 18 : hour, displayName).split(",")[0];
  const isGoalComplete = goalCompleted || remainingSeconds === 0;
  const streakDays = Math.max(0, focusStreak ?? 0);

  const openSession = () => {
    timer.reviewSummary?.();
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

  const changeArea = async (id: number | null) => {
    if (hasOpenSession || blocked || quickLock.current || areasLoading || questsError || guided.busy) return;
    if (id !== null && !subjects.some(area => area.id === id)) return;
    quickLock.current = true;
    try {
      if (await guided.save(preferenceForFocusArea(guided.value, id, subjects.find(area => area.id === id)?.title ?? "Everyday focus"))) { setQuickError(false); setAttempt(null); }
    } finally { quickLock.current = false; }
  };
  const chooseDuration = (seconds: number, custom = false) => {
    if (hasOpenSession || blocked || quickLock.current || areasLoading || !durationPreference.ready || !validSessionSeconds(seconds)) return;
    void durationPreference.choose(seconds, custom);
    setQuickError(false); setAttempt(null);
  };
  const startFreeSession = async () => {
    if (hasOpenSession) { openSession(); return; }
    if (quickLock.current || blocked || areasLoading || questsError || guided.busy || !durationPreference.ready) return;
    quickLock.current = true;
    setAttempt({ owner, seconds: quickSeconds, areaId: quickAreaId, title: quickTitle });
    setQuickStarting(true);
    setQuickError(false);
    try {
      const request = timer.startFreeTimer(quickSeconds, quickAreaId);
      openSession();
      if (!await request) setQuickError(true);
    } catch { setQuickError(true); }
    finally { quickLock.current = false; setQuickStarting(false); }
  };
  const openFocusPreferences = () => {
    if (hapticsEnabled) void Haptics.selectionAsync().catch(() => {});
    setGuidedSettings(true);
  };

  const goalSummary = <View testID="home-compact-goal" style={styles.guidedGoal}>
    <TouchableOpacity onPress={() => setGoalSettings(true)} style={styles.goalTap} accessibilityRole="button" accessibilityLabel={`Daily effort goal. ${dailyGoalRatio(safeCompletedSeconds, dailyGoalMinutes)}${isGoalComplete ? ", goal reached" : ""}. Change your goal`}>
      <View style={styles.goalTop}>
        <Text style={[styles.focusHeading, styles.goalLabel]}>{isGoalComplete ? "Daily goal reached" : "Today"}</Text>
        <Ionicons name={isGoalComplete ? "checkmark-circle-outline" : "options-outline"} size={19} color={isGoalComplete ? colors.success : colors.accent} />
      </View>
      <Text style={styles.goalBig}>{dailyGoalRatio(safeCompletedSeconds, dailyGoalMinutes)}</Text>
    </TouchableOpacity>
    <View style={styles.guidedTrack} accessible accessibilityRole="progressbar" accessibilityLabel="Today's goal" accessibilityValue={{ min: 0, max: dailyGoalMinutes * 60, now: Math.min(safeCompletedSeconds, dailyGoalMinutes * 60), text: dailyGoalRatio(safeCompletedSeconds, dailyGoalMinutes) }}>
      <View style={[styles.guidedFill, { width: `${Math.min(100, (safeCompletedSeconds / Math.max(1, dailyGoalMinutes * 60)) * 100)}%`, backgroundColor: isGoalComplete ? colors.success : colors.accent }]} />
    </View>
  </View>;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <TourScrollView testID="home-viewport" tourRoute="/" tourBottomInset={dockHeight} style={styles.viewport} scrollEnabled={contentHeight > viewportHeight + 1}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, nextHeight) => setContentHeight(nextHeight)}
        contentContainerStyle={[styles.content, { paddingBottom: dockHeight + 12 }]}>
        <ContentReveal>
        <View testID="home-layout" style={styles.layout}>
          <TourAnchor id="home-identity"><View style={{ gap: 16 }}><View style={styles.headerBlock}>
            <View style={styles.identityRow}>
              <View style={styles.identity} accessible accessibilityRole="header" accessibilityLabel={homeWelcome(hour < 5 ? 18 : hour, profile?.username)}>
                <Text style={styles.greeting}>{greeting},</Text>
                <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{displayName}</Text>
              </View>
              <TouchableOpacity style={styles.avatarFrame} onPress={() => router.navigate("/profile")} accessibilityRole="button" accessibilityLabel="Open Profile" accessibilityHint="View your companion, focus areas and milestones"><CharacterMark size={40} avatar={profile?.avatar ?? "🌱"} /></TouchableOpacity>
            </View>
            <View style={styles.identityMeta}>
              <TouchableOpacity style={styles.levelButton} onPress={() => setTiersOpen(true)} accessibilityRole="button" accessibilityLabel={`Level ${level}. View level tiers`}><Ionicons name="sparkles-outline" size={15} color={colors.accent} /><Text style={styles.levelText}>Lv {level}</Text><Ionicons name="chevron-forward" size={13} color={colors.accent} /></TouchableOpacity>
              <View style={styles.identityStat}><Ionicons name="flame-outline" size={15} color={colors.accent} /><Text style={styles.metaText}>{streakDays > 0 ? `${streakDays}-day focus streak` : "A fresh start"}</Text></View>
            </View>
          </View>
          {(loadError || questsError) && <TouchableOpacity onPress={() => void loadData()} disabled={refreshing}
            accessibilityRole="button" accessibilityLabel="Retry loading Home" style={styles.retry}>
            <Text style={styles.retryText}>{refreshing ? "Refreshing…" : "Couldn't refresh Home. Tap to retry."}</Text>
          </TouchableOpacity>}
          </View></TourAnchor>
          <TourAnchor id="home-focus"><View style={styles.focusContainer}>{!guided.ready || !durationPreference.ready ? <View style={styles.focusCard} testID="home-preference-loading">
            {goalSummary}<Text style={styles.focusHeading}>{guided.error || durationPreference.error ? "Your focus preferences need a retry." : "Getting your focus ready…"}</Text>
            {hasOpenSession && <TouchableOpacity onPress={openSession} accessibilityRole="button" style={styles.primaryButton}><Text style={styles.primaryButtonText}>Continue session</Text></TouchableOpacity>}
            {(guided.error || durationPreference.error) && <TouchableOpacity onPress={() => { void guided.retry(); void durationPreference.retry(); }} accessibilityRole="button" style={styles.changeButton}><Text style={styles.link}>Retry loading preferences</Text></TouchableOpacity>}
            {!hasOpenSession && <TouchableOpacity onPress={openFocusPreferences} accessibilityRole="button" accessibilityLabel="Change focus direction" accessibilityHint="Choose a focus area or free focus" style={styles.changeButton}><Text style={styles.link}>Change direction</Text></TouchableOpacity>}
          </View> : useGuidance ? <GuidedFocusCard key={owner} owner={owner} subjects={subjects} activeTitle={tasks.find(task => task.id === timer.linkedTaskId)?.title} disabled={blocked || (!hasOpenSession && (areasLoading || questsError))}
            goal={goalSummary} protection={<SessionProtectionControl activeSurface={accessMode === "online"} />} onStarted={openSession} onPreferences={openFocusPreferences} selectedSeconds={quickSeconds}
            onDuration={chooseDuration} customSeconds={durationPreference.value.customSeconds} onCustomDuration={seconds => chooseDuration(seconds, true)} /> : <FreeFocusCard key={owner}
            seconds={hasOpenSession ? timer.timeLeft : quickSeconds}
            area={hasOpenSession ? activeArea : quickTitle} areaId={hasOpenSession ? timer.targetAttributeId : quickAreaId} subjects={subjects}
            tint={lifeAreaColor(hasOpenSession ? timer.targetAttributeId : quickAreaId, (hasOpenSession ? activeSubject : subjects.find(area => area.id === quickAreaId))?.color_code)}
            active={!!hasOpenSession} running={!!timer.isRunning} awaitingStart={timer.awaitingStart} starting={quickStarting}
            disabled={blocked || (!hasOpenSession && (areasLoading || questsError)) || guided.busy} changeDisabled={quickStarting || !!timer.actionBusy || areasLoading || questsError || guided.busy} restoring={!!timer.isRestoring}
            failed={quickError} error={timer.actionError ?? undefined} setupError={guided.error ? "Couldn’t save your focus area. Your previous choice is still selected. Try again." : undefined} onChange={id => void changeArea(id)} onStart={() => void startFreeSession()}
            goal={goalSummary} protection={<SessionProtectionControl activeSurface={accessMode === "online"} />} onPreferences={openFocusPreferences} onDuration={chooseDuration} customSeconds={durationPreference.value.customSeconds} onCustomDuration={seconds => chooseDuration(seconds, true)}
          />}
          {durationPreference.ready && durationPreference.error && <View>
            <Text style={styles.retryText} accessibilityRole="alert">Your time is selected, but couldn’t be remembered on this phone.</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry remembering time" style={styles.retry}
              onPress={() => void durationPreference.choose(durationPreference.selectedSeconds, durationPreference.selectedSeconds !== 1800 && durationPreference.selectedSeconds !== 3600)}><Text style={styles.link}>Retry remembering time</Text></TouchableOpacity>
          </View>}
          {(timer.restoreError || (timer.endingSession && timer.actionError) || (timer.isCompleted && !sessionSummary)) && <TouchableOpacity onPress={openSession} accessibilityRole="button" accessibilityLabel="Review saved session" style={[styles.primaryButton, { marginTop: 12 }]}>
            <Text style={styles.primaryButtonText}>Review saved session</Text>
          </TouchableOpacity>}
          </View></TourAnchor>
          <TourAnchor id="home-quests"><SavedRoutinesCard subjects={subjects} initialSeconds={quickSeconds} initialAreaId={quickAreaId} active={accessMode === "online"} legacyTasks={tasks} onStartLegacy={openQuestSession} /></TourAnchor>
        </View>
        </ContentReveal>
      </TourScrollView>
      <GuidedPreferenceSheet owner={owner} visible={guidedSettings} onClose={() => setGuidedSettings(false)} />
      <LevelTierSheet level={level} currentXP={profile?.current_xp ?? 0} visible={tiersOpen} onClose={() => setTiersOpen(false)} />
      <DailyGoalSheet todayGoalMinutes={dailyGoalMinutes} visible={goalSettings} onClose={() => setGoalSettings(false)} onSaved={() => void loadData()} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  guidedGoalSection: { flexGrow: 0, paddingTop: 0, gap: 12 },
  guidedGoal: { width: "100%", gap: 8 },
  guidedGoalHeading: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14 }, goalCopy: { flex: 1, minWidth: 0, gap: 2 },
  goalLabel: { fontSize: 12, lineHeight: 16, letterSpacing: 0.9, textTransform: "uppercase", color: colors.muted }, goalValue: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }, goalValueText: { color: colors.text, fontSize: 20, lineHeight: 26, letterSpacing: -0.3, fontWeight: "600", flexShrink: 1, fontVariant: ["tabular-nums"] },
  guidedTrack: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden", marginTop: 12 },
  guidedFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  container: { flex: 1, backgroundColor: colors.background },
  viewport: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, maxWidth: 600, width: "100%", alignSelf: "center" },
  layout: { gap: 24 },
  focusContainer: { width: "100%", alignSelf: "stretch" },
  identityRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  identity: { flex: 1, minWidth: 0 },
  headerBlock: { gap: 4 },
  greeting: { color: colors.secondary, fontSize: 15, lineHeight: 21, fontWeight: "400" },
  name: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: "600", letterSpacing: -0.8 },
  avatarFrame: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.focusSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.focusBorder },
  levelButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 5 },
  levelText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  identityMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 18, rowGap: 0, paddingLeft: 0 },
  identityStat: { flexDirection: "row", alignItems: "center", gap: 6 }, heroRing: { width: 152, height: 152, alignItems: "center", justifyContent: "center" }, chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 10 },
  metaText: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: "500" },
  metaDivider: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.muted },
  goalSection: { flexShrink: 0, alignItems: "stretch", paddingBottom: 0, gap: 12 },
  goalHint: { textAlign: "center", color: colors.secondary, fontSize: 16, lineHeight: 22, maxWidth: 340 },
  focusCard: { width: "100%", borderRadius: 22, backgroundColor: colors.surfaceRaised, padding: 14, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  focusHeading: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  changeButton: { minHeight: 44, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.accentSoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  primaryButton: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.28)", backgroundColor: colors.primary, width: "100%", alignSelf: "stretch", minHeight: 52, borderRadius: 16, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", padding: 14 },
  primaryButtonText: { color: colors.primaryText, fontSize: 16, lineHeight: 22, fontWeight: "500", flexShrink: 1, textAlign: "center" },
  link: { color: colors.accent, fontSize: 15, fontWeight: "500" },
  retry: { marginTop: 12, paddingVertical: 10 },
  retryText: { color: colors.danger, fontSize: 13 },
  goalTap: { gap: 6 },
  goalTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalBig: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "600", letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
});
