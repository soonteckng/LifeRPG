import {
  JOURNAL_MAX_BYTES, JOURNAL_MAX_COMMANDS, JOURNAL_MAX_RECORDS, JOURNAL_VERSION,
  JournalValidationError,
  type JournalClock, type JournalEnvelope, type JournalJson, type JournalReceipt,
  type JournalScope, type JournalSetup,
} from "../types/sessionJournal";

type JsonObject = Record<string, unknown>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const forbiddenKeys = new Set([
  "accesstoken", "refreshtoken", "password", "authorization", "servicerole",
  "servicerolekey", "apikey", "secretkey", "credentials",
]);

function invalid(): never { throw new JournalValidationError("invalid_record"); }
function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as JsonObject;
}
function keys(value: JsonObject, names: string[]): void {
  if (Object.keys(value).length !== names.length || names.some(name => !Object.hasOwn(value, name))) invalid();
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function text(value: unknown, max = 1024): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
function timestamp(value: unknown): boolean { return integer(value, 0, 8_640_000_000_000_000); }
function nullableTime(value: unknown): boolean { return value === null || timestamp(value); }
function json(value: unknown, depth = 0): void {
  if (depth > 16) invalid();
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value)) invalid(); return; }
  if (typeof value === "string") { if (value.length > 32_768) invalid(); return; }
  if (Array.isArray(value)) {
    if (value.length > JOURNAL_MAX_COMMANDS) invalid();
    for (const item of value) json(item, depth + 1);
    return;
  }
  const item = object(value);
  if (Object.keys(item).length > 128) invalid();
  for (const [key, child] of Object.entries(item)) {
    if (!text(key, 128) || forbiddenKeys.has(key.replace(/[_-]/g, "").toLowerCase())) invalid();
    json(child, depth + 1);
  }
}

export function isJournalUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}
export function validateJournalScope(value: JournalScope): void {
  const item = object(value);
  keys(item, ["backendId", "ownerId"]);
  if (!text(item.backendId, 128) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(item.backendId)
      || !isJournalUuid(item.ownerId)) invalid();
}
export function validateJournalClock(value: JournalClock): void {
  const item = object(value);
  keys(item, ["wallTimeMs", "monotonicTimeMs", "bootId"]);
  if (!timestamp(item.wallTimeMs) || !nullableTime(item.monotonicTimeMs)
      || !(item.bootId === null || text(item.bootId, 128))
      || ((item.bootId === null) !== (item.monotonicTimeMs === null))) invalid();
}
export function validateJournalSetup(value: JournalSetup): void {
  const item = object(value);
  keys(item, ["targetSeconds", "activityType", "taskId", "subjectId", "notes", "title"]);
  if (!integer(item.targetSeconds, 1, 28_800) || !text(item.activityType, 128)
      || !(item.taskId === null || integer(item.taskId, 1))
      || !(item.subjectId === null || integer(item.subjectId, 1))
      || !(item.notes === null || (typeof item.notes === "string" && item.notes.length <= 10_000))
      || !(item.title === null || (typeof item.title === "string" && item.title.length <= 256))) invalid();
}

/** Validate the original receipt before comparisons omit legitimate replay flags. */
export function validateJournalReceipt(value: unknown): asserts value is JournalReceipt {
  const receipt = object(value);
  keys(receipt, ["sessionId", "durationSeconds", "result"]);
  if (!isJournalUuid(receipt.sessionId) || !integer(receipt.durationSeconds, 1, 28_800)) invalid();
  const result = object(receipt.result);
  json(result);
  if ((Object.hasOwn(result, "session_id") && result.session_id !== receipt.sessionId)
      || (Object.hasOwn(result, "duration_seconds") && result.duration_seconds !== receipt.durationSeconds)) invalid();
  for (const flag of ["already_completed", "goal_reached_now"])
    if (Object.hasOwn(result, flag) && typeof result[flag] !== "boolean") invalid();
}

