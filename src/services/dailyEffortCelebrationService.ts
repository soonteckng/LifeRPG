export interface DailyEffortClaimStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface DailyEffortEvidence {
  visible: boolean;
  pending: boolean;
  recovered: boolean;
  sessionId?: string | null;
  ownerId?: string | null;
  timeZone?: string;
  creditedDate?: string;
  creditVersion?: number;
  dailyCompletedSeconds?: number;
  durationSeconds?: number;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** The server's exact daily total proves this was the day's first credit. */
export function firstDailyEffortEvidence(value: DailyEffortEvidence, nowMs = Date.now()): boolean {
  if (!value.visible || value.pending || value.recovered || !value.ownerId || !value.sessionId || value.creditVersion !== 1) return false;
  if (!value.creditedDate || !datePattern.test(value.creditedDate) || !value.timeZone) return false;
  if (!Number.isSafeInteger(value.durationSeconds) || (value.durationSeconds ?? 0) <= 0 || value.dailyCompletedSeconds !== value.durationSeconds) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {timeZone:value.timeZone, year:"numeric", month:"2-digit", day:"2-digit"}).formatToParts(new Date(nowMs));
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}` === value.creditedDate;
  } catch { return false; }
}

// Both completion surfaces share the same process queue. Storage remains the
// authority after a restart; the ledger is small and isolated per account.
const queues = new Map<string, Promise<unknown>>();
export function createDailyEffortClaims(storage: DailyEffortClaimStorage, backendId: string) {
  return {
    async claim(ownerId: string, date: string, isCurrent: () => boolean): Promise<boolean> {
      if (!ownerId || !backendId || !datePattern.test(date)) return false;
      const key = `liferpg:daily-effort:v1:${encodeURIComponent(backendId)}:${encodeURIComponent(ownerId)}`;
      const before = queues.get(key) ?? Promise.resolve();
      const request = before.catch(() => {}).then(async () => {
        if (!isCurrent()) return false;
        try {
          const raw = await storage.getItem(key);
          if (!isCurrent()) return false;
          let days: string[] = [];
          if (raw !== null) {
            const parsed: unknown = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object" || !('version' in parsed) || parsed.version !== 1 || !('days' in parsed) || !Array.isArray(parsed.days)) return false;
            if (parsed.days.length > 35 || parsed.days.some(day => typeof day !== "string" || !datePattern.test(day))) return false;
            days = parsed.days;
          }
          if (days.includes(date) || !isCurrent()) return false;
          days = [...new Set([...days, date])].sort().reverse().slice(0, 35);
          await storage.setItem(key, JSON.stringify({version:1, days}));
          return isCurrent();
        } catch {
          // Optional encouragement must never block or fake session saving.
          return false;
        }
      });
      queues.set(key, request);
      try { return await request; }
      finally { if (queues.get(key) === request) queues.delete(key); }
    },
  };
}
