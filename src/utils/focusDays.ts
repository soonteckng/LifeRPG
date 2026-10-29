import { dateKey, daysBetween, shiftDay } from "./progressAnalytics";
export interface FocusRecord { completed_at: string | null; duration_seconds: number }
export function focusDay(record: FocusRecord, timeZone: string, now = new Date()): string | null {
  const timestamp = record.completed_at ? Date.parse(record.completed_at) : NaN;
  return Number.isFinite(record.duration_seconds) && record.duration_seconds > 0 && Number.isFinite(timestamp) && timestamp <= now.getTime()
    ? dateKey(new Date(timestamp), timeZone) : null;
}
/**
 * Rest days: every 7 focus days in your streak earn one (you can hold 2).
 * A missed day uses one automatically, so one bad day doesn't end the
 * streak. Rested days keep the streak alive but don't add to it.
 * The squads' server function uses exactly this rule (Round 82 SQL).
 */
export const REST_EVERY = 7, REST_MAX = 2;
export interface FocusStreak { current: number; longest: number; restDays: number; rested: string[] }
/** Today's streak (alive through yesterday while today still has a chance), the longest ever, and rest days ready. */
export function focusStreakWithRest(days: Iterable<string>, today: string): FocusStreak {
  let streak = 0, best = 0, tokens = 0, earned = 0, previous = "", rested: string[] = [];
  for (const day of [...new Set(days)].filter(d => d <= today).sort()) {
    const missed = previous ? daysBetween(previous, day) - 1 : 0;
    if (!previous || missed > tokens) { streak = 1; tokens = 0; earned = 0; rested = []; }
    else {
      for (let i = 1; i <= missed; i++) rested.push(shiftDay(previous, i));
      tokens -= missed; streak++;
    }
    earned++;
    if (earned % REST_EVERY === 0 && tokens < REST_MAX) tokens++;
    best = Math.max(best, streak); previous = day;
  }
  if (!previous) return { current: 0, longest: 0, restDays: 0, rested: [] };
  // Days missed since the last focus day, not counting today (still to come).
  const missed = Math.max(0, daysBetween(previous, today) - 1);
  if (missed > tokens) return { current: 0, longest: best, restDays: 0, rested: [] };
  for (let i = 1; i <= missed; i++) rested.push(shiftDay(previous, i));
  return { current: streak, longest: best, restDays: tokens - missed, rested };
}
/** The longest streak, with rest days bridging missed days the same way. */
export function bestFocusStreak(days: Iterable<string>): number {
  const all = [...new Set(days)].sort();
  return all.length ? focusStreakWithRest(all, all[all.length - 1]).longest : 0;
}
