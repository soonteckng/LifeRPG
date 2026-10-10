import {
  JournalValidationError,
  type JournalEnvelope,
  type JournalScope,
  type JournalValidationCode,
} from "../types/sessionJournal";
import { createJournal, isJournalRecordPrunable } from "../utils/sessionJournal";
import {
  parseJournalEnvelope,
  serializeJournalEnvelope,
  validateJournalEnvelope,
  validateJournalScope,
} from "../utils/sessionJournalSchema";

/** Inject the same backend object into every store that shares its data. */
export interface SessionJournalStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export type JournalLoadResult =
  | { kind: "ready"; journal: JournalEnvelope }
  | { kind: "quarantined"; reason: JournalValidationCode; quarantineKey: string };
export type JournalStorageCode =
  | "read_failed" | "write_failed" | "quarantine_failed"
  | "recovery_required" | "source_changed" | "invalid_quarantine"
  | "invalid_update" | "revision_mismatch" | "transform_failed";
export class JournalStorageError extends Error {
  constructor(public readonly code: JournalStorageCode, public readonly reason?: JournalValidationCode) {
    super(`Session journal storage ${code}`);
    this.name = "JournalStorageError";
  }
}

type QuarantineSnapshot = {
  schemaVersion: 1;
  sourceKey: string;
  scope: JournalScope;
  reason: JournalValidationCode;
  raw: string;
};
type SharedQueue = { tail: Promise<void>; quarantineIndex: number };
const queues = new WeakMap<SessionJournalStorage, Map<string, SharedQueue>>();
const reasons: readonly JournalValidationCode[] = ["invalid_json", "unsupported_version", "invalid_record", "scope_mismatch", "too_large"];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => equal(item, right[index]));
  }
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key]));
}
function validationReason(error: unknown): JournalValidationCode {
  return error instanceof JournalValidationError ? error.code : "invalid_record";
}
export function sessionJournalKey(scope: JournalScope): string {
  validateJournalScope(scope);
  return `liferpg:session-journal:v1:${encodeURIComponent(scope.backendId)}:${encodeURIComponent(scope.ownerId)}`;
}

/**
 * Storage foundation only. It has no auth, timer provider or network side effects.
 * A transform must be synchronous and pure; its input and returned result are detached.
 * This foreground JS queue is not a cross-runtime/native transaction. A future
 * native authority must replace this adapter rather than add a second writer.
 */
