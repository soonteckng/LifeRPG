import { tapHaptic } from "../utils/tapHaptics";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import ContentReveal from "./ContentReveal";
import ProgressRing from "./ProgressRing";
import FocusCard from "./FocusCard";
import SessionProtectionControl from "./SessionProtectionControl";
import GuidedPreferenceSheet from "./GuidedPreferenceSheet";
import SheetConfirmation from "./SheetConfirmation";
import { colors } from "../constants/theme";
import { type } from "../constants/typography";
import { suggestedFocus, suggestedFocusAreaKey, readSuggestedFocus } from "../constants/guidedQuests";
import { useTimer } from "../context/TimerContext";
import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import { useFocusDurationPreference } from "../hooks/useFocusDurationPreference";
import { focusAreaChoices, focusAreaKind, focusAreaTitle, FOCUS_AREAS } from "../utils/focusAreas";
import { sessionTime } from "../utils/sessionSetup";
import { homeWelcome } from "../utils/homeWelcome";
import { readRoutineSession } from "../utils/routineSession";
import { readOfflineFocusAreas, type OfflineFocusArea } from "../services/offlineFocusCatalog";
import SavedRoutinesCard from "./SavedRoutinesCard";
import { PinnedActionHost, PinnedActionProvider } from "./PinnedAction";
import { lifeAreaColor } from "../utils/lifeAreaColor";

