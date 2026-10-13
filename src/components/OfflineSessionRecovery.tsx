import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { type } from "../constants/typography";
import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import OfflineSessionWorkspace from "./OfflineSessionWorkspace";

function checkConnection(request: Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("connection_timeout")), 8000);
    request.then(() => { clearTimeout(timeout); resolve(); }, () => {
      clearTimeout(timeout); reject(new Error("connection_unavailable"));
    });
  });
}

function recoveryState(timer: ReturnType<typeof useTimer>) {
  if (timer.isRestoring) return { title: "Restoring your session", body: "Reading the session saved on this phone.", timer: null };
  if (timer.restoreError) return { title: "Your saved session needs another look", body: "We couldn’t read the saved session. Try loading it again before making any changes.", timer: null };
  if (timer.syncStatus === "rejected") return { title: "Your session needs review", body: "Your account hasn’t accepted this saved session. Reconnect to review it. Its local record is still available.", timer: null };
  if (timer.endingSession) return { title: "Your request to end is saved", body: "We’ll confirm the cancellation when you reconnect. This phone won’t submit a completion while that request is pending.", timer: null };
  if (timer.awaitingStart) return { title: "Checking your session start", body: "Your start request is saved. Reconnect to check its outcome before starting again.", timer: "planned" };
  if (timer.syncStatus === "saved") return { title: "Session saved", body: "Your account confirmed this session. The saved result is kept here.", timer: null };
  if (timer.isCompleted || (timer.hasOpenSession && timer.isRunning && timer.timeLeft <= 0)) {
    return { title: "Waiting for account confirmation", body: "The timer has reached zero. Your session stays on this phone while we wait to confirm it with your account. Progress updates after confirmation.", timer: "remaining" };
  }
  if (timer.hasOpenSession && !timer.isRunning) return { title: "Your session is paused", body: "The last confirmed paused time is kept here. Reconnect to resume or change this session.", timer: "remaining" };
  if (timer.hasOpenSession) return { title: "Your focus is still here", body: "This countdown follows your last confirmed session. Saving the result to your account needs a connection.", timer: "remaining" };
  return { title: "Your account is on this phone", body: "No active session is saved on this phone. Reconnect to start focusing or open your full account.", timer: null };
}

