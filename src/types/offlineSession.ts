import type { JournalReceipt, JournalScope } from "./sessionJournal";
import type { SessionTimerRemoteSession } from "../services/sessionTimerController";
export type { ClientSessionSubmission } from "./sessionJournal";

export const OFFLINE_POLICY_VERSION = 1 as const;
export const OFFLINE_CAPABILITY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const OFFLINE_POLICY_LIMITS = {
  maxAgeSeconds: 604800,
  maxSpanSeconds: 86400,
  maxTargetSeconds: 28800,
  maxSegments: 256,
  maxFutureSkewSeconds: 120,
  clockToleranceSeconds: 15,
  maxClientReportedDailySeconds: 57600,
} as const;

/** A scoped capability hint, never credentials or permission to award locally. */
export interface OfflineCapabilityGrant {
  scope: JournalScope;
  policyVersion: typeof OFFLINE_POLICY_VERSION;
  grantedAtMs: number;
  serverTimeMs: number;
  expiresAtMs: number;
  lastSeenAtMs: number;
}

export const OFFLINE_REJECTION_REASONS = [
  "invalid_submission", "policy_disabled", "identity_conflict", "changed_submission",
  "clock_skew", "expired", "span_too_large", "segments_invalid", "target_not_reached",
  "revision_conflict", "session_cancelled", "mapping_mismatch", "setup_mismatch",
  "handoff_not_found", "overlap", "daily_cap", "profile_not_found", "target_reached_needs_completion",
] as const;
export type OfflineRejectionReason = typeof OFFLINE_REJECTION_REASONS[number];

type AcceptedClientSessionIdentity = {
  outcome: "accepted" | "already_saved";
  clientSessionId: string;
  serverSessionId: string;
  revision: number;
  verification: "client_reported" | "server_timed";
};
export type ClientSessionSubmitResult = (AcceptedClientSessionIdentity & ({
  ending: "completed";
  receipt: JournalReceipt;
} | {
  ending: "cancelled";
  receipt: null;
})) | {
  outcome: "rejected";
  clientSessionId: string;
  serverSessionId: string | null;
  revision: number | null;
  verification: "client_reported" | "server_timed" | null;
  reasonCode: OfflineRejectionReason;
};

export interface SessionSyncSnapshot {
  session: SessionTimerRemoteSession;
  revision: number;
  clientSessionId: string | null;
  serverTimeMs: number;
  /** Exact immutable server baseline; do not substitute display-clock elapsed. */
  handoff: { revision: number; observedAtMs: number; confirmedMs: number } | null;
}
