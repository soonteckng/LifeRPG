import {
  JOURNAL_CLOCK_WARNING_MS,
  JOURNAL_MAX_COMMANDS,
  JOURNAL_MAX_RECORDS,
  JOURNAL_RETAIN_SETTLED_RECORDS,
  JOURNAL_START_STOP_REASON,
  JOURNAL_START_STOP_CONFIRMED_REASON,
  JOURNAL_VERSION,
  JOURNAL_CLIENT_TIMING_VERSION,
  JOURNAL_CLIENT_MAX_SEGMENTS,
  JOURNAL_CLIENT_MAX_SPAN_MS,
  JournalValidationError,
  type JournalAction,
  type JournalClock,
  type JournalCommand,
  type JournalEnvelope,
  type JournalJson,
  type JournalRecord,
  type JournalReceipt,
  type JournalScope,
  type JournalServerSnapshot,
  type JournalSetup,
  type JournalTimerView,
  type ClientSessionSubmission,
  type JournalClientTiming,
} from "../types/sessionJournal";
import {
  isJournalUuid,
  journalJsonEqual,
  serializeJournalEnvelope,
  validateJournalClock,
  validateJournalEnvelope,
  validateJournalScope,
  validateJournalSetup,
  validateJournalReceipt,
} from "./sessionJournalSchema";

export type JournalActionCode =
  | "invalid_action" | "stale_revision" | "stale_epoch" | "inactive_admission"
  | "unknown_operation" | "operation_conflict" | "operation_settled"
  | "unknown_session" | "session_conflict" | "invalid_transition"
  | "unresolved_command" | "snapshot_conflict" | "not_expired" | "receipt_conflict";

export class JournalActionError extends Error {
  constructor(public readonly code: JournalActionCode) {
    super(`Session journal action ${code}`);
    this.name = "JournalActionError";
  }
}

function fail(code: JournalActionCode): never { throw new JournalActionError(code); }
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is number => integer(value) && value <= 8_640_000_000_000_000;
const unresolved = (command: JournalCommand) => command.status === "prepared" || command.status === "unknown";
const copyClock = (clock: JournalClock): JournalClock => ({ ...clock });
const copySetup = (setup: JournalSetup): JournalSetup => ({ ...setup });
const clockRequest = (clock: JournalClock): { [key: string]: JournalJson } => ({
  wallTimeMs: clock.wallTimeMs, monotonicTimeMs: clock.monotonicTimeMs, bootId: clock.bootId,
});
const setupRequest = (setup: JournalSetup): { [key: string]: JournalJson } => ({
  targetSeconds: setup.targetSeconds, activityType: setup.activityType,
  taskId: setup.taskId, subjectId: setup.subjectId, notes: setup.notes, title: setup.title,
});
const detach = (envelope: JournalEnvelope): JournalEnvelope =>
  JSON.parse(JSON.stringify(envelope)) as JournalEnvelope;

function sameReceipt(left: JournalReceipt, right: JournalReceipt): boolean {
  const normalized = (receipt: JournalReceipt) => ({
    sessionId: receipt.sessionId,
    durationSeconds: receipt.durationSeconds,
    result: Object.fromEntries(Object.entries(receipt.result)
      .filter(([key]) => key !== "already_completed" && key !== "goal_reached_now")),
  });
  return journalJsonEqual(normalized(left), normalized(right));
}

function recordFor(envelope: JournalEnvelope, id: string): JournalRecord {
  const record = envelope.records.find(item => item.clientSessionId === id);
  if (!record) fail("unknown_session");
  return record;
}

function commandFor(envelope: JournalEnvelope, id: string): JournalCommand {
  const command = envelope.commands.find(item => item.operationId === id);
  if (!command) fail("unknown_operation");
  return command;
}

function assertNoUnresolved(envelope: JournalEnvelope, id?: string): void {
  if (envelope.commands.some(command => unresolved(command) && (id ? command.clientSessionId === id : command.kind !== "import"))) {
    fail("unresolved_command");
  }
}

function replayPrepared(envelope: JournalEnvelope, next: JournalCommand): boolean {
  const existing = envelope.commands.find(command => command.operationId === next.operationId);
  if (!existing) return false;
  if (existing.clientSessionId !== next.clientSessionId || existing.kind !== next.kind
    || !journalJsonEqual(existing.request, next.request)) fail("operation_conflict");
  if (existing.status === "rejected" || existing.status === "superseded") fail("operation_settled");
  return true;
}

function makeCommand(operationId: string, clientSessionId: string, kind: JournalCommand["kind"],
  createdAtMs: number, request: JournalCommand["request"]): JournalCommand {
  if (!isJournalUuid(operationId) || !isJournalUuid(clientSessionId)) fail("invalid_action");
  return { operationId, clientSessionId, kind, status: "prepared", createdAtMs, request };
}

/** Eligibility only: pruning still removes the record and every command together. */
export function isJournalRecordPrunable(envelope: JournalEnvelope, record: JournalRecord): boolean {
  const saved = envelope.records.find(item => item.clientSessionId === record.clientSessionId);
  if (!saved || (saved.state !== "completed" && saved.state !== "cancelled")
    || envelope.commands.some(command => command.clientSessionId === saved.clientSessionId && unresolved(command))) return false;
  if (saved.sync.state === "rejected") return saved.dismissedAtMs !== null;
  if (saved.state === "cancelled" && saved.clientTiming?.offlineOrigin && saved.sync.state === "synced"
      && saved.serverSessionId === null && saved.sync.receipt === null) return true;
  if (saved.sync.state !== "synced" || !isJournalUuid(saved.serverSessionId)) return false;
  return saved.state === "cancelled" || (saved.sync.receipt !== null
    && saved.sync.receipt.sessionId === saved.serverSessionId
    && saved.sync.receipt.durationSeconds === saved.setup.targetSeconds);
}

function retentionTime(envelope: JournalEnvelope, record: JournalRecord): number {
  let latest = Math.max(record.startedAtMs ?? 0, record.completedAtMs ?? 0,
    record.observedAtMs ?? 0, record.dismissedAtMs ?? 0);
  for (const command of envelope.commands) {
    if (command.clientSessionId === record.clientSessionId && !unresolved(command)) {
      latest = Math.max(latest, command.createdAtMs);
    }
  }
  return latest;
}

function withoutRecords(envelope: JournalEnvelope, dropped: Set<string>): JournalEnvelope {
  return {
    ...envelope,
    records: envelope.records.filter(record => !dropped.has(record.clientSessionId)),
    commands: envelope.commands.filter(command => !dropped.has(command.clientSessionId)),
  };
}

