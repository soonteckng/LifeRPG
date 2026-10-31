import type { IdeaArea, RoutineIdea } from "../constants/routineIdeas";

/** How many routines before the idea cards give way to a small link. */
export const IDEAS_FULL_UNTIL = 5;

/**
 * Round 88: three ideas instead of the whole grid. Only ideas you haven't
 * saved. With nothing saved yet: one each from Learning, Wellbeing and Work.
 * Once you have routines: two from the area you use most and one from an area
 * you don't use yet, as a gentle nudge. The picks change each day.
 */
export function pickIdeas(unsaved: readonly RoutineIdea[], usedAreas: readonly IdeaArea[], day: number, count = 3): RoutineIdea[] {
  if (!unsaved.length) return [];
  const rotate = <T,>(list: readonly T[]) => list.length ? [...list.slice(day % list.length), ...list.slice(0, day % list.length)] : [];
  const fromArea = (area: IdeaArea) => rotate(unsaved.filter(idea => idea.area === area));
  const picks: RoutineIdea[] = [];
  const add = (idea: RoutineIdea | undefined) => { if (idea && !picks.includes(idea) && picks.length < count) picks.push(idea); };
  if (!usedAreas.length) {
    for (const area of ["learning", "wellbeing", "work"] as const) add(fromArea(area)[0]);
  } else {
    const tally = new Map<IdeaArea, number>();
    for (const area of usedAreas) tally.set(area, (tally.get(area) ?? 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const mine = fromArea(top);
    add(mine[0]); add(mine[1]);
    const fresh = rotate(unsaved.filter(idea => !tally.has(idea.area)));
    add(fresh[0]);
  }
  // Fill any gap from the rest, in today's order.
  for (const idea of rotate(unsaved)) add(idea);
  return picks;
}

/** Whole days since 1 Jan 1970 in local time, so the picks turn over at midnight. */
export function ideaDay(now = new Date()) {
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
}
