export type FocusNeed = "revision" | "assignments" | "practice" | "work" | "creative" | "life-admin" | "restore";
// The alias keeps older callers and saved study choices compatible.
export type StudyNeed = FocusNeed;
export type FocusAreaKey = "learning" | "work" | "creative" | "wellbeing" | "personal" | "general";
export const STUDY_NEEDS: { id: FocusNeed; title: string; hint: string }[] = [
  { id: "revision", title: "Review and remember", hint: "Make sense of your class notes." },
  { id: "assignments", title: "Move an assignment forward", hint: "Find a manageable next step." },
  { id: "practice", title: "Practise what you’re learning", hint: "Work through practice material at your own pace." },
];
export interface FocusDirection {
  id: "learning" | "work" | "creative" | "life-admin" | "restore";
  title: string;
  hint: string;
  needs: FocusNeed[];
  defaultNeed: FocusNeed;
}
export const FOCUS_DIRECTIONS: FocusDirection[] = [
  { id: "learning", title: "Learn and study", hint: "Notes, books and practice.", needs: ["revision", "assignments", "practice"], defaultNeed: "revision" },
  { id: "work", title: "Work and projects", hint: "Move something meaningful forward.", needs: ["work"], defaultNeed: "work" },
  { id: "creative", title: "Create and practise", hint: "Make space for your craft.", needs: ["creative"], defaultNeed: "creative" },
  { id: "life-admin", title: "Everyday life", hint: "Plans, admin and small tasks.", needs: ["life-admin"], defaultNeed: "life-admin" },
  { id: "restore", title: "Take a quiet break", hint: "A little time away from screens.", needs: ["restore"], defaultNeed: "restore" },
];
export function focusDirection(need: FocusNeed): FocusDirection {
  return FOCUS_DIRECTIONS.find(direction => direction.needs.includes(need)) ?? FOCUS_DIRECTIONS[0];
}
export interface SuggestedFocus {
  templateId: string;
  need: FocusNeed;
  title: string;
  instruction: string;
  seconds: number;
  smaller: boolean;
}
interface Starter extends Omit<SuggestedFocus, "templateId" | "smaller"> {
  id: string;
  areaKey: FocusAreaKey;
  smallTitle: string;
  smallInstruction: string;
}
// IDs, wording and the v1 session marker remain stable for existing study blocks.
// The chooser exposes only the selected direction's prompts, not the whole list.
export const STARTER_QUESTS: Starter[] = [
  { id: "review-topic", need: "revision", areaKey: "learning", title: "Review your notes", instruction: "Open the material you want to review. Start with one topic, then keep working through your notes for this focus block.", seconds: 1800, smallTitle: "A short review", smallInstruction: "Spend ten minutes reviewing your notes. Start wherever feels manageable and keep going until the timer ends." },
  { id: "next-deadline", need: "assignments", areaKey: "learning", title: "Work on an assignment", instruction: "Open your assignment and choose the next unfinished part. Keep working on it for this block; a rough draft is a useful start.", seconds: 1800, smallTitle: "A short assignment session", smallInstruction: "Spend ten minutes moving your assignment forward. Choose a manageable part and make a rough start." },
  { id: "practice-question", need: "practice", areaKey: "learning", title: "Practise questions", instruction: "Open your practice material and work through questions at your own pace. Move to the next question when ready; you don’t need to return to the app between questions.", seconds: 1800, smallTitle: "A short practice session", smallInstruction: "Spend ten minutes practising. Start with a question you can attempt, then keep working at your own pace." },
  { id: "project-next-step", need: "work", areaKey: "work", title: "Move a project forward", instruction: "Open the project that matters most today. Choose the next unfinished part and stay with it for this block; a rough start is enough.", seconds: 1800, smallTitle: "A small project step", smallInstruction: "Give one part of your project ten quiet minutes. Start where you are and leave a useful next step for later." },
  { id: "work-priority", need: "work", areaKey: "work", title: "Make room for a priority", instruction: "Choose one piece of work that deserves your attention. Set the other tabs and tasks aside, then give this one thing the whole block.", seconds: 1800, smallTitle: "One clear priority", smallInstruction: "Spend ten minutes on one useful work task. Put the other tasks aside and make a little progress." },
  { id: "creative-first-draft", need: "creative", areaKey: "creative", title: "Make a first draft", instruction: "Open your notebook, document or materials. Write, sketch or build a rough version of one idea. You can refine it another time.", seconds: 1800, smallTitle: "A little room to create", smallInstruction: "Spend ten minutes making something rough. A few lines, a sketch or a small experiment is a good place to begin." },
  { id: "creative-practice", need: "creative", areaKey: "creative", title: "Spend time with your craft", instruction: "Choose a skill you enjoy practising. Gather what you need and work at your own pace, without checking back between each attempt.", seconds: 1800, smallTitle: "A short creative practice", smallInstruction: "Give your craft ten minutes of attention. Try something familiar or explore a small idea." },
  { id: "life-small-task", need: "life-admin", areaKey: "personal", title: "Clear a small life task", instruction: "Choose one everyday task you have been putting off: a form, a plan or a message to reply to. Work through it calmly, then use any remaining time for the next small task.", seconds: 1800, smallTitle: "One small task", smallInstruction: "Give an everyday task ten minutes. Open what you need and take the next manageable step." },
  { id: "life-reset-space", need: "life-admin", areaKey: "personal", title: "Reset a little space", instruction: "Choose a small part of your room, desk or digital space. Put things back in order at your own pace, one area at a time.", seconds: 1800, smallTitle: "A ten-minute reset", smallInstruction: "Choose one small space and spend ten minutes putting it in order. Stop when your block ends." },
  { id: "quiet-screen-free", need: "restore", areaKey: "wellbeing", title: "Take a screen-free pause", instruction: "Choose a quiet activity away from screens, such as reading for pleasure or spending time outside. Settle into something comfortable and return when the timer ends.", seconds: 1800, smallTitle: "A little quiet time", smallInstruction: "Put the screen aside for ten minutes. Choose a quiet activity you enjoy and let this be a little time for you." },
];
export const LEGACY_STARTER_NEEDS: Record<string, FocusNeed> = { "recall-three": "revision", "confusing-point": "revision", "revision-questions": "revision", "assignment-outline": "assignments", "improve-paragraph": "assignments", "continue-assignment": "assignments", "work-problem": "practice", "retry-mistake": "practice", "explain-example": "practice" };
export function defaultFocusId(need: FocusNeed) { return STARTER_QUESTS.find(item => item.need === need)!.id; }
export function focusOptions(need: FocusNeed): Starter[] {
  const direction = focusDirection(need);
  return STARTER_QUESTS.filter(task => direction.needs.includes(task.need));
}
// Area is catalogue metadata, rather than a change to the saved marker schema.
export function suggestedFocusAreaKey(id: string): FocusAreaKey {
  return (STARTER_QUESTS.find(item => item.id === id) ?? STARTER_QUESTS.find(item => item.need === LEGACY_STARTER_NEEDS[id]))?.areaKey ?? "general";
}
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
