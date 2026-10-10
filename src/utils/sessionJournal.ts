import {
  JOURNAL_CLOCK_WARNING_MS,
  JOURNAL_MAX_COMMANDS,
  JOURNAL_MAX_RECORDS,
  JOURNAL_RETAIN_SETTLED_RECORDS,
  JOURNAL_VERSION,
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
  if (envelope.commands.some(command => unresolved(command) && (!id || command.clientSessionId === id))) {
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
      nextAttemptAtMs: null, reasonCode: null },
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
      if (command.status === "acknowledged") {
        if (!snapshotMatches(record, action.snapshot)) fail("snapshot_conflict");
        return detach(envelope);
      }
      if (!unresolved(command)) fail("operation_settled");
      if (record.state !== "not_started" || (record.serverSessionId !== null
          && record.serverSessionId !== action.snapshot.serverSessionId)) fail("invalid_transition");
      if (envelope.records.some(item => item.clientSessionId !== record.clientSessionId
        && item.serverSessionId === action.snapshot.serverSessionId)) fail("session_conflict");
      return advance(envelope, withSnapshot(record, action.snapshot), { ...command, status: "acknowledged" });
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
    case "adopt_server": {
      assertVerifiedScope(envelope, action.verifiedScope);
      validateJournalSetup(action.setup);
      validateSnapshot(action.snapshot);
      if (!isJournalUuid(action.clientSessionId) || action.snapshot.state === "cancelled"
          || (action.clockWarning !== undefined && typeof action.clockWarning !== "boolean")) fail("invalid_action");
      assertNoUnresolved(envelope);
      if (envelope.records.some(item => ["not_started", "running", "paused"].includes(item.state)
          || item.clientSessionId === action.clientSessionId || item.serverSessionId === action.snapshot.serverSessionId)) fail("session_conflict");
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
          if (record.sync.receipt || record.dismissedAtMs !== null) fail("invalid_transition");
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
          || record.state === "cancelled" || record.dismissedAtMs !== null) fail("receipt_conflict");
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
      if (record.state !== "completed" || record.sync.receipt !== null
        || !envelope.commands.some(command => command.clientSessionId === record.clientSessionId
          && command.kind === "complete" && unresolved(command))) fail("invalid_transition");
      return advance(envelope, {
        ...record, revision: record.revision + 1,
        sync: { ...record.sync, state: action.waitingAuth ? "waiting_auth" : "pending",
          attempts: record.sync.attempts + 1, nextAttemptAtMs: action.nowMs + action.delayMs, reasonCode: action.reasonCode },
      });
    }
    case "dismiss": {
      if (!timestamp(action.dismissedAtMs)) fail("invalid_action");
      const record = recordFor(envelope, action.clientSessionId);
      if ((record.state !== "completed" && record.state !== "cancelled") || record.sync.state !== "rejected") {
        fail("invalid_transition");
      }
      assertNoUnresolved(envelope, record.clientSessionId);
      if (record.dismissedAtMs !== null) return detach(envelope);
      return advance(envelope, {
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
