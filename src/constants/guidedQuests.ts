export type StudyNeed = "revision" | "assignments" | "practice";
export const STUDY_NEEDS: { id: StudyNeed; title: string; hint: string }[] = [
  { id: "revision", title: "Review and remember", hint: "Make sense of your class notes." },
  { id: "assignments", title: "Move an assignment forward", hint: "Find a manageable next step." },
  { id: "practice", title: "Practise what you’re learning", hint: "Work through practice material at your own pace." },
];
export interface SuggestedFocus {
  templateId: string;
  need: StudyNeed;
  title: string;
  instruction: string;
  seconds: number;
  smaller: boolean;
}
interface Starter extends Omit<SuggestedFocus, "templateId" | "smaller"> {
  id: string;
  smallTitle: string;
  smallInstruction: string;
}
// Stable IDs are kept for existing preferences/session markers. New selection
// exposes three work blocks, rather than asking users to track each question.
export const STARTER_QUESTS: Starter[] = [
  { id: "review-topic", need: "revision", title: "Review your notes", instruction: "Open the material you want to review. Start with one topic, then keep working through your notes for this focus block.", seconds: 1800, smallTitle: "A short review", smallInstruction: "Spend ten minutes reviewing your notes. Start wherever feels manageable and keep going until the timer ends." },
  { id: "next-deadline", need: "assignments", title: "Work on an assignment", instruction: "Open your assignment and choose the next unfinished part. Keep working on it for this block; a rough draft is a useful start.", seconds: 1800, smallTitle: "A short assignment session", smallInstruction: "Spend ten minutes moving your assignment forward. Choose a manageable part and make a rough start." },
  { id: "practice-question", need: "practice", title: "Practise questions", instruction: "Open your practice material and work through questions at your own pace. Move to the next question when ready; you don’t need to return to the app between questions.", seconds: 1800, smallTitle: "A short practice session", smallInstruction: "Spend ten minutes practising. Start with a question you can attempt, then keep working at your own pace." },
];
export const LEGACY_STARTER_NEEDS: Record<string, StudyNeed> = { "recall-three": "revision", "confusing-point": "revision", "revision-questions": "revision", "assignment-outline": "assignments", "improve-paragraph": "assignments", "continue-assignment": "assignments", "work-problem": "practice", "retry-mistake": "practice", "explain-example": "practice" };
export function defaultFocusId(need: StudyNeed) { return STARTER_QUESTS.find(item => item.need === need)!.id; }
export function suggestedFocus(id: string, smaller = false): SuggestedFocus | null {
  const task = STARTER_QUESTS.find(item => item.id === id) ?? STARTER_QUESTS.find(item => item.need === LEGACY_STARTER_NEEDS[id]);
  return task ? { templateId: task.id, need: task.need, title: smaller ? task.smallTitle : task.title,
    instruction: smaller ? task.smallInstruction : task.instruction, seconds: smaller ? 600 : task.seconds, smaller } : null;
}
// A versioned marker in the existing notes field survives server restoration.
// Only curated IDs are accepted; arbitrary notes remain ordinary notes.
const PREFIX = "liferpg:suggested:v1:";
export function encodeSuggestedFocus(focus: SuggestedFocus): string {
  return PREFIX + JSON.stringify({ id: focus.templateId, smaller: focus.smaller, title: focus.title, instruction: focus.instruction, seconds: focus.seconds });
}
export function readSuggestedFocus(notes?: string | null): SuggestedFocus | null {
  if (!notes?.startsWith(PREFIX)) return null;
  try {
    const value = JSON.parse(notes.slice(PREFIX.length));
    if (typeof value?.id !== "string" || typeof value?.smaller !== "boolean") return null;
    const curated = suggestedFocus(value.id, value.smaller);
    if (!curated) return null;
    // Keep the original wording in saved sessions even if the catalogue evolves.
    if (value.title === undefined && value.instruction === undefined && value.seconds === undefined) return curated;
    if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 80 || typeof value.instruction !== "string" || !value.instruction.trim() || value.instruction.length > 600 || !Number.isInteger(value.seconds) || value.seconds < 1 || value.seconds > 28800) return null;
    return { ...curated, templateId: value.id, title: value.title, instruction: value.instruction, seconds: value.seconds };
  } catch { return null; }
}
