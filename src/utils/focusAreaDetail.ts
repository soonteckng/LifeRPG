import type { ProgressSession } from "../services/progressService";
import { focusAreaKind } from "./focusAreas";
import { focusDay } from "./focusDays";
import { dateKey, shiftDay } from "./progressAnalytics";

type Area = { id: number; title: string };
const groupKey = (area: Area) => focusAreaKind(area.title) ?? `custom:${area.id}`;

/** What a Profile focus-area card opens to, built from the snapshot Profile
 * already loaded. Legacy aliases of a catalogue area count as that area, as on
 * Progress; saved subject IDs are never changed. */
export function focusAreaDetail(area: Area, areas: Area[], sessions: ProgressSession[], timeZone: string, now = new Date()) {
  const key = groupKey(area);
  const ids = new Set([area.id, ...areas.filter(item => groupKey(item) === key).map(item => item.id)]);
  const today = dateKey(now, timeZone);
  const days = Array.from({ length: 7 }, (_, index) => ({ day: shiftDay(today, index - 6), seconds: 0 }));
  const weekStart = days[0].day, previousStart = shiftDay(weekStart, -7);
  let seconds = 0, previousWeekSeconds = 0;
  const done: { session: ProgressSession; at: number }[] = [];
  for (const session of new Map(sessions.map(item => [item.id, item])).values()) {
    // Abandoned rows can keep timestamps; only completed (or legacy) rows count.
    const status = (session as ProgressSession & { status?: string }).status;
    if (session.subject_id === null || !ids.has(session.subject_id) || status && status !== "completed") continue;
    const day = focusDay(session, timeZone, now);
    if (!day) continue;
    seconds += session.duration_seconds;
    done.push({ session, at: Date.parse(session.completed_at!) });
    const slot = days.find(item => item.day === day);
    if (slot) slot.seconds += session.duration_seconds;
    else if (day >= previousStart && day < weekStart) previousWeekSeconds += session.duration_seconds;
  }
  done.sort((a, b) => b.at - a.at);
  return {
    seconds, sessions: done.length, days, previousWeekSeconds,
    weekSeconds: days.reduce((sum, item) => sum + item.seconds, 0),
    recent: done.slice(0, 3).map(item => item.session),
  };
}
export type FocusAreaDetail = ReturnType<typeof focusAreaDetail>;
