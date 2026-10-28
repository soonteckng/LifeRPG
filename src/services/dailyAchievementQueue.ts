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
      if (request && request.evidence.ownerId === evidence.ownerId && request.evidence.creditedDate === evidence.creditedDate) {
        const before = request.evidence;
        const combined = [before, ...(before.confirmedReceipts ?? []), evidence, ...(evidence.confirmedReceipts ?? [])]
          .filter(value => value.ownerId === evidence.ownerId && value.creditedDate === evidence.creditedDate && value.timeZone === evidence.timeZone)
          .map(value => { const receipt: DailyEffortEvidence = { ...value }; delete receipt.confirmedReceipts; return receipt; });
        const proven = [combined.find(value => firstDailyEffortEvidence(value)), combined.find(value => dailyGoalEvidence(value))]
          .filter((value): value is DailyEffortEvidence => !!value);
        evidence = { ...evidence, confirmedReceipts: proven };
        if (before.sessionId === evidence.sessionId && firstDailyEffortEvidence(before) === firstDailyEffortEvidence(evidence)
          && dailyGoalEvidence(before) === dailyGoalEvidence(evidence)) return false;
      }
      request = Object.freeze({ id: ++sequence, evidence: Object.freeze({ ...evidence,
        ...(evidence.confirmedReceipts ? { confirmedReceipts: Object.freeze(evidence.confirmedReceipts.map(receipt => Object.freeze({ ...receipt }))) } : {}),
      }) });
      notify(); return true;
    },
    dismiss(id: number) { if (request?.id === id) { request = null; notify(); } },
  };
}

export const dailyAchievementQueue = createDailyAchievementQueue();
