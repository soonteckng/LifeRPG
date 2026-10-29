import type { OfflineSyncBatch } from "../services/offlineSyncPresentation";
import type { Subject } from "../services/taskService";
import { FOCUS_AREAS, FOCUS_AREA_PRESENTATION_ORDER, focusAreaKind, focusAreaTitle } from "./focusAreas";
import { lifeAreaColor } from "./lifeAreaColor";

type Entry = OfflineSyncBatch["entries"][number];
type Area = { title: string; color: string };
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const count = (value: unknown): number => isCount(value) ? value : 0;

/** Receipt identities are immutable. Repeated publications never add effort. */
function entriesOf(batch: OfflineSyncBatch): Entry[] {
  const clients = new Set<string>(), receipts = new Set<string>();
  return batch.entries.filter(entry => {
    if (clients.has(entry.clientSessionId) || receipts.has(entry.receipt.sessionId)) return false;
    clients.add(entry.clientSessionId); receipts.add(entry.receipt.sessionId); return true;
  });
}

/** What the catch-up card shows: confirmed sessions, their lengths and their categories. */
export function summarizeOfflineSync(batch: OfflineSyncBatch, subjects: readonly Pick<Subject, "id" | "title" | "color_code">[]) {
  const entries = entriesOf(batch), durations = new Map<number, number>(), areas = new Map<string, Area>();
  let seconds = 0;
  for (const entry of entries) {
    const duration = count(entry.receipt.durationSeconds);
    seconds += duration;
    durations.set(duration, (durations.get(duration) ?? 0) + 1);
    const subject = subjects.find(value => value.id === entry.setup.subjectId);
    if (!subject) continue;
    const title = focusAreaTitle(subject.title), kind = focusAreaKind(title);
    const fixed = FOCUS_AREAS.find(value => value.kind === kind);
    const key = kind ?? title.toLowerCase();
    if (!areas.has(key)) areas.set(key, { title, color: lifeAreaColor(subject.id, fixed?.color ?? subject.color_code) });
  }
  const rank = (title: string) => {
    const kind = focusAreaKind(title), index = kind ? FOCUS_AREA_PRESENTATION_ORDER.indexOf(kind) : -1;
    return index < 0 ? FOCUS_AREA_PRESENTATION_ORDER.length : index;
  };
  return { seconds, syncSummary: {
    sessionCount: entries.length,
    durations: [...durations].sort(([left], [right]) => left - right).map(([seconds, count]) => ({ seconds, count })),
    areas: [...areas.values()].sort((left, right) => rank(left.title) - rank(right.title) || left.title.localeCompare(right.title)),
  } };
}
