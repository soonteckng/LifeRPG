import type { JournalScope } from "./sessionJournal";

export interface RoutineReminder { enabled: boolean; hour: number; minute: number }
export interface RoutineDraft { name: string; focusAreaId: number | null; durationSeconds: number; reminder: RoutineReminder }
export interface SavedRoutine extends RoutineDraft { id: string; revision: number; deletedAt: number | null }
export interface RoutineOperation { operationId: string; routineId: string; expectedRevision: number; draft: RoutineDraft; deleted: boolean }
export interface RoutineConflict { operation: RoutineOperation; latest: SavedRoutine | null; reason: string }
export interface RoutineEnvelope { version: 1; scope: JournalScope; routines: SavedRoutine[]; pending: RoutineOperation[]; conflicts: RoutineConflict[] }
export interface RoutineState { ready: boolean; busy: boolean; error: string | null; routines: SavedRoutine[]; pendingCount: number; conflicts: RoutineConflict[] }
export interface RoutineReply { status: "saved" | "conflict"; routine: SavedRoutine | null; reason?: "limit" | "area" }
export interface RoutineTransport { list: () => Promise<SavedRoutine[]>; apply: (operation: RoutineOperation) => Promise<RoutineReply> }
