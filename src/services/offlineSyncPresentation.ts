import type { JournalRecord, JournalReceipt, JournalScope, JournalSetup } from "../types/sessionJournal";
import { isJournalUuid, validateJournalReceipt, validateJournalScope, validateJournalSetup } from "../utils/sessionJournalSchema";

/** Confirmed receipt copies only. This cache never credits or changes a session. */
export interface OfflineSyncEntry {
  clientSessionId: string;
  setup: JournalSetup;
  receipt: JournalReceipt;
  completedAtMs: number | null;
}
export interface OfflineSyncBatch { id: string; entries: readonly OfflineSyncEntry[] }
export interface OfflineSyncPresentationSnapshot {
  ready: boolean; busy: boolean; batch: OfflineSyncBatch | null;
  readonly acknowledgedReceiptIds: readonly string[];
}
export interface OfflineSyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export interface OfflineSyncObserver { accepted(record: JournalRecord): void; finish(): void }

type SeenReceipt = [clientSessionId: string, serverSessionId: string];
type Saved = { version: 1; scope: JournalScope; batch: OfflineSyncBatch | null; seen: SeenReceipt[] };
const EMPTY: OfflineSyncPresentationSnapshot = Object.freeze({ ready: true, busy: false, batch: null, acknowledgedReceiptIds: Object.freeze([]) });
const SEEN_LIMIT = 512;
const MAX_STORAGE_BYTES = 4 * 1024 * 1024;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const sameScope = (left: JournalScope, right: JournalScope) => left.backendId === right.backendId && left.ownerId === right.ownerId;
const identity = (entry: OfflineSyncEntry): SeenReceipt => [entry.clientSessionId, entry.receipt.sessionId];
const batchId = (entry: OfflineSyncEntry) => `offline-sync:${entry.clientSessionId}:${entry.receipt.sessionId}`;
const receiptMatches = (pair: SeenReceipt, entry: OfflineSyncEntry) => pair[0] === entry.clientSessionId || pair[1] === entry.receipt.sessionId;
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function offlineSyncPresentationKey(scope: JournalScope): string {
  validateJournalScope(scope);
  return `liferpg:offline-sync-presentation:v1:${encodeURIComponent(scope.backendId)}:${scope.ownerId}`;
}

function readEntry(value: unknown): OfflineSyncEntry | null {
  if (!object(value) || !isJournalUuid(value.clientSessionId) || !object(value.setup) || !object(value.receipt)
    || value.completedAtMs !== null && (typeof value.completedAtMs !== "number" || !Number.isSafeInteger(value.completedAtMs) || value.completedAtMs < 0)) return null;
  try {
    validateJournalSetup(value.setup as unknown as JournalSetup); validateJournalReceipt(value.receipt);
    if (value.setup.targetSeconds !== value.receipt.durationSeconds) return null;
    return { clientSessionId: value.clientSessionId, setup: clone(value.setup) as unknown as JournalSetup,
      receipt: clone(value.receipt), completedAtMs: value.completedAtMs as number | null };
  } catch { return null; }
}

function readSaved(raw: string | null, scope: JournalScope): Saved | null {
  if (!raw || raw.length > MAX_STORAGE_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== 1 || !object(value.scope) || !sameScope(value.scope as unknown as JournalScope, scope)
      || !Array.isArray(value.seen) || value.seen.length > SEEN_LIMIT) return null;
    const seen: SeenReceipt[] = [];
    for (const pair of value.seen) {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(isJournalUuid)) return null;
      seen.push([pair[0], pair[1]]);
    }
    if (value.batch === null) return { version: 1, scope, batch: null, seen };
    if (!object(value.batch) || typeof value.batch.id !== "string" || !Array.isArray(value.batch.entries) || !value.batch.entries.length) return null;
    const entries = value.batch.entries.map(readEntry);
    if (entries.some(entry => entry === null)) return null;
    const valid = entries as OfflineSyncEntry[];
    if (value.batch.id !== batchId(valid[0])) return null;
    return { version: 1, scope, batch: { id: value.batch.id, entries: valid }, seen };
  } catch { return null; }
}

/**
 * One private presentation queue per backend/account, separate from the journal.
 * It holds full accepted receipt copies because journal compaction may discard
 * early rows before a large sync pass finishes. No network or native imports.
 */
