import type { Task } from "../services/taskService";
import type { SavedRoutine } from "../types/savedRoutine";
import { questLists } from "./questLists";

/** One presentation, preserving each record's identity and completion rules. */
export type RoutineEntry =
  | { kind: "saved"; key: string; name: string; seconds: number; areaId: number | null; routine: SavedRoutine }
  | { kind: "legacy"; key: string; name: string; seconds: number; areaId: number | null; task: Task };

export function routinePresentation(routines: readonly SavedRoutine[], tasks: readonly Task[] = []) {
  const { available, done } = questLists(tasks);
  const entries: RoutineEntry[] = [
    ...available.map(task => ({ kind: "legacy" as const, key: `task:${task.id}`, name: task.title,
      seconds: (task.target_minutes || 30) * 60, areaId: task.subject_id ?? null, task })),
    ...routines.filter(routine => routine.deletedAt === null).map(routine => ({ kind: "saved" as const, key: `routine:${routine.id}`,
      name: routine.name, seconds: routine.durationSeconds, areaId: routine.focusAreaId, routine })),
  ];
  return { entries, done };
}
