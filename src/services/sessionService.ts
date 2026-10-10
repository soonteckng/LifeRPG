import { supabase } from "../../lib/supabase";
import {
  JOURNAL_CLOCK_WARNING_MS,
  type JournalClock, type JournalReceipt, type JournalScope, type JournalSetup,
} from "../types/sessionJournal";
import {
  isJournalUuid, validateJournalClock, validateJournalReceipt, validateJournalScope, validateJournalSetup,
} from "../utils/sessionJournalSchema";
import type { SessionTimerRemoteSession, SessionTimerTransport } from "./sessionTimerController";

export interface StartSessionParams {
  targetDurationSeconds: number;
  activityType?: string;
  taskId?: number | null;
  subjectId?: number | null;
  notes?: string | null;
}


export interface OpenActivitySession {
  id: string;
  task_id: number | null;
  subject_id: number | null;
  activity_type: string;
  target_duration_seconds: number;
  elapsed_seconds: number;
  status: "active" | "paused";
  notes: string | null;
  started_at: string;
  last_resumed_at: string | null;
  paused_at: string | null;
}

export interface CompletedSessionResult {
  already_completed: boolean;
  session_id: string;
  duration_seconds: number;
  minutes: number;
  xp_earned: number;
  gold_earned: number;
  level: number;
  current_xp: number;
  gold: number;
  leveled_up: boolean;
  daily_goal_minutes: number;
  daily_completed_minutes: number;
  daily_goal_completed: boolean;
  streak_count: number;
  credit_version?: number;
  character_xp_earned?: number;
  area_xp_earned?: number | null;
  character_remainder_seconds?: number;
  area_remainder_seconds?: number | null;
  daily_completed_seconds?: number;
  goal_reached_now?: boolean;
  credited_date?: string;
}

async function callRpc<T>(
  functionName: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(functionName, params);

  if (error) {
    console.error(`Supabase RPC ${functionName} failed`);
    throw error;
  }

  return data as T;
}

export async function getOpenActivitySession(): Promise<OpenActivitySession | null> {
  const { data, error } = await supabase
    .from("activity_sessions")
    .select(
      "id, task_id, subject_id, activity_type, target_duration_seconds, elapsed_seconds, status, notes, started_at, last_resumed_at, paused_at",
    )
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to load open activity session");
    throw error;
  }

  return data;
}

export async function startActivitySession({
  targetDurationSeconds,
  activityType = "general",
  taskId = null,
  subjectId = null,
  notes = null,
}: StartSessionParams): Promise<string> {
  return callRpc<string>("start_activity_session", {
    p_target_duration_seconds: targetDurationSeconds,
    p_activity_type: activityType,
    p_task_id: taskId,
    p_subject_id: subjectId,
    p_notes: notes,
  });
}

export async function pauseActivitySession(sessionId: string): Promise<void> {
  await callRpc("pause_activity_session", {
    p_session_id: sessionId,
  });
}

export async function resumeActivitySession(sessionId: string): Promise<void> {
  await callRpc("resume_activity_session", {
    p_session_id: sessionId,
  });
}

export async function cancelActivitySession(sessionId: string): Promise<void> {
  await callRpc("cancel_activity_session", {
    p_session_id: sessionId,
  });
}

export async function completeActivitySession(
  sessionId: string,
): Promise<CompletedSessionResult> {
  return callRpc<CompletedSessionResult>("complete_activity_session", {
    p_session_id: sessionId,
  });
}

export type SessionTransportCode = "auth_unavailable" | "scope_mismatch" | "invalid_request" | "invalid_response" | "request_failed";
export type SessionTransportFailureKind = "auth" | "transient" | "definitive";
export class SessionTransportError extends Error {
  constructor(public readonly code: SessionTransportCode, public readonly failureKind: SessionTransportFailureKind =
    code === "auth_unavailable" || code === "scope_mismatch" ? "auth" : code === "invalid_request" ? "definitive" : "transient",
    public readonly requestSent?: boolean) {
    super(`Session transport ${code}`);
    this.name = "SessionTransportError";
  }
}
export function classifySessionTransportError(error: unknown): SessionTransportFailureKind {
  return error instanceof SessionTransportError ? error.failureKind : "transient";
}

