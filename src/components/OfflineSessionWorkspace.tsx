import { tapHaptic, tapHapticsEnabled } from "../utils/tapHaptics";
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
import SectionHeader from "./SectionHeader";
import { colors, radius, edge } from "../constants/theme";
import { type } from "../constants/typography";
import { suggestedFocus, suggestedFocusAreaKey, readSuggestedFocus } from "../constants/guidedQuests";
import { useTimer } from "../context/TimerContext";
import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import { useFocusDurationPreference } from "../hooks/useFocusDurationPreference";
import { useOfflineReconnect } from "../hooks/useOfflineReconnect";
import { focusAreaChoices, focusAreaKind, focusAreaTitle, FOCUS_AREAS } from "../utils/focusAreas";
import { sessionTime } from "../utils/sessionSetup";
import { homeWelcome } from "../utils/homeWelcome";
import { readRoutineSession } from "../utils/routineSession";
import { readOfflineFocusAreas, type OfflineFocusArea } from "../services/offlineFocusCatalog";
import SavedRoutinesCard from "./SavedRoutinesCard";
import { PinnedActionHost, PinnedActionProvider } from "./PinnedAction";
import { lifeAreaColor } from "../utils/lifeAreaColor";
import { sessionBackendIdentity } from "../utils/sessionBackend";

