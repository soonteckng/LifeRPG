import { dateKey, shiftDay } from "./progressAnalytics";
export interface FocusRecord { completed_at: string | null; duration_seconds: number }
export function focusDay(record: FocusRecord, timeZone: string, now = new Date()): string | null {
  const timestamp = record.completed_at ? Date.parse(record.completed_at) : NaN;
  return Number.isFinite(record.duration_seconds) && record.duration_seconds > 0 && Number.isFinite(timestamp) && timestamp <= now.getTime()
    ? dateKey(new Date(timestamp), timeZone) : null;
}
export function bestFocusStreak(days: Iterable<string>): number {
  let best = 0, run = 0, previous = "";
  for (const day of [...new Set(days)].sort()) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run); previous = day;
  }
  return best;
}