export interface JournalSessionTransportOptions {
  // Fresh verified online owner/backend, never a cached/local-only account.
  // The controller also fences results with its admission epoch and revision.
  ensureVerifiedScope(): Promise<JournalScope | null>;
  // Synchronous identity/revocation fence. Connection loss may change online
  // admission to local-only without replacing this same-owner scope or epoch.
  currentScope(): JournalScope | null;
  currentEpoch(): number;
  getClock(): JournalClock;
}

function transportFail(code: SessionTransportCode, failureKind?: SessionTransportFailureKind, requestSent?: boolean): never {
  throw new SessionTransportError(code, failureKind, requestSent);
}
function mutationFailure(error: unknown, requestSent: boolean): never {
  if (error instanceof SessionTransportError) throw new SessionTransportError(error.code, error.failureKind, requestSent);
  return transportFail("request_failed", "transient", requestSent);
}
const sameScope = (a: JournalScope, b: JournalScope) => a.ownerId === b.ownerId && a.backendId === b.backendId;
function rowObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) transportFail("invalid_response");
  return value as Record<string, unknown>;
}
function safeInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function isoTime(value: unknown): number {
  if (typeof value !== "string" || !value.includes("T")) transportFail("invalid_response");
  const parsed = Date.parse(value);
  if (!safeInteger(parsed, 0, 8_640_000_000_000_000)) transportFail("invalid_response");
  return parsed;
}
function detachedReceipt(value: unknown): JournalReceipt {
  const result = rowObject(value);
  const receipt = { sessionId: result.session_id, durationSeconds: result.duration_seconds, result };
  try { validateJournalReceipt(receipt); }
  catch { return transportFail("invalid_response"); }
  return JSON.parse(JSON.stringify(receipt)) as JournalReceipt;
}

function responseFailureKind(error: unknown, status: unknown, operation: string): SessionTransportFailureKind {
  const details = error !== null && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof details.code === "string" ? details.code : "";
  if (typeof status === "number" && status >= 500) return "transient";
  if (status === 401 || ["PGRST301", "PGRST302", "PGRST303"].includes(code)) return "auth";
  // A failed READ cannot prove that an earlier uncertain mutation rolled back.
  if (operation.startsWith("read_")) return status === 403 ? "auth" : "transient";
  // The existing completion gate can temporarily reject a display-clock expiry.
  // Keep that immutable completion pending; never drop it or switch ending paths.
  if (operation === "complete_activity_session" && code === "P0001"
      && details.message === "Session has not reached its target duration yet") return "transient";
  if (code === "P0001" || code === "42501" || /^(22|23)[0-9A-Z]{3}$/.test(code)) return "definitive";
  if (status === 403) return "auth";
  return "transient";
}

/**
 * Convert saved server fields without resetting a full target at response time.
 * The existing API exposes no server-now sample. Active elapsed is explicitly a
 * DISPLAY estimate from server ISO anchors and the observed phone clock; paused
 * elapsed and saved receipts come directly from server records. Rewards still
 * require the existing complete_activity_session server elapsed-time gate.
 */
