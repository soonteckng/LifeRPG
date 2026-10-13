import { supabase } from "../../lib/supabase";
import {
  OFFLINE_CAPABILITY_MAX_AGE_MS, OFFLINE_POLICY_LIMITS, OFFLINE_POLICY_VERSION,
  OFFLINE_REJECTION_REASONS,
  type ClientSessionSubmission, type ClientSessionSubmitResult,
  type OfflineCapabilityGrant, type OfflineRejectionReason, type SessionSyncSnapshot,
} from "../types/offlineSession";
import type { JournalReceipt, JournalScope } from "../types/sessionJournal";
import {
  isJournalUuid, validateJournalReceipt, validateJournalScope, validateJournalSetup,
} from "../utils/sessionJournalSchema";
import {
  mapActivitySessionRow, SessionTransportError,
  type JournalSessionTransportOptions, type SessionTransportFailureKind,
} from "./sessionService";
import type { SessionJournalStorage } from "./sessionJournalStore";

type RpcResponse = { data: unknown; error: unknown; status?: number };
export type OfflineSessionRpc = (name: string, params: Record<string, unknown>) => Promise<RpcResponse>;
const defaultRpc: OfflineSessionRpc = async (name, params) => await supabase.rpc(name, params);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sameScope = (a: JournalScope, b: JournalScope) => a.backendId === b.backendId && a.ownerId === b.ownerId;
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const timestamp = (value: unknown): value is number => integer(value, 0, 8_640_000_000_000_000);

function fail(code: "invalid_request" | "invalid_response" | "scope_mismatch" | "auth_unavailable" | "request_failed" | "repair_unavailable",
  failureKind?: SessionTransportFailureKind, sent?: boolean): never {
  throw new SessionTransportError(code, failureKind, sent);
}
function object(value: unknown, request = false): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail(request ? "invalid_request" : "invalid_response");
  }
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[], request = false): void {
  if (Object.keys(value).length !== expected.length || expected.some(name => !Object.hasOwn(value, name)))
    fail(request ? "invalid_request" : "invalid_response");
}
function isoTime(value: unknown): number {
  if (typeof value !== "string" || !value.includes("T")) fail("invalid_response");
  const result = Date.parse(value);
  if (!timestamp(result)) fail("invalid_response");
  return result;
}
function scopeValid(scope: JournalScope): void {
  try { validateJournalScope(scope); }
  catch { fail("invalid_request", "definitive", false); }
}
function currentFence(scope: JournalScope, options: Pick<JournalSessionTransportOptions, "currentScope" | "currentEpoch">, epoch: number): void {
  let current;
  try {
    current = options.currentScope();
    if (current) validateJournalScope(current);
    if (!current || !sameScope(scope, current) || options.currentEpoch() !== epoch) fail("scope_mismatch");
  } catch (error) {
    if (error instanceof SessionTransportError) throw error;
    fail("auth_unavailable");
  }
}
async function verifiedEpoch(scope: JournalScope, options: Pick<JournalSessionTransportOptions,
  "currentScope" | "currentEpoch" | "ensureVerifiedScope">): Promise<number> {
  let epoch;
  try { epoch = options.currentEpoch(); }
  catch { return fail("auth_unavailable"); }
  if (!integer(epoch)) fail("auth_unavailable");
  currentFence(scope, options, epoch);
  let verified;
  try { verified = await options.ensureVerifiedScope(); }
  catch { return fail("auth_unavailable"); }
  if (!verified) fail("auth_unavailable");
  try { validateJournalScope(verified); }
  catch { return fail("auth_unavailable"); }
  if (!sameScope(scope, verified)) fail("scope_mismatch");
  currentFence(scope, options, epoch);
  return epoch;
}
function rpcFailure(response: RpcResponse, sent: boolean): never {
  const details = response.error && typeof response.error === "object" ? response.error as Record<string, unknown> : {};
  if (details.code === "PGRST202" || details.code === "42883") fail("repair_unavailable", "definitive", sent);
  if (response.status === 401 || response.status === 403 || ["PGRST301", "PGRST302", "PGRST303"].includes(String(details.code)))
    fail("auth_unavailable", "auth", sent);
  // JSON outcomes carry definitive policy rejection. An HTTP failure never
  // proves that a dispatched submission did not save before its reply was lost.
  fail("request_failed", "transient", sent);
}