function compactForCapacity(envelope: JournalEnvelope, applyCeiling: boolean,
  protectedId?: string): JournalEnvelope {
  const protectedRecord = envelope.records.find(record => record.clientSessionId === protectedId);
  const retainedProtected = protectedRecord && isJournalRecordPrunable(envelope, protectedRecord) ? 1 : 0;
  const eligible = envelope.records.map((record, index) => ({ record, index }))
    .filter(({ record }) => record.clientSessionId !== protectedId && isJournalRecordPrunable(envelope, record))
    .sort((left, right) => retentionTime(envelope, left.record) - retentionTime(envelope, right.record)
      || left.index - right.index);
  const dropped = new Set<string>();
  let cursor = 0;
  if (applyCeiling) {
    while (cursor < eligible.length - (JOURNAL_RETAIN_SETTLED_RECORDS - retainedProtected)) {
      dropped.add(eligible[cursor++].record.clientSessionId);
    }
  }
  for (;;) {
    const candidate = withoutRecords(envelope, dropped);
    const countsFit = candidate.records.length <= JOURNAL_MAX_RECORDS
      && candidate.commands.length <= JOURNAL_MAX_COMMANDS;
    if (countsFit) {
      try {
        // Validation precedes serialization; malformed input is never sanitized.
        serializeJournalEnvelope(candidate);
        return candidate;
      } catch (error) {
        if (!(error instanceof JournalValidationError) || error.code !== "too_large") throw error;
      }
    }
    if (cursor >= eligible.length) throw new JournalValidationError("too_large");
    dropped.add(eligible[cursor++].record.clientSessionId);
  }
}

function advance(envelope: JournalEnvelope, record?: JournalRecord, command?: JournalCommand,
  admission = envelope.admission): JournalEnvelope {
  const next: JournalEnvelope = {
    ...envelope,
    revision: envelope.revision + 1,
    admission: { ...admission },
    records: record
      ? envelope.records.some(item => item.clientSessionId === record.clientSessionId)
        ? envelope.records.map(item => item.clientSessionId === record.clientSessionId ? record : item)
        : [...envelope.records, record]
      : envelope.records,
    commands: command
      ? envelope.commands.some(item => item.operationId === command.operationId)
        ? envelope.commands.map(item => item.operationId === command.operationId ? command : item)
        : [...envelope.commands, command]
      : envelope.commands,
  };
  const appends = (record !== undefined && !envelope.records.some(item => item.clientSessionId === record.clientSessionId))
    || (command !== undefined && !envelope.commands.some(item => item.operationId === command.operationId));
  const confirmsTerminal = record !== undefined && record.sync.state === "synced"
    && isJournalRecordPrunable(next, record);
  // Cache retention and the user's action share one persisted revision. Never
  // discard the record being updated, including a just-confirmed receipt.
  const compacted = compactForCapacity(next, appends || confirmsTerminal, record?.clientSessionId);
  // Validate before cloning: JSON serialization must never sanitize bad input.
  validateJournalEnvelope(compacted, envelope.scope);
  return detach(compacted);
}

function validateSnapshot(snapshot: JournalServerSnapshot): void {
  if (!snapshot || !isJournalUuid(snapshot.serverSessionId)
    || !["running", "paused", "cancelled"].includes(snapshot.state)
    || !timestamp(snapshot.startedAtMs) || !integer(snapshot.elapsedMs)) fail("snapshot_conflict");
  validateJournalClock(snapshot.observedClock);
}

function assertVerifiedScope(envelope: JournalEnvelope, scope: JournalScope): void {
  validateJournalScope(scope);
  if (scope.backendId !== envelope.scope.backendId || scope.ownerId !== envelope.scope.ownerId) fail("snapshot_conflict");
}

function assertRemoteSetup(record: JournalRecord, setup: JournalSetup): void {
  validateJournalSetup(setup);
  for (const field of ["targetSeconds", "activityType", "taskId", "subjectId", "notes"] as const)
    if (record.setup[field] !== setup[field]) fail("snapshot_conflict");
}

function advanceRemote(envelope: JournalEnvelope, record: JournalRecord,
  commands: JournalCommand[]): JournalEnvelope {
  // Reconciliation changes one record and its operation statuses atomically.
  // The normal store guards still protect payloads, known IDs and terminal time.
  return advance({ ...envelope, commands }, record);
}

function snapshotMatches(record: JournalRecord, snapshot: JournalServerSnapshot): boolean {
  const elapsed = Math.min(snapshot.elapsedMs, record.setup.targetSeconds * 1000);
  return record.serverSessionId === snapshot.serverSessionId && record.state === snapshot.state
    && record.startedAtMs === snapshot.startedAtMs && record.elapsedMs === elapsed
    && record.observedAtMs === snapshot.observedClock.wallTimeMs
    && (snapshot.state !== "running" || journalJsonEqual(record.clockAnchor, snapshot.observedClock));
}

function withSnapshot(record: JournalRecord, snapshot: JournalServerSnapshot): JournalRecord {
  const elapsedMs = Math.min(snapshot.elapsedMs, record.setup.targetSeconds * 1000);
  const running = snapshot.state === "running";
  return {
    ...record, revision: record.revision + 1, serverSessionId: snapshot.serverSessionId,
    state: snapshot.state, startedAtMs: snapshot.startedAtMs, elapsedMs,
    clockAnchor: running ? copyClock(snapshot.observedClock) : null,
    endsAtMs: running ? snapshot.observedClock.wallTimeMs + record.setup.targetSeconds * 1000 - elapsedMs : null,
    completedAtMs: null, observedAtMs: snapshot.observedClock.wallTimeMs,
    clockWarning: record.clockWarning || (record.clockAnchor !== null
      && deriveJournalTimer(record, snapshot.observedClock).clockWarning),
    sync: { ...record.sync, state: snapshot.state === "cancelled" ? "synced" : "idle",
      nextAttemptAtMs: null, reasonCode: snapshot.state !== "cancelled" && record.sync.reasonCode === JOURNAL_START_STOP_REASON
        ? JOURNAL_START_STOP_REASON : null },
  };
}

export function createJournal(scope: JournalScope): JournalEnvelope {
  validateJournalScope(scope);
  return {
    schemaVersion: JOURNAL_VERSION, scope: { ...scope }, revision: 0,
    admission: { epoch: 0, active: false }, records: [], commands: [],
  };
}

