import { generalArea } from "./focusAreas";
import type { CreateTaskParams, Subject, Task } from "../services/taskService";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DURATIONS = [15, 30, 45, 60];
export interface QuestDraft {
  title: string;
  minutes: string;
  repeat: "once" | "daily" | "custom";
  days: string[];
  subjectId: number | null;
}
export function makeQuestDraft(task?: Task | null): QuestDraft {
  const rule = task?.repeat_rule || "once";
  return {
    title: task?.title ?? "", minutes: String(task?.target_minutes || 30),
    repeat: rule === "once" || rule === "daily" ? rule : "custom",
    days: rule === "once" || rule === "daily" ? [] : rule.split(",").map((day) => day.trim()).filter(Boolean),
    subjectId: task?.subject_id ?? null,
  };
}
export function draftKey(draft: QuestDraft) {
  return JSON.stringify({ ...draft, days: draft.repeat === "custom" ? DAYS.filter((day) => draft.days.includes(day)) : [] });
}
export function validateQuestDraft(draft: QuestDraft): string | null {
  if (!draft.title.trim()) return "Give your quest a name first.";
  if (!/^\d+$/.test(draft.minutes.trim()) || Number(draft.minutes) < 1 || Number(draft.minutes) > 480)
    return "Enter a duration between 1 and 480 minutes.";
  if (draft.repeat === "custom" && draft.days.length === 0) return "Select at least one day for your quest.";
  return null;
}
export function questParams(draft: QuestDraft, subjects: Subject[], task: Task | null): CreateTaskParams {
  return {
    title: draft.title.trim(), targetMinutes: Number(draft.minutes),
    subjectId: draft.subjectId ?? generalArea(subjects)?.id ?? null,
    repeatRule: draft.repeat === "custom" ? DAYS.filter((day) => draft.days.includes(day)).join(",") : draft.repeat,
    difficulty: task?.difficulty ?? "medium",
  };
}
