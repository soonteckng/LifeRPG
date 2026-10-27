import { lifeAreaColor } from "./lifeAreaColor";
import type {
  ProgressGoal,
  ProgressSession,
} from "../services/progressService";
import { sessionCategory } from "./sessionReporting";
import { FOCUS_AREAS, focusAreaKind, focusAreaTitle } from "./focusAreas";

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
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
const clockFormatters = new Map<string, Intl.DateTimeFormat>();
/** Compare matching local clock times, rather than today's partial day with a full earlier day. */
export function localClockSeconds(date: Date, timeZone: string): number {
  let formatter = clockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    if (clockFormatters.size >= 16) clockFormatters.delete(clockFormatters.keys().next().value!);
    clockFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return value("hour") * 3600 + value("minute") * 60 + value("second");
}
export function dateKey(date: Date, timeZone: string): string {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    if (dayFormatters.size >= 16) dayFormatters.delete(dayFormatters.keys().next().value!);
    dayFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
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
/**
 * Totals (a week, a month, a day, a category) in hours and minutes, like the
 * rest of the app. Seconds only show while the total is under a minute.
 * Single sessions keep their exact time with durationLabel.
 */
export function totalLabel(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  if (value > 0 && value < 60) return `${value}s`;
  const h = Math.floor(value / 3600), m = Math.floor((value % 3600) / 60);
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m";
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

// Display aliases share one analytics group; saved subject/session IDs stay intact.
// A duplicated catalogue kind uses its canonical colour even on a day containing
// only one alias. Unrelated single-ID and custom-area colours remain unchanged.
function progressAreaResolver(areas: { id: number; title: string; color_code?: string | null }[]) {
  const idsByKind = new Map<string, Set<number>>();
  for (const area of areas) {
    const kind = focusAreaKind(area.title);
    if (!kind) continue;
    const ids = idsByKind.get(kind) ?? new Set<number>();
    ids.add(area.id);
    idsByKind.set(kind, ids);
  }
  return (session: ProgressSession) => {
    const area = areas.find(item => item.id === session.subject_id);
    const title = sessionCategory(session, areas);
    // A session saved with no area shows as Everyday focus, so it joins that
    // row instead of becoming a second "Everyday focus".
    const kind = focusAreaKind(area?.title) ?? (!area && title === focusAreaTitle() ? focusAreaKind(title) : null);
    const canonical = kind && (idsByKind.get(kind)?.size ?? 0) > 1
      ? FOCUS_AREAS.find(item => item.kind === kind) : undefined;
    // Its colour comes from the account's area of that kind, so the row looks the same either way.
    const owner = area ?? (kind ? areas.find(item => focusAreaKind(item.title) === kind) : undefined);
    return {
      key: kind ? `kind:${kind}` : area ? `area:${area.id}` : `legacy:${title}`,
      title,
      color: canonical?.color ?? lifeAreaColor(owner?.id, owner?.color_code),
    };
  };
}

export function buildProgress(
  period: ProgressPeriod,
  sessions: ProgressSession[],
  goals: ProgressGoal[],
  timeZone: string,
  areas: { id: number; title: string; color_code?: string | null }[],
  now = new Date(),
) {
  // History is paginated and a concurrent completion can repeat a boundary
  // row. Match Profile's accounting: completed saved IDs count once only.
  const valid = [...new Map(sessions.filter(
    (s) => {
      const status = (s as ProgressSession & { status?: string }).status;
      return (!status || status === "completed") && s.completed_at &&
      Number.isFinite(s.duration_seconds) &&
      s.duration_seconds > 0 &&
      Date.parse(s.completed_at) <= now.getTime();
    },
  ).map(session => [session.id, session])).values()];
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
  const partialPeriod = period.start <= period.today && period.today <= period.end;
  const cutoffClock = localClockSeconds(now, timeZone);
  const comparisonSeconds = days
    .filter((d) => d.key <= shiftDay(period.start, comparisonDays - 1))
    .reduce((sum, d) => sum + d.seconds, 0);
  const previousSeconds = local
    .filter((s) => s.key >= period.previousStart && s.key <= previousCutoff
      && (!partialPeriod || s.key < previousCutoff
        || localClockSeconds(new Date(s.session.completed_at!), timeZone) <= cutoffClock))
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
  const resolveArea = progressAreaResolver(areas);
  for (const s of selected) {
    const { key, title, color } = resolveArea(s);
    const existing = groups.get(key) ?? {
      key,
      title,
      color,
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
    partialPeriod,
  };
}

export type ProgressAnalytics = ReturnType<typeof buildProgress>;

export function progressHeroDay(
  analytics: ProgressAnalytics,
  period: ProgressPeriod,
  selectedKey: string | null,
): ProgressDay | undefined {
  const selected = analytics.days.find(day => day.key === selectedKey);
  if (selected) return selected;
  return analytics.days.find(day => day.key === period.today)
    ?? [...analytics.days].reverse().find(day => day.sessions.length > 0)
    ?? analytics.days.at(-1);
}

/** Ongoing periods describe what is recorded without judging an unfinished day. */
export function progressPeriodMessage(analytics: ProgressAnalytics, period: ProgressPeriod): string {
  const count = analytics.sessions.length;
  if (!count) return `Your next completed session will begin this ${period.mode}'s record.`;
  if (analytics.partialPeriod && analytics.comparisonDays === 1)
    return `A new ${period.mode}, ${count === 1 ? "one session" : `${count} sessions`} finished. There is time ahead.`;
  const comparison = analytics.previousSeconds > 0
    ? Math.round((analytics.comparisonSeconds - analytics.previousSeconds) / analytics.previousSeconds * 100)
    : null;
  // A percentage based on a tiny earlier sample is noisy, even when technically comparable.
  const enoughHistory = analytics.previousSeconds >= 300;
  if (enoughHistory && comparison !== null && (!analytics.partialPeriod || comparison > 0)) {
    if (!comparison) return `The same recorded effort as the previous ${period.mode}.`;
    const scope = analytics.partialPeriod ? `this point in the previous ${period.mode}` : `the same days of the previous ${period.mode}`;
    return `${Math.abs(comparison)}% ${comparison > 0 ? "more" : "less"} recorded effort than ${scope}.`;
  }
  return `${count} ${count === 1 ? "session" : "sessions"} finished across ${analytics.activeDays} ${analytics.activeDays === 1 ? "day" : "days"}. Each completed session counts.`;
}


export function sessionAreaSegments(
  sessions: ProgressSession[],
  areas: { id: number; title: string; color_code?: string | null }[],
) {
  const groups = new Map<string, { key: string; title: string; seconds: number; color: string }>();
  const resolveArea = progressAreaResolver(areas);
  for (const session of sessions) {
    if (!Number.isFinite(session.duration_seconds) || session.duration_seconds <= 0) continue;
    const { key, title, color } = resolveArea(session);
    const group = groups.get(key) ?? { key, title, seconds: 0, color };
    group.seconds += session.duration_seconds;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