/** Derive a view without changing anchors, deadlines or provenance. */
export function deriveJournalTimer(record: JournalRecord, clock: JournalClock): JournalTimerView {
  validateJournalClock(clock);
  const targetMs = record.setup.targetSeconds * 1000;
  if (!integer(record.setup.targetSeconds) || record.setup.targetSeconds < 1 || record.setup.targetSeconds > 28800
    || !integer(record.elapsedMs) || record.elapsedMs > targetMs) fail("invalid_action");
  if (record.state === "completed") return {
    remainingMs: 0, elapsedMs: targetMs, expired: true, clockWarning: record.clockWarning,
  };
  if (record.state !== "running") return {
    remainingMs: targetMs - record.elapsedMs, elapsedMs: record.elapsedMs,
    expired: record.state === "paused" && record.elapsedMs === targetMs,
    clockWarning: record.clockWarning,
  };
  if (!record.clockAnchor || !timestamp(record.endsAtMs)) fail("invalid_action");
  validateJournalClock(record.clockAnchor);
  const anchor = record.clockAnchor;
  const wallDelta = clock.wallTimeMs - anchor.wallTimeMs;
  const sameBoot = anchor.bootId !== null && clock.bootId === anchor.bootId
    && anchor.monotonicTimeMs !== null && clock.monotonicTimeMs !== null;
  let warning = record.clockWarning;
  let remainingMs: number;
  if (sameBoot && clock.monotonicTimeMs! >= anchor.monotonicTimeMs!) {
    const delta = clock.monotonicTimeMs! - anchor.monotonicTimeMs!;
    warning = warning || Math.abs(wallDelta - delta) > JOURNAL_CLOCK_WARNING_MS;
    remainingMs = Math.max(0, targetMs - record.elapsedMs - delta);
  } else {
    if (sameBoot || wallDelta < -JOURNAL_CLOCK_WARNING_MS) warning = true;
    // A reboot changes the time source, never the persisted wall deadline.
    remainingMs = Math.max(0, Math.min(targetMs - record.elapsedMs, record.endsAtMs - clock.wallTimeMs));
  }
  return { remainingMs, elapsedMs: targetMs - remainingMs, expired: remainingMs === 0, clockWarning: warning };
}

/** Detached canonical submission; retries never use their wall clock or new IDs. */
export function buildClientSessionSubmission(record: JournalRecord): ClientSessionSubmission {
  const timing = record.clientTiming;
  if (!timing || !["completed", "cancelled"].includes(record.state) || record.startedAtMs === null
      || timing.segments.some(segment => segment.endedAtMs === null)
      || (record.state === "cancelled" && timing.offlineOrigin)) fail("invalid_transition");
  const endedAtMs = record.state === "completed" ? record.completedAtMs : record.observedAtMs;
  if (!timestamp(endedAtMs)) fail("invalid_action");
  return {
    policyVersion: 1, ending: record.state as "completed" | "cancelled", clientSessionId: record.clientSessionId,
    serverSessionId: timing.offlineOrigin ? null : record.serverSessionId,
    expectedRevision: timing.serverRevision, setup: copySetup(record.setup),
    startedAtMs: record.startedAtMs, endedAtMs,
    serverConfirmedMs: timing.serverConfirmedMs, serverObservedAtMs: timing.serverObservedAtMs,
    segments: timing.segments.map(segment => ({ startedAtMs: segment.startedAtMs, endedAtMs: segment.endedAtMs! })),
    clockWarning: record.clockWarning,
  };
}

function clientTimingFor(record: JournalRecord): JournalClientTiming {
  if (!record.clientTiming || record.verification !== "client_reported") fail("invalid_transition");
  return { ...record.clientTiming, segments: record.clientTiming.segments.map(segment => ({ ...segment })) };
}

function closeClientInterval(record: JournalRecord, clock: JournalClock): JournalRecord {
  const timing = clientTimingFor(record);
  const timer = deriveJournalTimer(record, clock);
  let observedAtMs = clock.wallTimeMs;
  if (record.state === "running") {
    const segment = timing.segments.at(-1);
    if (!segment || segment.endedAtMs !== null) fail("invalid_transition");
    segment.endedAtMs = segment.startedAtMs + timer.elapsedMs - record.elapsedMs;
    if (segment.endedAtMs - record.startedAtMs! > JOURNAL_CLIENT_MAX_SPAN_MS) fail("invalid_transition");
    observedAtMs = segment.endedAtMs;
    // Two taps within one clock millisecond do not constitute active effort.
    // Omitting that empty interval also avoids an invalid server submission.
    if (segment.endedAtMs === segment.startedAtMs) timing.segments.pop();
  }
  return { ...record, clientTiming: timing, elapsedMs: timer.elapsedMs, clockWarning: timer.clockWarning,
    clockAnchor: null, endsAtMs: null, observedAtMs };
}

function finishClientRecord(envelope: JournalEnvelope, record: JournalRecord, clock: JournalClock,
  operationId: string, ending: "completed" | "cancelled"): JournalEnvelope {
  const timer = deriveJournalTimer(record, clock);
  if (ending === "completed" && !timer.expired) fail("not_expired");
  const closed = closeClientInterval(record, clock);
  if (ending === "cancelled") {
    if (clock.wallTimeMs < (closed.observedAtMs ?? record.startedAtMs!)) fail("invalid_transition");
    closed.observedAtMs = clock.wallTimeMs;
  }
  const finished: JournalRecord = { ...closed, revision: record.revision + 1, state: ending,
    completedAtMs: ending === "completed" ? closed.observedAtMs : null,
    endsAtMs: ending === "completed" ? closed.observedAtMs : null,
    sync: { ...record.sync, state: "pending", nextAttemptAtMs: null, reasonCode: null } };
  const request = buildClientSessionSubmission(finished) as unknown as JournalCommand["request"];
  const command = makeCommand(operationId, record.clientSessionId, "import", clock.wallTimeMs, request);
  if (replayPrepared(envelope, command)) return detach(envelope);
  return advance(envelope, finished, command);
}