function validateRecord(value: unknown): JsonObject {
  const item = object(value);
  keys(item, ["clientSessionId", "serverSessionId", "revision", "state", "setup", "startedAtMs", "elapsedMs",
    "clockAnchor", "endsAtMs", "completedAtMs", "observedAtMs", "dismissedAtMs", "verification", "clockWarning", "sync"]);
  if (!isJournalUuid(item.clientSessionId) || !(item.serverSessionId === null || isJournalUuid(item.serverSessionId))
      || !integer(item.revision) || typeof item.state !== "string"
      || !["not_started", "running", "paused", "completed", "cancelled"].includes(item.state)
      || typeof item.verification !== "string"
      || !["server_timed", "client_reported"].includes(item.verification) || typeof item.clockWarning !== "boolean") invalid();
  validateJournalSetup(item.setup as JournalSetup);
  const targetMs = (item.setup as JournalSetup).targetSeconds * 1000;
  if (!integer(item.elapsedMs, 0, targetMs)
      || ![item.startedAtMs, item.endsAtMs, item.completedAtMs, item.observedAtMs, item.dismissedAtMs].every(nullableTime)) invalid();
  if (item.clockAnchor !== null) validateJournalClock(item.clockAnchor as JournalClock);
  const sync = object(item.sync);
  keys(sync, ["state", "attempts", "nextAttemptAtMs", "reasonCode", "receipt"]);
  if (typeof sync.state !== "string" || !["idle", "pending", "waiting_auth", "synced", "rejected"].includes(sync.state)
      || !integer(sync.attempts) || !nullableTime(sync.nextAttemptAtMs)
      || !(sync.reasonCode === null || text(sync.reasonCode, 128))) invalid();
  if (sync.receipt !== null) {
    validateJournalReceipt(sync.receipt);
    if (sync.receipt.sessionId !== item.serverSessionId || sync.receipt.durationSeconds * 1000 !== targetMs) invalid();
    if (item.state !== "completed" || sync.state !== "synced") invalid();
  }
  if (item.dismissedAtMs !== null
      && (sync.state !== "rejected" || !["completed", "cancelled"].includes(item.state as string))) invalid();
  if (item.state === "not_started") {
    // A returned server ID is saved before reading its timing row. Until that
    // snapshot arrives, this remains a pending intent with no invented clock.
    if (item.startedAtMs !== null || item.elapsedMs !== 0 || item.clockAnchor !== null
        || item.endsAtMs !== null || item.completedAtMs !== null || item.observedAtMs !== null || sync.state !== "idle") invalid();
  } else if (item.state === "cancelled" && item.serverSessionId === null) {
    // A definitive rejected start is retained as a terminal draft, never a
    // fabricated server session. Network uncertainty uses an unresolved command.
    if (item.startedAtMs !== null || item.elapsedMs !== 0 || item.observedAtMs !== null || sync.state !== "rejected") invalid();
  } else if (item.serverSessionId === null || item.startedAtMs === null) invalid();
  if (item.state === "running") {
    if (item.clockAnchor === null || item.endsAtMs === null || item.completedAtMs !== null || sync.state !== "idle") invalid();
    const anchor = item.clockAnchor as JournalClock;
    if (item.endsAtMs !== anchor.wallTimeMs + targetMs - (item.elapsedMs as number)) invalid();
  } else if (item.clockAnchor !== null) invalid();
  if (item.state === "paused" && (item.endsAtMs !== null || item.completedAtMs !== null || sync.state !== "idle")) invalid();
  if (item.state === "completed") {
    if (item.elapsedMs !== targetMs || item.completedAtMs === null || item.observedAtMs === null || sync.state === "idle"
        || (sync.state === "synced" && sync.receipt === null)) invalid();
  } else if (item.completedAtMs !== null || sync.receipt !== null) invalid();
  if (item.state === "cancelled" && (item.endsAtMs !== null
      || (item.serverSessionId !== null && sync.state !== "synced"))) invalid();
  return item;
}

