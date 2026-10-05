export type StudyNeed = "revision" | "assignments" | "practice";
export const STUDY_NEEDS: { id: StudyNeed; title: string; hint: string }[] = [
  { id: "revision", title: "Review and remember", hint: "Make sense of your class notes." },
  { id: "assignments", title: "Move an assignment forward", hint: "Find a manageable next step." },
  { id: "practice", title: "Practise what you’re learning", hint: "Try a question or work through a problem." },
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
export const STARTER_QUESTS: Starter[] = [
  { id: "review-topic", need: "revision", title: "Review one topic", instruction: "Open your latest class notes. Pick one heading, read it, then write three things you remember.", seconds: 600, smallTitle: "Read one page", smallInstruction: "Open your notes and read one page. Highlight one thing you want to remember." },
  { id: "recall-three", need: "revision", title: "Recall three things", instruction: "Close your notes and write three things you remember from your latest class. Check them afterward.", seconds: 300, smallTitle: "Recall one thing", smallInstruction: "Write one thing you remember from class, then check it against your notes." },
  { id: "confusing-point", need: "revision", title: "Untangle one confusing point", instruction: "Choose one unclear idea in your notes. Find an explanation or example and explain it in your own words.", seconds: 600, smallTitle: "Name what’s confusing", smallInstruction: "Read one unclear section and write the exact question you want answered." },
  { id: "revision-questions", need: "revision", title: "Make five revision questions", instruction: "Choose one section of your notes. Turn its key points into five questions to test yourself later.", seconds: 600, smallTitle: "Make one revision question", smallInstruction: "Pick one key point in your notes and turn it into a question." },
  { id: "next-deadline", need: "assignments", title: "Find your next deadline", instruction: "Open your assignment list. Find the nearest deadline and write down one action you can take next.", seconds: 300, smallTitle: "Find one assignment", smallInstruction: "Open your assignment list and choose one piece of work to return to." },
  { id: "assignment-outline", need: "assignments", title: "Start an assignment outline", instruction: "Open the assignment brief. Write three rough headings for your response; they don’t need to be perfect.", seconds: 600, smallTitle: "Write one next step", smallInstruction: "Read the assignment brief and write one small step you could take." },
  { id: "improve-paragraph", need: "assignments", title: "Improve one paragraph", instruction: "Open your draft. Choose one paragraph and make its main point clearer.", seconds: 900, smallTitle: "Improve one sentence", smallInstruction: "Open your draft and rewrite one sentence that feels unclear." },
  { id: "continue-assignment", need: "assignments", title: "Continue your assignment", instruction: "Open your current assignment. Choose its next unfinished part and make a rough start.", seconds: 1500, smallTitle: "Make a rough start", smallInstruction: "Open one unfinished section and write a few rough lines or steps." },
  { id: "practice-question", need: "practice", title: "Try one practice question", instruction: "Choose one question and attempt it before checking the answer. Note where you get stuck.", seconds: 600, smallTitle: "Find the first step", smallInstruction: "Read one practice question and write the first step you would try." },
  { id: "work-problem", need: "practice", title: "Work through a problem", instruction: "Choose a problem from your course. Work through it step by step and check your reasoning afterward.", seconds: 900, smallTitle: "Break down one problem", smallInstruction: "Read a problem and list what you know and what you need to find." },
  { id: "retry-mistake", need: "practice", title: "Retry a question you missed", instruction: "Choose a question you previously got wrong. Try again without the solution, then compare your steps.", seconds: 600, smallTitle: "Understand one mistake", smallInstruction: "Look at a previous mistake and write why that step didn’t work." },
  { id: "explain-example", need: "practice", title: "Explain a worked example", instruction: "Choose a worked example. Cover the next step, predict it, then check and explain why it works.", seconds: 600, smallTitle: "Explain one step", smallInstruction: "Pick one step in a worked example and explain it in your own words." },
];
export function suggestedFocus(id: string, smaller = false): SuggestedFocus | null {
  const task = STARTER_QUESTS.find(item => item.id === id);
  return task ? { templateId: id, need: task.need, title: smaller ? task.smallTitle : task.title,
    instruction: smaller ? task.smallInstruction : task.instruction, seconds: smaller ? 300 : task.seconds, smaller } : null;
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
    return { ...curated, title: value.title, instruction: value.instruction, seconds: value.seconds };
  } catch { return null; }
}
