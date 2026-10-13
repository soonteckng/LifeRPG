import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "./AppText";
import ProgressRing from "./ProgressRing";
import FocusDurationSheet from "./FocusDurationSheet";
import { colors } from "../constants/theme";
import { type } from "../constants/typography";
import { suggestedFocus } from "../constants/guidedQuests";
import { useTimer } from "../context/TimerContext";
import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import { useFocusDurationPreference } from "../hooks/useFocusDurationPreference";
import { focusAreaKind } from "../utils/focusAreas";
import { sessionTime } from "../utils/sessionSetup";
import { readOfflineFocusAreas, type OfflineFocusArea } from "../services/offlineFocusCatalog";

/** Available only after a verified, durably cached backend capability. */
export default function OfflineSessionWorkspace() {
  const timer = useTimer(), auth = useAuth();
  const { hapticsEnabled = true } = useUser();
  const { width } = useWindowDimensions();
  const owner = auth.localOwner;
  const ownerId = owner?.id, backendId = owner?.backendId;
  const scopeKey = JSON.stringify([backendId, ownerId]);
  const duration = useFocusDurationPreference(owner?.id ?? "");
  const [custom, setCustom] = useState(false);
  const [direction, setDirection] = useState<"learning" | "general">("learning");
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
  const areas = catalog?.scope === scopeKey ? catalog.areas : [];
  const area = areas.find(item => focusAreaKind(item.title) === direction);
  const active = timer.hasOpenSession && !timer.endingSession;
  const terminal = timer.isCompleted || timer.endingSession || timer.syncStatus === "rejected";
  const busy = timer.isRestoring || timer.actionBusy || localBusy;
  const feedback = () => { if (hapticsEnabled) void Haptics.selectionAsync().catch(() => {}); };
  const action = async (work: () => Promise<unknown>) => {
    if (busy) return;
    feedback(); setLocalBusy(true); setError("");
    try { await work(); } catch { setError("Couldn’t save that change. Your session is still on this phone."); }
    finally { setLocalBusy(false); }
  };
  const start = () => action(async () => {
    const focus = suggestedFocus("review-topic", false);
    const started = direction === "learning" && focus
      ? await timer.startSuggestedTimer({ ...focus, seconds: duration.selectedSeconds }, area?.id ?? null)
      : await timer.startFreeTimer(duration.selectedSeconds, area?.id ?? null);
    if (!started) setError("Couldn’t start yet. Try again; your saved sessions stay here.");
  });
  const ringSize = Math.max(180, Math.min(width - 80, 310));
  return <SafeAreaView style={s.page} edges={["top", "bottom"]} testID="offline-session-workspace">
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.content}>
        <View style={s.badge}><View style={s.dot} /><Text style={s.badgeText}>Offline</Text></View>
        <Text style={s.heading}>{active ? timer.isRunning ? "Keep going." : "Take a moment." : terminal ? timer.isCompleted ? "Time well spent." : "Session stopped." : "Make room for what matters."}</Text>
        <Text style={s.body}>{active ? "Your timer and controls work on this phone." : terminal
          ? "Saved on this phone. Your progress will sync when connected." : "Choose something to work on. We’ll save your session here and sync it when you reconnect."}</Text>
        {active ? <View style={s.timer}>
          <ProgressRing size={ringSize} progress={1 - timer.timeLeft / Math.max(1, timer.duration)}>
            <Text allowFontScaling={false} style={s.time} accessibilityLabel={`Time remaining ${sessionTime(timer.timeLeft)}`}>{sessionTime(timer.timeLeft)}</Text>
            <Text style={s.caption}>{timer.isRunning ? "Time remaining" : "Paused"}</Text>
          </ProgressRing>
          <View style={s.controls}>
            <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={timer.isRunning ? "Pause session" : "Resume session"}
              onPress={() => void action(timer.isRunning ? timer.pauseTimer : timer.resumeTimer)} style={[s.button, s.grow]}>
              <Text style={s.buttonText}>{timer.isRunning ? "Pause" : "Resume"}</Text>
            </Pressable>
            <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="End session" onPress={() => void action(timer.resetTimer)} style={s.secondary}>
              <Text style={s.link}>End</Text>
            </Pressable>
          </View>
          <Text style={s.caption}>Ending early doesn’t earn progress.</Text>
        </View> : terminal ? <View style={s.card}>
          <Text style={s.cardTitle}>{timer.isCompleted ? `${sessionTime(timer.duration)} completed` : "Your request to end is saved"}</Text>
          {timer.syncStatus === "rejected" && <Text style={s.body}>This result needs review when connected. Its record is kept on this phone.</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => { feedback(); timer.clearCompletionModal(); }} style={s.button}>
            <Text style={s.buttonText}>Done</Text>
          </Pressable>
        </View> : <View style={s.card}>
          <View style={s.controls}>{(["learning", "general"] as const).map(value => <Pressable key={value} disabled={busy}
            accessibilityRole="button" accessibilityState={{ selected: value === direction }} onPress={() => { feedback(); setDirection(value); }}
            style={[s.choice, value === direction && s.selected]}><Text style={s.choiceText}>{value === "learning" ? "Learning" : "Free focus"}</Text></Pressable>)}</View>
          <Text style={s.cardTitle}>{direction === "learning" ? "Review your notes" : "One thing at a time."}</Text>
          <Text style={s.body}>{direction === "learning" ? "Open one topic and start wherever feels manageable." : "Choose one thing you’d like to work on."}</Text>
          <View style={s.controls}>{[1800, 3600].map(seconds => <Pressable key={seconds} disabled={busy} accessibilityRole="button"
            accessibilityState={{ selected: duration.selectedSeconds === seconds }} onPress={() => { feedback(); void duration.choose(seconds); }} style={s.choice}>
            <Text style={s.choiceText}>{seconds / 60} min</Text></Pressable>)}
            <Pressable disabled={busy} accessibilityRole="button" onPress={() => { feedback(); setCustom(true); }} style={s.choice}><Text style={s.choiceText}>Custom</Text></Pressable>
          </View>
          <Pressable disabled={busy || !duration.ready} accessibilityRole="button" accessibilityLabel="Start session" onPress={() => void start()} style={s.button}><Text style={s.buttonText}>Start · {sessionTime(duration.selectedSeconds)}</Text></Pressable>
        </View>}
        {timer.unsyncedSessionCount > 0 && <Text style={s.caption} accessibilityLiveRegion="polite">{timer.unsyncedSessionCount} {timer.unsyncedSessionCount === 1 ? "session waiting" : "sessions waiting"} to sync. Your records stay on this phone.</Text>}
        {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
        {!!timer.actionError && <Text style={s.caption} accessibilityLiveRegion="polite">{timer.actionError}</Text>}
        <Pressable disabled={localBusy || timer.isRestoring} accessibilityRole="button" accessibilityLabel="Retry connection"
          onPress={() => void action(async () => { await auth.retrySessionVerification(); })} style={s.secondary}><Text style={s.link}>Retry connection</Text></Pressable>
      </View>
    </ScrollView>
    <FocusDurationSheet seconds={duration.value.customSeconds ?? duration.selectedSeconds} visible={custom} disabled={busy}
      onClose={() => setCustom(false)} onSave={seconds => { void duration.choose(seconds, true); }} />
  </SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, scroll: { flexGrow: 1, padding: 24 },
  content: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 20 },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.accentSoft },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }, badgeText: { ...type.caption, color: colors.accent },
  heading: { ...type.pageTitle, fontSize: 30, lineHeight: 38 }, body: { ...type.body, color: colors.secondary }, caption: { ...type.secondary },
  card: { padding: 20, gap: 20, borderRadius: 24, backgroundColor: colors.surface }, cardTitle: { ...type.pageTitle, fontSize: 22, lineHeight: 30 },
  timer: { alignItems: "center", gap: 24 }, time: { color: colors.text, fontSize: 54, lineHeight: 68, fontWeight: "600", fontVariant: ["tabular-nums"] },
  controls: { width: "100%", flexDirection: "row", gap: 10 }, grow: { flex: 1 },
  choice: { flex: 1, minHeight: 48, borderRadius: 14, padding: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  selected: { backgroundColor: colors.accentSoft }, choiceText: { ...type.body, fontSize: 15, textAlign: "center" },
  button: { minHeight: 52, padding: 14, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  buttonText: { ...type.body, fontWeight: "600", color: colors.primaryText }, secondary: { minHeight: 48, padding: 12, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  link: { ...type.body, fontWeight: "600", color: colors.accent }, error: { ...type.body, color: colors.danger },
});
