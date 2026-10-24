import type { SessionTimerControllerSnapshot } from "../services/sessionTimerController";

export type SessionClockReading = {
  contextKey: string | null;
  timeLeft: number;
  displayTimeLeft: number | null;
  interactionTimeLeft: number | null;
  breakSecondsLeft: number;
};

// An external-store notification can render before React commits the matching
// session context. Never combine that clock with another phase, break or owner.
// Seconds stay outside this key so ordinary ticks still leave the tabs alone.
export function runtimeContextKey(snapshot: SessionTimerControllerSnapshot, scopeKey: string | null) {
  return JSON.stringify([scopeKey, snapshot.record?.clientSessionId, snapshot.record?.revision, snapshot.record?.state,
    snapshot.restoring, snapshot.busy, snapshot.error, snapshot.restoreError, snapshot.syncStatus,
    snapshot.ending, snapshot.unsyncedSessionCount, snapshot.interaction?.kind,
    snapshot.interaction?.timeLeft == null, snapshot.displayTimeLeft == null, snapshot.finishing,
    (snapshot.breakSecondsLeft ?? 0) > 0, snapshot.recovered, snapshot.offlineAvailable,
    snapshot.cloudSaveVersion, snapshot.rewardsVisible]);
}

export function sessionClockReading(snapshot: SessionTimerControllerSnapshot, scopeKey: string | null): SessionClockReading {
  return { contextKey: runtimeContextKey(snapshot, scopeKey), timeLeft: snapshot.timeLeft,
    displayTimeLeft: snapshot.displayTimeLeft ?? null, interactionTimeLeft: snapshot.interaction?.timeLeft ?? null,
    breakSecondsLeft: snapshot.breakSecondsLeft ?? 0 };
}

export function matchingSessionClockReading(context: SessionClockReading, latest: SessionClockReading) {
  return context.contextKey === latest.contextKey ? latest : context;
}
