import { lifeAreaColor } from "./lifeAreaColor";
import type {
  ProgressGoal,
  ProgressSession,
} from "../services/progressService";
import { sessionCategory } from "./sessionReporting";

export type PeriodMode = "week" | "month";
export interface ProgressPeriod {
  mode: PeriodMode;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  elapsedEnd: string;
  today: string;
}
export interface ProgressDay {
  key: string;
  seconds: number;
  sessions: ProgressSession[];
  goal: ProgressGoal | undefined;
  future: boolean;
}
const DAY = 86400000;
export const DEFAULT_TIMEZONE = "Asia/Kuala_Lumpur";
export function dateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftDay(key: string, count: number): string {
  return new Date(Date.parse(`${key}T12:00:00Z`) + count * DAY)
    .toISOString()
    .slice(0, 10);
}
export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / DAY);
}
export function periodFor(
  mode: PeriodMode,
  anchor: string,
  timeZone: string,
  now = new Date(),
): ProgressPeriod {
  const today = dateKey(now, timeZone);
  const weekday = new Date(`${anchor}T12:00:00Z`).getUTCDay();
  const start =
    mode === "week"
      ? shiftDay(anchor, -((weekday + 6) % 7))
      : anchor.slice(0, 7) + "-01";
  const nextMonth = new Date(`${start}T12:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const end =
    mode === "week"
      ? shiftDay(start, 6)
      : shiftDay(nextMonth.toISOString().slice(0, 10), -1);
  const previousStart =
    mode === "week"
      ? shiftDay(start, -7)
      : (() => {
          const d = new Date(`${start}T12:00:00Z`);
          d.setUTCMonth(d.getUTCMonth() - 1);
          return d.toISOString().slice(0, 10);
        })();
  const previousEnd = shiftDay(start, -1);
  return {
    mode,
    start,
    end,
    previousStart,
    previousEnd,
    elapsedEnd: end < today ? end : today,
    today,
  };
}
export function previousAnchor(period: ProgressPeriod) {
  return period.previousStart;
}
export function nextAnchor(period: ProgressPeriod) {
  return shiftDay(period.end, 1);
}
export function queryBounds(period: ProgressPeriod) {
  // UTC padding includes every local midnight, including DST and UTC+14.
  return {
    since: `${shiftDay(period.previousStart, -1)}T00:00:00Z`,
    until: `${shiftDay(period.end, 2)}T00:00:00Z`,
  };
}
export function durationLabel(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const h = Math.floor(value / 3600),
    m = Math.floor((value % 3600) / 60),
    s = value % 60;
  return (
    [h ? `${h}h` : "", m ? `${m}m` : "", s ? `${s}s` : ""]
      .filter(Boolean)
      .join(" ") || "0m"
  );
}
export function calendarLabel(
  key: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${key}T12:00:00Z`));
}
export function buildProgress(
  period: ProgressPeriod,
  sessions: ProgressSession[],
  goals: ProgressGoal[],
  timeZone: string,
  areas: { id: number; title: string; color_code?: string | null }[],
  now = new Date(),
) {
  const valid = sessions.filter(
    (s) =>
      s.completed_at &&
      Number.isFinite(s.duration_seconds) &&
      s.duration_seconds > 0 &&
      Date.parse(s.completed_at) <= now.getTime(),
  );
  const local = valid.map((s) => ({
    session: s,
    key: dateKey(new Date(s.completed_at!), timeZone),
  }));
  const days: ProgressDay[] = Array.from(
    { length: daysBetween(period.start, period.end) + 1 },
    (_, i) => {
      const key = shiftDay(period.start, i),
        matching = local.filter((s) => s.key === key).map((s) => s.session);
      return {
        key,
        seconds: matching.reduce((sum, s) => sum + s.duration_seconds, 0),
        sessions: matching,
        goal: goals.find((g) => g.progress_date === key),
        future: key > period.today,
      };
    },
  );
  const selected = days.flatMap((d) => d.sessions);
  const seconds = days.reduce((sum, d) => sum + d.seconds, 0);
  const comparisonDays =
    Math.min(
      daysBetween(period.start, period.elapsedEnd),
      daysBetween(period.previousStart, period.previousEnd),
    ) + 1;
  const previousCutoff = shiftDay(period.previousStart, comparisonDays - 1);
  const comparisonSeconds = days
    .filter((d) => d.key <= shiftDay(period.start, comparisonDays - 1))
    .reduce((sum, d) => sum + d.seconds, 0);
  const previousSeconds = local
    .filter((s) => s.key >= period.previousStart && s.key <= previousCutoff)
    .reduce((sum, s) => sum + s.session.duration_seconds, 0);
  const groups = new Map<
    string,
    {
      key: string;
      title: string;
      color: string;
      seconds: number;
      sessions: ProgressSession[];
    }
  >();
  for (const s of selected) {
    const title = sessionCategory(s, areas);
    const area = areas.find((a) => a.id === s.subject_id);
    const key = area ? `area:${area.id}` : `legacy:${title}`;
    const existing = groups.get(key) ?? {
      key,
      title,
      color:
        lifeAreaColor(area?.id, area?.color_code),
      seconds: 0,
      sessions: [],
    };
    existing.seconds += s.duration_seconds;
    existing.sessions.push(s);
    groups.set(key, existing);
  }
  return {
    days,
    sessions: selected.sort((a, b) =>
      (b.completed_at ?? "").localeCompare(a.completed_at ?? ""),
    ),
    seconds,
    previousSeconds,
    activeDays: days.filter((d) => d.sessions.length > 0).length,
    goalDays: days.filter((d) => !d.future && d.goal?.goal_completed).length,
    areas: [...groups.values()].sort((a, b) => b.seconds - a.seconds),
    previousCutoff,
    comparisonSeconds,
    comparisonDays,
  };
}


export function sessionAreaSegments(
  sessions: ProgressSession[],
  areas: { id: number; title: string; color_code?: string | null }[],
) {
  const groups = new Map<string, { key: string; title: string; seconds: number; color: string }>();
  for (const session of sessions) {
    if (!Number.isFinite(session.duration_seconds) || session.duration_seconds <= 0) continue;
    const area = areas.find(item => item.id === session.subject_id);
    const title = sessionCategory(session, areas);
    const key = area ? `area:${area.id}` : `legacy:${title}`;
    const group = groups.get(key) ?? { key, title, seconds: 0, color: lifeAreaColor(area?.id, area?.color_code) };
    group.seconds += session.duration_seconds;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