export function createOfflineSyncPresentationStore({ loadTimeoutMs = 2000 }: { loadTimeoutMs?: number } = {}) {
  type Bucket = {
    scope: JournalScope; value: OfflineSyncPresentationSnapshot; listeners: Set<() => void>;
    pending: Map<string, OfflineSyncEntry>; staged: Map<string, OfflineSyncEntry>; seen: SeenReceipt[];
    id: string | null; tokens: Set<symbol>; storage: OfflineSyncStorage | null;
    hydration: Promise<void> | null; writing: Promise<void> | null; dirty: boolean;
  };
  const buckets = new Map<string, Bucket>();
  const bucketFor = (scope: JournalScope) => {
    const key = offlineSyncPresentationKey(scope);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { scope: { ...scope }, value: EMPTY, listeners: new Set(), pending: new Map(), staged: new Map(), seen: [],
        id: null, tokens: new Set(), storage: null, hydration: null, writing: null, dirty: false };
      buckets.set(key, bucket);
    }
    return bucket;
  };
  const contains = (entries: Iterable<OfflineSyncEntry>, entry: OfflineSyncEntry) => {
    for (const current of entries) if (current.clientSessionId === entry.clientSessionId || current.receipt.sessionId === entry.receipt.sessionId) return true;
    return false;
  };
  const wasSeen = (bucket: Bucket, entry: OfflineSyncEntry) => bucket.seen.some(pair => receiptMatches(pair, entry));
  const insert = (target: Map<string, OfflineSyncEntry>, entry: OfflineSyncEntry, bucket: Bucket) => {
    if (!wasSeen(bucket, entry) && !contains(target.values(), entry)) target.set(entry.clientSessionId, entry);
  };
  const publish = (bucket: Bucket, ready = bucket.value.ready) => {
    const first = bucket.pending.values().next().value;
    if (!first) bucket.id = null;
    else bucket.id ??= batchId(first);
    const candidate = bucket.id ? freeze({ id: bucket.id, entries: [...bucket.pending.values()].map(clone) }) : null;
    const batch = JSON.stringify(bucket.value.batch) === JSON.stringify(candidate) ? bucket.value.batch : candidate;
    // In-progress accepted receipts stay staged, so ordinary import publications
    // cannot expose one confirmed session at a time to the result host.
    const acknowledgedReceiptIds = Object.freeze(bucket.seen.map(pair => pair[1]));
    if (bucket.value.ready === ready && bucket.value.busy === (bucket.tokens.size > 0)
      && bucket.value.batch === batch
      && JSON.stringify(bucket.value.acknowledgedReceiptIds) === JSON.stringify(acknowledgedReceiptIds)) return;
    bucket.value = Object.freeze({ ready, busy: bucket.tokens.size > 0, batch, acknowledgedReceiptIds });
    for (const listener of [...bucket.listeners]) { try { listener(); } catch { /* Presentation observers cannot interrupt syncing. */ } }
  };
  const savedValue = (bucket: Bucket): Saved => {
    const entries = new Map<string, OfflineSyncEntry>();
    for (const entry of [...bucket.pending.values(), ...bucket.staged.values()]) insert(entries, entry, bucket);
    const values = [...entries.values()];
    return { version: 1, scope: bucket.scope, batch: values.length ? { id: bucket.id ?? batchId(values[0]), entries: values } : null, seen: bucket.seen };
  };
  const persist = (bucket: Bucket) => {
    bucket.dirty = true;
    if (!bucket.storage || !bucket.value.ready || bucket.writing) return;
    // Serial writes keep a delayed older snapshot from overwriting Done.
    bucket.writing = (async () => {
      while (bucket.dirty) {
        bucket.dirty = false;
        try { await bucket.storage!.setItem(offlineSyncPresentationKey(bucket.scope), JSON.stringify(savedValue(bucket))); }
        catch { /* Progress is already authoritative in the journal/server. */ }
      }
    })().finally(() => {
      bucket.writing = null;
      // A microtask can change the presentation after the loop returned but
      // before this finally releases its promise. Only that new dirty state
      // reschedules a write; a storage rejection alone never retries itself.
      if (bucket.dirty) persist(bucket);
    });
  };
  const remember = (bucket: Bucket, pair: SeenReceipt) => {
    bucket.seen = [...bucket.seen.filter(current => current[0] !== pair[0] && current[1] !== pair[1]), pair].slice(-SEEN_LIMIT);
  };

  return {
    bind(scope: JournalScope, storage: OfflineSyncStorage): Promise<void> {
      const bucket = bucketFor(scope);
      if (bucket.hydration) return bucket.hydration;
      bucket.storage = storage; publish(bucket, false);
      bucket.hydration = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const raw = await Promise.race([
          Promise.resolve().then(() => storage.getItem(offlineSyncPresentationKey(scope))).catch(() => null),
          new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), Math.max(1, loadTimeoutMs)); }),
        ]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
        const saved = readSaved(raw, scope);
        if (saved) {
          const localSeen = bucket.seen;
          bucket.seen = [];
          for (const pair of [...saved.seen, ...localSeen]) remember(bucket, pair);
          const pending = new Map<string, OfflineSyncEntry>();
          for (const entry of [...(saved.batch?.entries ?? []), ...bucket.pending.values()]) insert(pending, entry, bucket);
          bucket.pending = pending;
          // Staged receipts remain private until the current observers finish.
          for (const [id, entry] of bucket.staged) if (wasSeen(bucket, entry) || contains(pending.values(), entry)) bucket.staged.delete(id);
          bucket.id = saved.batch && pending.has(saved.batch.entries[0].clientSessionId) ? saved.batch.id : null;
        }
        publish(bucket, true); persist(bucket);
      })().catch(() => { publish(bucket, true); });
      return bucket.hydration;
    },
    snapshot(scope: JournalScope | null): OfflineSyncPresentationSnapshot { return scope ? bucketFor(scope).value : EMPTY; },
    subscribe(scope: JournalScope | null, listener: () => void) {
      if (!scope) return () => {};
      const bucket = bucketFor(scope); bucket.listeners.add(listener);
      return () => { bucket.listeners.delete(listener); };
    },
    begin(scope: JournalScope): OfflineSyncObserver {
      const bucket = bucketFor(scope), token = Symbol("offline-sync-pass");
      let finished = false;
      bucket.tokens.add(token); publish(bucket);
      return {
        accepted(record) {
          if (finished || record.state !== "completed" || record.sync.state !== "synced" || !record.sync.receipt) return;
          const entry = readEntry({ clientSessionId: record.clientSessionId, setup: record.setup, receipt: record.sync.receipt, completedAtMs: record.completedAtMs });
          if (!entry || record.serverSessionId !== entry.receipt.sessionId || wasSeen(bucket, entry)
            || contains(bucket.pending.values(), entry) || contains(bucket.staged.values(), entry)) return;
          bucket.staged.set(entry.clientSessionId, entry); persist(bucket);
        },
        finish() {
          if (finished) return;
          finished = true; bucket.tokens.delete(token);
          if (!bucket.tokens.size) {
            for (const entry of bucket.staged.values()) insert(bucket.pending, entry, bucket);
            bucket.staged.clear();
          }
          publish(bucket); persist(bucket);
        },
      };
    },
    acknowledge(scope: JournalScope, id: string, clientIds: readonly string[]) {
      const bucket = bucketFor(scope);
      if (bucket.id !== id) return;
      const exact = new Set(clientIds);
      let removed = false;
      for (const [clientId, entry] of bucket.pending) {
        if (!exact.has(clientId)) continue;
        removed = true; bucket.pending.delete(clientId); remember(bucket, identity(entry));
      }
      if (!removed) return;
      // A late receipt is a new presentation. An old native dismissal cannot
      // silently acknowledge entries that were not on its outgoing summary.
      bucket.id = null; publish(bucket); persist(bucket);
    },
    hasAcknowledgedReceipt(scope: JournalScope | null, receiptSessionId: string) {
      return !!scope && bucketFor(scope).seen.some(pair => pair[1] === receiptSessionId);
    },
    /** For local verification; normal syncing never waits for cache persistence. */
    async flush(scope: JournalScope) {
      const bucket = bucketFor(scope);
      await bucket.hydration;
      while (bucket.writing) await bucket.writing;
    },
  };
}

export const offlineSyncPresentation = createOfflineSyncPresentationStore();