/** Slice A: durable online intents and recovery, with no local timing transitions. */
export function applyJournalAction(envelope: JournalEnvelope, action: JournalAction): JournalEnvelope {
  validateJournalEnvelope(envelope, envelope.scope);
  if (!action || !integer(action.epoch) || !integer(action.expectedRevision)) fail("invalid_action");
  if (action.expectedRevision !== envelope.revision) fail("stale_revision");
  if (action.type === "admit") {
    if (action.epoch <= envelope.admission.epoch) fail("stale_epoch");
    // The owner is immutable; a new admission epoch only fences old callbacks.
    return advance(envelope, undefined, undefined, { epoch: action.epoch, active: true });
  }
  if (action.epoch !== envelope.admission.epoch) fail("stale_epoch");
  if (action.type === "revoke") {
    if (!envelope.admission.active) return detach(envelope);
    return advance(envelope, undefined, undefined, { epoch: action.epoch + 1, active: false });
  }
  if (!envelope.admission.active) fail("inactive_admission");

  switch (action.type) {
    case "local_start": {
      validateJournalSetup(action.setup); validateJournalClock(action.clock);
      if (!isJournalUuid(action.clientSessionId)) fail("invalid_action");
      assertNoUnresolved(envelope);
      if (envelope.records.some(record => ["not_started", "running", "paused"].includes(record.state)
          || record.clientSessionId === action.clientSessionId)) fail("session_conflict");
      const record: JournalRecord = {
        clientSessionId: action.clientSessionId, serverSessionId: null, revision: 1, state: "running",
        setup: copySetup(action.setup), startedAtMs: action.clock.wallTimeMs, elapsedMs: 0,
        clockAnchor: copyClock(action.clock), endsAtMs: action.clock.wallTimeMs + action.setup.targetSeconds * 1000,
        completedAtMs: null, observedAtMs: action.clock.wallTimeMs, dismissedAtMs: null,
        verification: "client_reported", clockWarning: false,
        clientTiming: { policyVersion: 1, offlineOrigin: true, segments: [{ startedAtMs: action.clock.wallTimeMs, endedAtMs: null }],
          serverRevision: null, serverObservedAtMs: null, serverConfirmedMs: 0 },
        sync: { state: "idle", attempts: 0, nextAttemptAtMs: null, reasonCode: null, receipt: null },
      };
      return advance({ ...envelope, schemaVersion: JOURNAL_CLIENT_TIMING_VERSION }, record);
    }
    case "remember_server_checkpoint": {
      assertVerifiedScope(envelope, action.verifiedScope);
      const record = recordFor(envelope, action.clientSessionId), checkpoint = action.serverCheckpoint;
      if (record.clientTiming || !record.serverSessionId || !["running", "paused"].includes(record.state)
          || !checkpoint || !integer(checkpoint.revision) || !timestamp(checkpoint.observedAtMs)
          || !integer(checkpoint.confirmedMs) || checkpoint.confirmedMs !== record.elapsedMs
          || checkpoint.clientSessionId !== record.clientSessionId
          || checkpoint.observedAtMs < record.startedAtMs!) fail("snapshot_conflict");
      assertNoUnresolved(envelope, record.clientSessionId);
      if (record.serverCheckpoint && checkpoint.revision < record.serverCheckpoint.revision) fail("snapshot_conflict");
      if (journalJsonEqual(record.serverCheckpoint ?? null, checkpoint)) return detach(envelope);
      return advance({ ...envelope, schemaVersion: JOURNAL_CLIENT_TIMING_VERSION },
        { ...record, revision: record.revision + 1, serverCheckpoint: { ...checkpoint } });
    }
    case "enter_client_timing": {
      const record = recordFor(envelope, action.clientSessionId), checkpoint = record.serverCheckpoint;
      validateJournalClock(action.clock);
      if (record.clientTiming) return detach(envelope);
      assertNoUnresolved(envelope, record.clientSessionId);
      if (!record.serverSessionId || !["running", "paused"].includes(record.state) || !checkpoint
          || action.serverRevision !== checkpoint.revision || action.serverObservedAtMs !== checkpoint.observedAtMs
          || (action.serverConfirmedMs !== undefined && action.serverConfirmedMs !== checkpoint.confirmedMs)
          || action.clock.wallTimeMs !== checkpoint.observedAtMs
          || checkpoint.confirmedMs !== record.elapsedMs) fail("snapshot_conflict");
      const running = record.state === "running";
      return advance(envelope, { ...record, revision: record.revision + 1, verification: "client_reported",
        clockAnchor: running ? copyClock(action.clock) : null,
        endsAtMs: running ? checkpoint.observedAtMs + record.setup.targetSeconds * 1000 - checkpoint.confirmedMs : null,
        clientTiming: { policyVersion: 1, offlineOrigin: false, serverRevision: checkpoint.revision,
          serverObservedAtMs: checkpoint.observedAtMs, serverConfirmedMs: checkpoint.confirmedMs,
          segments: running ? [{ startedAtMs: checkpoint.observedAtMs, endedAtMs: null }] : [] } });
    }
    case "local_pause": {
      const record = recordFor(envelope, action.clientSessionId);
      if (record.state !== "running") fail("invalid_transition");
      assertNoUnresolved(envelope, record.clientSessionId);
      if (deriveJournalTimer(record, action.clock).expired) fail("not_expired");
      return advance(envelope, { ...closeClientInterval(record, action.clock), revision: record.revision + 1, state: "paused" });
    }
    case "local_resume": {
      const record = recordFor(envelope, action.clientSessionId), timing = clientTimingFor(record);
      validateJournalClock(action.clock);
      assertNoUnresolved(envelope, record.clientSessionId);
      const lastEnd = timing.segments.at(-1)?.endedAtMs ?? timing.serverObservedAtMs ?? record.startedAtMs!;
      if (record.state !== "paused" || record.elapsedMs >= record.setup.targetSeconds * 1000
          || action.clock.wallTimeMs < lastEnd || action.clock.wallTimeMs - record.startedAtMs! > JOURNAL_CLIENT_MAX_SPAN_MS
          || timing.segments.length >= JOURNAL_CLIENT_MAX_SEGMENTS) fail("invalid_transition");
      timing.segments.push({ startedAtMs: action.clock.wallTimeMs, endedAtMs: null });
      return advance(envelope, { ...record, revision: record.revision + 1, state: "running", clientTiming: timing,
        clockAnchor: copyClock(action.clock), endsAtMs: action.clock.wallTimeMs + record.setup.targetSeconds * 1000 - record.elapsedMs,
        observedAtMs: action.clock.wallTimeMs });
    }
    case "local_cancel": {
      const record = recordFor(envelope, action.clientSessionId);
      clientTimingFor(record); validateJournalClock(action.clock);
      if (!["running", "paused"].includes(record.state)) fail("invalid_transition");
      assertNoUnresolved(envelope, record.clientSessionId);
      const timer = deriveJournalTimer(record, action.clock);
      if (timer.expired) {
        if (!isJournalUuid(action.operationId)) fail("invalid_action");
        return finishClientRecord(envelope, record, action.clock, action.operationId, "completed");
      }
      if (!record.clientTiming!.offlineOrigin) {
        if (!isJournalUuid(action.operationId)) fail("invalid_action");
        return finishClientRecord(envelope, record, action.clock, action.operationId, "cancelled");
      }
      return advance(envelope, { ...closeClientInterval(record, action.clock), revision: record.revision + 1,
        state: "cancelled", sync: { ...record.sync, state: "synced", nextAttemptAtMs: null, reasonCode: null } });
    }
    case "local_expire": {
      const record = recordFor(envelope, action.clientSessionId);
      clientTimingFor(record); validateJournalClock(action.clock);
      if (record.state === "completed") {
        const existing = commandFor(envelope, action.operationId);
        if (existing.kind !== "import" || existing.clientSessionId !== record.clientSessionId) fail("operation_conflict");
        return detach(envelope);
      }
      if (!["running", "paused"].includes(record.state)) fail("invalid_transition");
      assertNoUnresolved(envelope, record.clientSessionId);
      return finishClientRecord(envelope, record, action.clock, action.operationId, "completed");
    }
    case "acknowledge_import": {
      assertVerifiedScope(envelope, action.verifiedScope);
      const record = recordFor(envelope, action.clientSessionId);
      clientTimingFor(record);
      const command = envelope.commands.find(item => item.clientSessionId === record.clientSessionId && item.kind === "import");
      if (!command || !["completed", "cancelled"].includes(record.state)) fail("invalid_transition");
      if (record.state === "cancelled") {
        if (action.receipt !== null || record.clientTiming!.offlineOrigin) fail("receipt_conflict");
        if (action.remoteCompletedReceipt) {
          validateJournalReceipt(action.remoteCompletedReceipt);
          if (action.remoteCompletedReceipt.sessionId !== record.serverSessionId
            || action.remoteCompletedReceipt.durationSeconds !== record.setup.targetSeconds) fail("receipt_conflict");
        }
      } else {
        if (action.remoteCompletedReceipt) fail("receipt_conflict");
        validateJournalReceipt(action.receipt);
        if (action.receipt.durationSeconds !== record.setup.targetSeconds
            || (record.serverSessionId !== null && action.receipt.sessionId !== record.serverSessionId)) fail("receipt_conflict");
      }
      if (record.sync.state === "synced") {
        if (command.status !== "acknowledged" || (record.sync.receipt === null ? action.receipt !== null
          : action.receipt === null || !sameReceipt(record.sync.receipt, action.receipt))) fail("receipt_conflict");
        return detach(envelope);
      }
      if (!unresolved(command)) fail("operation_settled");
      return advance(envelope, { ...record, revision: record.revision + 1,
        serverSessionId: action.receipt?.sessionId ?? record.serverSessionId,
        sync: { ...record.sync, state: "synced", reasonCode: action.remoteCompletedReceipt ? "server_completed_before_end" : null, nextAttemptAtMs: null, receipt: action.receipt } },
      { ...command, status: "acknowledged" });
    }
    case "reject_import": {
      const record = recordFor(envelope, action.clientSessionId);
      clientTimingFor(record);
      if (typeof action.reasonCode !== "string" || !action.reasonCode.length || action.reasonCode.length > 128) fail("invalid_action");
      const command = envelope.commands.find(item => item.clientSessionId === record.clientSessionId && item.kind === "import");
      if (!command || !["completed", "cancelled"].includes(record.state)) fail("invalid_transition");
      if (command.status === "rejected") {
        if (record.sync.reasonCode !== action.reasonCode) fail("operation_conflict");
        return detach(envelope);
      }
      if (!unresolved(command)) fail("operation_settled");
      return advance(envelope, { ...record, revision: record.revision + 1,
        sync: { ...record.sync, state: "rejected", nextAttemptAtMs: null, reasonCode: action.reasonCode } },
      { ...command, status: "rejected" });
    }
    case "prepare_start": {
      validateJournalSetup(action.setup);
      validateJournalClock(action.clock);
      const command = makeCommand(action.operationId, action.clientSessionId, "start", action.clock.wallTimeMs,
        { setup: setupRequest(action.setup), clock: clockRequest(action.clock) });
      if (replayPrepared(envelope, command)) return detach(envelope);
      assertNoUnresolved(envelope);
      if (envelope.records.some(record => ["not_started", "running", "paused"].includes(record.state))) fail("session_conflict");
      if (envelope.records.some(record => record.clientSessionId === action.clientSessionId)) fail("session_conflict");
      const record: JournalRecord = {
        clientSessionId: action.clientSessionId, serverSessionId: null, revision: 1, state: "not_started",
        setup: copySetup(action.setup), startedAtMs: null, elapsedMs: 0, clockAnchor: null,
        endsAtMs: null, completedAtMs: null, observedAtMs: null, dismissedAtMs: null,
        verification: "server_timed", clockWarning: false,
        sync: { state: "idle", attempts: 0, nextAttemptAtMs: null, reasonCode: null, receipt: null },
      };
      return advance(envelope, record, command);
    }
    case "acknowledge_start": {
      const command = commandFor(envelope, action.operationId);
      if (command.kind !== "start") fail("operation_conflict");
      const record = recordFor(envelope, command.clientSessionId);
      validateSnapshot(action.snapshot);
      if (action.clockWarning !== undefined && typeof action.clockWarning !== "boolean") fail("invalid_action");
      if (command.status === "acknowledged") {
        if (!snapshotMatches(record, action.snapshot)) fail("snapshot_conflict");
        return detach(envelope);
      }
      if (!unresolved(command)) fail("operation_settled");
      if (record.state !== "not_started" || (record.serverSessionId !== null
          && record.serverSessionId !== action.snapshot.serverSessionId)) fail("invalid_transition");
      if (envelope.records.some(item => item.clientSessionId !== record.clientSessionId
        && item.serverSessionId === action.snapshot.serverSessionId)) fail("session_conflict");
      return advance(envelope, { ...withSnapshot(record, action.snapshot),
        clockWarning: record.clockWarning || (action.clockWarning ?? false) }, { ...command, status: "acknowledged" });
    }
    case "remember_start_identity": {
      assertVerifiedScope(envelope, action.verifiedScope);
      if (!isJournalUuid(action.serverSessionId)) fail("invalid_action");
      const command = commandFor(envelope, action.operationId);
      const record = recordFor(envelope, command.clientSessionId);
      if (command.kind !== "start" || record.state !== "not_started" || !unresolved(command)) fail("invalid_transition");
      if (record.serverSessionId !== null) {
        if (record.serverSessionId !== action.serverSessionId) fail("snapshot_conflict");
        return detach(envelope);
      }
      if (envelope.records.some(item => item.serverSessionId === action.serverSessionId)) fail("session_conflict");
      return advance(envelope, { ...record, revision: record.revision + 1, serverSessionId: action.serverSessionId },
        { ...command, status: "unknown" });
    }
    case "request_start_end": {
      const record = recordFor(envelope, action.clientSessionId);
      const command = envelope.commands.find(item => item.clientSessionId === record.clientSessionId && unresolved(item));
      if (record.state !== "not_started" || command?.kind !== "start") fail("invalid_transition");
      if (record.sync.reasonCode === JOURNAL_START_STOP_REASON) return detach(envelope);
      return advance(envelope, { ...record, revision: record.revision + 1,
        sync: { ...record.sync, reasonCode: JOURNAL_START_STOP_REASON } });
    }
    case "acknowledge_start_stop": {
      assertVerifiedScope(envelope, action.verifiedScope);
      validateJournalSetup(action.setup); validateJournalClock(action.clock);
      const record = recordFor(envelope, action.clientSessionId), proof = action.proof;
      if (!proof || proof.clientSessionId !== record.clientSessionId || !isJournalUuid(proof.clientSessionId)
        || proof.serverSessionId !== null || proof.status !== "cancelled" || proof.legacyStartsFenced !== true
        || !journalJsonEqual(action.setup, record.setup)) fail("snapshot_conflict");
      assertVerifiedScope(envelope, proof.scope);
      const command = envelope.commands.find(item => item.clientSessionId === record.clientSessionId && item.kind === "start");
      if (record.state === "cancelled" && record.serverSessionId === null && record.sync.state === "rejected"
        && record.sync.reasonCode === JOURNAL_START_STOP_CONFIRMED_REASON && record.dismissedAtMs !== null
        && command?.status === "rejected") return detach(envelope);
      if (record.state !== "not_started" || record.serverSessionId !== null
        || record.sync.reasonCode !== JOURNAL_START_STOP_REASON || !command || !unresolved(command)) fail("invalid_transition");
      // An acknowledged server tombstone can settle an absent Start without
      // inventing a session UUID, timestamp, elapsed duration or reward receipt.
      return advance(envelope, { ...record, revision: record.revision + 1, state: "cancelled",
        dismissedAtMs: action.clock.wallTimeMs, sync: { ...record.sync, state: "rejected",
          nextAttemptAtMs: null, reasonCode: JOURNAL_START_STOP_CONFIRMED_REASON } }, { ...command, status: "rejected" });
    }
    case "adopt_server": {
      assertVerifiedScope(envelope, action.verifiedScope);
      validateJournalSetup(action.setup);
      validateSnapshot(action.snapshot);
      if (!isJournalUuid(action.clientSessionId) || action.snapshot.state === "cancelled"
          || (action.clockWarning !== undefined && typeof action.clockWarning !== "boolean")) fail("invalid_action");
      assertNoUnresolved(envelope);
      if (envelope.records.some(item => ["not_started", "running", "paused"].includes(item.state)
          || item.clientSessionId === action.clientSessionId || item.serverSessionId === action.snapshot.serverSessionId
            && !(item.clientTiming && item.sync.state === "rejected" && item.dismissedAtMs !== null))) fail("session_conflict");
      const seed: JournalRecord = {
        clientSessionId: action.clientSessionId, serverSessionId: action.snapshot.serverSessionId,
        revision: 0, state: "not_started", setup: copySetup(action.setup), startedAtMs: null,
        elapsedMs: 0, clockAnchor: null, endsAtMs: null, completedAtMs: null, observedAtMs: null,
        dismissedAtMs: null, verification: "server_timed", clockWarning: action.clockWarning ?? false,
        sync: { state: "idle", attempts: 0, nextAttemptAtMs: null, reasonCode: null, receipt: null },
      };
      return advance(envelope, withSnapshot(seed, action.snapshot));
    }
    case "reconcile_server": {
      assertVerifiedScope(envelope, action.verifiedScope);
      validateJournalClock(action.clock);
      const record = recordFor(envelope, action.clientSessionId);
      if (record.clientTiming) fail("invalid_transition");
      assertRemoteSetup(record, action.setup);
      if (!record.serverSessionId || (action.clockWarning !== undefined && typeof action.clockWarning !== "boolean")
          || (!!action.snapshot === !!action.receipt)) fail("invalid_action");
      const commands = envelope.commands.map(command => ({ ...command }));
      const pending = commands.find(command => command.clientSessionId === record.clientSessionId && unresolved(command));
      if (action.snapshot) {
        validateSnapshot(action.snapshot);
        const snapshot = action.snapshot;
        if (snapshot.serverSessionId !== record.serverSessionId
            || (record.startedAtMs !== null && snapshot.startedAtMs !== record.startedAtMs)) fail("snapshot_conflict");
        if (record.state === "completed") {
          // A remote cancellation cannot rewrite a locally finished deadline.
          if (snapshot.state !== "cancelled") return detach(envelope);
          if (record.sync.receipt) fail("invalid_transition");
          if (!pending || pending.kind !== "complete") fail("invalid_transition");
          pending.status = "rejected";
          return advanceRemote(envelope, { ...record, revision: record.revision + 1,
            sync: { ...record.sync, state: "rejected", reasonCode: "server_cancelled", nextAttemptAtMs: null } }, commands);
        }
        if (record.state === "cancelled") {
          if (snapshot.state !== "cancelled") fail("invalid_transition");
          return detach(envelope);
        }
        if (pending) {
          const desired = pending.kind === "start" ? snapshot.state !== "cancelled"
            : pending.kind === "pause" ? snapshot.state === "paused"
            : pending.kind === "resume" ? snapshot.state === "running"
            : pending.kind === "cancel" ? snapshot.state === "cancelled" : false;
          if (!desired && snapshot.state !== "cancelled") {
            // An old-state read cannot prove a delayed legacy RPC failed.
            return detach(envelope);
          }
          pending.status = desired ? "acknowledged" : "rejected";
        }
        return advanceRemote(envelope, { ...withSnapshot(record, snapshot),
          clockWarning: record.clockWarning || (action.clockWarning ?? false) }, commands);
      }
      validateJournalReceipt(action.receipt);
      const receipt = action.receipt;
      if (receipt.sessionId !== record.serverSessionId || receipt.durationSeconds !== record.setup.targetSeconds
          || !timestamp(action.startedAtMs) || !timestamp(action.completedAtMs)
          || action.completedAtMs < action.startedAtMs
          || (record.startedAtMs !== null && record.startedAtMs !== action.startedAtMs)
          || record.state === "cancelled" || record.dismissedAtMs !== null && record.state !== "completed") fail("receipt_conflict");
      if (record.sync.receipt !== null) {
        if (!sameReceipt(record.sync.receipt, receipt)) fail("receipt_conflict");
        return detach(envelope);
      }
      let complete = commands.find(command => command.clientSessionId === record.clientSessionId
        && command.kind === "complete" && unresolved(command));
      const completedAtMs = record.state === "completed" ? record.completedAtMs! : action.completedAtMs;
      if (!complete) {
        if (!isJournalUuid(action.operationId) || commands.some(command => command.operationId === action.operationId)) fail("invalid_action");
        complete = makeCommand(action.operationId, record.clientSessionId, "complete", action.clock.wallTimeMs,
          { serverSessionId: record.serverSessionId, completedAtMs, targetSeconds: record.setup.targetSeconds });
        commands.push(complete);
      }
      for (const command of commands) {
        if (command.clientSessionId === record.clientSessionId && unresolved(command))
          command.status = command.kind === "start" || command.kind === "complete" ? "acknowledged" : "rejected";
      }
      complete.status = "acknowledged";
      const finished: JournalRecord = {
        ...record, revision: record.revision + 1, state: "completed", startedAtMs: action.startedAtMs,
        elapsedMs: record.setup.targetSeconds * 1000, clockAnchor: null,
        endsAtMs: record.state === "completed" ? record.endsAtMs : null,
        completedAtMs, observedAtMs: record.state === "completed" ? record.observedAtMs : action.clock.wallTimeMs,
        clockWarning: record.clockWarning || (record.state === "completed" ? false : action.clockWarning ?? false),
        sync: { ...record.sync, state: "synced", reasonCode: null, nextAttemptAtMs: null, receipt },
      };
      return advanceRemote(envelope, finished, commands);
    }
    case "prepare_transition": {
      if (!["pause", "resume", "cancel"].includes(action.kind)) fail("invalid_action");
      const record = recordFor(envelope, action.clientSessionId);
      if (record.clientTiming) fail("invalid_transition");
      if (record.sync.reasonCode === JOURNAL_START_STOP_REASON && action.kind !== "cancel") fail("invalid_transition");
      validateJournalClock(action.clock);
      const command = makeCommand(action.operationId, action.clientSessionId, action.kind, action.clock.wallTimeMs,
        { serverSessionId: record.serverSessionId, clock: clockRequest(action.clock) });
      if (replayPrepared(envelope, command)) return detach(envelope);
      const previous = envelope.commands.find(item => item.clientSessionId === record.clientSessionId && unresolved(item));
      if (previous && (action.kind !== "cancel" || (previous.kind !== "pause" && previous.kind !== "resume"))) fail("unresolved_command");
      if (!record.serverSessionId || (action.kind === "pause" && record.state !== "running")
        || (action.kind === "resume" && record.state !== "paused")
        || (action.kind === "cancel" && record.state !== "running" && record.state !== "paused")) fail("invalid_transition");
      const timer = deriveJournalTimer(record, action.clock);
      if (timer.expired && action.kind !== "cancel") fail("invalid_transition");
      // Preparation changes metadata only; the confirmed clock keeps running.
      const prepared = previous ? { ...envelope, commands: envelope.commands.map(item => item.operationId === previous.operationId
        ? { ...item, status: "superseded" as const } : item) } : envelope;
      // End replaces the earlier intention, not its immutable evidence. A
      // delayed pause/resume cannot reopen the server's terminal cancellation.
      return advance(prepared, {
        ...record, revision: record.revision + 1, clockWarning: timer.clockWarning,
        sync: { ...record.sync, reasonCode: null },
      }, command);
    }
    case "acknowledge_transition": {
      const command = commandFor(envelope, action.operationId);
      if (command.kind !== "pause" && command.kind !== "resume" && command.kind !== "cancel") fail("operation_conflict");
      const record = recordFor(envelope, command.clientSessionId);
      validateSnapshot(action.snapshot);
      const expectedState = command.kind === "pause" ? "paused" : command.kind === "resume" ? "running" : "cancelled";
      if (action.snapshot.serverSessionId !== record.serverSessionId || action.snapshot.startedAtMs !== record.startedAtMs
        || action.snapshot.state !== expectedState
        || Math.min(action.snapshot.elapsedMs, record.setup.targetSeconds * 1000) < record.elapsedMs) fail("snapshot_conflict");
      if (command.status === "acknowledged") {
        if (!snapshotMatches(record, action.snapshot)) fail("snapshot_conflict");
        return detach(envelope);
      }
      if (!unresolved(command)) fail("operation_settled");
      if ((command.kind === "pause" && record.state !== "running")
        || (command.kind === "resume" && record.state !== "paused")
        || (command.kind === "cancel" && record.state !== "running" && record.state !== "paused")) fail("invalid_transition");
      return advance(envelope, withSnapshot(record, action.snapshot), { ...command, status: "acknowledged" });
    }
    case "mark_unknown": {
      const command = commandFor(envelope, action.operationId);
      if (command.status === "unknown" || command.status === "acknowledged") return detach(envelope);
      if (command.status !== "prepared") fail("operation_settled");
      return advance(envelope, undefined, { ...command, status: "unknown" });
    }
    case "reject_command": {
      if (typeof action.reasonCode !== "string" || !action.reasonCode.length) fail("invalid_action");
      const command = commandFor(envelope, action.operationId);
      if (command.kind === "import") fail("invalid_transition");
      const record = recordFor(envelope, command.clientSessionId);
      if (command.status === "rejected") {
        if (record.sync.reasonCode !== action.reasonCode) fail("operation_conflict");
        return detach(envelope);
      }
      if (!unresolved(command)) fail("operation_settled");
      const next: JournalRecord = {
        ...record, revision: record.revision + 1,
        state: command.kind === "start" ? "cancelled" : record.state,
        sync: { ...record.sync, state: command.kind === "start" || command.kind === "complete" ? "rejected" : "idle",
          nextAttemptAtMs: null, reasonCode: action.reasonCode },
      };
      return advance(envelope, next, { ...command, status: "rejected" });
    }
    case "expire": {
      const record = recordFor(envelope, action.clientSessionId);
      if (record.clientTiming) fail("invalid_transition");
      if (record.sync.reasonCode === JOURNAL_START_STOP_REASON) fail("invalid_transition");
      validateJournalClock(action.clock);
      const completedAtMs = record.state === "completed" ? record.completedAtMs
        : record.state === "running" ? record.endsAtMs : record.observedAtMs;
      const command = makeCommand(action.operationId, action.clientSessionId, "complete", action.clock.wallTimeMs,
        { serverSessionId: record.serverSessionId, completedAtMs, targetSeconds: record.setup.targetSeconds });
      if (replayPrepared(envelope, command)) return detach(envelope);
      assertNoUnresolved(envelope, record.clientSessionId);
      if (!record.serverSessionId || (record.state !== "running" && record.state !== "paused")) fail("invalid_transition");
      const timer = deriveJournalTimer(record, action.clock);
      if (!timer.expired) fail("not_expired");
      if (!timestamp(completedAtMs)) fail("invalid_transition");
      return advance(envelope, {
        ...record, revision: record.revision + 1, state: "completed",
        elapsedMs: record.setup.targetSeconds * 1000, clockAnchor: null,
        completedAtMs, observedAtMs: action.clock.wallTimeMs, clockWarning: timer.clockWarning,
        sync: { ...record.sync, state: "pending", nextAttemptAtMs: null, reasonCode: null },
      }, command);
    }
    case "acknowledge_completion": {
      const command = commandFor(envelope, action.operationId);
      if (command.kind !== "complete") fail("operation_conflict");
      const record = recordFor(envelope, command.clientSessionId);
      const receipt = action.receipt;
      if (!receipt || !isJournalUuid(receipt.sessionId) || record.state !== "completed"
        || receipt.sessionId !== record.serverSessionId || receipt.durationSeconds !== record.setup.targetSeconds
        || !receipt.result || typeof receipt.result !== "object" || Array.isArray(receipt.result)) fail("receipt_conflict");
      if ((Object.hasOwn(receipt.result, "session_id") && receipt.result.session_id !== receipt.sessionId)
        || (Object.hasOwn(receipt.result, "duration_seconds") && receipt.result.duration_seconds !== receipt.durationSeconds)) fail("receipt_conflict");
      for (const flag of ["already_completed", "goal_reached_now"]) {
        if (Object.hasOwn(receipt.result, flag) && typeof receipt.result[flag] !== "boolean") fail("receipt_conflict");
      }
      if (record.sync.receipt !== null) {
        // Check the original JSON before ignoring the two server replay flags.
        validateJournalReceipt(receipt);
        if (command.status !== "acknowledged" || !sameReceipt(record.sync.receipt, receipt)) fail("receipt_conflict");
        return detach(envelope);
      }
      if (!unresolved(command)) fail("operation_settled");
      return advance(envelope, {
        ...record, revision: record.revision + 1,
        sync: { ...record.sync, state: "synced", nextAttemptAtMs: null, reasonCode: null, receipt },
      }, { ...command, status: "acknowledged" });
    }
    case "defer_sync": {
      if (!timestamp(action.nowMs) || !integer(action.delayMs) || action.delayMs > 86_400_000
        || !timestamp(action.nowMs + action.delayMs) || typeof action.waitingAuth !== "boolean"
        || typeof action.reasonCode !== "string" || !action.reasonCode.length) fail("invalid_action");
      const record = recordFor(envelope, action.clientSessionId);
      if ((record.state !== "completed" && !(record.state === "cancelled" && record.clientTiming)) || record.sync.receipt !== null
        || !envelope.commands.some(command => command.clientSessionId === record.clientSessionId
          && (command.kind === "complete" || command.kind === "import") && unresolved(command))) fail("invalid_transition");
      return advance(envelope, {
        ...record, revision: record.revision + 1,
        sync: { ...record.sync, state: action.waitingAuth ? "waiting_auth" : "pending",
          attempts: record.sync.attempts + 1, nextAttemptAtMs: action.nowMs + action.delayMs, reasonCode: action.reasonCode },
      });
    }
    case "dismiss": {
      if (!timestamp(action.dismissedAtMs)) fail("invalid_action");
      const record = recordFor(envelope, action.clientSessionId);
      if ((record.state !== "completed" && record.state !== "cancelled")
          || (record.state === "cancelled" && !record.clientTiming && !["synced", "rejected"].includes(record.sync.state))) {
        fail("invalid_transition");
      }
      if (envelope.commands.some(command => command.clientSessionId === record.clientSessionId && unresolved(command)
          && !(record.clientTiming && command.kind === "import")
          && !(record.state === "completed" && command.kind === "complete"))) fail("unresolved_command");
      if (record.dismissedAtMs !== null) return detach(envelope);
      // v2 allows closing a terminal result's presentation while its original
      // completion command remains durable and independently retryable.
      return advance({ ...envelope, schemaVersion: JOURNAL_CLIENT_TIMING_VERSION }, {
        ...record, revision: record.revision + 1, dismissedAtMs: action.dismissedAtMs,
      });
    }
    case "compact": {
      const compacted = compactForCapacity(envelope, true);
      if (compacted.records.length === envelope.records.length) return detach(envelope);
      return advance(compacted);
    }
    default: return fail("invalid_action");
  }
}

