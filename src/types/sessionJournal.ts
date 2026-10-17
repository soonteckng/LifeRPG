// Wire format shared with the future native adapter. No credentials belong here.
export const JOURNAL_PROTECTED_VERSION = 3 as const;
export const JOURNAL_VERSION = 1 as const;
export const JOURNAL_CLIENT_TIMING_VERSION = 2 as const;
export const JOURNAL_CLIENT_MAX_SEGMENTS = 256;
export const JOURNAL_CLIENT_MAX_SPAN_MS = 86_400_000;
export const JOURNAL_CLOCK_WARNING_MS = 15_000;
export const JOURNAL_MAX_BYTES = 512 * 1024;
export const JOURNAL_MAX_RECORDS = 100;
export const JOURNAL_MAX_COMMANDS = 1000;
// A recovery cache; full accepted session history remains on the server.
export const JOURNAL_RETAIN_SETTLED_RECORDS = 20;
// Existing v1 metadata carries the stop intention until a start UUID is known.
// It must survive every start snapshot until a cancellation command is durable.
export const JOURNAL_START_STOP_REASON = "end_requested_before_start_confirmation";
export const JOURNAL_START_STOP_CONFIRMED_REASON = "server_start_stop_confirmed";

export interface JournalScope { backendId: string; ownerId: string }
export interface JournalClock {
  wallTimeMs: number;
  monotonicTimeMs: number | null;
  bootId: string | null;
}
export interface JournalSetup {
  targetSeconds: number;
  activityType: string;
  taskId: number | null;
  subjectId: number | null;
  notes: string | null;
  title: string | null;
}
export type JournalState = "not_started" | "running" | "paused" | "completed" | "cancelled";
export type JournalSyncState = "idle" | "pending" | "waiting_auth" | "synced" | "rejected";
export type JournalCommandKind = "start" | "pause" | "resume" | "cancel" | "complete" | "import";
export type JournalCommandStatus = "prepared" | "unknown" | "acknowledged" | "rejected" | "superseded";
export type JournalJson = null | boolean | number | string | JournalJson[] | { [key: string]: JournalJson };

export interface JournalReceipt {
  sessionId: string;
  durationSeconds: number;
  result: { [key: string]: JournalJson };
}
export interface JournalStartStopProof {
  scope: JournalScope;
  clientSessionId: string;
  serverSessionId: string | null;
  status: "cancelled" | "completed";
  legacyStartsFenced: true;
}
export interface JournalClientTiming {
  policyVersion: 1;
  offlineOrigin: boolean;
  segments: { startedAtMs: number; endedAtMs: number | null }[];
  serverRevision: number | null;
  serverObservedAtMs: number | null;
  // Confirmed cumulative elapsed at the anchor. Historical paused gaps are not
  // reconstructed as active intervals; only subsequent local intervals follow.
  serverConfirmedMs: number;
}
export interface ClientSessionSubmission {
  policyVersion: 1;
  ending: "completed" | "cancelled";
  clientSessionId: string;
  serverSessionId: string | null;
  expectedRevision: number | null;
  setup: JournalSetup;
  startedAtMs: number;
  endedAtMs: number;
  serverConfirmedMs: number;
  serverObservedAtMs: number | null;
  segments: { startedAtMs: number; endedAtMs: number }[];
  clockWarning: boolean;
}
export interface JournalRecord {
  clientSessionId: string;
  serverSessionId: string | null;
  revision: number;
  state: JournalState;
  setup: JournalSetup;
  startedAtMs: number | null;
  elapsedMs: number;
  clockAnchor: JournalClock | null;
  endsAtMs: number | null;
  completedAtMs: number | null;
  observedAtMs: number | null;
  dismissedAtMs: number | null;
  verification: "server_timed" | "client_reported";
  clockWarning: boolean;
  protection?: { breakStartedAtMs: number | null; breakEndsAtMs: number | null };
  clientTiming?: JournalClientTiming;
  serverCheckpoint?: { revision: number; observedAtMs: number; confirmedMs: number; clientSessionId: string };
  sync: {
    state: JournalSyncState;
    attempts: number;
    nextAttemptAtMs: number | null;
    reasonCode: string | null;
    receipt: JournalReceipt | null;
  };
}
export interface JournalCommand {
  operationId: string;
  clientSessionId: string;
  kind: JournalCommandKind;
  status: JournalCommandStatus;
  createdAtMs: number;
  // Original request is immutable; same-ID/different-payload retries are refused.
  request: { [key: string]: JournalJson };
}
export interface JournalEnvelope {
  schemaVersion: typeof JOURNAL_VERSION | typeof JOURNAL_CLIENT_TIMING_VERSION | typeof JOURNAL_PROTECTED_VERSION;
  scope: JournalScope;
  revision: number;
  admission: { epoch: number; active: boolean };
  records: JournalRecord[];
  commands: JournalCommand[];
}
export interface JournalServerSnapshot {
  serverSessionId: string;
  state: "running" | "paused" | "cancelled";
  startedAtMs: number;
  elapsedMs: number;
  // Elapsed includes time up to observedClock; callers must reconcile server time.
  observedClock: JournalClock;
}

