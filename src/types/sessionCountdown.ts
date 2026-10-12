import type { JournalClock, JournalEnvelope, JournalScope } from "./sessionJournal";

/**
 * Preparation only: no native renderer or provider consumes this contract yet.
 * Journal identity is not a native renderer lease or authenticated authority.
 */
export const SESSION_COUNTDOWN_VERSION = 1 as const;
export type SessionCountdownActionKind = "pause" | "resume" | "end";
export interface SessionCountdownIdentity {
  scope: JournalScope;
  // This is the durable journal admission epoch, not the auth provider's epoch.
  admissionEpoch: number;
  journalRevision: number;
  recordRevision: number;
  clientSessionId: string;
  serverSessionId: string | null;
}
export interface SessionCountdownInput {
  journal: JournalEnvelope;
  currentScope: JournalScope | null;
  currentAdmissionEpoch: number;
  currentClientSessionId: string | null;
  clock: JournalClock;
}
export interface SessionCountdownProjection {
  version: typeof SESSION_COUNTDOWN_VERSION;
  identity: SessionCountdownIdentity;
  phase: "running" | "paused" | "checking" | "unconfirmed" | "ending" | "finished" | "settled";
  title: string;
  targetMs: number;
  remainingMs: number;
  elapsedMs: number;
  observedClock: JournalClock;
  // Derived display deadline; never replace the journal's persisted deadline.
  deadlineMs: number | null;
  clockWarning: boolean;
  // Eligibility only; permissions and actual OS delivery remain native concerns.
  showOngoing: boolean;
  scheduleFinishAlert: boolean;
  foregroundActions: SessionCountdownActionKind[];
}
export interface SessionCountdownActionToken {
  version: typeof SESSION_COUNTDOWN_VERSION;
  identity: SessionCountdownIdentity;
  operationId: string;
  kind: SessionCountdownActionKind;
}
export type SessionCountdownActionDecision =
  | { accepted: true; operationId: string; foregroundAction: "pause" | "resume" | "end" | "complete" }
  | { accepted: false; reason: "invalid_token" | "inactive" | "stale_scope" | "stale_epoch" | "stale_session"
      | "stale_revision" | "duplicate" | "ending" | "unresolved" | "invalid_state" };

/**
 * The foreground owner supplies previously consumed action IDs. The helper does
 * not consume them or grant authority. Acceptance must be fenced again by the
 * existing controller immediately before its durable/network work.
 */
export interface SessionCountdownActionInput extends SessionCountdownInput {
  token: unknown;
  consumedOperationIds: readonly string[];
}
