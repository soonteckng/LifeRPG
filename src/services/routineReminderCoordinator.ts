import type { JournalScope } from "../types/sessionJournal";
import type { SavedRoutine } from "../types/savedRoutine";

export interface ScheduledRoutineReminder { id: string; scopeKey: string; routineId: string; fingerprint: string }
export interface RoutineReminderAdapter {
  fingerprint?: (routine: SavedRoutine) => string;
  allowed: () => Promise<boolean>;
  list: () => Promise<ScheduledRoutineReminder[]>;
  cancel: (id: string) => Promise<void>;
  schedule: (scope: JournalScope, routine: SavedRoutine, fingerprint: string) => Promise<string>;
}
export const routineReminderScope = (scope: JournalScope) => `${scope.backendId}:${scope.ownerId}`;
export const routineReminderFingerprint = (routine: SavedRoutine) => JSON.stringify([routine.name, routine.durationSeconds, routine.reminder.hour, routine.reminder.minute]);

// One serialized reconciler owns all local routine reminders. A delayed schedule
// is cancelled before the next account can use the device.
export function createRoutineReminderCoordinator(adapter: RoutineReminderAdapter) {
  const fingerprintFor = adapter.fingerprint ?? routineReminderFingerprint;
  let desired: { scope: JournalScope | null; routines: SavedRoutine[] } = { scope: null, routines: [] };
  let generation = 0, flight: Promise<void> | null = null;
  return {
    update(scope: JournalScope | null, routines: SavedRoutine[]) {
      desired = { scope, routines }; generation++;
      if (flight) return flight;
      flight = (async () => {
        let processed = -1;
        while (processed !== generation) {
          processed = generation;
          const request = desired;
          const allowed = !!request.scope && await adapter.allowed();
          const active = allowed ? request.routines.filter(item => item.deletedAt === null && item.reminder.enabled) : [];
          const existing = await adapter.list();
          if (processed !== generation) continue;
          const scopeKey = request.scope ? routineReminderScope(request.scope) : "";
          for (const item of existing) {
            const routine = active.find(value => value.id === item.routineId);
            if (item.scopeKey !== scopeKey || !routine || item.fingerprint !== fingerprintFor(routine)) await adapter.cancel(item.id);
          }
          for (const routine of active) {
            if (processed !== generation || !request.scope) break;
            const fingerprint = fingerprintFor(routine);
            if (existing.some(item => item.scopeKey === scopeKey && item.routineId === routine.id && item.fingerprint === fingerprint)) continue;
            const id = await adapter.schedule(request.scope, routine, fingerprint);
            if (processed !== generation) await adapter.cancel(id);
          }
        }
      })().finally(() => { flight = null; });
      return flight;
    },
  };
}
