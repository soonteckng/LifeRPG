import {
  JOURNAL_CLOCK_WARNING_MS,
  JournalValidationError,
  type JournalAction,
  type JournalActionBase,
  type JournalEnvelope,
  type JournalScope,
  type JournalServerSnapshot,
  type JournalSetup,
} from "../types/sessionJournal";
import {
  isJournalUuid,
  validateJournalClock,
  validateJournalEnvelope,
  validateJournalScope,
  validateJournalSetup,
} from "./sessionJournalSchema";

// This matching window has a different purpose from a timer clock warning.
// A delayed or clock-skewed legacy start outside it stays unknown; do not retry
// the legacy start RPC merely because this conservative match was inconclusive.
export const LEGACY_START_MATCH_WINDOW_MS = JOURNAL_CLOCK_WARNING_MS;

type LegacyStartSetup = Pick<JournalSetup,
  "targetSeconds" | "activityType" | "taskId" | "subjectId" | "notes">;

export interface LegacyOpenSessionCandidate {
  scope: JournalScope;
  setup: LegacyStartSetup;
  // The caller reconciles server elapsed time up to this observation. This
  // helper does not calculate server time from the phone's wall clock.
  snapshot: JournalServerSnapshot;
}

export interface LegacyOpenSessionRead {
  scope: JournalScope;
  // Requires a successful, complete, freshly verified owner-scoped read of ALL
  // open rows. Today's getOpenActivitySession limit(1)/maybeSingle is insufficient.
  complete: boolean;
  sessions: readonly LegacyOpenSessionCandidate[];
}

export interface LegacyStartRecoveryRequest extends JournalActionBase {
  verifiedScope: JournalScope;
  operationId: string;
  openSessions: LegacyOpenSessionRead;
}

export type LegacyStartRecoveryReason =
  | "invalid_input" | "invalid_journal" | "scope_mismatch"
  | "stale_revision" | "stale_epoch" | "inactive_admission"
  | "unknown_operation" | "not_unknown_start" | "not_pending_start"
  | "incomplete_server_read" | "no_open_session" | "ambiguous_open_sessions"
  | "server_scope_mismatch" | "invalid_server_snapshot" | "server_session_already_known"
  | "setup_mismatch" | "start_time_mismatch" | "clock_changed";

export type LegacyStartRecoveryResult =
  | { kind: "acknowledge"; action: Extract<JournalAction, { type: "acknowledge_start" }> }
  | { kind: "unreconciled"; reason: LegacyStartRecoveryReason };

const skip = (reason: LegacyStartRecoveryReason): LegacyStartRecoveryResult => ({ kind: "unreconciled", reason });
const sameScope = (a: JournalScope, b: JournalScope) => a.backendId === b.backendId && a.ownerId === b.ownerId;
const safeInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is number => safeInteger(value) && value <= 8_640_000_000_000_000;

/**
 * Narrow legacy recovery only: return one acknowledgement of an existing row.
 * Matching setup/time is not a server operation receipt or proof of study.
 * This helper never starts, cancels, completes or rewards a server session, and
 * never changes the supplied journal. Live query/provider wiring is deferred.
 */