/** Local recovery only. Editable tabs and controls return after online verification. */
export default function OfflineSessionRecovery() {
  const auth = useAuth();
  const { profile } = useUser();
  const timer = useTimer();
  const { width, fontScale } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const cached = auth.cachedProfile?.id === auth.localOwner?.id ? auth.cachedProfile
    : profile.id === auth.localOwner?.id ? profile : null;
  const scope = `${auth.localOwner?.backendId ?? ""}:${auth.localOwner?.id ?? ""}:${auth.admissionEpoch}`;
  const currentState = recoveryState(timer);
  const rawSeconds = currentState.timer === "planned" ? timer.duration : timer.isCompleted ? 0 : timer.timeLeft;
  const currentSeconds = Number.isFinite(rawSeconds) ? Math.max(0, Math.floor(rawSeconds)) : 0;
  const currentPresentation = { scope, state: currentState, seconds: currentSeconds, running: timer.isRunning,
    restoreError: timer.restoreError, actionError: timer.actionError };
  const [stable, setStable] = useState<typeof currentPresentation | null>(() => timer.isRestoring ? null : currentPresentation);
  // A local reload must not flash a draft/empty timer between the last known
  // record and the newly read journal. A different account never reuses it.
  if (!timer.isRestoring && (!stable || stable.scope !== scope || stable.state.title !== currentState.title
    || stable.state.body !== currentState.body || stable.state.timer !== currentState.timer || stable.seconds !== currentSeconds
    || stable.running !== timer.isRunning || stable.restoreError !== timer.restoreError || stable.actionError !== timer.actionError)) {
    setStable(currentPresentation);
  }
  const presentation = timer.isRestoring && stable?.scope === scope ? stable : currentPresentation;
  const state = presentation.state;
  const seconds = presentation.seconds;
  const minutes = Math.floor(seconds / 60), remainder = seconds % 60;
  const timeLabel = `${state.timer === "planned" ? "Planned focus" : "Time remaining"}, ${minutes} ${minutes === 1 ? "minute" : "minutes"}, ${remainder} ${remainder === 1 ? "second" : "seconds"}`;
  const disabled = busy || timer.actionBusy || timer.isRestoring;
  const run = async () => {
    if (lock.current || timer.actionBusy) return;
    lock.current = true; setBusy(true); setError(""); setFeedback("");
    try {
      // Saved-work retry already verifies the account. Running a separate auth
      // retry alongside it races admission and repeats the same network check.
      if (timer.restoreError) timer.retryRestore();
      else if (timer.isCompleted) await timer.retryCompletion();
      else if (timer.hasOpenSession || timer.endingSession || timer.awaitingStart) await timer.retryAction();
      else await checkConnection(auth.retrySessionVerification());
      if (mounted.current) setFeedback("Your saved session stays on this phone until your account confirms it. We’ll reconnect automatically when the connection returns.");
    } catch {
      if (mounted.current) setError("Couldn’t reconnect yet. Check your connection and try again.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  if ((timer.offlineAvailable || timer.clientReported) && !timer.restoreError && !timer.awaitingStart
    && !(timer.endingSession && !timer.clientReported)) return <OfflineSessionWorkspace />;
  return <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.page} testID="offline-session-recovery">
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      <View style={styles.content}>
        <View style={styles.badge} accessible accessibilityRole="text" accessibilityLabel="Offline. Working from saved account details on this phone.">
          <View style={styles.dot} />
          <Text style={styles.badgeText}>Offline</Text>
        </View>
        <View style={styles.intro}>
          <Text style={styles.heading} accessibilityRole="header">{cached?.username ? `Welcome back, ${cached.username}.` : "Welcome back."}</Text>
          <Text style={styles.body}>Working from saved account details. We’ll reconnect before making changes.</Text>
          {cached && <Text style={styles.caption}>Last saved daily goal: {cached.daily_goal_minutes} min</Text>}
        </View>
        <View style={styles.card}>
          <Text style={styles.statusTitle} accessibilityRole="header">{state.title}</Text>
          {state.timer && <View testID="offline-countdown" accessible accessibilityRole="text" accessibilityLabel={timeLabel}>
            <Text style={styles.caption}>{state.timer === "planned" ? "Planned focus" : presentation.running ? "Time remaining" : "Saved time remaining"}</Text>
            <View style={[styles.time, { flexDirection: width < 350 || fontScale > 1.5 ? "column" : "row" }]}>
              <View style={styles.unit}><Text testID="offline-minutes" style={styles.number}>{minutes}</Text><Text style={styles.unitLabel}>min</Text></View>
              <View style={styles.unit}><Text testID="offline-seconds" style={styles.number}>{String(remainder).padStart(2, "0")}</Text><Text style={styles.unitLabel}>sec</Text></View>
            </View>
          </View>}
          <Text style={styles.body}>{state.body}</Text>
          {presentation.restoreError && !!presentation.actionError && <Text style={styles.error}
            accessibilityRole="alert" accessibilityLiveRegion="polite">{presentation.actionError}</Text>}
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry connection"
            accessibilityState={{ disabled, busy: busy || timer.actionBusy }} disabled={disabled} onPress={() => void run()}
            style={styles.button}>
            <Text style={styles.buttonText}>Retry connection</Text>
          </Pressable>
          {!!feedback && <Text accessibilityLiveRegion="polite" style={styles.caption}>{feedback}</Text>}
          {!!error && <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </View>
        <Text style={styles.caption}>New sessions, session changes and account editing return after your account is verified online.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  content: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 24 },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 16, backgroundColor: colors.accentSoft },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  badgeText: { ...type.caption, color: colors.accent },
  intro: { gap: 12 },
  heading: { ...type.pageTitle, fontSize: 30, lineHeight: 38 },
  body: { ...type.body, color: colors.secondary },
  caption: { ...type.secondary },
  card: { padding: 20, gap: 18, borderRadius: 24, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  statusTitle: { ...type.pageTitle, fontSize: 22, lineHeight: 30 },
  time: { gap: 20, paddingVertical: 12, alignItems: "flex-start" },
  unit: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  number: { fontSize: 48, lineHeight: 58, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.text },
  unitLabel: { ...type.body, color: colors.secondary },
  actions: { gap: 12 },
  button: { minHeight: 52, paddingHorizontal: 18, paddingVertical: 14, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.primary },
  buttonText: { ...type.body, fontWeight: "600", color: colors.primaryText, textAlign: "center" },
  error: { ...type.body, color: colors.danger },
});
