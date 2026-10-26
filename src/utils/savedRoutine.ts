import type { RoutineDraft, RoutineEnvelope, RoutineOperation, SavedRoutine } from "../types/savedRoutine";
import type { JournalScope } from "../types/sessionJournal";
import { isJournalUuid, validateJournalScope } from "./sessionJournalSchema";
import { MAX_SESSION_SECONDS, validSessionSeconds } from "./sessionSetup";

export const ROUTINE_LIMIT = 32;
export const ROUTINE_QUEUE_LIMIT = 64;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
/** Stored records and already-queued operations keep their original durations. */
export function validStoredRoutineDraft(value: unknown): value is RoutineDraft {
  if (!object(value) || typeof value.name !== "string" || value.name !== value.name.trim() || !value.name.length || value.name.length > 80 || /[\u0000-\u001f\u007f]/.test(value.name)) return false;
  const reminder = value.reminder;
  return (value.focusAreaId === null || integer(value.focusAreaId, 1, Number.MAX_SAFE_INTEGER)) && integer(value.durationSeconds, 1, MAX_SESSION_SECONDS)
    && object(reminder) && typeof reminder.enabled === "boolean" && integer(reminder.hour, 0, 23) && integer(reminder.minute, 0, 59);
}
export function validRoutineDraft(value: unknown): value is RoutineDraft {
  return validStoredRoutineDraft(value) && validSessionSeconds(value.durationSeconds);
}
export function validSavedRoutine(value: unknown): value is SavedRoutine {
  return validStoredRoutineDraft(value) && object(value) && isJournalUuid(value.id) && integer(value.revision, 0, Number.MAX_SAFE_INTEGER)
    && (value.deletedAt === null || integer(value.deletedAt, 0, Number.MAX_SAFE_INTEGER));
}
export function validRoutineOperation(value: unknown): value is RoutineOperation {
  return object(value) && isJournalUuid(value.operationId) && isJournalUuid(value.routineId) && integer(value.expectedRevision, 0, Number.MAX_SAFE_INTEGER)
    && validStoredRoutineDraft(value.draft) && typeof value.deleted === "boolean";
}
export function routineStorageKey(scope: JournalScope): string {
  validateJournalScope(scope);
  return `liferpg:routines:v1:${scope.backendId}:${scope.ownerId}`;
}
export function emptyRoutineEnvelope(scope: JournalScope): RoutineEnvelope {
  validateJournalScope(scope); return { version: 1, scope: { ...scope }, routines: [], pending: [], conflicts: [] };
}
export function parseRoutineEnvelope(raw: string | null, scope: JournalScope): RoutineEnvelope {
  if (raw === null) return emptyRoutineEnvelope(scope);
  if (raw.length > 256 * 1024) throw new Error("Your saved routines need another look. Try loading them again.");
  const value = JSON.parse(raw);
  if (!object(value) || value.version !== 1 || !object(value.scope) || value.scope.ownerId !== scope.ownerId || value.scope.backendId !== scope.backendId
    || !Array.isArray(value.routines) || value.routines.length > ROUTINE_LIMIT + ROUTINE_QUEUE_LIMIT || !value.routines.every(validSavedRoutine)
    || new Set(value.routines.map(item => item.id)).size !== value.routines.length
    || !Array.isArray(value.pending) || value.pending.length > ROUTINE_QUEUE_LIMIT || !value.pending.every(validRoutineOperation)
    || new Set(value.pending.map(item => item.operationId)).size !== value.pending.length
    || !Array.isArray(value.conflicts) || value.conflicts.length > 8 || !value.conflicts.every(item => object(item) && validRoutineOperation(item.operation)
      && (item.latest === null || validSavedRoutine(item.latest)) && typeof item.reason === "string" && item.reason.length <= 200)) throw new Error("Your saved routines need another look. Try loading them again.");
  return value as unknown as RoutineEnvelope;
}
export function visibleRoutines(envelope: RoutineEnvelope): SavedRoutine[] {
  const records = new Map(envelope.routines.map(item => [item.id, item]));
  for (const operation of envelope.pending) records.set(operation.routineId, { ...operation.draft, id: operation.routineId,
    revision: operation.expectedRevision + 1, deletedAt: operation.deleted ? 0 : null });
  return [...records.values()].filter(item => item.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name));
}
export function routineDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60), remainder = seconds % 60;
  return minutes ? `${minutes} min${remainder ? ` ${remainder} sec` : ""}` : `${remainder} sec`;
}