export function reconcileLegacyUnknownStart(
  envelope: JournalEnvelope,
  request: LegacyStartRecoveryRequest,
): LegacyStartRecoveryResult {
  try { validateJournalScope(request.verifiedScope); }
  catch { return skip("invalid_input"); }
  try { validateJournalEnvelope(envelope, request.verifiedScope); }
  catch (error) {
    return skip(error instanceof JournalValidationError && error.code === "scope_mismatch"
      ? "scope_mismatch" : "invalid_journal");
  }
  if (!safeInteger(request.epoch) || !safeInteger(request.expectedRevision)) return skip("invalid_input");
  if (request.expectedRevision !== envelope.revision) return skip("stale_revision");
  if (request.epoch !== envelope.admission.epoch) return skip("stale_epoch");
  if (!envelope.admission.active) return skip("inactive_admission");
  if (!isJournalUuid(request.operationId)) return skip("invalid_input");
  const command = envelope.commands.find(item => item.operationId === request.operationId);
  if (!command) return skip("unknown_operation");
  if (command.kind !== "start" || command.status !== "unknown") return skip("not_unknown_start");
  const record = envelope.records.find(item => item.clientSessionId === command.clientSessionId);
  if (!record || record.state !== "not_started" || record.serverSessionId !== null
      || ("dismissedAtMs" in record && record.dismissedAtMs !== null)) return skip("not_pending_start");
  const read = request.openSessions;
  if (!read || !Array.isArray(read.sessions)) return skip("invalid_input");
  try { validateJournalScope(read.scope); }
  catch { return skip("invalid_input"); }
  if (!sameScope(read.scope, request.verifiedScope)) return skip("server_scope_mismatch");
  if (read.complete !== true) return skip("incomplete_server_read");
  if (read.sessions.length === 0) return skip("no_open_session");
  // Do not filter out a nonmatching row and then pretend the read was unique.
  if (read.sessions.length !== 1) return skip("ambiguous_open_sessions");
  const candidate = read.sessions[0];
  try { validateJournalScope(candidate.scope); }
  catch { return skip("invalid_server_snapshot"); }
  if (!sameScope(candidate.scope, request.verifiedScope)) return skip("server_scope_mismatch");
  const snapshot = candidate.snapshot;
  try {
    validateJournalSetup({ ...candidate.setup, title: null });
    if (!snapshot || !isJournalUuid(snapshot.serverSessionId)
        || !["running", "paused"].includes(snapshot.state)
        || !timestamp(snapshot.startedAtMs) || !safeInteger(snapshot.elapsedMs)) {
      return skip("invalid_server_snapshot");
    }
    validateJournalClock(snapshot.observedClock);
  } catch { return skip("invalid_server_snapshot"); }
  if (envelope.records.some(item => item.serverSessionId === snapshot.serverSessionId)) {
    return skip("server_session_already_known");
  }
  const setup = record.setup;
  if (candidate.setup.targetSeconds !== setup.targetSeconds
      || candidate.setup.activityType !== setup.activityType
      || candidate.setup.taskId !== setup.taskId
      || candidate.setup.subjectId !== setup.subjectId
      || candidate.setup.notes !== setup.notes) return skip("setup_mismatch");
  if (Math.abs(snapshot.startedAtMs - command.createdAtMs) > LEGACY_START_MATCH_WINDOW_MS) {
    return skip("start_time_mismatch");
  }
  const originalClock = command.request.clock as unknown as JournalServerSnapshot["observedClock"];
  const observation = snapshot.observedClock;
  const wallDelta = observation.wallTimeMs - originalClock.wallTimeMs;
  const sameBoot = originalClock.bootId !== null && observation.bootId === originalClock.bootId
    && originalClock.monotonicTimeMs !== null && observation.monotonicTimeMs !== null;
  if (sameBoot) {
    const delta = observation.monotonicTimeMs! - originalClock.monotonicTimeMs!;
    if (delta < 0 || Math.abs(wallDelta - delta) > JOURNAL_CLOCK_WARNING_MS) return skip("clock_changed");
  } else if (wallDelta < -JOURNAL_CLOCK_WARNING_MS) return skip("clock_changed");
  return {
    kind: "acknowledge",
    action: {
      type: "acknowledge_start", epoch: request.epoch, expectedRevision: request.expectedRevision,
      operationId: command.operationId,
      snapshot: {
        serverSessionId: snapshot.serverSessionId, state: snapshot.state,
        startedAtMs: snapshot.startedAtMs, elapsedMs: snapshot.elapsedMs,
        observedClock: {
          wallTimeMs: snapshot.observedClock.wallTimeMs,
          monotonicTimeMs: snapshot.observedClock.monotonicTimeMs,
          bootId: snapshot.observedClock.bootId,
        },
      },
    },
  };
}