/** Results belong to the stable global sheet; this surface owns offline controls. */
export default function OfflineSessionWorkspace({ active: surfaceActive = true }: { active?: boolean }) {
  const timer = useTimer(), auth = useAuth();
  const { hapticsEnabled = true, profile } = useUser();
  const { width } = useWindowDimensions();
  const liveOwner = auth.localOwner;
  const liveCached = auth.cachedProfile?.id === liveOwner?.id ? auth.cachedProfile : profile?.id === liveOwner?.id ? profile : null;
  const [lastIdentity, setLastIdentity] = useState(() => liveOwner ? { owner: liveOwner, cached: liveCached } : null);
  if (liveOwner && (lastIdentity?.owner.id !== liveOwner.id || lastIdentity.owner.backendId !== liveOwner.backendId || lastIdentity.cached !== liveCached)) {
    setLastIdentity({ owner: liveOwner, cached: liveCached });
  }
  // Only the outgoing same-account surface keeps its display metadata. Live
  // admission and surface activity still gate every action and reconnect.
  const configuredBackend = sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId;
  const leaving = !surfaceActive && !liveOwner && !!lastIdentity && auth.user?.id === lastIdentity.owner.id
    && configuredBackend === lastIdentity.owner.backendId;
  const owner = leaving ? lastIdentity?.owner : liveOwner;
  const ownerId = owner?.id, backendId = owner?.backendId;
  const cached = leaving ? lastIdentity?.cached : liveCached;
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
  const reconnect = useOfflineReconnect({
    scope: liveOwner ? JSON.stringify([liveOwner.backendId, liveOwner.id, auth.admissionEpoch]) : null,
    active: surfaceActive, blocked: busy,
    reconnect: auth.retrySessionVerification,
  });
  const checking = reconnect.checking || busy;
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
  return <SafeAreaView style={s.page} edges={["top", "bottom", "left", "right"]} testID="offline-session-workspace"><PinnedActionProvider>
    <ScrollView style={s.viewport} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} testID="offline-workspace-scroll">
      <View style={s.content}>
        <View style={s.identityRow}>
          <View style={s.identity}><Text style={s.greeting}>{homeWelcome(hour < 5 ? 18 : hour, name).split(",")[0]},</Text><Text style={s.heading} accessibilityRole="header" numberOfLines={1}>{name}</Text></View>
          <View style={s.badge} accessible accessibilityRole="text" accessibilityLabel="Offline. Working from saved account details on this phone."><View style={s.dot} /><Text style={s.badgeText}>Offline</Text></View>
        </View>
        <View style={s.localNotice} testID="offline-local-notice">
          <View style={s.noticeRow}><View style={s.noticeIcon}><Ionicons name="cloud-offline-outline" size={20} color={colors.accent} /></View><View style={s.noticeCopy}>
            <Text style={s.noticeTitle}>Saved on this phone</Text><Text style={s.caption}>Your sessions and routine changes sync when you reconnect.</Text>
          </View></View>
          {!active && cached && <View style={s.savedGoal}><Text style={s.caption}>Last saved daily goal</Text><Text style={s.goalValue}>{cached.daily_goal_minutes} min</Text></View>}
        </View>
        {terminal && <View style={s.statusCard} testID="offline-terminal-status"><Ionicons name={timer.syncStatus === "rejected" ? "alert-circle-outline" : timer.isCompleted ? "checkmark-circle-outline" : "stop-circle-outline"} size={20} color={colors.accent} /><Text style={s.statusCopy}>{timer.syncStatus === "rejected" ? "Saved session needs review. Its record stays on this phone." : timer.isCompleted ? "Session complete. Your record stays on this phone." : "Session stopped. Your saved request stays on this phone."}</Text></View>}
        {active ? <ContentReveal key="active"><View style={s.section}>
          <SectionHeader title="My session" subtitle={breakActive ? "On break" : timer.isRunning ? "In progress" : "Paused"} />
          <View style={s.timer}>
          <ProgressRing size={ringSize} progress={breakActive ? 1 - timer.breakSecondsLeft / 300 : 1 - timer.timeLeft / Math.max(1, timer.duration)} color={breakActive ? colors.streak : undefined}>
            <Text allowFontScaling={false} style={s.time} accessibilityLabel={breakActive ? `Break time left ${sessionTime(timer.breakSecondsLeft)}` : `Time remaining ${sessionTime(timer.timeLeft)}`}>{sessionTime(breakActive ? timer.breakSecondsLeft : timer.timeLeft)}</Text>
            <Text style={s.caption}>{breakActive ? `Break left · ${sessionTime(timer.timeLeft)} of focus remains` : timer.isRunning ? "Time remaining" : "Paused"}</Text>
          </ProgressRing>
          <SessionProtectionControl statusOnly activeSurface={surfaceActive} />
          {!!currentFocus && <Text style={s.cardTitle}>{currentFocus.title}</Text>}
          {!currentFocus && !!readRoutineSession(timer.notes) && <Text style={s.cardTitle}>{readRoutineSession(timer.notes)}</Text>}
          {!!currentFocus && <Text style={s.body}>{currentFocus.instruction}</Text>}
          <View style={s.controls}>
            <Pressable testID="offline-session-control" disabled={busy || uncertain || breakSpent} accessibilityRole="button" accessibilityState={{ disabled: busy || uncertain || breakSpent }} accessibilityLabel={breakActive ? "End break early" : timer.protectedSession ? breakSpent ? "Break used" : "Take a five-minute break" : timer.isRunning ? "Pause session" : "Resume session"}
              onPress={() => void action(timer.isRunning ? timer.pauseTimer : timer.resumeTimer)} style={[s.button, s.grow, (busy || uncertain || breakSpent) && s.disabled]}>
              {!breakSpent && <Ionicons name={breakActive ? "play-outline" : timer.isRunning ? "pause-outline" : "play-outline"} size={22} color={colors.text} />}
              <Text style={s.buttonText}>{breakActive ? "End break early" : timer.protectedSession ? breakSpent ? "Break used" : "5-min break" : timer.isRunning ? "Pause" : "Resume"}</Text>
            </Pressable>
            <Pressable testID="offline-end-session" disabled={busy} accessibilityRole="button" accessibilityLabel="End session" onPress={() => { feedback(); setConfirmEnd(true); }} style={s.secondary}>
              <Text style={s.link}>End</Text>
            </Pressable>
          </View>
          {uncertain && <Text style={s.caption}>Reconnect to confirm the previous state before pausing or resuming. You can still End this session.</Text>}
          <Text style={s.caption}>Ending early doesn’t earn progress.</Text>
          </View>
        </View></ContentReveal> : terminal ? null : <>
          <View style={s.section}>
          <SectionHeader title="My session" />
          <FocusCard cardID="offline-focus-card" startID="offline-start-session" preferencesID="offline-focus-preferences"
            label="Your focus" title={focus?.title ?? "One thing at a time."} instruction={focus?.instruction ?? "Choose your own activity."}
            contentKey={focus?.templateId ?? "free"} suggested={!!focus} seconds={duration.selectedSeconds} area={areaTitle} tint={tint}
            active={false} running={false} busy={busy} disabled={startDisabled} editDisabled={busy || !surfaceActive}
            setupDisabled={directionLocked} onPreferences={openDirection} onStart={() => void start()}
            customSeconds={duration.value.customSeconds} onDuration={seconds => { void duration.choose(seconds); }} onCustomDuration={seconds => { void duration.choose(seconds, true); }}
            protection={<SessionProtectionControl activeSurface={surfaceActive} />} error={!timer.offlineAvailable ? "Reconnect before starting another session. Your saved work stays on this phone." : undefined} />
          </View>
          <SavedRoutinesCard subjects={catalogReady ? catalog.areas : []}
            initialSeconds={duration.selectedSeconds} initialAreaId={area?.id ?? null} active={surfaceActive && catalogReady} />
        </>}
        {timer.unsyncedSessionCount > 0 && <View style={s.statusCard} testID="offline-pending-sync"><Ionicons name="cloud-upload-outline" size={20} color={colors.secondary} /><Text style={s.statusCopy} accessibilityLiveRegion="polite">{timer.unsyncedSessionCount} saved {timer.unsyncedSessionCount === 1 ? "session" : "sessions"} not yet confirmed. Your records stay on this phone.</Text></View>}
        {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
        {!!timer.actionError && <Text style={s.localCaption} accessibilityLiveRegion="polite">{timer.actionError}</Text>}
        <View style={s.reconnect}>
          <Pressable testID="offline-workspace-retry-connection" haptic={false} disabled={reconnect.disabled} accessibilityRole="button" accessibilityLabel="Retry connection" accessibilityState={{ disabled: reconnect.disabled, busy: checking }}
            onPress={() => { if (hapticsEnabled && tapHapticsEnabled()) tapHaptic(); void reconnect.retry(); }} style={s.retry}><Text style={s.retryText}>{checking ? "Checking…" : "Retry connection"}</Text><Ionicons name="refresh-outline" size={17} color={colors.accent} /></Pressable>
          <Text style={s.localCaption} accessibilityLiveRegion="polite">We’ll reconnect automatically when the connection returns.</Text>
        </View>
      </View>
    </ScrollView>
    <PinnedActionHost route="index" style={s.pinned} />
    <GuidedPreferenceSheet owner={ownerId ?? ""} visible={surfaceActive && directionOpen && !active && !terminal} onClose={() => setDirectionOpen(false)} />
    {surfaceActive && active && confirmEnd && <SheetConfirmation elevated title="End this session?" message="This cancels the current session instead of completing it. Completion rewards will not be awarded."
      cancelLabel="Keep session" confirmLabel="End session" onCancel={() => setConfirmEnd(false)} onConfirm={() => void end()} />}
  </PinnedActionProvider></SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, viewport: { flex: 1, minHeight: 0 }, scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  content: { width: "100%", maxWidth: 600, alignSelf: "center", gap: 26 }, section: { gap: 12 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 4 }, identity: { flex: 1, minWidth: 0 }, greeting: { color: colors.secondary, fontSize: 15, lineHeight: 20 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: colors.accentSoft },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }, badgeText: { ...type.caption, color: colors.accent },
  heading: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: "700", letterSpacing: -0.8, marginTop: 2 }, body: { ...type.body, color: colors.secondary, textAlign: "center" }, caption: { ...type.secondary },
  localNotice: { ...edge, padding: 16, gap: 12, borderRadius: radius.card, backgroundColor: colors.surface },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: 12 }, noticeIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }, noticeCopy: { flex: 1, minWidth: 0, gap: 3 },
  noticeTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" }, savedGoal: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 }, goalValue: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600", fontVariant: ["tabular-nums"] },
  statusCard: { ...edge, padding: 14, borderRadius: radius.tile, backgroundColor: colors.surface, flexDirection: "row", alignItems: "flex-start", gap: 10 }, statusCopy: { ...type.secondary, flex: 1, minWidth: 0 },
  pinned: { flexShrink: 0, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, width: "100%", maxWidth: 600, alignSelf: "center", backgroundColor: colors.background }, reconnect: { gap: 10, alignItems: "stretch" },
  retry: { ...edge, minHeight: 48, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24, backgroundColor: colors.sheetCard, alignItems: "center", justifyContent: "space-between", flexDirection: "row", gap: 8 }, retryText: { color: colors.accent, fontSize: 15, lineHeight: 20, fontWeight: "600" }, localCaption: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  cardTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "600", letterSpacing: -0.3, flexShrink: 1, textAlign: "center" },
  timer: { ...edge, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface, alignItems: "center", gap: 16 }, time: { color: colors.text, fontSize: 54, lineHeight: 68, fontWeight: "600", fontVariant: ["tabular-nums"] },
  controls: { width: "100%", flexDirection: "row", gap: 10 }, grow: { flex: 1 }, disabled: { opacity: 0.5 },
  button: { minHeight: 56, padding: 14, borderRadius: 28, backgroundColor: colors.sheetCard, ...edge, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  buttonText: { ...type.body, fontWeight: "600", color: colors.text }, secondary: { ...edge, minHeight: 56, minWidth: 64, padding: 12, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  link: { ...type.body, fontWeight: "600", color: colors.accent }, error: { ...type.body, color: colors.danger },
});
