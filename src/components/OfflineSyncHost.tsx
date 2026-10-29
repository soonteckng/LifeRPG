import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import SessionResultSheet from "./SessionResultSheet";
import { useTimer } from "../context/TimerContext";
import { useQuests } from "../context/QuestContext";
import { offlineSyncPresentation, type OfflineSyncBatch } from "../services/offlineSyncPresentation";
import { summarizeOfflineSync } from "../utils/offlineSyncSummary";
import { useActiveSheetCount } from "../utils/sheetActivity";
import type { JournalScope } from "../types/sessionJournal";

/** One receipt for a whole offline catch-up. Done acknowledges every session in it. */
export default function OfflineSyncHost({ scope, batch, active }: { scope: JournalScope; batch: OfflineSyncBatch; active: boolean }) {
  const timer = useTimer({ live: false });
  const { subjects } = useQuests();
  const [sheetActivity] = useState(() => Symbol("offline-sync-summary"));
  const otherSheets = useActiveSheetCount(sheetActivity);
  const [started, setStarted] = useState(false);
  const [foreground, setForeground] = useState(!AppState.currentState || AppState.currentState === "active");
  const [frozen, setFrozen] = useState<OfflineSyncBatch | null>(null);
  const alive = useRef(true), doneRequested = useRef(false);
  const currentTimer = useRef(timer), currentBatch = useRef(batch), frozenRef = useRef<OfflineSyncBatch | null>(null);
  const surfaceActive = active && started && foreground;
  const surfaceRef = useRef(surfaceActive);
  useLayoutEffect(() => { currentTimer.current = timer; currentBatch.current = batch; surfaceRef.current = surfaceActive; }, [timer, batch, surfaceActive]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { const sub = AppState.addEventListener("change", state => setForeground(state === "active")); return () => sub.remove(); }, []);
  if (active && foreground && !started && otherSheets === 0) setStarted(true);

  // The card keeps describing exactly the sessions it showed, even if more
  // arrive while it fades out; they get their own card afterwards.
  const outgoing = frozen ?? batch;
  const summary = useMemo(() => summarizeOfflineSync(outgoing, subjects), [outgoing, subjects]);
  const done = () => {
    if (!surfaceRef.current || doneRequested.current) return;
    doneRequested.current = true;
    frozenRef.current = currentBatch.current;
    setFrozen(currentBatch.current);
  };
  const dismissed = () => {
    const outgoingBatch = frozenRef.current;
    if (!alive.current || !doneRequested.current || !outgoingBatch) return;
    frozenRef.current = null; // a late second callback does nothing
    // Release an underlying completed timer that belongs to this catch-up, so
    // its own card never opens a second time behind this one.
    const latest = currentTimer.current;
    if (!latest.hasOpenSession && outgoingBatch.entries.some(entry => entry.clientSessionId === latest.protectionSessionId
      || entry.receipt.sessionId === latest.sessionSummary?.sessionId)) {
      latest.acknowledgeSummary(); latest.clearCompletionModal();
    }
    if (offlineSyncPresentation.snapshot(scope).batch?.id !== outgoingBatch.id) return;
    offlineSyncPresentation.acknowledge(scope, outgoingBatch.id, outgoingBatch.entries.map(entry => entry.clientSessionId));
  };
  return <SessionResultSheet sessionId={batch.id} visible={surfaceActive && !frozen}
    activityId={sheetActivity} recovered durationSeconds={summary.seconds}
    syncSummary={{ ...summary.syncSummary, pendingCount: timer.unsyncedSessionCount }}
    onClose={done} onDismiss={dismissed} />;
}
