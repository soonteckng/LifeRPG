import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import ContentReveal from "./ContentReveal";
import ProgressRing from "./ProgressRing";
import FocusLengthControl from "./FocusLengthControl";
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
import { readOfflineFocusAreas, type OfflineFocusArea } from "../services/offlineFocusCatalog";

/** Results belong to the stable global sheet; this surface owns offline controls. */
export default function OfflineSessionWorkspace({ active: surfaceActive = true }: { active?: boolean }) {
  const timer = useTimer(), auth = useAuth();
  const { hapticsEnabled = true } = useUser();
  const { width } = useWindowDimensions();
  const owner = auth.localOwner;
  const ownerId = owner?.id, backendId = owner?.backendId;
  const scopeKey = JSON.stringify([backendId, ownerId]);
  const duration = useFocusDurationPreference(ownerId ?? "");
  const preference = useGuidedPreference(ownerId ?? "");
  const [directionOpen, setDirectionOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [previousActive, setPreviousActive] = useState(surfaceActive);
  if (surfaceActive !== previousActive) {
    setPreviousActive(surfaceActive);
    if (!surfaceActive) { setDirectionOpen(false); setConfirmEnd(false); }
  }
  if (confirmEnd && (!timer.hasOpenSession || timer.endingSession || timer.sessionEnded || timer.isCompleted)) setConfirmEnd(false);
  const [catalog, setCatalog] = useState<{ scope: string; areas: OfflineFocusArea[] } | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState("");
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
  const tint = area?.color_code ?? FOCUS_AREAS.find(item => item.kind === kind)!.color;
  const resultEnding = !timer.isCompleted && (timer.endingSession || timer.sessionEnded);
  const terminal = timer.isCompleted || resultEnding || timer.syncStatus === "rejected";
  const active = timer.hasOpenSession && !timer.endingSession;
  const busy = timer.isRestoring || timer.actionBusy || localBusy;
  const uncertain = !timer.clientReported && (timer.syncStatus === "waiting" || !timer.offlineControlsAvailable);
  const currentFocus = readSuggestedFocus(timer.notes);
  const feedback = () => { if (hapticsEnabled) void Haptics.selectionAsync().catch(() => {}); };
  const action = async (work: () => Promise<unknown>) => {
    if (busy) return false;
    feedback(); setLocalBusy(true); setError("");
    try { await work(); return true; }
    catch { setError("Couldn’t save that change. Your session is still on this phone."); return false; }
    finally { setLocalBusy(false); }
  };
  const start = () => action(async () => {
    const started = focus
      ? await timer.startSuggestedTimer({ ...focus, seconds: duration.selectedSeconds }, area?.id ?? null)
      : await timer.startFreeTimer(duration.selectedSeconds, area?.id ?? null);
    if (!started) setError("Couldn’t start yet. Try again; your saved sessions stay here.");
  });
  const end = async () => {
    setConfirmEnd(false);
    await action(timer.resetTimer);
  };
  const ringSize = Math.max(180, Math.min(width - 80, 310));
  return <SafeAreaView style={s.page} edges={["top", "bottom"]} testID="offline-session-workspace">
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.content}>
        <View style={s.badge}><View style={s.dot} /><Text style={s.badgeText}>Offline</Text></View>
        <Text style={s.heading}>{active ? timer.isRunning ? "Keep going." : "Take a moment." : terminal ? timer.isCompleted ? "Time well spent." : "Session stopped." : "Make room for what matters."}</Text>
        <Text style={s.body}>{active ? "Your timer and controls work on this phone." : terminal
          ? "Your session is kept on this phone." : "Choose something to work on. We’ll save your session here and sync it when you reconnect."}</Text>
        {active ? <ContentReveal key="active"><View style={s.timer}>
          <ProgressRing size={ringSize} progress={1 - timer.timeLeft / Math.max(1, timer.duration)}>
            <Text allowFontScaling={false} style={s.time} accessibilityLabel={`Time remaining ${sessionTime(timer.timeLeft)}`}>{sessionTime(timer.timeLeft)}</Text>
            <Text style={s.caption}>{timer.isRunning ? "Time remaining" : "Paused"}</Text>
          </ProgressRing>
          {!!currentFocus && <Text style={s.cardTitle}>{currentFocus.title}</Text>}
          {!!currentFocus && <Text style={s.body}>{currentFocus.instruction}</Text>}
          <View style={s.controls}>
            <Pressable disabled={busy || uncertain} accessibilityRole="button" accessibilityState={{ disabled: busy || uncertain }} accessibilityLabel={timer.isRunning ? "Pause session" : "Resume session"}
              onPress={() => void action(timer.isRunning ? timer.pauseTimer : timer.resumeTimer)} style={[s.button, s.grow, (busy || uncertain) && s.disabled]}>
              <Ionicons name={timer.isRunning ? "pause-outline" : "play-outline"} size={22} color={colors.primaryText} />
              <Text style={s.buttonText}>{timer.isRunning ? "Pause" : "Resume"}</Text>
            </Pressable>
            <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="End session" onPress={() => { feedback(); setConfirmEnd(true); }} style={s.secondary}>
              <Text style={s.link}>End</Text>
            </Pressable>
          </View>
          {uncertain && <Text style={s.caption}>Reconnect to confirm the previous state before pausing or resuming. You can still End this session.</Text>}
          <Text style={s.caption}>Ending early doesn’t earn progress.</Text>
        </View></ContentReveal> : terminal ? null : <>
          <View style={s.card}>
            <Text style={s.label}>{focus ? "Suggested focus" : "Free focus"}</Text>
            <ContentReveal key={focus?.templateId ?? "free"}>
              <Text style={s.cardTitle}>{focus?.title ?? "One thing at a time."}</Text>
              <Text style={[s.body, s.instruction]}>{focus?.instruction ?? "Choose one thing you’d like to work on. Set a time that feels manageable, settle in, and give it your attention for this block."}</Text>
            </ContentReveal>
            <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Choose focus area" onPress={() => { feedback(); setDirectionOpen(true); }} style={s.areaRow}>
              <Text style={s.label}>Focus area</Text><View style={s.areaValue}><View style={[s.dot, { backgroundColor: tint }]} /><Text style={s.areaTitle}>{areaTitle}</Text><Ionicons name="chevron-forward" size={18} color={colors.accent} /></View>
            </Pressable>
            {surfaceActive && <FocusLengthControl seconds={duration.selectedSeconds} customSeconds={duration.value.customSeconds} disabled={busy}
              onChange={seconds => { void duration.choose(seconds); }} onCustomSave={seconds => { void duration.choose(seconds, true); }} />}
            <Pressable disabled={busy || !duration.ready || !preference.ready || !catalogReady || !timer.offlineAvailable} accessibilityRole="button" accessibilityLabel="Start session" onPress={() => void start()} style={[s.button, (busy || !timer.offlineAvailable) && s.disabled]}>
              <Ionicons name="play-outline" size={22} color={colors.primaryText} /><Text style={s.buttonText}>Start focusing</Text>
            </Pressable>
            {!timer.offlineAvailable && <Text style={s.caption}>Reconnect before starting another session. Your saved work stays on this phone.</Text>}
          </View>
          <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Find your next step" onPress={() => { feedback(); setDirectionOpen(true); }} style={s.directionCard}>
            <View style={s.grow}><Text style={s.link}>Find your next step</Text><Text style={s.caption}>Change your focus suggestions</Text></View><Ionicons name="chevron-forward" size={20} color={colors.accent} />
          </Pressable>
        </>}
        {timer.unsyncedSessionCount > 0 && <Text style={s.caption} accessibilityLiveRegion="polite">{timer.unsyncedSessionCount} {timer.unsyncedSessionCount === 1 ? "session waiting" : "sessions waiting"} to sync. Your records stay on this phone.</Text>}
        {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
        {!!timer.actionError && <Text style={s.caption} accessibilityLiveRegion="polite">{timer.actionError}</Text>}
        <Pressable disabled={localBusy || timer.isRestoring} accessibilityRole="button" accessibilityLabel="Retry connection"
          onPress={() => void action(async () => { await auth.retrySessionVerification(); })} style={s.secondary}><Text style={s.link}>Retry connection</Text></Pressable>
      </View>
    </ScrollView>
    <GuidedPreferenceSheet owner={ownerId ?? ""} visible={surfaceActive && directionOpen && !active && !terminal} onClose={() => setDirectionOpen(false)} />
    {surfaceActive && active && confirmEnd && <SheetConfirmation title="End this session?" message="This cancels the current session instead of completing it. Completion rewards will not be awarded."
      cancelLabel="Keep session" confirmLabel="End session" onCancel={() => setConfirmEnd(false)} onConfirm={() => void end()} />}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, scroll: { flexGrow: 1, padding: 20 },
  content: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 20 },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.accentSoft },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }, badgeText: { ...type.caption, color: colors.accent },
  heading: { ...type.pageTitle, fontSize: 30, lineHeight: 38 }, body: { ...type.body, color: colors.secondary }, caption: { ...type.secondary },
  card: { padding: 18, gap: 16, borderRadius: 24, backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardTitle: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "500", letterSpacing: -0.5 }, label: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, instruction: { marginTop: 8 },
  areaRow: { minHeight: 44, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  areaValue: { flexDirection: "row", alignItems: "center", flexShrink: 1, gap: 7 }, areaTitle: { color: colors.text, fontSize: 15, lineHeight: 21, flexShrink: 1 },
  directionCard: { minHeight: 80, borderRadius: 24, padding: 18, backgroundColor: colors.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 12 },
  timer: { alignItems: "center", gap: 24 }, time: { color: colors.text, fontSize: 54, lineHeight: 68, fontWeight: "600", fontVariant: ["tabular-nums"] },
  controls: { width: "100%", flexDirection: "row", gap: 10 }, grow: { flex: 1 }, disabled: { opacity: 0.5 },
  button: { minHeight: 52, padding: 14, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  buttonText: { ...type.body, fontWeight: "600", color: colors.primaryText }, secondary: { minHeight: 48, padding: 12, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  link: { ...type.body, fontWeight: "600", color: colors.accent }, error: { ...type.body, color: colors.danger },
});
