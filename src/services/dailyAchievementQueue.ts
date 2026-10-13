import { dailyGoalEvidence, firstDailyEffortEvidence, type DailyEffortEvidence } from "./dailyEffortCelebrationService";

export interface DailyAchievementRequest {
  id: number;
  evidence: Readonly<DailyEffortEvidence>;
}

/** Presentation only: immutable confirmed evidence, released after result dismissal. */
export function createDailyAchievementQueue() {
  let request: DailyAchievementRequest | null = null, sequence = 0;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    snapshot: () => request,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    enqueue(evidence: DailyEffortEvidence) {
      if (!firstDailyEffortEvidence(evidence) && !dailyGoalEvidence(evidence)) return false;
      if (request && request.evidence.ownerId === evidence.ownerId && request.evidence.sessionId === evidence.sessionId) return false;
      request = Object.freeze({ id: ++sequence, evidence: Object.freeze({ ...evidence }) });
      notify(); return true;
    },
    dismiss(id: number) { if (request?.id === id) { request = null; notify(); } },
  };
}

export const dailyAchievementQueue = createDailyAchievementQueue();