export function mapActivitySessionRow(
  value: unknown,
  scope: JournalScope,
  observedClock: JournalClock,
): SessionTimerRemoteSession {
  try { validateJournalScope(scope); validateJournalClock(observedClock); }
  catch { return transportFail("invalid_request"); }
  const row = rowObject(value);
  if (row.user_id !== scope.ownerId) transportFail("scope_mismatch");
  if (!isJournalUuid(row.id) || !["active", "paused", "cancelled", "completed"].includes(row.status as string)
      || !safeInteger(row.elapsed_seconds, 0, Math.floor(Number.MAX_SAFE_INTEGER / 1000))) transportFail("invalid_response");
  const setup: JournalSetup = {
    targetSeconds: row.target_duration_seconds as number, activityType: row.activity_type as string,
    taskId: row.task_id as number | null, subjectId: row.subject_id as number | null,
    notes: row.notes as string | null, title: null,
  };
  try { validateJournalSetup(setup); }
  catch { return transportFail("invalid_response"); }
  const startedAtMs = isoTime(row.started_at);
  const completedAtMs = row.completed_at === null || row.completed_at === undefined ? null : isoTime(row.completed_at);
  if ((row.status === "completed" || row.status === "cancelled") && completedAtMs === null) transportFail("invalid_response");
  const targetMs = setup.targetSeconds * 1000;
  let elapsedMs = Math.min(targetMs, row.elapsed_seconds * 1000);
  let clockWarning = startedAtMs - observedClock.wallTimeMs > JOURNAL_CLOCK_WARNING_MS;
  if (row.status === "active") {
    const resumedAtMs = isoTime(row.last_resumed_at);
    if (resumedAtMs < startedAtMs) transportFail("invalid_response");
    clockWarning = clockWarning || resumedAtMs - observedClock.wallTimeMs > JOURNAL_CLOCK_WARNING_MS;
    elapsedMs = Math.min(targetMs, elapsedMs + Math.min(targetMs, Math.max(0, observedClock.wallTimeMs - resumedAtMs)));
  } else if (row.status === "paused") {
    if (row.last_resumed_at !== null) transportFail("invalid_response");
    isoTime(row.paused_at);
  }
  let receipt: JournalReceipt | null = null;
  if (row.status === "completed" && row.credit_result !== null && row.credit_result !== undefined) {
    receipt = detachedReceipt(row.credit_result);
    if (receipt.sessionId !== row.id || receipt.durationSeconds !== row.duration_seconds
        || receipt.durationSeconds !== setup.targetSeconds) transportFail("invalid_response");
  }
  const status = row.status === "active" ? "running" : row.status as "paused" | "cancelled" | "completed";
  return {
    scope: { ...scope }, serverSessionId: row.id, setup, status, startedAtMs, completedAtMs, receipt,
    clockWarning, timingSource: row.status === "active" ? "server_record_with_local_clock" : "server_record",
    snapshot: status === "completed" ? null : {
      serverSessionId: row.id, state: status, startedAtMs, elapsedMs, observedClock: { ...observedClock },
    },
  };
}

/**
 * Guarded adapter for the journal controller. Existing public RPC signatures
 * stay unchanged. This adapter never automatically replays a control RPC:
 * unknown pause/resume/cancel outcomes must first use readSession, and an
 * unchanged state does not prove that the earlier request will not arrive.
 */