/** Results belong to the stable global sheet; this surface owns offline controls. */
export default function OfflineSessionWorkspace({ active: surfaceActive = true }: { active?: boolean }) {
  const timer = useTimer(), auth = useAuth();
  const { hapticsEnabled = true, profile } = useUser();
  const { width } = useWindowDimensions();
  const owner = auth.localOwner;
  const ownerId = owner?.id, backendId = owner?.backendId;
  const cached = auth.cachedProfile?.id === ownerId ? auth.cachedProfile : profile?.id === ownerId ? profile : null;
  const name = cached?.username?.trim() || "Hero";
  const hour = new Date().getHours();
  const scopeKey = JSON.stringify([backendId, ownerId]);
  const duration = useFocusDurationPreference(ownerId ?? "");
  const preference = useGuidedPreference(ownerId ?? "");
  const [directionOpen, setDirectionOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [previousSurface, setPreviousSurface] = useState({ active: surfaceActive, scope: scopeKey });
  if (surfaceActive !== previousSurface.active || scopeKey !== previousSurface.scope) {
    setPreviousSurface({ active: surfaceActive, scope: scopeKey });
    if (!surfaceActive || scopeKey !== previousSurface.scope) { setDirectionOpen(false); setConfirmEnd(false); }
  }
  if (confirmEnd && (!timer.hasOpenSession || timer.endingSession || timer.sessionEnded || timer.isCompleted)) setConfirmEnd(false);
  const [catalog, setCatalog] = useState<{ scope: string; areas: OfflineFocusArea[] } | null>(null);
  const [localOperation, setLocalOperation] = useState({ scope: "", busy: false });
  const actionLock = useRef<{ scope: string; token: object } | null>(null);
  const [localError, setLocalError] = useState({ scope: "", message: "" });
  const localBusy = localOperation.scope === scopeKey && localOperation.busy;
  const error = localError.scope === scopeKey ? localError.message : "";
  const setError = (message: string) => setLocalError({ scope: scopeKey, message });
  useEffect(() => {
    let live = true;
    if (ownerId && backendId) void readOfflineFocusAreas({ backendId, ownerId }).then(areas => {
      if (live) setCatalog({ scope: scopeKey, areas });
    });
    return () => { live = false; };
  }, [ownerId, backendId, scopeKey]);
  const catalogReady = catalog?.scope === scopeKey;
  const areas = focusAreaChoices(catalogReady ? catalog.areas : [], preference.value.areaId);
  const focus = preference.value.enabled ? suggestedFocus(preference.value.templateId, false) : null;
  const kind = focus ? suggestedFocusAreaKey(focus.templateId) : "general";
  const area = (preference.value.areaId !== undefined ? areas.find(item => item.id === preference.value.areaId) : undefined)
    ?? areas.find(item => focusAreaKind(item.title) === kind);
  const areaTitle = focusAreaTitle(area?.title ?? FOCUS_AREAS.find(item => item.kind === kind)?.title);
  const tint = area ? lifeAreaColor(area.id, area.color_code) : FOCUS_AREAS.find(item => item.kind === kind)!.color;
  const breakActive = timer.breakSecondsLeft > 0;
  const breakSpent = timer.protectedSession && timer.breakUsed && !breakActive;
  const resultEnding = !timer.isCompleted && (timer.endingSession || timer.sessionEnded);
  const terminal = timer.isCompleted || resultEnding || timer.syncStatus === "rejected";
  const active = timer.hasOpenSession && !timer.endingSession;
  const busy = timer.isRestoring || timer.actionBusy || localBusy;
  const directionLocked = busy || !surfaceActive || preference.busy || !ownerId;
  const startDisabled = busy || !surfaceActive || preference.busy || !duration.ready || !preference.ready || !catalogReady || !timer.offlineAvailable;
  const uncertain = !timer.clientReported && (timer.syncStatus === "waiting" || !timer.offlineControlsAvailable);
  const currentFocus = readSuggestedFocus(timer.notes);
  const feedback = () => { if (hapticsEnabled) tapHaptic(); };
  const openDirection = () => {
    if (directionLocked || active || terminal || actionLock.current?.scope === scopeKey) return;
    feedback(); setDirectionOpen(true);
  };
  const action = async (work: () => Promise<unknown>) => {
    if (busy || !surfaceActive || actionLock.current?.scope === scopeKey) return false;
    const token = {};
    actionLock.current = { scope: scopeKey, token };
    feedback(); setLocalOperation({ scope: scopeKey, busy: true }); setError("");
    try { await work(); return true; }
    catch { setError("Couldn’t save that change. Your session is still on this phone."); return false; }
    finally {
      if (actionLock.current?.token === token) actionLock.current = null;
      setLocalOperation(previous => previous.scope === scopeKey ? { scope: scopeKey, busy: false } : previous);
    }
  };
  const start = () => {
    if (startDisabled || active || terminal) return Promise.resolve(false);
    return action(async () => {
    const started = focus
      ? await timer.startSuggestedTimer({ ...focus, seconds: duration.selectedSeconds }, area?.id ?? null)
      : await timer.startFreeTimer(duration.selectedSeconds, area?.id ?? null);
    if (!started) setError("Couldn’t start yet. Try again; your saved sessions stay here.");
    });
  };
  const end = async () => {
    setConfirmEnd(false);
    await action(timer.resetTimer);
  };
  const ringSize = Math.max(180, Math.min(width - 80, 310));
  return <SafeAreaView style={s.page} edges={["top", "bottom"]} testID="offline-session-workspace"><PinnedActionProvider>
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.content}>
        <View style={s.identityRow}>
          <View style={s.identity}><Text style={s.greeting}>{homeWelcome(hour < 5 ? 18 : hour, name).split(",")[0]}</Text><Text style={s.heading} numberOfLines={1}>{name}</Text></View>
          <View style={s.badge}><View style={s.dot} /><Text style={s.badgeText}>Offline</Text></View>
        </View>
        {terminal && <Text style={s.caption}>{timer.isCompleted ? "Session complete. Your record stays on this phone." : "Session stopped. Your saved request stays on this phone."}</Text>}
        {active ? <ContentReveal key="active"><View style={s.timer}>
          <ProgressRing size={ringSize} progress={breakActive ? 1 - timer.breakSecondsLeft / 300 : 1 - timer.timeLeft / Math.max(1, timer.duration)} color={breakActive ? colors.streak : undefined}>
            <Text allowFontScaling={false} style={s.time} accessibilityLabel={breakActive ? `Break time left ${sessionTime(timer.breakSecondsLeft)}` : `Time remaining ${sessionTime(timer.timeLeft)}`}>{sessionTime(breakActive ? timer.breakSecondsLeft : timer.timeLeft)}</Text>
            <Text style={s.caption}>{breakActive ? `Break left · ${sessionTime(timer.timeLeft)} of focus remains` : timer.isRunning ? "Time remaining" : "Paused"}</Text>
          </ProgressRing>
          <SessionProtectionControl statusOnly activeSurface={surfaceActive} />
          {!!currentFocus && <Text style={s.cardTitle}>{currentFocus.title}</Text>}
          {!currentFocus && !!readRoutineSession(timer.notes) && <Text style={s.cardTitle}>{readRoutineSession(timer.notes)}</Text>}
          {!!currentFocus && <Text style={s.body}>{currentFocus.instruction}</Text>}
          <View style={s.controls}>
            <Pressable disabled={busy || uncertain || breakSpent} accessibilityRole="button" accessibilityState={{ disabled: busy || uncertain || breakSpent }} accessibilityLabel={breakActive ? "End break early" : timer.protectedSession ? breakSpent ? "Break used" : "Take a five-minute break" : timer.isRunning ? "Pause session" : "Resume session"}
              onPress={() => void action(timer.isRunning ? timer.pauseTimer : timer.resumeTimer)} style={[s.button, s.grow, (busy || uncertain) && s.disabled]}>
              {!breakSpent && <Ionicons name={breakActive ? "play-outline" : timer.isRunning ? "pause-outline" : "play-outline"} size={22} color={colors.text} />}
              <Text style={s.buttonText}>{breakActive ? "End break early" : timer.protectedSession ? breakSpent ? "Break used" : "5-min break" : timer.isRunning ? "Pause" : "Resume"}</Text>
            </Pressable>
            <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="End session" onPress={() => { feedback(); setConfirmEnd(true); }} style={s.secondary}>
              <Text style={s.link}>End</Text>
            </Pressable>
          </View>
          {uncertain && <Text style={s.caption}>Reconnect to confirm the previous state before pausing or resuming. You can still End this session.</Text>}
          <Text style={s.caption}>Ending early doesn’t earn progress.</Text>
        </View></ContentReveal> : terminal ? null : <>
          <FocusCard cardID="offline-focus-card" startID="offline-start-session" preferencesID="offline-focus-preferences"
            label="Your focus" title={focus?.title ?? "One thing at a time."} instruction={focus?.instruction ?? "Choose your own activity."}
            contentKey={focus?.templateId ?? "free"} suggested={!!focus} seconds={duration.selectedSeconds} area={areaTitle} tint={tint}
            active={false} running={false} busy={busy} disabled={startDisabled} editDisabled={busy || !surfaceActive}
            setupDisabled={directionLocked} onPreferences={openDirection} onStart={() => void start()}
            customSeconds={duration.value.customSeconds} onDuration={seconds => { void duration.choose(seconds); }} onCustomDuration={seconds => { void duration.choose(seconds, true); }}
            goal={<View style={s.offlineGoal}><Ionicons name="cloud-offline-outline" size={20} color={colors.secondary} /><View style={s.offlineGoalCopy}><Text style={s.goalText}>{cached ? `${cached.daily_goal_minutes} min goal today` : "Your session stays on this phone"}</Text><Text style={s.localCaption}>Progress syncs when you reconnect.</Text></View></View>}
            protection={<SessionProtectionControl activeSurface={surfaceActive} />} error={!timer.offlineAvailable ? "Reconnect before starting another session. Your saved work stays on this phone." : undefined} />
          <SavedRoutinesCard subjects={catalogReady ? catalog.areas : []}
            initialSeconds={duration.selectedSeconds} initialAreaId={area?.id ?? null} active={surfaceActive && catalogReady} />
        </>}
        {timer.unsyncedSessionCount > 0 && <Text style={s.localCaption} accessibilityLiveRegion="polite">{timer.unsyncedSessionCount} {timer.unsyncedSessionCount === 1 ? "session waiting" : "sessions waiting"} to sync. Your records stay on this phone.</Text>}
        {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
        {!!timer.actionError && <Text style={s.localCaption} accessibilityLiveRegion="polite">{timer.actionError}</Text>}
        <Pressable disabled={localBusy || timer.isRestoring} accessibilityRole="button" accessibilityLabel="Retry connection"
          onPress={() => void action(async () => { await auth.retrySessionVerification(); })} style={s.retry}><Text style={s.link}>Retry connection</Text></Pressable>
      </View>
    </ScrollView>
    <PinnedActionHost route="index" style={s.pinned} />
    <GuidedPreferenceSheet owner={ownerId ?? ""} visible={surfaceActive && directionOpen && !active && !terminal} onClose={() => setDirectionOpen(false)} />
    {surfaceActive && active && confirmEnd && <SheetConfirmation title="End this session?" message="This cancels the current session instead of completing it. Completion rewards will not be awarded."
      cancelLabel="Keep session" confirmLabel="End session" onCancel={() => setConfirmEnd(false)} onConfirm={() => void end()} />}
  </PinnedActionProvider></SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, scroll: { flexGrow: 1, padding: 20 },
  content: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 24 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 4 }, identity: { flex: 1, minWidth: 0 }, greeting: { color: colors.secondary, fontSize: 15, lineHeight: 20 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: colors.accentSoft },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }, badgeText: { ...type.caption, color: colors.accent },
  heading: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "500", letterSpacing: -0.6, marginTop: 2 }, body: { ...type.body, color: colors.secondary }, caption: { ...type.secondary },
  card: { padding: 16, gap: 12, borderRadius: 24, backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  offlineGoal: { flexDirection: "row", alignItems: "center", gap: 12 }, offlineGoalCopy: { flex: 1, minWidth: 0, gap: 2 }, goalText: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "500" },
  pinned: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, width: "100%", maxWidth: 600, alignSelf: "center" }, retry: { minHeight: 48, padding: 12, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, localCaption: { color: colors.secondary, fontSize: 12, lineHeight: 16 },
  cardHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  change: { minHeight: 44, minWidth: 68, paddingHorizontal: 4, paddingVertical: 8, alignItems: "flex-end", justifyContent: "center" },
  changeText: { color: colors.accent, fontSize: 14, lineHeight: 20, fontWeight: "500" }, suggestionRow: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 8 },
  suggestion: { color: colors.secondary, fontSize: 14, lineHeight: 20, flex: 1 },
  cardTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "600", letterSpacing: -0.3, flexShrink: 1 }, label: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  areaValue: { flexDirection: "row", alignItems: "center", gap: 8 },
  timer: { alignItems: "center", gap: 24 }, time: { color: colors.text, fontSize: 54, lineHeight: 68, fontWeight: "600", fontVariant: ["tabular-nums"] },
  controls: { width: "100%", flexDirection: "row", gap: 10 }, grow: { flex: 1 }, disabled: { opacity: 0.5 },
  button: { minHeight: 56, padding: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  buttonText: { ...type.body, fontWeight: "600", color: colors.text }, secondary: { minHeight: 56, minWidth: 64, padding: 12, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  link: { ...type.body, fontWeight: "600", color: colors.accent }, error: { ...type.body, color: colors.danger },
});
