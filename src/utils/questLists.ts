import type { Task } from "../services/taskService";

/** Shared scopes keep Home's preview and the quest sheet in the same order. */
export function questLists(tasks: readonly Task[]) {
  const available = tasks.filter(task => !task.is_completed_today && (task.is_recurring || !task.is_completed));
  const today = available.filter(task => task.is_due_today);
  const done = tasks.filter(task => task.is_completed_today);
  return {
    available: available.slice().sort((a, b) => Number(b.is_due_today) - Number(a.is_due_today)),
    today,
    done,
  };
}