export function createJournalSessionTransport(
  expectedScope: JournalScope,
  options: JournalSessionTransportOptions,
): SessionTimerTransport {
  try { validateJournalScope(expectedScope); }
  catch { return transportFail("invalid_request"); }
  const scope = { ...expectedScope };
  const assertCurrent = (epoch: number) => {
    let current: JournalScope | null, currentEpoch: number;
    try {
      current = options.currentScope(); currentEpoch = options.currentEpoch();
      if (current) validateJournalScope(current);
    } catch { return transportFail("auth_unavailable"); }
    if (!current || !sameScope(scope, current) || currentEpoch !== epoch) transportFail("scope_mismatch");
  };
  const verify = async () => {
    let epoch: number;
    try { epoch = options.currentEpoch(); }
    catch { return transportFail("auth_unavailable"); }
    if (!safeInteger(epoch)) transportFail("auth_unavailable");
    assertCurrent(epoch);
    let verified: JournalScope | null;
    try { verified = await options.ensureVerifiedScope(); }
    catch { return transportFail("auth_unavailable"); }
    if (!verified) transportFail("auth_unavailable");
    try { validateJournalScope(verified); }
    catch { return transportFail("auth_unavailable"); }
    if (!sameScope(scope, verified)) transportFail("scope_mismatch");
    assertCurrent(epoch);
    return epoch;
  };
  const clock = () => {
    let observed: JournalClock;
    try { observed = options.getClock(); validateJournalClock(observed); }
    catch { return transportFail("invalid_request"); }
    return { ...observed };
  };
  const validId = (id: string, mutating = false) => { if (!isJournalUuid(id)) transportFail("invalid_request", "definitive", mutating ? false : undefined); };
  const rpc = async <T,>(name: string, params: Record<string, unknown>): Promise<T> => {
    let epoch: number;
    try { epoch = await verify(); }
    catch (error) { return mutationFailure(error, false); }
    let response;
    try { response = await supabase.rpc(name, params); }
    catch { return transportFail("request_failed", "transient", true); }
    try { assertCurrent(epoch); }
    catch (error) { return mutationFailure(error, true); }
    if (response.error) transportFail("request_failed", responseFailureKind(response.error, response.status, name), true);
    return response.data as T;
  };
  const control = async (name: string, id: string) => {
    validId(id, true);
    await rpc(name, { p_session_id: id });
  };
  return {
    start: async setup => {
      try { validateJournalSetup(setup); }
      catch { return transportFail("invalid_request", "definitive", false); }
      const id = await rpc<unknown>("start_activity_session", {
        p_target_duration_seconds: setup.targetSeconds, p_activity_type: setup.activityType,
        p_task_id: setup.taskId, p_subject_id: setup.subjectId, p_notes: setup.notes,
      });
      if (!isJournalUuid(id)) transportFail("invalid_response", "transient", true);
      return id;
    },
    pause: id => control("pause_activity_session", id),
    resume: id => control("resume_activity_session", id),
    cancel: id => control("cancel_activity_session", id),
    complete: async id => {
      validId(id, true);
      const raw = await rpc("complete_activity_session", { p_session_id: id });
      let result: JournalReceipt;
      try { result = detachedReceipt(raw); }
      catch (error) { return mutationFailure(error, true); }
      if (result.sessionId !== id) transportFail("invalid_response", "transient", true);
      return result;
    },
    readSession: async id => {
      validId(id);
      const epoch = await verify();
      let response;
      try {
        response = await supabase.from("activity_sessions").select("*")
          .eq("user_id", scope.ownerId).eq("id", id).maybeSingle();
      } catch { return transportFail("request_failed"); }
      const observed = clock();
      assertCurrent(epoch);
      if (response.error) transportFail("request_failed", responseFailureKind(response.error, response.status, "read_session"));
      if (response.data === null) return null;
      const session = mapActivitySessionRow(response.data, scope, observed);
      if (rowObject(response.data).id !== id) transportFail("invalid_response");
      return session;
    },
    readOpenSessions: async () => {
      const pageSize = 100, maxPages = 10;
      let expectedCount: number | null = null;
      const sessions: SessionTimerRemoteSession[] = [], identities = new Set<string>();
      for (let page = 0; page < maxPages; page++) {
        const epoch = await verify();
        let response;
        try {
          response = await supabase.from("activity_sessions").select("*", { count: "exact" })
            .eq("user_id", scope.ownerId).in("status", ["active", "paused"])
            .order("id", { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
        } catch { return transportFail("request_failed"); }
        const observed = clock();
        assertCurrent(epoch);
        if (response.error) transportFail("request_failed", responseFailureKind(response.error, response.status, "read_open_sessions"));
        if (!Array.isArray(response.data)) transportFail("invalid_response");
        const count = safeInteger(response.count) ? response.count : null;
        if (page === 0) expectedCount = count;
        else if (count !== expectedCount) return { complete: false, sessions };
        for (const row of response.data) {
          const session = mapActivitySessionRow(row, scope, observed);
          if (session.status !== "running" && session.status !== "paused") transportFail("invalid_response");
          const id = session.snapshot!.serverSessionId;
          if (identities.has(id)) return { complete: false, sessions };
          identities.add(id); sessions.push(session);
        }
        if (expectedCount === null || sessions.length > expectedCount) return { complete: false, sessions };
        if (sessions.length === expectedCount) return { complete: true, sessions };
        if (response.data.length < pageSize) return { complete: false, sessions };
      }
      return { complete: false, sessions };
    },
  };
}