export interface OfflineCapabilityCacheOptions extends Pick<JournalSessionTransportOptions,
  "ensureVerifiedScope" | "currentScope" | "currentEpoch"> {
  storage: SessionJournalStorage;
  now?: () => number;
  rpc?: OfflineSessionRpc;
}
type CacheEntry = { cacheVersion: 1; scope: JournalScope; grant: OfflineCapabilityGrant | null };
const cacheQueues = new WeakMap<SessionJournalStorage, Map<string, { tail: Promise<void> }>>();
export function offlineCapabilityKey(scope: JournalScope): string {
  scopeValid(scope);
  return `liferpg:session-sync-capability:v1:${encodeURIComponent(scope.backendId)}:${encodeURIComponent(scope.ownerId)}`;
}
function validGrant(value: unknown, scope: JournalScope, now: number): value is OfflineCapabilityGrant {
  try {
    const grant = object(value);
    keys(grant, ["scope", "policyVersion", "grantedAtMs", "serverTimeMs", "expiresAtMs", "lastSeenAtMs"]);
    validateJournalScope(grant.scope as JournalScope);
    return sameScope(grant.scope as JournalScope, scope) && grant.policyVersion === OFFLINE_POLICY_VERSION
      && timestamp(grant.grantedAtMs) && timestamp(grant.serverTimeMs) && timestamp(grant.expiresAtMs) && timestamp(grant.lastSeenAtMs)
      && grant.lastSeenAtMs >= grant.grantedAtMs && grant.lastSeenAtMs <= now
      && grant.expiresAtMs > grant.grantedAtMs && grant.expiresAtMs - grant.grantedAtMs <= OFFLINE_CAPABILITY_MAX_AGE_MS
      && Math.abs(grant.serverTimeMs - grant.grantedAtMs) <= OFFLINE_POLICY_LIMITS.clockToleranceSeconds * 1000
      && now >= grant.grantedAtMs && now < grant.expiresAtMs;
  } catch { return false; }
}
function capabilityGrant(raw: unknown, scope: JournalScope, now: number): OfflineCapabilityGrant | null {
  const value = object(raw);
  if (value.owner_id !== scope.ownerId) fail("scope_mismatch");
  if (value.policy_version !== OFFLINE_POLICY_VERSION || value.offline_enabled !== true) return null;
  const limits = {
    max_age_seconds: OFFLINE_POLICY_LIMITS.maxAgeSeconds,
    max_span_seconds: OFFLINE_POLICY_LIMITS.maxSpanSeconds,
    max_target_seconds: OFFLINE_POLICY_LIMITS.maxTargetSeconds,
    max_segments: OFFLINE_POLICY_LIMITS.maxSegments,
    max_future_skew_seconds: OFFLINE_POLICY_LIMITS.maxFutureSkewSeconds,
    clock_tolerance_seconds: OFFLINE_POLICY_LIMITS.clockToleranceSeconds,
    max_client_reported_daily_seconds: OFFLINE_POLICY_LIMITS.maxClientReportedDailySeconds,
  };
  if (Object.entries(limits).some(([name, expected]) => value[name] !== expected)
    || !integer(value.max_cached_grant_age_seconds, 1, OFFLINE_CAPABILITY_MAX_AGE_MS / 1000)) fail("invalid_response");
  const serverTimeMs = isoTime(value.server_time);
  if (Math.abs(serverTimeMs - now) > OFFLINE_POLICY_LIMITS.clockToleranceSeconds * 1000) fail("invalid_response");
  const expiresAtMs = now + value.max_cached_grant_age_seconds * 1000;
  if (!timestamp(expiresAtMs)) fail("invalid_response");
  return { scope: { ...scope }, policyVersion: OFFLINE_POLICY_VERSION, grantedAtMs: now, serverTimeMs, expiresAtMs, lastSeenAtMs: now };
}