export function validateJournalEnvelope(value: unknown, scope: JournalScope): JournalEnvelope {
  validateJournalScope(scope);
  const envelope = object(value);
  if (envelope.schemaVersion !== JOURNAL_VERSION) throw new JournalValidationError("unsupported_version");
  keys(envelope, ["schemaVersion", "scope", "revision", "admission", "records", "commands"]);
  validateJournalScope(envelope.scope as JournalScope);
  const savedScope = envelope.scope as JournalScope;
  if (savedScope.backendId !== scope.backendId || savedScope.ownerId !== scope.ownerId)
    throw new JournalValidationError("scope_mismatch");
  if (!integer(envelope.revision)) invalid();
  const admission = object(envelope.admission);
  keys(admission, ["epoch", "active"]);
  if (!integer(admission.epoch) || typeof admission.active !== "boolean" || (admission.active && admission.epoch === 0)) invalid();
  if (!Array.isArray(envelope.records) || !Array.isArray(envelope.commands)) invalid();
  if (envelope.records.length > JOURNAL_MAX_RECORDS || envelope.commands.length > JOURNAL_MAX_COMMANDS)
    throw new JournalValidationError("too_large");
  const identities = new Set<string>(), serverIds = new Set<string>(), operations = new Set<string>();
  let open = 0;
  for (const value of envelope.records) {
    const record = validateRecord(value);
    const clientId = record.clientSessionId as string;
    if (identities.has(clientId)) invalid();
    identities.add(clientId);
    if (record.serverSessionId !== null) {
      const serverId = record.serverSessionId as string;
      if (serverIds.has(serverId)) invalid();
      serverIds.add(serverId);
    }
    if (["not_started", "running", "paused"].includes(record.state as string)) open++;
  }
  if (open > 1) invalid();
  let unresolvedCount = 0;
  for (const value of envelope.commands) {
    const command = object(value);
    keys(command, ["operationId", "clientSessionId", "kind", "status", "createdAtMs", "request"]);
    if (!isJournalUuid(command.operationId) || !isJournalUuid(command.clientSessionId)
        || operations.has(command.operationId) || !identities.has(command.clientSessionId)
        || typeof command.kind !== "string" || !["start", "pause", "resume", "cancel", "complete"].includes(command.kind)
        || typeof command.status !== "string" || !["prepared", "unknown", "acknowledged", "rejected", "superseded"].includes(command.status)
        || !timestamp(command.createdAtMs)) invalid();
    operations.add(command.operationId);
    if (command.status === "superseded") {
      const index = envelope.commands.indexOf(value);
      if ((command.kind !== "pause" && command.kind !== "resume")
        || !envelope.commands.slice(index + 1).some(item => object(item).kind === "cancel"
          && object(item).clientSessionId === command.clientSessionId)) invalid();
    }
    const request = object(command.request); json(request);
    const record = (envelope.records as JsonObject[]).find(item => item.clientSessionId === command.clientSessionId)!;
    if (command.kind === "start") {
      keys(request, ["setup", "clock"]);
      validateJournalSetup(request.setup as JournalSetup);
      validateJournalClock(request.clock as JournalClock);
      if (!journalJsonEqual(request.setup, record.setup)
          || (request.clock as JournalClock).wallTimeMs !== command.createdAtMs) invalid();
    } else if (command.kind === "complete") {
      keys(request, ["serverSessionId", "completedAtMs", "targetSeconds"]);
      if (request.serverSessionId !== record.serverSessionId || !isJournalUuid(request.serverSessionId)
          || request.completedAtMs !== record.completedAtMs || !timestamp(request.completedAtMs)
          || request.targetSeconds !== (record.setup as JournalSetup).targetSeconds) invalid();
    } else {
      keys(request, ["serverSessionId", "clock"]);
      validateJournalClock(request.clock as JournalClock);
      if (request.serverSessionId !== record.serverSessionId || !isJournalUuid(request.serverSessionId)
          || (request.clock as JournalClock).wallTimeMs !== command.createdAtMs) invalid();
    }
    if (command.status === "prepared" || command.status === "unknown") {
      unresolvedCount++;
      if ((command.kind === "start" && record.state !== "not_started")
          || (command.kind === "pause" && record.state !== "running")
          || (command.kind === "resume" && record.state !== "paused")
          || (command.kind === "cancel" && record.state !== "running" && record.state !== "paused")
          || (command.kind === "complete" && (record.state !== "completed"
            || !["pending", "waiting_auth"].includes((record.sync as JsonObject).state as string)))) invalid();
    }
  }
  if (unresolvedCount > 1) invalid();
  for (const record of envelope.records as JsonObject[]) {
    const commands = (envelope.commands as JsonObject[]).filter(item => item.clientSessionId === record.clientSessionId);
    const isUnresolved = (item: JsonObject) => item.status === "prepared" || item.status === "unknown";
    if (record.dismissedAtMs !== null && commands.some(isUnresolved)) invalid();
    if (record.state === "not_started" && !commands.some(item => item.kind === "start" && isUnresolved(item))) invalid();
    if (record.state === "not_started" && record.serverSessionId !== null
        && !commands.some(item => item.kind === "start" && item.status === "unknown")) invalid();
    if (record.state === "completed" && ["pending", "waiting_auth"].includes((record.sync as JsonObject).state as string)
        && !commands.some(item => item.kind === "complete" && isUnresolved(item))) invalid();
    if (record.state === "completed" && (record.sync as JsonObject).state === "rejected"
        && !commands.some(item => item.kind === "complete" && item.status === "rejected")) invalid();
    if (record.state === "cancelled" && record.serverSessionId === null
        && !commands.some(item => item.kind === "start" && item.status === "rejected")) invalid();
  }
  // Check the whole object for unexpected credential fields even inside receipts.
  json(envelope);
  return envelope as unknown as JournalEnvelope;
}

function utf8Bytes(text: string): number {
  let count = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    count += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return count;
}
export function parseJournalEnvelope(raw: string, scope: JournalScope): JournalEnvelope {
  if (typeof raw !== "string") throw new JournalValidationError("invalid_json");
  if (raw.length > JOURNAL_MAX_BYTES || utf8Bytes(raw) > JOURNAL_MAX_BYTES)
    throw new JournalValidationError("too_large");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new JournalValidationError("invalid_json"); }
  return validateJournalEnvelope(parsed, scope);
}
export function serializeJournalEnvelope(journal: JournalEnvelope): string {
  validateJournalEnvelope(journal, journal.scope);
  const raw = JSON.stringify(journal);
  if (raw.length > JOURNAL_MAX_BYTES || utf8Bytes(raw) > JOURNAL_MAX_BYTES)
    throw new JournalValidationError("too_large");
  return raw;
}

function canonical(value: JournalJson): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function journalJsonEqual(left: unknown, right: unknown): boolean {
  json(left); json(right);
  return canonical(left as JournalJson) === canonical(right as JournalJson);
}
