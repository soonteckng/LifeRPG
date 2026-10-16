import { JOURNAL_START_STOP_REASON, type JournalCommand, type JournalRecord } from "../types/sessionJournal";
import {
  SESSION_COUNTDOWN_VERSION, type SessionCountdownActionDecision, type SessionCountdownActionInput,
  type SessionCountdownActionToken, type SessionCountdownIdentity, type SessionCountdownInput,
  type SessionCountdownProjection,
} from "../types/sessionCountdown";
import { deriveJournalTimer } from "./sessionJournal";
import { isJournalUuid, validateJournalClock, validateJournalEnvelope, validateJournalScope } from "./sessionJournalSchema";

const unresolved = (command: JournalCommand) => command.status === "prepared" || command.status === "unknown";
const sameScope = (a: SessionCountdownIdentity["scope"], b: SessionCountdownIdentity["scope"]) =>
  a.backendId === b.backendId && a.ownerId === b.ownerId;
const pending = (input: SessionCountdownInput, record: JournalRecord) =>
  input.journal.commands.find(command => command.clientSessionId === record.clientSessionId && unresolved(command));
const ending = (record: JournalRecord, command: JournalCommand | undefined) =>
  record.sync.reasonCode === JOURNAL_START_STOP_REASON || command?.kind === "cancel";

function currentRecord(input: SessionCountdownInput): JournalRecord | null {
  validateJournalEnvelope(input.journal, input.journal.scope);
  validateJournalClock(input.clock);
  if (input.currentScope !== null) validateJournalScope(input.currentScope);
  if (!input.currentScope || !sameScope(input.currentScope, input.journal.scope)
    || !input.journal.admission.active || input.currentAdmissionEpoch !== input.journal.admission.epoch) return null;
  return input.journal.records.find(record => record.clientSessionId === input.currentClientSessionId) ?? null;
}
function identity(input: SessionCountdownInput, record: JournalRecord): SessionCountdownIdentity {
  return { scope: { ...input.journal.scope }, admissionEpoch: input.journal.admission.epoch,
    journalRevision: input.journal.revision, recordRevision: record.revision,
    clientSessionId: record.clientSessionId, serverSessionId: record.serverSessionId };
}

/** Pure, detached presentation derived from saved state; it never updates the journal. */
export function projectSessionCountdown(input: SessionCountdownInput): SessionCountdownProjection | null {
  const record = currentRecord(input);
  if (!record) return null;
  const command = pending(input, record), timer = deriveJournalTimer(record, input.clock);
  const isEnding = ending(record, command);
  const phase: SessionCountdownProjection["phase"] = isEnding ? "ending"
    : record.state === "not_started" ? "unconfirmed"
    : record.state === "cancelled" || record.sync.state === "synced" ? "settled"
    : record.state === "completed" ? "finished"
    : command ? "checking" : timer.expired ? "finished" : record.state;
  const active = phase === "running" || phase === "paused";
  const running = phase === "running";
  const resumeAtMs = running && record.protection?.breakEndsAtMs && record.protection.breakEndsAtMs > input.clock.wallTimeMs ? record.protection.breakEndsAtMs : null;
  return { version: SESSION_COUNTDOWN_VERSION, identity: identity(input, record), phase,
    title: record.setup.title ?? (record.setup.taskId === null ? "Free session" : "Quest session"),
    targetMs: record.setup.targetSeconds * 1000, remainingMs: timer.remainingMs, elapsedMs: timer.elapsedMs,
    observedClock: { ...input.clock }, ...(resumeAtMs ? { resumeAtMs } : {}), deadlineMs: running ? (resumeAtMs ?? input.clock.wallTimeMs) + timer.remainingMs : null,
    clockWarning: timer.clockWarning, showOngoing: active,
    // A warning is carried separately. An alert grants no reward, and the
    // shared clock derivation still supplies the bounded remaining duration.
    scheduleFinishAlert: running,
    foregroundActions: active && record.protection ? resumeAtMs ? ["resume", "end"] : record.protection.breakStartedAtMs !== null ? ["end"] : ["pause", "end"] : active ? [running ? "pause" : "resume", "end"] : phase === "checking" ? ["end"] : [],
  };
}

