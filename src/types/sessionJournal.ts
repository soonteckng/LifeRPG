// Wire format shared with the future native adapter. No credentials belong here.
export const JOURNAL_VERSION = 1 as const;
export const JOURNAL_CLOCK_WARNING_MS = 15_000;
export const JOURNAL_MAX_BYTES = 512 * 1024;
export const JOURNAL_MAX_RECORDS = 100;
export const JOURNAL_MAX_COMMANDS = 1000;
// A recovery cache; full accepted session history remains on the server.
export const JOURNAL_RETAIN_SETTLED_RECORDS = 20;

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
export type JournalCommandKind = "start" | "pause" | "resume" | "cancel" | "complete";
export type JournalCommandStatus = "prepared" | "unknown" | "acknowledged" | "rejected" | "superseded";
export type JournalJson = null | boolean | number | string | JournalJson[] | { [key: string]: JournalJson };

export interface JournalReceipt {
  sessionId: string;
  durationSeconds: number;
  result: { [key: string]: JournalJson };
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
  schemaVersion: typeof JOURNAL_VERSION;
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
  | (JournalActionBase & { type: "prepare_start"; operationId: string; clientSessionId: string; setup: JournalSetup; clock: JournalClock })
  | (JournalActionBase & { type: "acknowledge_start"; operationId: string; snapshot: JournalServerSnapshot })
  | (JournalActionBase & { type: "remember_start_identity"; operationId: string; serverSessionId: string; verifiedScope: JournalScope })
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