export interface JournalActionBase { epoch: number; expectedRevision: number }
export type JournalAction =
  | { type: "admit"; epoch: number; expectedRevision: number }
  | { type: "revoke"; epoch: number; expectedRevision: number }
  | (JournalActionBase & { type: "prepare_start"; protectedSession?: boolean; operationId: string; clientSessionId: string; setup: JournalSetup; clock: JournalClock })
  | (JournalActionBase & { type: "acknowledge_start"; operationId: string; snapshot: JournalServerSnapshot; clockWarning?: boolean })
  | (JournalActionBase & { type: "remember_start_identity"; operationId: string; serverSessionId: string; verifiedScope: JournalScope })
  | (JournalActionBase & { type: "request_start_end"; clientSessionId: string })
  | (JournalActionBase & { type: "acknowledge_start_stop"; clientSessionId: string; setup: JournalSetup;
      verifiedScope: JournalScope; clock: JournalClock; proof: JournalStartStopProof })
  | (JournalActionBase & { type: "adopt_server"; clientSessionId: string; setup: JournalSetup; snapshot: JournalServerSnapshot; verifiedScope: JournalScope; clockWarning?: boolean })
  | (JournalActionBase & { type: "reconcile_server"; clientSessionId: string; setup: JournalSetup; verifiedScope: JournalScope; clock: JournalClock;
      snapshot?: JournalServerSnapshot; receipt?: JournalReceipt; startedAtMs?: number; completedAtMs?: number; operationId?: string; clockWarning?: boolean })
  | (JournalActionBase & { type: "prepare_transition"; operationId: string; clientSessionId: string; kind: "pause" | "resume" | "cancel"; clock: JournalClock })
  | (JournalActionBase & { type: "acknowledge_transition"; operationId: string; snapshot: JournalServerSnapshot })
  | (JournalActionBase & { type: "mark_unknown"; operationId: string })
  | (JournalActionBase & { type: "reject_command"; operationId: string; reasonCode: string })
  | (JournalActionBase & { type: "expire"; operationId: string; clientSessionId: string; clock: JournalClock })
  | (JournalActionBase & { type: "acknowledge_completion"; operationId: string; receipt: JournalReceipt })
  | (JournalActionBase & { type: "defer_sync"; clientSessionId: string; nowMs: number; delayMs: number; reasonCode: string; waitingAuth: boolean })
  | (JournalActionBase & { type: "dismiss"; clientSessionId: string; dismissedAtMs: number })
  | (JournalActionBase & { type: "protect_session" | "begin_protected_break" | "end_protected_break"; clientSessionId: string; clock: JournalClock })
  | (JournalActionBase & { type: "local_start"; protectedSession?: boolean; clientSessionId: string; setup: JournalSetup; clock: JournalClock })
  | (JournalActionBase & { type: "enter_client_timing"; clientSessionId: string; clock: JournalClock;
      serverRevision: number; serverObservedAtMs: number; serverConfirmedMs?: number })
  | (JournalActionBase & { type: "remember_server_checkpoint"; clientSessionId: string;
      serverCheckpoint: NonNullable<JournalRecord["serverCheckpoint"]>; verifiedScope: JournalScope })
  | (JournalActionBase & { type: "local_pause" | "local_resume"; clientSessionId: string; clock: JournalClock })
  | (JournalActionBase & { type: "local_cancel"; clientSessionId: string; clock: JournalClock; operationId?: string })
  | (JournalActionBase & { type: "local_expire"; clientSessionId: string; operationId: string; clock: JournalClock })
  | (JournalActionBase & { type: "acknowledge_import"; clientSessionId: string; receipt: JournalReceipt | null;
      remoteCompletedReceipt?: JournalReceipt; verifiedScope: JournalScope })
  | (JournalActionBase & { type: "reject_import"; clientSessionId: string; reasonCode: string })
  | (JournalActionBase & { type: "compact" });

export type JournalValidationCode = "invalid_json" | "unsupported_version" | "invalid_record" | "scope_mismatch" | "too_large";
export class JournalValidationError extends Error {
  constructor(public readonly code: JournalValidationCode) {
    super(`Session journal ${code}`);
    this.name = "JournalValidationError";
  }
}

export interface JournalTimerView {
  remainingMs: number;
  elapsedMs: number;
  expired: boolean;
  clockWarning: boolean;
}
