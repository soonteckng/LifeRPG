import type { ProgressSession } from "../services/progressService";
import { earnedMilestones } from "./characterGrowth";
import { studyTime } from "./studyPlan";

export type QuietMarker = { id: string; icon: "time-outline" | "calendar-outline" | "checkmark-done-outline" | "flame-outline" | "hourglass-outline"; text: string };

// Round numbers worth noticing. Only the largest one you have passed shows:
// a plain fact about your own history, with nothing to unlock or collect.
const HOURS = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
const DAYS = [5, 10, 25, 50, 100, 200, 365, 500, 1000];
const SESSIONS = [10, 25, 50, 100, 250, 500, 1000];
const passed = (value: number, steps: number[]) => [...steps].reverse().find(step => value >= step) ?? null;

/** Quiet markers for Your rhythm: what you've done so far, said simply. */
export function quietMarkers(sessions: ProgressSession[], timeZone: string, now = new Date()): QuietMarker[] {
  const totals = earnedMilestones(sessions, timeZone, now);
  const markers: QuietMarker[] = [];
  const hours = passed(totals.seconds / 3600, HOURS);
  if (hours) markers.push({ id: "hours", icon: "time-outline", text: `${hours} ${hours === 1 ? "hour" : "hours"} focused in total` });
  const days = passed(totals.days, DAYS);
  if (days) markers.push({ id: "days", icon: "calendar-outline", text: `Showed up on ${days} different days` });
  const count = passed(totals.sessions, SESSIONS);
  if (count) markers.push({ id: "sessions", icon: "checkmark-done-outline", text: `${count} sessions finished` });
  if (totals.bestStreak >= 3) markers.push({ id: "streak", icon: "flame-outline", text: `Longest run: ${totals.bestStreak} days in a row` });
  const longest = sessions.reduce((max, session) => {
    const status = (session as ProgressSession & { status?: string }).status;
    return (!status || status === "completed") && session.completed_at ? Math.max(max, session.duration_seconds) : max;
  }, 0);
  if (longest >= 20 * 60) markers.push({ id: "longest", icon: "hourglass-outline", text: `Longest session: ${studyTime(longest)}` });
  return markers;
}