function strictObject(value: unknown, names: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}
function parseToken(value: unknown): SessionCountdownActionToken | null {
  if (!strictObject(value, ["version", "identity", "operationId", "kind"])
    || value.version !== SESSION_COUNTDOWN_VERSION || !isJournalUuid(value.operationId)
    || !["pause", "resume", "end"].includes(value.kind as string)
    || !strictObject(value.identity, ["scope", "admissionEpoch", "journalRevision", "recordRevision", "clientSessionId", "serverSessionId"])) return null;
  const id = value.identity;
  try { validateJournalScope(id.scope as SessionCountdownIdentity["scope"]); } catch { return null; }
  if (![id.admissionEpoch, id.journalRevision, id.recordRevision].every(item => Number.isSafeInteger(item) && (item as number) >= 0)
    || !isJournalUuid(id.clientSessionId) || !(id.serverSessionId === null || isJournalUuid(id.serverSessionId))) return null;
  return value as unknown as SessionCountdownActionToken;
}

/** A recovered End tap may ask for confirmation, never authorize a mutation.
 * Cold recovery advances admission/revisions, so the original exact command
 * proof stays stale. Its same-session intent can still open the current UI.
 */
export function decideSessionCountdownEndPrompt(input: SessionCountdownActionInput):
  { accepted: true; operationId: string } | { accepted: false } {
  const token = parseToken(input.token);
  if (!token || token.kind !== "end") return { accepted: false };
  const record = currentRecord(input);
  if (!record || !input.currentScope || !sameScope(token.identity.scope, input.currentScope)
    || !sameScope(token.identity.scope, input.journal.scope)
    || token.identity.clientSessionId !== record.clientSessionId) return { accepted: false };
  // A local session may receive its server id during recovery. An old non-null
  // id may never be substituted for a different server session or removed id.
  if (token.identity.serverSessionId !== record.serverSessionId && token.identity.serverSessionId !== null)
    return { accepted: false };
  if (token.identity.admissionEpoch > input.journal.admission.epoch
    || token.identity.journalRevision > input.journal.revision || token.identity.recordRevision > record.revision
    || input.consumedOperationIds.includes(token.operationId)
    || input.journal.commands.some(command => command.operationId === token.operationId)) return { accepted: false };
  const command = pending(input, record);
  if (ending(record, command) || record.state !== "running" && record.state !== "paused"
    || command && command.kind !== "pause" && command.kind !== "resume") return { accepted: false };
  return { accepted: true, operationId: token.operationId };
}

/** Decision only. Native actions must open the app; no background timing mutation is approved here. */
export function decideSessionCountdownAction(input: SessionCountdownActionInput): SessionCountdownActionDecision {
  const token = parseToken(input.token);
  if (!token) return { accepted: false, reason: "invalid_token" };
  const record = currentRecord(input);
  if (!input.currentScope || !sameScope(token.identity.scope, input.currentScope)
    || !sameScope(token.identity.scope, input.journal.scope)) return { accepted: false, reason: "stale_scope" };
  if (!input.journal.admission.active) return { accepted: false, reason: "inactive" };
  if (token.identity.admissionEpoch !== input.currentAdmissionEpoch
    || token.identity.admissionEpoch !== input.journal.admission.epoch) return { accepted: false, reason: "stale_epoch" };
  if (!record || token.identity.clientSessionId !== record.clientSessionId
    || token.identity.serverSessionId !== record.serverSessionId) return { accepted: false, reason: "stale_session" };
  if (token.identity.journalRevision !== input.journal.revision || token.identity.recordRevision !== record.revision)
    return { accepted: false, reason: "stale_revision" };
  if (input.consumedOperationIds.includes(token.operationId)
    || input.journal.commands.some(command => command.operationId === token.operationId)) return { accepted: false, reason: "duplicate" };
  const command = pending(input, record);
  if (ending(record, command)) return { accepted: false, reason: "ending" };
  if (record.state !== "running" && record.state !== "paused") return { accepted: false, reason: "invalid_state" };
  if (command && (token.kind !== "end" || (command.kind !== "pause" && command.kind !== "resume")))
    return { accepted: false, reason: "unresolved" };
  // An unresolved Pause may already have stopped the server before the target.
  // Match the controller: true full expiry wins only without earlier uncertainty.
  if (!command && deriveJournalTimer(record, input.clock).expired)
    return { accepted: true, operationId: token.operationId, foregroundAction: "complete" };
  if (record.protection && token.kind !== "end") {
    const onBreak = !!record.protection.breakEndsAtMs && input.clock.wallTimeMs < record.protection.breakEndsAtMs;
    if (token.kind === "pause" && record.protection.breakStartedAtMs !== null || token.kind === "resume" && !onBreak) return { accepted: false, reason: "invalid_state" };
    return { accepted: true, operationId: token.operationId, foregroundAction: token.kind };
  }
  if ((token.kind === "pause" && record.state !== "running") || (token.kind === "resume" && record.state !== "paused"))
    return { accepted: false, reason: "invalid_state" };
  return { accepted: true, operationId: token.operationId, foregroundAction: token.kind };
}
