import type { OfflineSyncBatch } from "../services/offlineSyncPresentation";
import type { ClaimedTrail, RewardsState, SessionClaim } from "../services/rewardsService";
import type { Reveal } from "../services/rewardsStore";
import type { Subject } from "../services/taskService";
import { FOCUS_AREAS, FOCUS_AREA_PRESENTATION_ORDER, focusAreaKind, focusAreaTitle } from "./focusAreas";
import { lifeAreaColor } from "./lifeAreaColor";
import { isJournalUuid } from "./sessionJournalSchema";

type Entry = OfflineSyncBatch["entries"][number];
type Expedition = Extract<Reveal, { kind: "expedition" }> & { sessions?: SessionClaim["sessions"] };
type Area = { title: string; color: string; xp: number };
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const count = (value: unknown): number => isCount(value) ? value : 0;
const date = (value: unknown): string | undefined => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
const DEFAULT_RULES = { findSeconds: 1800, stops: 4 };

/** Receipt identities are immutable. Repeated publications never add effort. */
function entriesOf(batch: OfflineSyncBatch): Entry[] {
  const clients = new Set<string>(), receipts = new Set<string>();
  return batch.entries.filter(entry => {
    if (clients.has(entry.clientSessionId) || receipts.has(entry.receipt.sessionId)) return false;
    clients.add(entry.clientSessionId); receipts.add(entry.receipt.sessionId); return true;
  });
}

export function summarizeOfflineSync(batch: OfflineSyncBatch, subjects: readonly Pick<Subject, "id" | "title" | "color_code">[]) {
  const entries = entriesOf(batch), durations = new Map<number, number>(), areas = new Map<string, Area>();
  let seconds = 0, xpEarned = 0;
  for (const entry of entries) {
    const duration = count(entry.receipt.durationSeconds), result = entry.receipt.result;
    seconds += duration; xpEarned += count(result.xp_earned);
    durations.set(duration, (durations.get(duration) ?? 0) + 1);
    const xp = count(result.area_xp_earned);
    if (!xp) continue;
    const subject = subjects.find(value => value.id === entry.setup.subjectId);
    const title = focusAreaTitle(subject?.title), kind = focusAreaKind(title);
    const fixed = FOCUS_AREAS.find(value => value.kind === kind);
    const key = kind ?? title.toLowerCase();
    const previous = areas.get(key);
    if (previous) previous.xp += xp;
    else areas.set(key, { title, color: lifeAreaColor(subject?.id, fixed?.color ?? subject?.color_code), xp });
  }
  const rank = (title: string) => {
    const kind = focusAreaKind(title), index = kind ? FOCUS_AREA_PRESENTATION_ORDER.indexOf(kind) : -1;
    return index < 0 ? FOCUS_AREA_PRESENTATION_ORDER.length : index;
  };
  return { seconds, xpEarned, syncSummary: {
    sessionCount: entries.length,
    durations: [...durations].sort(([left], [right]) => left - right).map(([seconds, count]) => ({ seconds, count })),
    areas: [...areas.values()].sort((left, right) => rank(left.title) - rank(right.title) || left.title.localeCompare(right.title)),
  } };
}

function legacyMembers(reveal: Expedition): string[] {
  return reveal.id.startsWith("return:") ? reveal.id.slice("return:".length).split(",").filter(isJournalUuid) : [];
}

function validRules(value: { findSeconds: number; stops: number } | null | undefined) {
  return value && count(value.findSeconds) > 0 && count(value.stops) > 0 && value.stops <= 24 && value.findSeconds * value.stops <= 86400
    ? { findSeconds: value.findSeconds, stops: value.stops } : null;
}

/**
 * Presentation only: the imports and claims remain individual and authoritative.
 * A shared claim can include other owned rewards, which must not be discarded.
 */