/** Disabled until a fresh verified account has seen the installed backend policy. */
export function createOfflineCapabilityCache(expectedScope: JournalScope, options: OfflineCapabilityCacheOptions) {
  scopeValid(expectedScope);
  const scope = { ...expectedScope }, key = offlineCapabilityKey(scope), rpc = options.rpc ?? defaultRpc;
  let queues = cacheQueues.get(options.storage);
  if (!queues) { queues = new Map(); cacheQueues.set(options.storage, queues); }
  let queue = queues.get(key);
  if (!queue) { queue = { tail: Promise.resolve() }; queues.set(key, queue); }
  const shared = queue;
  let grant: OfflineCapabilityGrant | null = null, clockRejected = false, generation = 0;
  const enqueue = <T,>(action: () => Promise<T>): Promise<T> => {
    const result = shared.tail.then(action, action);
    shared.tail = result.then(() => {}, () => {});
    return result;
  };
  const clock = () => {
    const now = (options.now ?? Date.now)();
    if (!timestamp(now)) fail("invalid_request");
    return now;
  };
  const persist = async (next: OfflineCapabilityGrant | null) => {
    const value: CacheEntry = { cacheVersion: 1, scope, grant: next };
    await options.storage.setItem(key, JSON.stringify(value));
  };
  const readFreshGrant = (requestedScope: JournalScope = scope): OfflineCapabilityGrant | null => {
    try {
      scopeValid(requestedScope);
      if (!sameScope(scope, requestedScope)) return null;
      const epoch = options.currentEpoch();
      currentFence(scope, options, epoch);
      const now = clock();
      if (grant && now < grant.lastSeenAtMs) {
        grant = null; clockRejected = true;
        // Persist a disabled marker so a restart cannot revive a rolled-back grant.
        void enqueue(() => persist(null)).catch(() => {});
      }
      if (clockRejected || !validGrant(grant, scope, now)) return null;
      grant = { ...grant, lastSeenAtMs: now };
      return clone(grant);
    } catch { return null; }
  };
  const load = () => { const requestedGeneration = generation; return enqueue(async (): Promise<OfflineCapabilityGrant | null> => {
    const epoch = options.currentEpoch();
    try {
      currentFence(scope, options, epoch);
      if (clockRejected) return null;
      const raw = await options.storage.getItem(key);
      currentFence(scope, options, epoch);
      if (generation !== requestedGeneration) return null;
      if (!raw || raw.length > 4096) return null;
      const entry = object(JSON.parse(raw));
      keys(entry, ["cacheVersion", "scope", "grant"]);
      validateJournalScope(entry.scope as JournalScope);
      const now = clock();
      if (entry.cacheVersion !== 1 || !sameScope(entry.scope as JournalScope, scope) || !validGrant(entry.grant, scope, now)) return null;
      const candidate = { ...entry.grant, lastSeenAtMs: now };
      await persist(candidate);
      currentFence(scope, options, epoch);
      if (generation !== requestedGeneration) return null;
      grant = candidate;
      return clone(grant);
    } catch { grant = null; return null; }
  }); };
  const refresh = () => { const requestedGeneration = generation; return enqueue(async (): Promise<OfflineCapabilityGrant | null> => {
    try {
      const before = clock(), epoch = await verifiedEpoch(scope, options);
      const response = await rpc("session_sync_capabilities_v1", {});
      currentFence(scope, options, epoch);
      if (generation !== requestedGeneration) return null;
      const now = clock();
      if (now < before) { grant = null; clockRejected = true; await persist(null); return null; }
      if (response.error) rpcFailure(response, true);
      const candidate = capabilityGrant(response.data, scope, now);
      await persist(candidate);
      currentFence(scope, options, epoch);
      if (generation !== requestedGeneration) return null;
      grant = candidate; clockRejected = false;
      return readFreshGrant();
    } catch (error) {
      if (error instanceof SessionTransportError && error.code === "repair_unavailable") {
        grant = null;
        try { await persist(null); } catch { /* memory stays disabled even if storage fails */ }
        return null;
      }
      return readFreshGrant();
    }
  }); };
  const clear = () => { generation++; grant = null; clockRejected = true; return enqueue(() => persist(null)); };
  return { key, load, readFreshGrant, refresh, clear };
}