/** The caller supplies a freshly verified backend/owner scope before sending. */
export function pendingServerCompletions(envelope: JournalEnvelope, verifiedScope: JournalScope): JournalRecord[] {
  validateJournalEnvelope(envelope, verifiedScope);
  if (!envelope.admission.active) return [];
  return envelope.records.filter(record => record.state === "completed" && record.verification === "server_timed"
    && record.serverSessionId !== null
    && record.sync.receipt === null && (record.sync.state === "pending" || record.sync.state === "waiting_auth")
    && envelope.commands.some(command => command.clientSessionId === record.clientSessionId
      && command.kind === "complete" && unresolved(command))).map(record => ({
        ...record, setup: copySetup(record.setup), clockAnchor: record.clockAnchor ? copyClock(record.clockAnchor) : null,
        sync: { ...record.sync },
      }));
}

/** Owner-bound local queue. A reconnect hint alone is never upload authority. */
export function queuedClientCompletions(envelope: JournalEnvelope, verifiedScope: JournalScope): JournalRecord[] {
  validateJournalEnvelope(envelope, verifiedScope);
  if (!envelope.admission.active) return [];
  return envelope.records.filter(record => record.clientTiming && ["completed", "cancelled"].includes(record.state)
    && record.sync.receipt === null && ["pending", "waiting_auth"].includes(record.sync.state)
    && envelope.commands.some(command => command.clientSessionId === record.clientSessionId
      && command.kind === "import" && unresolved(command)))
    .sort((left, right) => (left.completedAtMs ?? left.observedAtMs ?? 0) - (right.completedAtMs ?? right.observedAtMs ?? 0))
    .map(record => JSON.parse(JSON.stringify(record)) as JournalRecord);
}
