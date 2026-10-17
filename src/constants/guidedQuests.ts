import { FOCUS_AREAS, FOCUS_AREA_PRESENTATION_ORDER } from "../utils/focusAreas";
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
const directionNeeds: { id: FocusDirection["id"]; areaKey: FocusAreaKey; needs: FocusNeed[]; defaultNeed: FocusNeed }[] = [
  { id: "learning", areaKey: "learning", needs: ["revision", "assignments", "practice"], defaultNeed: "revision" },
  { id: "work", areaKey: "work", needs: ["work"], defaultNeed: "work" },
  { id: "creative", areaKey: "creative", needs: ["creative"], defaultNeed: "creative" },
  { id: "life-admin", areaKey: "personal", needs: ["life-admin"], defaultNeed: "life-admin" },
  { id: "restore", areaKey: "wellbeing", needs: ["restore"], defaultNeed: "restore" },
];
export const FOCUS_DIRECTIONS: FocusDirection[] = [...directionNeeds].sort((a, b) =>
  FOCUS_AREA_PRESENTATION_ORDER.indexOf(a.areaKey) - FOCUS_AREA_PRESENTATION_ORDER.indexOf(b.areaKey)
).map(({ areaKey, ...direction }) => {
  const area = FOCUS_AREAS.find(item => item.kind === areaKey)!;
  return { ...direction, title: area.title, hint: area.hint };
});
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
  { id: "quiet-screen-free", need: "restore", areaKey: "wellbeing", title: "Make time to recharge", instruction: "Choose something restful: read a book for pleasure, write in a journal, or take a gentle walk. Put distracting apps aside and give yourself this uninterrupted time.", seconds: 1800, smallTitle: "A little quiet time", smallInstruction: "Spend ten minutes reading for pleasure, journaling, or taking a gentle walk. Keep distracting apps closed and return when your timer ends." },
  // Added later; each direction now offers four first steps.
  { id: "read-chapter", need: "revision", areaKey: "learning", title: "Read a chapter", instruction: "Open the chapter or article you need to get through. Read closely, and jot down a line or two about what stuck before the block ends.", seconds: 1800, smallTitle: "A few pages", smallInstruction: "Read for ten minutes. When the timer ends, note the one idea you want to remember." },
  { id: "work-plan-week", need: "work", areaKey: "work", title: "Plan the week ahead", instruction: "List what has to happen this week, then give the important things a time in your calendar. Leave room for the unexpected.", seconds: 1800, smallTitle: "Plan tomorrow", smallInstruction: "Spend ten minutes choosing tomorrow’s three most important tasks and when you’ll do them." },
  { id: "work-inbox", need: "work", areaKey: "work", title: "Get through your inbox", instruction: "Work from the oldest message up. Reply, file or archive each one, and turn anything bigger into a task for later.", seconds: 1800, smallTitle: "Ten minutes of replies", smallInstruction: "Answer the messages that only need a quick reply. Leave the long ones for another block." },
  { id: "creative-learn-technique", need: "creative", areaKey: "creative", title: "Learn a new technique", instruction: "Pick one tutorial, lesson or chapter. Follow along once, then try it on your own before the block ends.", seconds: 1800, smallTitle: "Try one technique", smallInstruction: "Spend ten minutes trying one new technique. Rough results are part of learning it." },
  { id: "creative-finish-piece", need: "creative", areaKey: "creative", title: "Finish something", instruction: "Choose a piece that is nearly done. Work on the last details and call it finished, even if it isn’t perfect.", seconds: 1800, smallTitle: "One last detail", smallInstruction: "Spend ten minutes on the final touches of something you’ve almost finished." },
  { id: "life-money", need: "life-admin", areaKey: "personal", title: "Sort out your money", instruction: "Check your recent spending, pay what’s due and update your budget. Note anything that needs a follow-up.", seconds: 1800, smallTitle: "A quick money check", smallInstruction: "Spend ten minutes looking over recent spending and paying anything that’s due." },
  { id: "life-plan-meals", need: "life-admin", areaKey: "personal", title: "Plan meals and groceries", instruction: "Decide what you’ll eat over the next few days and write the shopping list as you go.", seconds: 1800, smallTitle: "Tonight and tomorrow", smallInstruction: "Spend ten minutes deciding your next few meals and what you need to buy." },
  { id: "wellbeing-read", need: "restore", areaKey: "wellbeing", title: "Read for pleasure", instruction: "Pick up a book you are enjoying. Keep your phone face down and read until the timer ends.", seconds: 1800, smallTitle: "A chapter’s worth", smallInstruction: "Read something you enjoy for ten minutes, away from feeds and notifications." },
  { id: "wellbeing-journal", need: "restore", areaKey: "wellbeing", title: "Write in your journal", instruction: "Write about your day, what’s on your mind, or anything you are grateful for. There is no right way to do it.", seconds: 1800, smallTitle: "A few honest lines", smallInstruction: "Spend ten minutes writing a few honest lines about today." },
  { id: "wellbeing-move", need: "restore", areaKey: "wellbeing", title: "Move your body", instruction: "Go for a walk, stretch or do a short workout. Leave the phone in your pocket until the block ends.", seconds: 1800, smallTitle: "A short walk", smallInstruction: "Take a ten-minute walk or stretch. Notice how you feel when you come back." },
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