export function validateClientSessionSubmission(value: unknown): asserts value is ClientSessionSubmission {
  const submission = object(value, true);
  keys(submission, ["policyVersion", "clientSessionId", "serverSessionId", "expectedRevision", "setup", "startedAtMs", "endedAtMs",
    "ending", "segments", "clockWarning", "serverConfirmedMs", "serverObservedAtMs"], true);
  if (submission.policyVersion !== OFFLINE_POLICY_VERSION || !isJournalUuid(submission.clientSessionId)
    || !(submission.serverSessionId === null || isJournalUuid(submission.serverSessionId))
    || !(submission.expectedRevision === null || integer(submission.expectedRevision))
    || !timestamp(submission.startedAtMs) || !timestamp(submission.endedAtMs) || submission.endedAtMs < submission.startedAtMs
    || (submission.ending === "completed" && submission.endedAtMs - submission.startedAtMs > OFFLINE_POLICY_LIMITS.maxSpanSeconds * 1000)
    || !["completed", "cancelled"].includes(String(submission.ending))
    || typeof submission.clockWarning !== "boolean" || !integer(submission.serverConfirmedMs, 0, OFFLINE_POLICY_LIMITS.maxTargetSeconds * 1000)
    || !(submission.serverObservedAtMs === null || timestamp(submission.serverObservedAtMs))
    || !Array.isArray(submission.segments) || submission.segments.length > OFFLINE_POLICY_LIMITS.maxSegments
    || ((submission.serverSessionId === null) !== (submission.expectedRevision === null))
    || ((submission.serverSessionId === null) !== (submission.serverObservedAtMs === null))
    || (submission.serverObservedAtMs !== null && (submission.serverObservedAtMs < submission.startedAtMs
      || submission.serverObservedAtMs > submission.endedAtMs))) fail("invalid_request", "definitive", false);
  try { validateJournalSetup(submission.setup as ClientSessionSubmission["setup"]); }
  catch { return fail("invalid_request", "definitive", false); }
  let previousEnd = submission.serverObservedAtMs ?? submission.startedAtMs;
  let elapsedMs = submission.serverConfirmedMs;
  for (const raw of submission.segments) {
    const segment = object(raw, true); keys(segment, ["startedAtMs", "endedAtMs"], true);
    if (!timestamp(segment.startedAtMs) || !timestamp(segment.endedAtMs) || segment.startedAtMs < previousEnd
      || segment.endedAtMs <= segment.startedAtMs || segment.endedAtMs > submission.endedAtMs) fail("invalid_request", "definitive", false);
    elapsedMs += segment.endedAtMs - segment.startedAtMs;
    if (!integer(elapsedMs)) fail("invalid_request", "definitive", false);
    previousEnd = segment.endedAtMs;
  }
  if (submission.serverSessionId === null && submission.serverConfirmedMs !== 0) fail("invalid_request", "definitive", false);
}

/** Bind responses to the frozen original submission before the journal acknowledges. */
export function parseClientSessionSubmitResult(value: unknown, submission: ClientSessionSubmission): ClientSessionSubmitResult {
  const raw = object(value);
  if (raw.client_session_id !== submission.clientSessionId || !["accepted", "already_saved", "rejected"].includes(String(raw.outcome))) fail("invalid_response");
  if (raw.outcome === "rejected") {
    if (!OFFLINE_REJECTION_REASONS.includes(raw.reason_code as OfflineRejectionReason)
      || !(raw.session_id === null || isJournalUuid(raw.session_id))
      || !(raw.sync_revision === null || integer(raw.sync_revision))
      || !(raw.verification_class === null || ["client_reported", "server_timed"].includes(String(raw.verification_class)))
      || (raw.receipt !== undefined && raw.receipt !== null)) fail("invalid_response");
    return { outcome: "rejected", clientSessionId: submission.clientSessionId, serverSessionId: raw.session_id as string | null,
      revision: raw.sync_revision as number | null, verification: raw.verification_class as "client_reported" | "server_timed" | null,
      reasonCode: raw.reason_code as OfflineRejectionReason };
  }
  if (!isJournalUuid(raw.session_id) || !integer(raw.sync_revision)
    || !["client_reported", "server_timed"].includes(String(raw.verification_class))
    || (raw.ending !== submission.ending && !(submission.ending === "cancelled" && raw.ending === "completed" && raw.outcome === "already_saved"))
    || (submission.serverSessionId !== null && raw.session_id !== submission.serverSessionId)) fail("invalid_response");
  const identity = { outcome: raw.outcome as "accepted" | "already_saved", clientSessionId: submission.clientSessionId,
    serverSessionId: raw.session_id, revision: raw.sync_revision, verification: raw.verification_class as "client_reported" | "server_timed" };
  if (raw.ending === "cancelled") {
    if (raw.receipt !== null || submission.serverSessionId === null) fail("invalid_response");
    return { ...identity, ending: "cancelled", receipt: null };
  }
  const result = object(raw.receipt);
  for (const name of ["xp_earned", "gold_earned", "level", "current_xp", "gold", "daily_goal_minutes", "daily_completed_minutes",
    "streak_count", "credit_version", "character_xp_earned", "character_remainder_seconds", "daily_completed_seconds"])
    if (Object.hasOwn(result, name) && !integer(result[name])) fail("invalid_response");
  for (const name of ["area_xp_earned", "area_remainder_seconds"])
    if (Object.hasOwn(result, name) && result[name] !== null && !integer(result[name])) fail("invalid_response");
  for (const name of ["leveled_up", "daily_goal_completed"])
    if (Object.hasOwn(result, name) && typeof result[name] !== "boolean") fail("invalid_response");
  const receipt = { sessionId: result.session_id, durationSeconds: result.duration_seconds, result };
  try { validateJournalReceipt(receipt); }
  catch { return fail("invalid_response"); }
  if (receipt.sessionId !== raw.session_id || receipt.durationSeconds !== submission.setup.targetSeconds) fail("invalid_response");
  return { ...identity, ending: "completed", receipt: clone(receipt as JournalReceipt) };
}