export function createSessionJournalStore(storage: SessionJournalStorage, requestedScope: JournalScope) {
  const key = sessionJournalKey(requestedScope), scope = clone(requestedScope);
  let backendQueues = queues.get(storage);
  if (!backendQueues) { backendQueues = new Map(); queues.set(storage, backendQueues); }
  let shared = backendQueues.get(key);
  if (!shared) { shared = { tail: Promise.resolve(), quarantineIndex: 0 }; backendQueues.set(key, shared); }
  const queue = shared;
  const ordered = <T,>(work: () => Promise<T>): Promise<T> => {
    const task = queue.tail.then(work);
    // A rejected read, transform or write cannot poison the next queued operation.
    queue.tail = task.then(() => undefined, () => undefined);
    return task;
  };
  const read = async (itemKey: string): Promise<string | null> => {
    try { return await storage.getItem(itemKey); }
    catch { throw new JournalStorageError("read_failed"); }
  };
  const write = async (itemKey: string, value: string, code: "write_failed" | "quarantine_failed") => {
    try { await storage.setItem(itemKey, value); }
    catch { throw new JournalStorageError(code); }
  };
  const parseSnapshot = (raw: string | null, expectedKey: string): QuarantineSnapshot => {
    try {
      const saved: unknown = JSON.parse(raw ?? "null");
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error();
      const candidate = saved as QuarantineSnapshot;
      if (candidate.schemaVersion !== 1 || candidate.sourceKey !== key || !equal(candidate.scope, scope) ||
          typeof candidate.raw !== "string" || !reasons.includes(candidate.reason) || !expectedKey.startsWith(`${key}:quarantine:`)) throw new Error();
      return candidate;
    } catch { throw new JournalStorageError("invalid_quarantine"); }
  };
  const quarantine = async (raw: string, reason: JournalValidationCode): Promise<string> => {
    const payload: QuarantineSnapshot = { schemaVersion: 1, sourceKey: key, scope, reason, raw };
    // Never overwrite an earlier archive. After restart, search existing numbered
    // archives and reuse only an identical, verifiable copy of this source.
    for (let attempts = 0; attempts < 1000; attempts++) {
      const quarantineKey = `${key}:quarantine:${queue.quarantineIndex}`;
      const saved = await read(quarantineKey);
      if (saved !== null) {
        try {
          if (equal(parseSnapshot(saved, quarantineKey), payload)) return quarantineKey;
        } catch { /* An unreadable archive remains untouched. */ }
        queue.quarantineIndex++;
        continue;
      }
      const encoded = JSON.stringify(payload);
      await write(quarantineKey, encoded, "quarantine_failed");
      // Explicit recovery must rely on a durable copy, not an in-memory snapshot.
      if (await read(quarantineKey) !== encoded) throw new JournalStorageError("quarantine_failed");
      return quarantineKey;
    }
    throw new JournalStorageError("quarantine_failed");
  };
  const loadCurrent = async (): Promise<JournalLoadResult> => {
    const raw = await read(key);
    if (raw === null) return { kind: "ready", journal: clone(createJournal(scope)) };
    try { return { kind: "ready", journal: clone(parseJournalEnvelope(raw, scope)) }; }
    catch (error) {
      const reason = validationReason(error);
      const quarantineKey = await quarantine(raw, reason);
      return { kind: "quarantined", reason, quarantineKey };
    }
  };
  return {
    key,
    load: () => ordered(loadCurrent),
    update: (transform: (journal: JournalEnvelope) => JournalEnvelope) => ordered(async () => {
      const loaded = await loadCurrent();
      if (loaded.kind !== "ready") throw new JournalStorageError("recovery_required", loaded.reason);
      const before = loaded.journal;
      let proposed: JournalEnvelope;
      try { proposed = transform(clone(before)); }
      catch { throw new JournalStorageError("transform_failed"); }
      let next: JournalEnvelope;
      try { next = clone(validateJournalEnvelope(proposed, scope)); }
      catch (error) { throw new JournalStorageError("invalid_update", validationReason(error)); }
      if (equal(before, next)) return clone(before);
      if (next.revision !== before.revision + 1) throw new JournalStorageError("revision_mismatch");
      // Count/size retention policy belongs to the trusted pure reducer. Storage
      // independently protects unsettled work and requires a whole safe record
      // and all its commands to be removed in the same durable replacement.
      const removedRecords = new Set<string>();
      for (const record of before.records) {
        const candidate = next.records.find(item => item.clientSessionId === record.clientSessionId);
        if (!candidate) {
          if (!isJournalRecordPrunable(before, record) ||
              next.commands.some(command => command.clientSessionId === record.clientSessionId)) {
            throw new JournalStorageError("invalid_update", "invalid_record");
          }
          removedRecords.add(record.clientSessionId);
          continue;
        }
        if (!equal(record.setup, candidate.setup) ||
            (record.serverSessionId !== null && record.serverSessionId !== candidate.serverSessionId) ||
            (record.startedAtMs !== null && record.startedAtMs !== candidate.startedAtMs)) {
          throw new JournalStorageError("invalid_update", "invalid_record");
        }
        if (["completed", "cancelled"].includes(record.state)) {
          const terminalFields = ["state", "elapsedMs", "endsAtMs", "completedAtMs", "observedAtMs", "clockAnchor", "clockWarning"] as const;
          if (terminalFields.some(field => !equal(record[field], candidate[field]))) {
            throw new JournalStorageError("invalid_update", "invalid_record");
          }
        }
        if (record.sync.receipt !== null && !equal(record.sync.receipt, candidate.sync.receipt)) {
          throw new JournalStorageError("invalid_update", "invalid_record");
        }
        if (record.dismissedAtMs !== null && record.dismissedAtMs !== candidate.dismissedAtMs) {
          throw new JournalStorageError("invalid_update", "invalid_record");
        }
        if (record.dismissedAtMs === null && candidate.dismissedAtMs !== null) {
          // Evaluate only the dismissal change against previously saved state;
          // settling an unknown command and dismissing it cannot be one shortcut.
          const dismissed = { ...record, dismissedAtMs: candidate.dismissedAtMs };
          const dismissal = { ...before, records: before.records.map(item => item.clientSessionId === record.clientSessionId ? dismissed : item) };
          if (!isJournalRecordPrunable(dismissal, dismissed)) throw new JournalStorageError("invalid_update", "invalid_record");
        }
      }
      for (const command of before.commands) {
        const candidate = next.commands.find(item => item.operationId === command.operationId);
        if (!candidate && !removedRecords.has(command.clientSessionId)) {
          throw new JournalStorageError("invalid_update", "invalid_record");
        }
        if (candidate && (candidate.kind !== command.kind || candidate.clientSessionId !== command.clientSessionId ||
            candidate.createdAtMs !== command.createdAtMs || !equal(command.request, candidate.request))) {
          throw new JournalStorageError("invalid_update", "invalid_record");
        }
      }
      let encoded: string;
      try { encoded = serializeJournalEnvelope(next); }
      catch (error) { throw new JournalStorageError("invalid_update", validationReason(error)); }
      await write(key, encoded, "write_failed");
      return clone(next);
    }),
    // The original stays in place until this explicit recovery request. A stale
    // archive cannot reset changed source data, including a now-valid journal.
    resetQuarantined: (quarantineKey: string) => ordered(async () => {
      if (!quarantineKey.startsWith(`${key}:quarantine:`)) throw new JournalStorageError("invalid_quarantine");
      const snapshot = parseSnapshot(await read(quarantineKey), quarantineKey);
      const current = await read(key);
      if (current !== snapshot.raw) throw new JournalStorageError("source_changed");
      let valid = false;
      try { parseJournalEnvelope(current, scope); valid = true; } catch { /* Only invalid data can be explicitly reset. */ }
      if (valid) throw new JournalStorageError("invalid_quarantine");
      const journal = clone(createJournal(scope));
      await write(key, serializeJournalEnvelope(journal), "write_failed");
      return clone(journal);
    }),
  };
}

export type SessionJournalStore = ReturnType<typeof createSessionJournalStore>;