export function offlineSyncReturn(batch: OfflineSyncBatch, expeditionReveals: readonly Reveal[], state: RewardsState | null): { reveal: Expedition; consumedIds: string[] } {
  const entries = entriesOf(batch), memberIds = new Set(entries.map(entry => entry.receipt.sessionId));
  const sources = expeditionReveals.filter((reveal): reveal is Expedition => reveal.kind === "expedition" && reveal.id.startsWith("return:")
    && [...(reveal.sessions?.map(session => session.sessionId) ?? []), ...legacyMembers(reveal)].some(id => memberIds.has(id)));
  const consumedIds = [...new Set(sources.map(source => source.id))];
  const sessions: SessionClaim["sessions"] = [], knownSessions = new Set<string>(), opaqueSets = new Set<string>();
  const legacy: Expedition[] = [];
  for (const source of sources) {
    if (source.sessions?.length) {
      for (const session of source.sessions) {
        if (knownSessions.has(session.sessionId)) continue;
        knownSessions.add(session.sessionId);
        sessions.push({ ...session, finds: session.finds.map(gift => ({ ...gift })) });
      }
    }
  }
  for (const source of sources) {
    if (!source.sessions?.length) {
      // Older claims were disjoint server replies without per-session detail.
      // Dedupe identical opaque claims, but never guess gift/currency shares.
      const key = [...new Set(legacyMembers(source))].sort().join(",");
      if (opaqueSets.has(key) || legacyMembers(source).every(id => knownSessions.has(id))) continue;
      opaqueSets.add(key); legacy.push(source);
    }
  }
  const finds = [...sessions.flatMap(session => session.finds), ...legacy.flatMap(source => source.finds.map(gift => ({ ...gift })))];
  const stardust = sessions.reduce((sum, session) => sum + count(session.minutesStardust) + count(session.trailStardust)
    + session.finds.reduce((total, gift) => total + count(gift.stardust), 0), 0)
    + legacy.reduce((sum, source) => sum + count(source.stardust), 0);

  const stateDay = date(state?.today.date) ?? date(state?.pack.date);
  const days = [stateDay, ...sources.map(source => date(source.trail?.date)), ...sessions.map(session => date(session.creditedDate)),
    ...entries.map(entry => date(entry.receipt.result.credited_date))].filter((day): day is string => !!day);
  const day = days.sort().at(-1);
  const sameDay = (candidate: string | undefined) => day !== undefined && date(candidate) === day;
  const currentState = state && sameDay(stateDay) ? state : null;
  const trails = sources.map(source => source.trail).filter((trail): trail is ClaimedTrail => !!trail && sameDay(trail.date));
  const receiptEntries = entries.filter(entry => sameDay(date(entry.receipt.result.credited_date)));
  const counters = receiptEntries.map(entry => entry.receipt.result.daily_completed_seconds)
    .filter(isCount);
  const claimCounters = sessions.filter(session => sameDay(session.creditedDate ?? undefined)).map(session => session.daySecondsAfter).filter(isCount);
  const seconds = Math.max(0, count(currentState?.today.seconds), ...trails.map(trail => count(trail.seconds)), ...counters, ...claimCounters);
  const rules = validRules(currentState?.trail) ?? validRules(trails.at(-1)) ?? validRules(state?.trail) ?? DEFAULT_RULES;
  const awarded = Math.min(rules.stops, Math.max(0, count(currentState?.today.finds), ...trails.map(trail => count(trail.finds))));
  const reached = Math.min(rules.stops, Math.floor(seconds / rules.findSeconds));
  const pendingFinds = Math.min(rules.stops - awarded, Math.max(reached - awarded, count(currentState?.today.pendingFinds), ...trails.map(trail => count(trail.pendingFinds))));
  const complete = !!currentState?.trail.complete || trails.some(trail => trail.complete);
  const authoritativeNext = currentState?.today.seconds === seconds ? currentState.nextFindSeconds
    : [...trails].reverse().find(trail => trail.seconds === seconds)?.nextFindSeconds;
  const nextFindSeconds = awarded === rules.stops || pendingFinds > 0 || complete ? 0
    : isCount(authoritativeNext) ? authoritativeNext : Math.max(0, (reached + 1) * rules.findSeconds - seconds);
  const starts = [...trails.map(trail => trail.fromSeconds).filter(isCount),
    ...sessions.filter(session => sameDay(session.creditedDate ?? undefined)).map(session => session.daySecondsBefore).filter(isCount),
    ...receiptEntries.filter(entry => isCount(entry.receipt.result.daily_completed_seconds))
      .map(entry => Math.max(0, count(entry.receipt.result.daily_completed_seconds) - count(entry.receipt.durationSeconds)))];
  const trail: ClaimedTrail = { ...rules, seconds, fromSeconds: Math.min(seconds, starts.length ? Math.min(...starts) : seconds),
    finds: awarded, pendingFinds, complete, nextFindSeconds, ...(day ? { date: day } : {}) };
  const trailStardust = sessions.filter(session => sameDay(session.creditedDate ?? undefined)).reduce((sum, session) => sum + count(session.trailStardust), 0)
    + legacy.filter(source => sameDay(source.trail?.date)).reduce((sum, source) => sum + count(source.trailStardust), 0);
  return { consumedIds, reveal: { id: `sync-return:${batch.id}`, kind: "expedition",
    seconds: entries.reduce((sum, entry) => sum + count(entry.receipt.durationSeconds), 0), finds, stardust,
    sessions, trail, fromSeconds: trail.fromSeconds, trailStardust } };
}
