import { tapHaptic, tapHapticsEnabled } from "../utils/tapHaptics";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import { colors, radius, edge } from "../constants/theme";
import { type } from "../constants/typography";
import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { useOfflineReconnect } from "../hooks/useOfflineReconnect";
import { homeWelcome } from "../utils/homeWelcome";
import { sessionBackendIdentity } from "../utils/sessionBackend";
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
export default function OfflineSessionRecovery({ active = true }: { active?: boolean }) {
  const auth = useAuth();
  const { profile } = useUser();
  const timer = useTimer();
  const { width, fontScale } = useWindowDimensions();
  const liveOwner = auth.localOwner;
  const liveCached = auth.cachedProfile?.id === liveOwner?.id ? auth.cachedProfile : profile?.id === liveOwner?.id ? profile : null;
  const [lastIdentity, setLastIdentity] = useState(() => liveOwner ? { owner: liveOwner, cached: liveCached, epoch: auth.admissionEpoch } : null);
  if (liveOwner && (lastIdentity?.owner.id !== liveOwner.id || lastIdentity.owner.backendId !== liveOwner.backendId || lastIdentity.cached !== liveCached || lastIdentity.epoch !== auth.admissionEpoch)) {
    setLastIdentity({ owner: liveOwner, cached: liveCached, epoch: auth.admissionEpoch });
  }
  const configuredBackend = sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId;
  const leaving = !active && !liveOwner && !!lastIdentity && auth.user?.id === lastIdentity.owner.id
    && configuredBackend === lastIdentity.owner.backendId;
  const owner = leaving ? lastIdentity?.owner : liveOwner;
  const cached = leaving ? lastIdentity?.cached : liveCached;
  const name = cached?.username?.trim() || "Hero";
  const hour = new Date().getHours();
  const scope = `${owner?.backendId ?? ""}:${owner?.id ?? ""}:${leaving ? lastIdentity?.epoch : auth.admissionEpoch}`;
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
  const workspaceAvailable = (timer.offlineAvailable || timer.clientReported) && !timer.restoreError && !timer.awaitingStart
    && !(timer.endingSession && !timer.clientReported);
  const run = async () => {
    // Saved-work retry already verifies the account. Running a separate auth
    // retry alongside it races admission and repeats the same network check.
    if (timer.restoreError) timer.retryRestore();
    else if (timer.isCompleted) await timer.retryCompletion();
    else if (timer.hasOpenSession || timer.endingSession || timer.awaitingStart) await timer.retryAction();
    else await checkConnection(auth.retrySessionVerification());
  };
  const reconnect = useOfflineReconnect({
    scope: liveOwner ? JSON.stringify([liveOwner.backendId, liveOwner.id, auth.admissionEpoch]) : null,
    active: active && !workspaceAvailable, blocked: timer.actionBusy || timer.isRestoring, reconnect: run,
  });
  const checking = reconnect.checking || timer.actionBusy || timer.isRestoring;
  // Leaving the screen keeps showing recovery, so nothing flashes as it fades.
  if (workspaceAvailable && active) return <OfflineSessionWorkspace active={active} />;
  return <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.page} testID="offline-session-recovery">
    <ScrollView style={styles.viewport} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      <View style={styles.content}>
        <View style={styles.identityRow}>
          <View style={styles.intro}><Text style={styles.greeting}>{homeWelcome(hour < 5 ? 18 : hour, name).split(",")[0]},</Text><Text style={styles.heading} accessibilityRole="header" numberOfLines={1}>{name}</Text></View>
          <View style={styles.badge} accessible accessibilityRole="text" accessibilityLabel="Offline. Working from saved account details on this phone.">
            <View style={styles.dot} /><Text style={styles.badgeText}>Offline</Text>
          </View>
        </View>
        <View style={styles.localNotice}>
          <View style={styles.noticeRow}><Ionicons name="cloud-offline-outline" size={20} color={colors.accent} /><Text style={styles.noticeTitle}>Saved on this phone</Text></View>
          <Text style={styles.caption}>Your saved record stays here while we reconnect.</Text>
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
          <Pressable testID="offline-recovery-retry-connection" accessibilityRole="button" accessibilityLabel="Retry connection"
            accessibilityState={{ disabled: reconnect.disabled, busy: checking }} disabled={reconnect.disabled} onPress={() => { if (tapHapticsEnabled()) tapHaptic(); void reconnect.retry(); }}
            style={styles.button}>
            <Text style={styles.buttonText}>{checking ? "Checking…" : "Retry connection"}</Text><Ionicons name="refresh-outline" size={17} color={colors.accent} />
          </Pressable>
          <Text accessibilityLiveRegion="polite" style={styles.caption}>We’ll reconnect automatically when the connection returns.</Text>
        </View>
        <Text style={styles.caption}>Your full account returns after online verification.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  viewport: { flex: 1, minHeight: 0 }, scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  content: { width: "100%", maxWidth: 600, alignSelf: "center", gap: 26 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 14, backgroundColor: colors.accentSoft },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  badgeText: { ...type.caption, color: colors.accent },
  intro: { flex: 1, minWidth: 0, gap: 2 }, greeting: { color: colors.secondary, fontSize: 15, lineHeight: 20 },
  heading: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: "700", letterSpacing: -0.8 },
  localNotice: { ...edge, padding: 16, gap: 6, borderRadius: radius.card, backgroundColor: colors.surface }, noticeRow: { flexDirection: "row", alignItems: "center", gap: 10 }, noticeTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  body: { ...type.body, color: colors.secondary },
  caption: { ...type.secondary },
  card: { padding: 16, gap: 14, borderRadius: radius.card, backgroundColor: colors.surface, ...edge },
  statusTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  time: { gap: 16, paddingVertical: 8, alignItems: "flex-start" },
  unit: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  number: { fontSize: 40, lineHeight: 48, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.text },
  unitLabel: { ...type.body, color: colors.secondary },
  actions: { gap: 10, alignItems: "stretch" },
  button: { ...edge, minHeight: 48, paddingHorizontal: 18, paddingVertical: 12, alignItems: "center", justifyContent: "space-between", flexDirection: "row", gap: 8, borderRadius: 24, backgroundColor: colors.sheetCard },
  buttonText: { color: colors.accent, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  error: { ...type.body, color: colors.danger },
});
