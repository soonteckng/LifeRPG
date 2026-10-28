import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, BackHandler, StyleSheet } from "react-native";
import { usePathname, useRouter } from "expo-router";
import SessionResultSheet from "./SessionResultSheet";
import { ExpeditionReveal } from "./rewards/RevealScreens";
import { useRewards, rewardsStore } from "../hooks/useRewards";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { useQuests } from "../context/QuestContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { offlineSyncPresentation, type OfflineSyncBatch } from "../services/offlineSyncPresentation";
import { offlineSyncCelebration, offlineSyncReturn, summarizeOfflineSync } from "../utils/offlineSyncSummary";
import { dailyAchievementQueue } from "../services/dailyAchievementQueue";
import { DEFAULT_TIMEZONE } from "../utils/progressAnalytics";
import { registerSheetActivity, useActiveSheetCount } from "../utils/sheetActivity";
import type { JournalScope } from "../types/sessionJournal";

const CLAIM_WAIT_MS = 15_000;
type Phase = "summary" | "preparing" | "closing" | "map" | "leaving";

/** One receipt and one retained return screen for a whole offline catch-up. */
export default function OfflineSyncHost({ scope, batch, active }: { scope: JournalScope; batch: OfflineSyncBatch; active: boolean }) {
  const rewards = useRewards({ load: false }), timer = useTimer({ live: false });
  const { profile } = useUser(), { subjects } = useQuests();
  const router = useRouter(), pathname = usePathname(), reduced = useReducedMotion();
  const [sheetActivity] = useState(() => Symbol("offline-sync-summary"));
  const [returnActivity] = useState(() => Symbol("offline-sync-return"));
  const otherSheets = useActiveSheetCount(sheetActivity);
  const [started, setStarted] = useState(false), [phase, setPhase] = useState<Phase>("summary");
  const [foreground, setForeground] = useState(!AppState.currentState || AppState.currentState === "active");
  const [away, setAway] = useState<{ arrived: boolean } | null>(null);
  if (away && !away.arrived && pathname === "/outfits") setAway({ arrived: true });
  if (away?.arrived && pathname !== "/outfits") setAway(null);
  const [frozen, setFrozen] = useState<OfflineSyncBatch | null>(null);
  const [claimSettled, setClaimSettled] = useState(false), [prepared, setPrepared] = useState<ReturnType<typeof offlineSyncReturn> | null>(null);
  const [mapReady, setMapReady] = useState(false), [trailStarted, setTrailStarted] = useState(false);
  const [opacity] = useState(() => new Animated.Value(1));
  const alive = useRef(true), phaseRef = useRef(phase), closeGeneration = useRef(0);
  const currentTimer = useRef(timer), currentBatch = useRef(batch), currentRewards = useRef(rewards);
  const claimStarted = useRef(false), doneRequested = useRef(false);
  const surfaceActive = active && started && foreground && !away;
  const surfaceRef = useRef(surfaceActive);
  useLayoutEffect(() => { phaseRef.current = phase; currentTimer.current = timer; currentBatch.current = batch;
    currentRewards.current = rewards; surfaceRef.current = surfaceActive; }, [phase, timer, batch, rewards, surfaceActive]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; opacity.stopAnimation(); }; }, [opacity]);
  useEffect(() => { const sub = AppState.addEventListener("change", state => setForeground(state === "active")); return () => sub.remove(); }, []);
  if (active && foreground && !started && otherSheets === 0) setStarted(true);

  // Reuse the existing claim endpoint after the pass, never between imports.
  // One bounded existing backlog follow-up is enough; no polling on errors.
  useEffect(() => {
    if (prepared) return;
    if (!active || !started || claimStarted.current || claimSettled || rewards.busy || !rewards.online) return;
    claimStarted.current = true;
    const current = () => alive.current && offlineSyncPresentation.snapshot(scope).batch?.id === batch.id;
    void (async () => {
      const first = await currentRewards.current.claimSessions({ offlineBatchId: batch.id });
      if (current() && first.ok && first.value.sessions.length === 50 && (first.value.state.today.pendingFinds ?? 0) > 0)
        await currentRewards.current.claimSessions({ offlineBatchId: batch.id });
    })().catch(() => {}).finally(() => { if (current()) setClaimSettled(true); });
  }, [active, started, claimSettled, rewards.busy, rewards.online, scope, batch.id, prepared]);
  useEffect(() => {
    if (!started || claimSettled) return;
    const limit = setTimeout(() => setClaimSettled(true), CLAIM_WAIT_MS);
    return () => clearTimeout(limit);
  }, [started, claimSettled]);

  const outgoing = frozen ?? batch;
  const summary = useMemo(() => summarizeOfflineSync(outgoing, subjects), [outgoing, subjects]);
  const done = () => {
    if (!surfaceRef.current || phaseRef.current !== "summary" || doneRequested.current) return;
    doneRequested.current = true;
    setFrozen(currentBatch.current); setPhase("preparing");
  };
  if (phase === "preparing" && !prepared && frozen && (claimSettled || !rewards.online))
    setPrepared(offlineSyncReturn(frozen, rewards.reveals, rewards.state));
  const contentReady = useCallback(() => { if (alive.current) setMapReady(true); }, []);
  if (phase === "preparing" && prepared && mapReady && surfaceActive) setPhase("closing");
  if (!surfaceActive && phase === "preparing" && mapReady) setMapReady(false);
  const dismissed = () => {
    if (!alive.current || !doneRequested.current || phaseRef.current !== "closing" || !frozen) return;
    // Release an underlying completed timer while the opaque return covers it,
    // so the map's final fade reveals the app rather than a second timer exit.
    const latest = currentTimer.current;
    if (!latest.hasOpenSession && frozen.entries.some(entry => entry.clientSessionId === latest.protectionSessionId
      || entry.receipt.sessionId === latest.sessionSummary?.sessionId)) {
      latest.acknowledgeSummary(); latest.clearCompletionModal();
    }
    setPhase("map");
  };
  const close = useCallback(() => {
    if (!surfaceRef.current || phaseRef.current !== "map" || !frozen || !prepared) return;
    phaseRef.current = "leaving"; setPhase("leaving");
    const generation = ++closeGeneration.current;
    const finish = ({ finished }: { finished: boolean }) => {
      if (!finished || !alive.current || generation !== closeGeneration.current) return;
      const current = offlineSyncPresentation.snapshot(scope).batch;
      if (current?.id !== frozen.id) return;
      // Only the exact outgoing return is seen. Late finds retain their card,
      // but the acknowledged receipt IDs prevent another map for them.
      for (const id of prepared.consumedIds) rewardsStore.dismissReveal(scope.ownerId, id);
      const evidence = offlineSyncCelebration(frozen, scope.ownerId, profile?.timezone || DEFAULT_TIMEZONE);
      if (evidence) dailyAchievementQueue.enqueue(evidence);
      offlineSyncPresentation.acknowledge(scope, frozen.id, frozen.entries.map(entry => entry.clientSessionId));
    };
    if (reduced) { opacity.setValue(0); finish({ finished: true }); }
    else Animated.timing(opacity, { toValue: 0, duration: 480, useNativeDriver: true }).start(finish);
  }, [frozen, prepared, scope, reduced, opacity, profile?.timezone]);
  if (!surfaceActive && phase === "leaving") setPhase("map");
  useEffect(() => {
    if (surfaceActive) return;
    closeGeneration.current++; opacity.stopAnimation(); opacity.setValue(1);
  }, [surfaceActive, phase, opacity]);
  useEffect(() => {
    if (!surfaceActive || !prepared) return;
    return registerSheetActivity(returnActivity);
  }, [surfaceActive, prepared, returnActivity]);
  useEffect(() => {
    if (!surfaceActive || phase !== "map") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; });
    return () => sub.remove();
  }, [surfaceActive, phase, close]);
  const player = { look: rewards.look, equipped: rewards.equipped, level: profile?.level ?? 1, background: rewards.background, frame: rewards.frame,
    today: rewards.today, nextFindSeconds: rewards.nextFindSeconds, trail: rewards.trail };
  return <>
    {surfaceActive && prepared && <Animated.View testID="offline-sync-return" accessibilityViewIsModal
      pointerEvents="auto" style={[StyleSheet.absoluteFill, s.return, { opacity }]}>
      <ExpeditionReveal reveal={prepared.reveal} player={player} onClose={close} onReady={contentReady}
        walkDelay={phase === "preparing" || phase === "closing" ? 60_000 : 650} startAtTrail={trailStarted}
        onTrail={() => setTrailStarted(true)} onOutfits={item => { setAway({ arrived: false }); router.push({ pathname: "/outfits", params: { show: item } }); }} />
    </Animated.View>}
    <SessionResultSheet sessionId={batch.id} visible={surfaceActive && (phase === "summary" || phase === "preparing")}
      activityId={sheetActivity} recovered durationSeconds={summary.seconds} xpEarned={summary.xpEarned}
      syncSummary={{ ...summary.syncSummary, pendingCount: timer.unsyncedSessionCount, preparing: phase === "preparing" }}
      onClose={done} onDismiss={dismissed} />
  </>;
}

const s = StyleSheet.create({ return: { zIndex: 60, backgroundColor: "#0B0F1A" } });