export interface OfflineSessionTransportOptions extends JournalSessionTransportOptions { rpc?: OfflineSessionRpc }
export function createOfflineSessionTransport(expectedScope: JournalScope, options: OfflineSessionTransportOptions) {
  scopeValid(expectedScope);
  const scope = { ...expectedScope }, rpc = options.rpc ?? defaultRpc;
  const call = async (name: string, params: Record<string, unknown>, mutation: boolean) => {
    let epoch;
    try { epoch = await verifiedEpoch(scope, options); }
    catch (error) {
      if (error instanceof SessionTransportError && mutation) throw new SessionTransportError(error.code, error.failureKind, false);
      throw error;
    }
    let response;
    try { response = await rpc(name, params); }
    catch { return fail("request_failed", "transient", mutation ? true : undefined); }
    try { currentFence(scope, options, epoch); }
    catch (error) {
      if (error instanceof SessionTransportError && mutation) throw new SessionTransportError(error.code, error.failureKind, true);
      throw error;
    }
    if (response.error) rpcFailure(response, mutation);
    return response.data;
  };
  return {
    submit: async (clientSessionId: string, value: ClientSessionSubmission): Promise<ClientSessionSubmitResult> => {
      validateClientSessionSubmission(value);
      if (value.clientSessionId !== clientSessionId) fail("invalid_request", "definitive", false);
      // Freeze before auth/network waits; caller edits cannot change the same-ID payload.
      const submission = clone(value);
      const raw = await call("submit_client_session_v1", { client_session_id: clientSessionId, submission }, true);
      try { return parseClientSessionSubmitResult(raw, submission); }
      catch (error) {
        if (error instanceof SessionTransportError) throw new SessionTransportError(error.code, "transient", true);
        throw error;
      }
    },
    readSnapshot: async (id: string, clientSessionId: string | null = null): Promise<SessionSyncSnapshot | null> => {
      if (!isJournalUuid(id) || !(clientSessionId === null || isJournalUuid(clientSessionId))) fail("invalid_request");
      const raw = await call("session_sync_snapshot_v1", { server_session_id: id, client_session_id: clientSessionId }, false);
      if (raw === null) return null;
      const row = object(raw);
      if (row.id !== id || !integer(row.sync_revision)
        || !(row.client_session_id === null || isJournalUuid(row.client_session_id))
        || (clientSessionId !== null && row.client_session_id !== clientSessionId)) fail("invalid_response");
      const serverTimeMs = isoTime(row.server_time);
      const localClock = options.getClock();
      const session = mapActivitySessionRow(row, scope, localClock);
      let handoff: SessionSyncSnapshot["handoff"] = null;
      if (row.sync_handoff !== null) {
        const candidate = object(row.sync_handoff);
        keys(candidate, ["revision", "observed_at_ms", "confirmed_ms"]);
        if (candidate.revision !== row.sync_revision || !timestamp(candidate.observed_at_ms)
          || !integer(candidate.confirmed_ms, 0, session.setup.targetSeconds * 1000)
          || Math.abs(candidate.observed_at_ms - serverTimeMs) > OFFLINE_POLICY_LIMITS.clockToleranceSeconds * 1000) fail("invalid_response");
        handoff = { revision: row.sync_revision, observedAtMs: candidate.observed_at_ms, confirmedMs: candidate.confirmed_ms };
      }
      if (["running", "paused"].includes(session.status) && !handoff) fail("invalid_response");
      if (handoff && session.snapshot) {
        session.snapshot.elapsedMs = handoff.confirmedMs;
        session.snapshot.observedClock = { wallTimeMs: handoff.observedAtMs, monotonicTimeMs: null, bootId: null };
        session.timingSource = "server_record";
      }
      session.clockWarning = session.clockWarning || Math.abs(localClock.wallTimeMs - serverTimeMs) > OFFLINE_POLICY_LIMITS.clockToleranceSeconds * 1000;
      return { session, revision: row.sync_revision, clientSessionId: row.client_session_id as string | null, serverTimeMs, handoff };
    },
  };
}
