import type { ProgressSession } from "../services/progressService";
import { focusAreaKind } from "./focusAreas";
import { focusDay } from "./focusDays";
import { sessionCategory } from "./sessionReporting";
import { buildProgress, dateKey, periodFor } from "./progressAnalytics";

type Area = { id: number; title: string; color_code?: string | null };
const groupKey = (area: Area) => focusAreaKind(area.title) ?? `custom:${area.id}`;

/** The same saved rows back both a category's totals and its subject breakdown. */
export function focusAreaSessions(area: Area, areas: Area[], sessions: ProgressSession[], timeZone: string, now = new Date()) {
  const key = groupKey(area);
  const ids = new Set([area.id, ...areas.filter(item => groupKey(item) === key).map(item => item.id)]);
  return [...new Map(sessions.map(item => [item.id, item])).values()].filter(session => {
    // Abandoned rows can keep timestamps; only completed (or legacy) rows count.
    const status = (session as ProgressSession & { status?: string }).status;
    // Match Progress's display grouping for old sessions saved without an area.
    // This changes only their time breakdown, never their saved XP or category.
    const unassignedGeneral = key === "general" && !areas.some(item => item.id === session.subject_id)
      && focusAreaKind(sessionCategory(session, areas)) === "general";
    return (session.subject_id !== null && ids.has(session.subject_id) || unassignedGeneral)
      && (!status || status === "completed") && focusDay(session, timeZone, now) !== null;
  });
}

/** What a Profile focus-area card opens to, built from the snapshot Profile
 * already loaded. The week is the same Monday–Sunday week, computed by the same
 * code, as Progress, and legacy aliases of a catalogue area count as that area. */
export function focusAreaDetail(area: Area, areas: Area[], sessions: ProgressSession[], timeZone: string, now = new Date()) {
  const mine = focusAreaSessions(area, areas, sessions, timeZone, now);
  const week = buildProgress(periodFor("week", dateKey(now, timeZone), timeZone, now), mine, [], timeZone, areas, now);
  return {
    seconds: mine.reduce((sum, session) => sum + session.duration_seconds, 0),
    sessions: mine.length,
    days: week.days.map(day => ({ day: day.key, seconds: day.seconds, future: day.future })),
    weekSeconds: week.seconds,
    // The same moment of last week, as Progress compares an unfinished week.
    lastWeekByNow: week.previousSeconds,
    recent: [...mine].sort((a, b) => Date.parse(b.completed_at!) - Date.parse(a.completed_at!)).slice(0, 3),
  };
}
export type FocusAreaDetail = ReturnType<typeof focusAreaDetail>;
