import type {
  JournalAction, JournalClock, JournalCommand, JournalEnvelope, JournalRecord, JournalReceipt, JournalScope,
  JournalServerSnapshot, JournalSetup,
  JournalStartStopProof,
} from "../types/sessionJournal";
import { JournalStorageError, type SessionJournalStore } from "./sessionJournalStore";
import { applyJournalAction, buildClientSessionSubmission, deriveJournalTimer, queuedClientCompletions } from "../utils/sessionJournal";
import type { ClientSessionSubmission, ClientSessionSubmitResult, OfflineCapabilityGrant, SessionSyncSnapshot } from "../types/offlineSession";
import { LEGACY_START_MATCH_WINDOW_MS, reconcileLegacyUnknownStart } from "../utils/sessionJournalRecovery";
import { isJournalUuid, validateJournalClock, validateJournalReceipt, validateJournalScope, validateJournalSetup } from "../utils/sessionJournalSchema";
import { JOURNAL_START_STOP_REASON } from "../types/sessionJournal";

export interface SessionTimerRemoteSession {
  scope: JournalScope;
  serverSessionId: string;
  setup: JournalSetup;
  status: "running" | "paused" | "cancelled" | "completed";
  snapshot: JournalServerSnapshot | null;
  receipt: JournalReceipt | null;
  startedAtMs: number;
  completedAtMs: number | null;
  clockWarning?: boolean;
  timingSource?: "server_record_with_local_clock" | "server_record";
}

export interface SessionTimerTransport {
  start(setup: JournalSetup, clientSessionId: string): Promise<string>;
  pause(serverSessionId: string): Promise<void>;
  resume(serverSessionId: string): Promise<void>;
  cancel(serverSessionId: string): Promise<void>;
  complete(serverSessionId: string): Promise<JournalReceipt>;
  readSession(serverSessionId: string): Promise<SessionTimerRemoteSession | null>;
  readOpenSessions(): Promise<{ complete: boolean; sessions: SessionTimerRemoteSession[] }>;
  readFinishedStart?(setup: JournalSetup, requestedAtMs: number): Promise<{ complete: boolean; sessions: SessionTimerRemoteSession[] }>;
  readStartedSession?(clientSessionId: string): Promise<SessionTimerRemoteSession | null>;
  confirmStartStop?(setup: JournalSetup, clientSessionId: string): Promise<SessionStartStopConfirmation>;
}
export type SessionStartStopConfirmation = JournalStartStopProof;

export interface SessionTimerAuthority {
  currentScope(): JournalScope | null;
  currentEpoch(): number;
  verify(): Promise<JournalScope | null>;
  beginOperation?(): void;
  endOperation?(): void;
}

export interface SessionTimerControllerOptions {
  scope: JournalScope;
  store: SessionJournalStore;
  server: SessionTimerTransport;
  authority: SessionTimerAuthority;
  clock(): JournalClock;
  uuid(): string;
  timeoutMs?: number;
  mutationTimeoutMs?: number;
  classifyError?(error: unknown): "transient" | "auth" | "definitive";
  offline?: {
    load(): Promise<unknown>;
    readFreshGrant(): OfflineCapabilityGrant | null;
    refresh(): Promise<unknown>;
    isLocalOnly(): boolean;
    readSnapshot(serverSessionId: string, clientSessionId: string | null): Promise<SessionSyncSnapshot | null>;
    submit(clientSessionId: string, submission: ClientSessionSubmission): Promise<ClientSessionSubmitResult>;
  };
}

export interface SessionTimerControllerSnapshot {
  record: JournalRecord | null;
  timeLeft: number;
  restoring: boolean;
  busy: boolean;
  error: string | null;
  restoreError: boolean;
  syncStatus: "idle" | "waiting" | "saved" | "rejected";
  receipt: JournalReceipt | null;
  rewardsVisible: boolean;
  ending: boolean;
  unsyncedSessionCount: number;
  // A transient view of the tap, never a journal transition or reward authority.
  interaction: { kind: "start" | "pause" | "resume"; timeLeft: number } | null;
  displayTimeLeft: number | null;
  recovered: boolean;
  offlineAvailable: boolean;
  cloudSaveVersion: number;
}

type ActionInput = JournalAction extends infer A ? A extends JournalAction
  ? Omit<A, "epoch" | "expectedRevision"> : never : never;
const sameScope = (left: JournalScope | null, right: JournalScope) =>
  !!left && left.ownerId === right.ownerId && left.backendId === right.backendId;
const unresolved = (command: JournalCommand) => command.status === "prepared" || command.status === "unknown";
const sameSetup = (actual: JournalSetup, expected: JournalSetup) =>
  (["targetSeconds", "activityType", "taskId", "subjectId", "notes"] as const).every(field => actual[field] === expected[field]);
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const MAX_RETRY_MS = 60_000;

class ControllerFenceError extends Error {}
class ControllerAuthorityError extends Error {}
class ControllerRemoteError extends Error {}
class ControllerTimeoutError extends Error {}
class ControllerReceiptUnavailableError extends Error {}
class ControllerStartStopUnavailableError extends Error {}

/**
 * The journal is the local authority. A previously verified capability permits
 * local timing; only a server receipt confirms rewards. Uncertain legacy
 * timing mutations are never retried blindly.
 * Native notifications and React rendering remain adapters of its snapshots.
 */
export function createSessionTimerController(options: SessionTimerControllerOptions) {
  validateJournalScope(options.scope);
  const scope = { ...options.scope };
  const externalEpoch = options.authority.currentEpoch();
  const timeoutMs = options.timeoutMs ?? 8000;
  const mutationTimeoutMs = options.mutationTimeoutMs ?? options.timeoutMs ?? 20_000;
  if ([timeoutMs, mutationTimeoutMs].some(value => !Number.isSafeInteger(value) || value < 1 || value > 60_000)) throw new ControllerRemoteError();
  const listeners = new Set<(value: SessionTimerControllerSnapshot) => void>();
  let journal: JournalEnvelope | null = null;
  let durableEpoch: number | null = null;
  let disposed = false, locked = false, initialized = false;
  let localDuringRemote = false, localLocked = false, clientSyncActive = false;
  let initializing: Promise<void> | null = null;
  let selectedId: string | null = null, hiddenId: string | null = null;
  let rewardId: string | null = null;
  const dismissedRewardIds = new Set<string>();
  const pendingDismissals = new Map<string, number>();
  let discoverAfterConflictDismissal = false;
  let lastAction: "start" | "pause" | "resume" | "cancel" | "complete" | null = null;
  let lastSetup: JournalSetup | null = null;
  let remoteRetryAtMs = 0, remoteRetryAttempts = 0;
  let interaction: { kind: "start" | "pause" | "resume"; remainingMs: number; atMs: number } | null = null;
  // Keep one presentation clock through successful replies. Server snapshots
  // still determine expiry, saved timing and rewards; this clock is never stored.
  let displayClock: { clientSessionId: string | null; running: boolean; remainingMs: number; atMs: number } | null = null;
  const recoveredIds = new Set<string>();
  let state: SessionTimerControllerSnapshot = {
    record: null, timeLeft: 0, restoring: true, busy: false, error: null,
    restoreError: false, syncStatus: "idle", receipt: null, rewardsVisible: false,
    ending: false, unsyncedSessionCount: 0, interaction: null, displayTimeLeft: null, recovered: false, offlineAvailable: false, cloudSaveVersion: 0,
  };

  const live = () => !disposed && options.authority.currentEpoch() === externalEpoch
    && sameScope(options.authority.currentScope(), scope);
  const fence = () => { if (!live()) throw new ControllerFenceError(); };
  const now = () => { const value = options.clock(); validateJournalClock(value); return value; };
  const uuid = () => { const value = options.uuid(); if (!isJournalUuid(value)) throw new ControllerRemoteError(); return value; };
  const selected = () => journal?.records.find(record => record.clientSessionId === selectedId) ?? null;
  const pending = (record?: JournalRecord | null) => journal?.commands.find(command => unresolved(command)
    && (!record || command.clientSessionId === record.clientSessionId)) ?? null;
  const startStopRequested = (record?: JournalRecord | null) => !!record
    && record.sync.reasonCode === JOURNAL_START_STOP_REASON;
  const offlineAvailable = () => {
    const grant = options.offline?.readFreshGrant();
    return live() && !!grant && sameScope(grant.scope, scope);
  };
  const locallyAdmitted = () => offlineAvailable() && options.offline?.isLocalOnly() === true;
  const legacyPending = () => journal?.commands.find(command => unresolved(command) && command.kind !== "import") ?? null;
  function bounded<T>(request: Promise<T>, budgetMs = timeoutMs): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new ControllerTimeoutError()), budgetMs);
      request.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
  }

  function chooseRecord(): void {
    if (!journal) { selectedId = null; return; }
    const open = journal.records.find(record => ["not_started", "running", "paused"].includes(record.state));
    const waiting = journal.records.find(record => record.state === "completed"
      && ["pending", "waiting_auth"].includes(record.sync.state) && record.dismissedAtMs === null && record.clientSessionId !== hiddenId);
    if (open || waiting) { selectedId = (open ?? waiting)!.clientSessionId; return; }
    if (selectedId && selected() && selectedId !== hiddenId) return;
    selectedId = [...journal.records].reverse().find(record => record.clientSessionId !== hiddenId
      && record.state === "completed" && record.sync.state === "rejected" && record.dismissedAtMs === null)?.clientSessionId ?? null;
    // Synced historical receipts stay in the journal/history. Only current-run
    // completions or actual pending/rejected work belong in the active surface.
  }

  function publish(patch: Partial<SessionTimerControllerSnapshot> = {}): void {
    const record = live() ? selected() : null;
    const clock = live() ? now() : null;
    const timer = record && clock ? deriveJournalTimer(record, clock) : null;
    if (!live() || (!interaction && displayClock && (!record || record.clientSessionId !== displayClock.clientSessionId
      || record.state !== (displayClock.running ? "running" : "paused") || !!pending(record) || timer?.clockWarning))) displayClock = null;
    const displayRemaining = displayClock && clock ? Math.max(0, Math.ceil((displayClock.remainingMs
      - (displayClock.running ? Math.max(0, clock.wallTimeMs - displayClock.atMs) : 0)) / 1000)) : null;
    // Responsive tap timing can precede the actual server Start/Resume. Zero is
    // a terminal promise: never display it while the canonical timer still has
    // work remaining, since End would correctly cancel that unfinished block.
    const displayTimeLeft = displayRemaining !== null && displayClock?.running && timer && timer.remainingMs > 0
      ? Math.max(1, displayRemaining) : displayRemaining;
    const feedback = interaction && clock ? { kind: interaction.kind, timeLeft: displayTimeLeft ?? state.timeLeft } : null;
    const receipt = record?.sync.receipt ?? null;
    const waiting = !!record && (!!pending(record) || ["pending", "waiting_auth"].includes(record.sync.state));
    const syncStatus = !record ? "idle" : record.sync.state === "rejected" ? "rejected"
      : waiting ? "waiting" : record.sync.state === "synced" ? "saved" : "idle";
    const unsyncedSessionCount = live() ? journal?.records.filter(item => !!pending(item)
      || ["pending", "waiting_auth"].includes(item.sync.state)
      || (item.sync.state === "rejected" && item.dismissedAtMs === null)).length ?? 0 : 0;
    state = {
      ...state, ...patch, record: record ? copy(record) : null,
      busy: localDuringRemote && (record?.clientTiming || offlineAvailable() && !legacyPending()
        && !journal?.records.some(item => ["running", "paused", "not_started"].includes(item.state))) ? localLocked : patch.busy ?? state.busy,
      timeLeft: timer ? Math.ceil(timer.remainingMs / 1000) : 0,
      syncStatus, receipt: receipt ? copy(receipt) : null,
      rewardsVisible: !!receipt && rewardId === record?.clientSessionId,
      ending: !!record && (pending(record)?.kind === "cancel" || record.state === "cancelled" && pending(record)?.kind === "import" || startStopRequested(record)), unsyncedSessionCount, interaction: feedback, displayTimeLeft,
      recovered: !!record && recoveredIds.has(record.clientSessionId),
      offlineAvailable: offlineAvailable(),
    };
    for (const listener of listeners) {
      try { listener(state); } catch { /* A view cannot break durable work. */ }
    }
  }

  async function write(action: ActionInput): Promise<void> {
    fence();
    const saved = await options.store.update(current => {
      fence();
      if (durableEpoch === null || current.admission.epoch !== durableEpoch || !current.admission.active) {
        throw new ControllerFenceError();
      }
      return applyJournalAction(current, { ...action, epoch: durableEpoch, expectedRevision: current.revision } as JournalAction);
    });
    fence();
    journal = saved;
    chooseRecord();
    publish();
  }

  async function verify(): Promise<JournalScope> {
    fence();
    const verified = await bounded(options.authority.verify());
    fence();
    if (!sameScope(verified, scope)) throw new ControllerAuthorityError();
    return scope;
  }

  function checkRemote(remote: SessionTimerRemoteSession, expectedId?: string): void {
    if (!sameScope(remote.scope, scope) || !isJournalUuid(remote.serverSessionId)
      || (expectedId !== undefined && remote.serverSessionId !== expectedId)
      || (remote.snapshot !== null && remote.snapshot.serverSessionId !== remote.serverSessionId)
      || (remote.receipt !== null && remote.receipt.sessionId !== remote.serverSessionId)) throw new ControllerRemoteError();
    validateJournalSetup(remote.setup);
  }

  function classify(error: unknown): "transient" | "auth" | "definitive" {
    if (error instanceof ControllerAuthorityError || error instanceof ControllerFenceError) return "auth";
    const custom = options.classifyError?.(error);
    if (custom) return custom;
    const kind = error && typeof error === "object" && "failureKind" in error ? error.failureKind : null;
    return kind === "auth" || kind === "definitive" ? kind : "transient";
  }

  function storageMessage(): string { return "Couldn’t save this change on your phone. Try again."; }
  function scheduleRemoteRetry(): void {
    remoteRetryAtMs = now().wallTimeMs + Math.min(MAX_RETRY_MS, 1000 * 2 ** Math.min(remoteRetryAttempts++, 6));
  }

  async function noteFailure(error: unknown, commandId?: string, rpcAttempted = false,
    provenNotSent = false, mutationReplyReceived = false): Promise<void> {
    if (!live()) return;
    const kind = classify(error);
    let command = journal?.commands.find(item => item.operationId === commandId);
    try {
      if (command && unresolved(command)) {
        if ((provenNotSent || (kind === "definitive" && !mutationReplyReceived)) && rpcAttempted
            && command.kind !== "complete" && command.kind !== "cancel") {
          await write({ type: "reject_command", operationId: command.operationId,
            reasonCode: provenNotSent ? "request_not_sent" : "server_rejected" });
        } else if (command.status === "prepared" && rpcAttempted) {
          await write({ type: "mark_unknown", operationId: command.operationId });
        }
      }
      command = journal?.commands.find(item => item.operationId === commandId);
      const record = command ? journal?.records.find(item => item.clientSessionId === command!.clientSessionId) : selected();
      if (record?.state === "completed" && !record.sync.receipt && ["pending", "waiting_auth"].includes(record.sync.state)) {
        const delayMs = Math.min(MAX_RETRY_MS, 1000 * 2 ** Math.min(record.sync.attempts, 6));
        await write({ type: "defer_sync", clientSessionId: record.clientSessionId,
          nowMs: now().wallTimeMs, delayMs, reasonCode: kind === "auth" ? "authentication" : "connection",
          waitingAuth: kind === "auth" });
      }
    } catch {
      if (live()) publish({ error: storageMessage() });
      return;
    }
    scheduleRemoteRetry();
    const record = selected();
    const repairUnavailable = error instanceof ControllerStartStopUnavailableError
      || !!error && typeof error === "object" && "code" in error && error.code === "repair_unavailable";
    const message = error instanceof JournalStorageError ? storageMessage()
      : repairUnavailable ? "This session needs the recovery update on the server. Your saved record is kept on this phone."
      : record?.state === "completed"
      ? "Saved on this phone. Waiting to confirm your progress."
      : error instanceof ControllerReceiptUnavailableError ? "Your account reports this session as completed, but its saved result isn’t available yet. Your local record is kept while we check again. No new completion will be submitted."
      : startStopRequested(record) ? "Your request to end is saved on this phone. Waiting to confirm the start so we can end it safely."
      : command?.kind === "cancel" && unresolved(command) ? "Your stop is saved on this phone. Waiting to confirm it."
      : command && unresolved(command) ? "Waiting to confirm your saved session state."
      : kind === "auth" ? "Connect to the internet to continue."
      : "Couldn’t confirm the session. Connect and retry.";
    // Account/network failure after a successful local load says nothing about
    // journal readability. Only a genuine local read/quarantine failure may
    // send the idle offline page into its saved-session recovery branch.
    const localReadFailure = error instanceof JournalStorageError
      && ["read_failed", "recovery_required", "quarantine_failed"].includes(error.code);
    publish({ error: message, restoreError: localReadFailure });
  }

  async function reconcileRemote(record: JournalRecord, remote: SessionTimerRemoteSession): Promise<void> {
    checkRemote(remote, record.serverSessionId ?? undefined);
    const verifiedScope = await verify();
    if (remote.status === "completed") {
      let receipt = remote.receipt;
      if (!receipt) {
        // An End intent must never initiate a completion repair or award. Wait
        // for an existing receipt to become readable instead.
        if (pending(record)?.kind === "cancel" || startStopRequested(record)) throw new ControllerReceiptUnavailableError();
        receipt = await bounded(options.server.complete(remote.serverSessionId), mutationTimeoutMs);
        fence();
      }
      if (remote.completedAtMs === null) throw new ControllerRemoteError();
      await write({ type: "reconcile_server", clientSessionId: record.clientSessionId, setup: remote.setup,
        verifiedScope, clock: now(), receipt, startedAtMs: remote.startedAtMs,
        completedAtMs: remote.completedAtMs, operationId: uuid(), clockWarning: remote.clockWarning });
      rewardId = null;
    } else {
      if (!remote.snapshot) throw new ControllerRemoteError();
      await write({ type: "reconcile_server", clientSessionId: record.clientSessionId,
        setup: remote.setup, verifiedScope, clock: now(), snapshot: remote.snapshot, clockWarning: remote.clockWarning });
    }
    if (pending(selected())) scheduleRemoteRetry();
    else { remoteRetryAtMs = 0; remoteRetryAttempts = 0; }
    publish({ error: pending(selected()) ? "Waiting to confirm your saved session state." : null, restoreError: false });
  }

  async function readKnown(record: JournalRecord): Promise<SessionTimerRemoteSession | null> {
    if (!record.serverSessionId) return null;
    await verify();
    const remote = await bounded(options.server.readSession(record.serverSessionId));
    fence();
    if (remote) checkRemote(remote, record.serverSessionId);
    return remote;
  }

  async function rememberCheckpoint(record: JournalRecord): Promise<void> {
    if (!offlineAvailable() || !options.offline || !record.serverSessionId || record.clientTiming || pending(record)
      || !["running", "paused"].includes(record.state)) return;
    const result = await bounded(options.offline.readSnapshot(record.serverSessionId, record.clientSessionId));
    fence();
    if (!result) throw new ControllerRemoteError();
    checkRemote(result.session, record.serverSessionId);
    if (result.clientSessionId !== record.clientSessionId || !sameSetup(result.session.setup, record.setup)) throw new ControllerRemoteError();
    await reconcileRemote(record, result.session);
    const current = journal!.records.find(item => item.clientSessionId === record.clientSessionId);
    if (!current || !result.handoff || !["running", "paused"].includes(current.state)) return;
    await write({ type: "remember_server_checkpoint", clientSessionId: current.clientSessionId,
      verifiedScope: await verify(), serverCheckpoint: { revision: result.handoff.revision,
        observedAtMs: result.handoff.observedAtMs, confirmedMs: result.handoff.confirmedMs, clientSessionId: current.clientSessionId } });
  }

  async function enterLocalTiming(record: JournalRecord): Promise<boolean> {
    if (record.clientTiming) return true;
    if (!offlineAvailable() || pending(record) || !record.serverCheckpoint) return false;
    const anchor = record.serverCheckpoint;
    await write({ type: "enter_client_timing", clientSessionId: record.clientSessionId,
      clock: { wallTimeMs: anchor.observedAtMs, monotonicTimeMs: null, bootId: null },
      serverRevision: anchor.revision, serverObservedAtMs: anchor.observedAtMs, serverConfirmedMs: anchor.confirmedMs });
    return true;
  }

  async function syncClientQueue(force: boolean): Promise<void> {
    if (!journal || !options.offline || options.offline.isLocalOnly() || clientSyncActive) return;
    clientSyncActive = true;
    try {
    for (const record of queuedClientCompletions(journal, scope)) {
      if (!due(record, force)) continue;
      const command = pending(record);
      try {
        await verify();
        const payload = buildClientSessionSubmission(record);
        const result = await bounded(options.offline.submit(record.clientSessionId, payload), mutationTimeoutMs);
        fence();
        if (result.clientSessionId !== record.clientSessionId) throw new ControllerRemoteError();
        if (result.outcome === "rejected") {
          if (result.reasonCode === "policy_disabled") {
            await write({ type: "defer_sync", clientSessionId: record.clientSessionId, nowMs: now().wallTimeMs,
              delayMs: MAX_RETRY_MS, reasonCode: "policy_disabled", waitingAuth: false });
            publish({ error: "Saved on this phone. Sync is temporarily unavailable." });
            continue;
          }
          await write({ type: "reject_import", clientSessionId: record.clientSessionId, reasonCode: result.reasonCode });
          continue;
        }
        const remoteCompletedBeforeEnd = payload.ending === "cancelled" && result.ending === "completed" && result.outcome === "already_saved";
        if (result.ending !== payload.ending && !remoteCompletedBeforeEnd || result.receipt && (result.receipt.sessionId !== result.serverSessionId
          || result.receipt.durationSeconds !== record.setup.targetSeconds)) throw new ControllerRemoteError();
        await write({ type: "acknowledge_import", clientSessionId: record.clientSessionId,
          receipt: remoteCompletedBeforeEnd ? null : result.receipt,
          remoteCompletedReceipt: remoteCompletedBeforeEnd ? result.receipt! : undefined, verifiedScope: await verify() });
        if (result.receipt && selectedId === record.clientSessionId && record.dismissedAtMs === null
          && !dismissedRewardIds.has(record.clientSessionId) && !recoveredIds.has(record.clientSessionId) && result.outcome === "accepted") rewardId = record.clientSessionId;
        publish({ error: null, restoreError: false, cloudSaveVersion: state.cloudSaveVersion + 1 });
      } catch (error) {
        if (!live()) return;
        // Imports are idempotent, but an HTTP timeout is still an unknown reply.
        if (command?.status === "prepared") await write({ type: "mark_unknown", operationId: command.operationId });
        const kind = classify(error);
        await write({ type: "defer_sync", clientSessionId: record.clientSessionId, nowMs: now().wallTimeMs,
          delayMs: Math.min(MAX_RETRY_MS, 1000 * 2 ** Math.min(record.sync.attempts, 6)), reasonCode: kind === "auth" ? "authentication" : "connection", waitingAuth: kind === "auth" });
        publish({ error: "Saved on this phone. We’ll sync when connected." });
        return;
      }
    }
    } finally { clientSyncActive = false; }
  }

  async function reconcileStart(command: JournalCommand): Promise<void> {
    const record = journal!.records.find(item => item.clientSessionId === command.clientSessionId)!;
    if (record.serverSessionId) {
      const remote = await readKnown(record);
      if (!remote) throw new ControllerRemoteError();
      await reconcileRemote(record, remote);
      return;
    }
    if (command.status === "prepared") await write({ type: "mark_unknown", operationId: command.operationId });
    const verifiedScope = await verify();
    if (options.server.readStartedSession) {
      const identified = await bounded(options.server.readStartedSession(record.clientSessionId));
      fence();
      if (identified) {
        checkRemote(identified, record.clientSessionId);
        if (!sameSetup(identified.setup, record.setup)) throw new ControllerRemoteError();
        await write({ type: "remember_start_identity", operationId: command.operationId,
          serverSessionId: identified.serverSessionId, verifiedScope });
        recoveredIds.add(record.clientSessionId);
        await reconcileRemote(selected()!, identified);
        return;
      }
    }
    if (command.operationId === record.clientSessionId) {
      // New identified Starts share one persistent UUID with their operation.
      // A different matching account timer cannot prove this request succeeded.
      if (startStopRequested(record)) await confirmUnknownStartStop(record);
      else {
        scheduleRemoteRetry();
        publish({ error: "Your start is still unconfirmed. No matching session was found yet. We’ll keep checking its saved identity without starting another.", restoreError: false });
      }
      return;
    }
    const read = await bounded(options.server.readOpenSessions());
    fence();
    for (const remote of read.sessions) checkRemote(remote);
    const result = reconcileLegacyUnknownStart(journal!, {
      verifiedScope, epoch: durableEpoch!, expectedRevision: journal!.revision, operationId: command.operationId,
      allowOwnedOpenRecovery: true,
      openSessions: { scope, complete: read.complete, sessions: read.sessions.map(remote => {
        if (!remote.snapshot || (remote.status !== "running" && remote.status !== "paused")) throw new ControllerRemoteError();
        return { scope: remote.scope, setup: remote.setup, snapshot: remote.snapshot };
      }) },
    });
    if (result.kind === "acknowledge") {
      recoveredIds.add(record.clientSessionId);
      await write(result.action);
    } else {
      // The reply can be lost even though that session was subsequently ended
      // or completed. Open rows alone cannot recover that terminal outcome.
      if (result.reason === "no_open_session" && options.server.readFinishedStart) {
        const finished = await bounded(options.server.readFinishedStart(record.setup, command.createdAtMs));
        fence();
        for (const remote of finished.sessions) checkRemote(remote);
        if (finished.complete && finished.sessions.length === 1) {
          const remote = finished.sessions[0], actual = remote.setup, expected = record.setup;
          const matching = actual.targetSeconds === expected.targetSeconds && actual.activityType === expected.activityType
            && actual.taskId === expected.taskId && actual.subjectId === expected.subjectId && actual.notes === expected.notes
            && Math.abs(remote.startedAtMs - command.createdAtMs) <= LEGACY_START_MATCH_WINDOW_MS
            && !journal!.records.some(item => item.clientSessionId !== record.clientSessionId && item.serverSessionId === remote.serverSessionId);
          if (matching && (remote.status === "cancelled" || remote.status === "completed" && remote.receipt)) {
            recoveredIds.add(record.clientSessionId);
            await write({ type: "remember_start_identity", operationId: command.operationId,
              serverSessionId: remote.serverSessionId, verifiedScope: await verify() });
            await reconcileRemote(selected()!, remote);
            return;
          }
        }
      }
      if (startStopRequested(selected()) && !selected()?.serverSessionId) {
        await confirmUnknownStartStop(selected()!);
        return;
      }
      scheduleRemoteRetry();
      const error = startStopRequested(record) ? "Your request to end is saved. We’re checking for the original session before confirming it."
        : result.reason === "no_open_session" ? "Your start is still unconfirmed. No running session was found yet. We’ll keep checking without starting another."
        : "Waiting to confirm whether your session started.";
      publish({ error, restoreError: false });
    }
  }

  async function confirmUnknownStartStop(record: JournalRecord): Promise<void> {
    if (!options.server.confirmStartStop) throw new ControllerStartStopUnavailableError();
    await verify();
    const proof = await bounded(options.server.confirmStartStop(record.setup, record.clientSessionId), mutationTimeoutMs);
    fence();
    if (!proof || !sameScope(proof.scope, scope) || proof.clientSessionId !== record.clientSessionId
      || !isJournalUuid(proof.clientSessionId) || proof.legacyStartsFenced !== true
      || (proof.status !== "cancelled" && proof.status !== "completed")
      || (proof.serverSessionId !== null && !isJournalUuid(proof.serverSessionId))
      || (proof.serverSessionId !== null && proof.serverSessionId !== record.clientSessionId)
      || (proof.serverSessionId === null && proof.status !== "cancelled")) throw new ControllerRemoteError();
    const verifiedScope = await verify();
    if (proof.serverSessionId === null) {
      await write({ type: "acknowledge_start_stop", clientSessionId: record.clientSessionId,
        setup: record.setup, verifiedScope, clock: now(), proof });
      hiddenId = record.clientSessionId; selectedId = null; rewardId = null;
      lastAction = null; lastSetup = null; remoteRetryAtMs = 0; remoteRetryAttempts = 0;
      publish({ error: null, restoreError: false });
      return;
    }
    const remote = await bounded(options.server.readSession(proof.serverSessionId));
    fence();
    if (!remote || remote.status !== proof.status) throw new ControllerRemoteError();
    checkRemote(remote, proof.serverSessionId);
    if (!sameSetup(remote.setup, record.setup)) throw new ControllerRemoteError();
    if (remote.status === "completed") {
      if (!remote.receipt) throw new ControllerReceiptUnavailableError();
      validateJournalReceipt(remote.receipt);
      if (remote.receipt.durationSeconds !== record.setup.targetSeconds || remote.completedAtMs === null
        || !Number.isSafeInteger(remote.startedAtMs) || !Number.isSafeInteger(remote.completedAtMs)
        || remote.startedAtMs < 0 || remote.completedAtMs < remote.startedAtMs) throw new ControllerRemoteError();
    } else {
      const snapshot = remote.snapshot;
      if (!snapshot || snapshot.state !== "cancelled" || snapshot.startedAtMs !== remote.startedAtMs
        || !Number.isSafeInteger(snapshot.startedAtMs) || snapshot.startedAtMs < 0
        || !Number.isSafeInteger(snapshot.elapsedMs) || snapshot.elapsedMs < 0) throw new ControllerRemoteError();
      validateJournalClock(snapshot.observedClock);
    }
    const confirmedScope = await verify();
    await write({ type: "remember_start_identity", operationId: pending(record)!.operationId,
      serverSessionId: proof.serverSessionId, verifiedScope: confirmedScope });
    recoveredIds.add(record.clientSessionId);
    await reconcileRemote(selected()!, remote);
  }

  async function prepareRequestedStartStop(): Promise<void> {
    const record = selected();
    if (!startStopRequested(record) || !record?.serverSessionId || pending(record)
      || (record.state !== "running" && record.state !== "paused")) return;
    // Replacing the marker and installing Cancel is one durable write. Even a
    // recovered expired snapshot must not auto-complete between these steps.
    await write({ type: "prepare_transition", operationId: uuid(), clientSessionId: record.clientSessionId,
      kind: "cancel", clock: now() });
  }

  async function expireLocal(): Promise<boolean> {
    const record = selected();
    if (!record || pending(record) || startStopRequested(record) || (record.state !== "running" && record.state !== "paused")) return false;
    const clock = now();
    if (!deriveJournalTimer(record, clock).expired) return false;
    lastAction = "complete";
    await write({ type: record.clientTiming ? "local_expire" : "expire", clientSessionId: record.clientSessionId, operationId: uuid(), clock });
    return true;
  }

  function due(record: JournalRecord, force: boolean): boolean {
    const next = record.sync.nextAttemptAtMs;
    return force || next === null || now().wallTimeMs >= next || next - now().wallTimeMs > MAX_RETRY_MS;
  }

  async function syncCompletion(force: boolean): Promise<void> {
    const record = selected();
    const command = pending(record);
    if (!record || record.state !== "completed" || record.verification !== "server_timed" || record.sync.receipt || !record.serverSessionId
      || command?.kind !== "complete" || !due(record, force)) return;
    let rpcAttempted = false;
    try {
      await verify();
      fence();
      rpcAttempted = true;
      // This ending intent is already durable, and Complete is idempotent for
      // this exact UUID. Let its server gate decide in one round trip instead
      // of reading the same row before every normal completion.
      const receipt = await bounded(options.server.complete(record.serverSessionId), mutationTimeoutMs);
      fence();
      await write({ type: "acknowledge_completion", operationId: command.operationId, receipt });
      // Only this freshly returned, durably stored result can start celebration.
      rewardId = receipt.result.already_completed === true || dismissedRewardIds.has(record.clientSessionId)
        ? null : record.clientSessionId;
      publish({ error: null, restoreError: false });
    } catch (error) {
      if (rpcAttempted && live()) {
        try {
          const remote = await readKnown(record);
          if (remote?.status === "completed" || remote?.status === "cancelled") {
            await reconcileRemote(record, remote);
            return;
          }
        } catch { /* Keep the original ending intent until a fresh proof succeeds. */ }
      }
      await noteFailure(error, command.operationId, rpcAttempted);
    }
  }

  async function retryCancellation(command: JournalCommand): Promise<boolean> {
    const record = journal!.records.find(item => item.clientSessionId === command.clientSessionId);
    if (!record?.serverSessionId || command.kind !== "cancel" || !unresolved(command)) return false;
    let rpcAttempted = false, mutationReplyReceived = false;
    try {
      const remote = await readKnown(record);
      if (!remote) throw new ControllerRemoteError();
      await reconcileRemote(record, remote);
      if (!pending(selected())) return selected()?.state === "cancelled";
      if (remote.status !== "running" && remote.status !== "paused") return false;
      // Cancel is the only legacy control safe to replay. Its terminal state
      // absorbs delayed duplicates and later pause/resume calls on this ID.
      await verify(); fence(); rpcAttempted = true;
      await bounded(options.server.cancel(record.serverSessionId), mutationTimeoutMs);
      mutationReplyReceived = true; fence();
      const confirmed = await readKnown(selected()!);
      if (!confirmed) throw new ControllerRemoteError();
      await reconcileRemote(selected()!, confirmed);
      return selected()?.state === "cancelled";
    } catch (error) {
      const provenNotSent = rpcAttempted && !mutationReplyReceived && !!error && typeof error === "object"
        && "requestSent" in error && error.requestSent === false;
      await noteFailure(error, command.operationId, rpcAttempted, provenNotSent, mutationReplyReceived);
      return false;
    }
  }

  async function refreshInternal(force: boolean): Promise<void> {
    if (options.offline) {
      // The single manual reconnect action must still verify the owner. Local
      // admission permits timing, never authenticated server reconciliation.
      if (force && options.offline.isLocalOnly()) await verify();
      if (!options.offline.isLocalOnly()) await bounded(options.offline.refresh());
      await expireLocal();
      await syncClientQueue(force);
      if (selected()?.clientTiming || options.offline.isLocalOnly()) { publish({ restoreError: false }); return; }
    }
    await prepareRequestedStartStop();
    await expireLocal();
    let command = legacyPending();
    const hadCommand = command !== null && command !== undefined;
    if (command?.kind === "complete") {
      await syncCompletion(force);
      if (pending()) return;
    } else if (command?.kind === "cancel") {
      await retryCancellation(command);
      if (pending()) return;
    } else if (command?.kind === "start") {
      await reconcileStart(command);
      await prepareRequestedStartStop();
      if (pending()?.kind === "cancel") await retryCancellation(pending()!);
      if (pending()) return;
    } else if (command) {
      if (command.status === "prepared") await write({ type: "mark_unknown", operationId: command.operationId });
      const record = selected();
      if (!record?.serverSessionId) throw new ControllerRemoteError();
      const remote = await readKnown(record);
      if (!remote) throw new ControllerRemoteError();
      await reconcileRemote(record, remote);
      await rememberCheckpoint(selected()!);
      if (pending()) return;
    }
    if (hadCommand) {
      // The just-read known UUID (or complete owned-open start proof) is enough
      // to settle this operation. Do not hold controls for unrelated discovery.
      await expireLocal();
      if (pending()?.kind === "complete") await syncCompletion(force);
      if (!pending()) publish({ error: null, restoreError: false });
      return;
    }
    const record = selected();
    if (record && (record.state === "running" || record.state === "paused")) {
      const remote = await readKnown(record);
      if (!remote) throw new ControllerRemoteError();
      await reconcileRemote(record, remote);
      if (offlineAvailable()) { try { await rememberCheckpoint(selected()!); } catch { /* refresh preserves confirmed timer */ } }
      await expireLocal();
      if (pending()?.kind === "complete") { await syncCompletion(force); return; }
      publish({ error: pending() ? "Waiting to confirm your saved session state." : null, restoreError: false });
      return;
    }
    if (record?.serverSessionId) { publish({ error: null, restoreError: false }); return; }
    await verify();
    const read = await bounded(options.server.readOpenSessions());
    fence();
    if (!read.complete || read.sessions.length > 1) throw new ControllerRemoteError();
    if (read.sessions.length === 1) {
      const remote = read.sessions[0];
      checkRemote(remote);
      if (!remote.snapshot || (remote.status !== "running" && remote.status !== "paused")) throw new ControllerRemoteError();
      const known = journal!.records.find(item => item.serverSessionId === remote.serverSessionId);
      if (!known || known.clientTiming && known.sync.state === "rejected" && known.dismissedAtMs !== null) {
        let adoptedId = uuid(), snapshot = remote.snapshot, clockWarning = remote.clockWarning;
        let handoff: SessionSyncSnapshot["handoff"] = null;
        if (!known && offlineAvailable() && options.offline) {
          try {
            const authoritative = await bounded(options.offline.readSnapshot(remote.serverSessionId, null)); fence();
            if (authoritative?.clientSessionId && authoritative.session.snapshot) {
              checkRemote(authoritative.session, remote.serverSessionId);
              if (!sameSetup(authoritative.session.setup, remote.setup)) throw new ControllerRemoteError();
              adoptedId = authoritative.clientSessionId; snapshot = authoritative.session.snapshot; handoff = authoritative.handoff;
              clockWarning = clockWarning || authoritative.session.clockWarning;
            }
          } catch { /* Unmapped legacy rows are bound only by the owned follow-up below. */ }
        }
        await write({ type: "adopt_server", clientSessionId: adoptedId, setup: remote.setup,
          snapshot, verifiedScope: await verify(), clockWarning });
        if (handoff) await write({ type: "remember_server_checkpoint", clientSessionId: adoptedId, verifiedScope: await verify(),
          serverCheckpoint: { ...handoff, clientSessionId: adoptedId } });
        else if (!known) { try { await rememberCheckpoint(selected()!); } catch { /* a legacy mapping may need online controls */ } }
        await expireLocal();
        if (pending()?.kind === "complete") await syncCompletion(force);
      }
    }
    command = pending();
    publish({ error: command ? "Waiting to confirm your saved session state." : null, restoreError: false });
  }

  async function flushDismissals(): Promise<void> {
    for (const [clientSessionId, dismissedAtMs] of pendingDismissals) {
      await write({ type: "dismiss", clientSessionId, dismissedAtMs }); pendingDismissals.delete(clientSessionId);
    }
  }

  async function runLocal(work: () => Promise<boolean | void>): Promise<boolean> {
    if (!locked || !localDuringRemote || localLocked || !initialized || !live()) return false;
    localLocked = true; publish({ busy: true, error: null });
    try { return (await work()) !== false; }
    catch (error) { await noteFailure(error, pending(selected())?.operationId); return false; }
    finally {
      try { if (live()) await flushDismissals(); } catch { if (live()) publish({ error: storageMessage() }); }
      localLocked = false; if (live()) publish();
    }
  }

  async function run(work: () => Promise<boolean | void>, allowLocal = false): Promise<boolean> {
    if (locked || !initialized || !live()) return false;
    locked = true; localDuringRemote = allowLocal;
    options.authority.beginOperation?.();
    publish({ busy: true, error: null });
    let succeeded = false;
    try { succeeded = (await work()) !== false; return succeeded; }
    catch (error) { await noteFailure(error, pending()?.operationId); return false; }
    finally {
      // An uncertain or unsent action must return to the journal's protected
      // state. Only a confirmed matching transition keeps its display anchor.
      if (interaction && !succeeded) displayClock = null;
      interaction = null;
      if (live()) {
        try { await flushDismissals(); } catch { publish({ error: storageMessage() }); }
      }
      locked = false; localDuringRemote = false; if (live()) publish({ busy: localLocked });
      options.authority.endOperation?.();
      if (discoverAfterConflictDismissal && live() && !options.offline?.isLocalOnly()) {
        discoverAfterConflictDismissal = false;
        void run(() => refreshInternal(true), true);
      }
    }
  }

  async function startInternal(setup: JournalSetup, forceLocal = false): Promise<boolean> {
    validateJournalSetup(setup);
    if (legacyPending() || journal!.records.some(record => ["not_started", "running", "paused"].includes(record.state))) return false;
    lastSetup = copy(setup); lastAction = "start";
    interaction = { kind: "start", remainingMs: setup.targetSeconds * 1000, atMs: now().wallTimeMs };
    displayClock = { clientSessionId: null, running: true, remainingMs: interaction.remainingMs, atMs: interaction.atMs };
    publish();
    // Verification is a read, before any start intent, so an offline attempt
    // cannot create an unsent legacy start that would be unsafe to retry.
    const localStart = async () => {
      const clientSessionId = uuid();
      await write({ type: "local_start", clientSessionId, setup, clock: now() });
      selectedId = clientSessionId; hiddenId = null; rewardId = null;
      displayClock = null; interaction = null;
      publish({ error: null, restoreError: false });
      return true;
    };
    if (locallyAdmitted() || offlineAvailable() && (forceLocal || queuedClientCompletions(journal!, scope).length > 0)) return localStart();
    let verifiedScope: JournalScope;
    try { verifiedScope = await verify(); }
    catch (error) {
      // No mutation has been dispatched. A cached scoped grant can admit this
      // local Start; never take this fallback after an uncertain Start reply.
      if (locallyAdmitted() || classify(error) === "transient" && offlineAvailable()) return localStart();
      throw error;
    }
    // The v1-compatible identity convention distinguishes new v2 Starts from
    // stored legacy intents, whose operation and client UUIDs were different.
    const clientSessionId = uuid(), operationId = clientSessionId;
    await write({ type: "prepare_start", operationId, clientSessionId, setup, clock: now() });
    selectedId = clientSessionId; hiddenId = null; rewardId = null;
    if (displayClock) displayClock.clientSessionId = clientSessionId;
    let rpcAttempted = false, mutationReplyReceived = false;
    try {
      fence(); rpcAttempted = true;
      const serverSessionId = await bounded(options.server.start(setup, clientSessionId), mutationTimeoutMs);
      mutationReplyReceived = true;
      fence();
      await write({ type: "remember_start_identity", operationId, serverSessionId, verifiedScope });
      const record = selected()!;
      const remote = await readKnown(record);
      if (!remote) throw new ControllerRemoteError();
      await reconcileRemote(record, remote);
      // Missing capability keeps the established online flow unchanged.
      // A checkpoint failure cannot turn a confirmed Start into a failed one.
      if (offlineAvailable()) { try { await rememberCheckpoint(selected()!); } catch { /* local controls remain gated */ } }
      return selected()?.state === "running" || selected()?.state === "paused";
    } catch (error) {
      const provenNotSent = rpcAttempted && !mutationReplyReceived && !!error && typeof error === "object"
        && "requestSent" in error && error.requestSent === false;
      await noteFailure(error, operationId, rpcAttempted, provenNotSent, mutationReplyReceived);
      return false;
    }
  }

  async function controlInternal(kind: "pause" | "resume" | "cancel"): Promise<boolean> {
    const record = selected();
    if (!record) return false;
    const startCommand = pending(record);
    if (kind === "cancel" && record.state === "not_started" && startCommand?.kind === "start") {
      lastAction = "cancel";
      await write({ type: "request_start_end", clientSessionId: record.clientSessionId });
      await reconcileStart(startCommand);
      await prepareRequestedStartStop();
      const cancel = pending(selected());
      if (cancel?.kind === "cancel") return retryCancellation(cancel);
      return hiddenId === record.clientSessionId && !selected() && !pending(record)
        || selected()?.state === "cancelled" || selected()?.state === "completed";
    }
    if (kind === "cancel" && startStopRequested(record)) {
      lastAction = "cancel";
      await prepareRequestedStartStop();
      const cancel = pending(selected());
      if (cancel?.kind === "cancel") return retryCancellation(cancel);
      return false;
    }
    // With no earlier unresolved intention, reaching the full target wins over
    // a late End tap. A stop saved before expiry still takes precedence.
    if (!pending(record) && (record.state === "running" || record.state === "paused")
        && deriveJournalTimer(record, now()).expired) {
      await expireLocal();
      if (!record.clientTiming) await syncCompletion(true);
      return false;
    }
    if (kind === "cancel" && (record.state === "completed" || record.state === "cancelled") && !pending(record)) {
      if (record.sync.state === "rejected") await write({ type: "dismiss", clientSessionId: record.clientSessionId, dismissedAtMs: now().wallTimeMs });
      hiddenId = record.clientSessionId; selectedId = null; rewardId = null; publish({ error: null }); return true;
    }
    if ((record.clientTiming || locallyAdmitted() && (kind !== "cancel" || !!record.serverCheckpoint)
      || kind === "cancel" && offlineAvailable() && !!record.serverCheckpoint) && !pending(record)
      && (record.state === "running" || record.state === "paused")) {
      if (!await enterLocalTiming(record)) {
        publish({ error: "Reconnect once to prepare this session for offline controls." }); return false;
      }
      const current = selected()!;
      if (kind === "pause" && current.state !== "running" || kind === "resume" && current.state !== "paused") return false;
      lastAction = kind; displayClock = null; interaction = null;
      await write({ type: kind === "pause" ? "local_pause" : kind === "resume" ? "local_resume" : "local_cancel",
        clientSessionId: current.clientSessionId, clock: now(), operationId: kind === "cancel" ? uuid() : undefined } as ActionInput);
      publish({ error: null, restoreError: false });
      // The retry heartbeat uploads this terminal intent. Local End does not
      // wait for an unrelated or newly queued HTTP reply.
      return true;
    }
    if (kind === "cancel" && record.serverSessionId && (record.state === "running" || record.state === "paused")) {
      lastAction = "cancel";
      let command = pending(record);
      if (command?.kind !== "cancel") {
        if (command && command.kind !== "pause" && command.kind !== "resume") return false;
        const operationId = uuid();
        // Save the user’s stop before account checks or network waits. A failed
        // or unsent request must leave this intent durable and block expiry.
        await write({ type: "prepare_transition", operationId, clientSessionId: record.clientSessionId, kind, clock: now() });
        command = journal!.commands.find(item => item.operationId === operationId)!;
      }
      return retryCancellation(command);
    }
    if (pending(record) || !record.serverSessionId || (kind === "pause" && record.state !== "running")
      || (kind === "resume" && record.state !== "paused")
      || (kind === "cancel" && record.state !== "running" && record.state !== "paused")) return false;
    lastAction = kind;
    if (kind !== "cancel") {
      const tapClock = now();
      // Freeze the numeral the user actually tapped, including a tap between
      // display ticks. Resume continues from this exact paused numeral.
      interaction = { kind, remainingMs: (state.displayTimeLeft ?? state.timeLeft) * 1000, atMs: tapClock.wallTimeMs };
      displayClock = { clientSessionId: record.clientSessionId, running: kind === "resume", remainingMs: interaction.remainingMs, atMs: interaction.atMs };
      publish();
    }
    try { await verify(); }
    catch (error) {
      if ((!locallyAdmitted() && classify(error) !== "transient") || !offlineAvailable() || !record.serverCheckpoint) throw error;
      // Verification failed before preparing/sending a Pause or Resume.
      await enterLocalTiming(record);
      displayClock = null; interaction = null;
      await write({ type: kind === "pause" ? "local_pause" : "local_resume", clientSessionId: record.clientSessionId, clock: now() });
      publish({ error: null }); return true;
    }
    const operationId = uuid();
    await write({ type: "prepare_transition", operationId, clientSessionId: record.clientSessionId, kind, clock: now() });
    let rpcAttempted = false, mutationReplyReceived = false;
    try {
      fence(); rpcAttempted = true;
      await bounded(options.server[kind](record.serverSessionId), mutationTimeoutMs);
      mutationReplyReceived = true;
      fence();
      const remote = await readKnown(selected()!);
      if (!remote) throw new ControllerRemoteError();
      await reconcileRemote(selected()!, remote);
      if (offlineAvailable()) { try { await rememberCheckpoint(selected()!); } catch { /* keep confirmed online control */ } }
      const current = selected();
      return current?.state === (kind === "pause" ? "paused" : kind === "resume" ? "running" : "cancelled");
    } catch (error) {
      const provenNotSent = rpcAttempted && !mutationReplyReceived && !!error && typeof error === "object"
        && "requestSent" in error && error.requestSent === false;
      await noteFailure(error, operationId, rpcAttempted, provenNotSent, mutationReplyReceived);
      return false;
    }
  }

  async function initialize(): Promise<void> {
    if (initializing) return initializing;
    if (initialized || !live()) return;
    locked = true; publish({ busy: true, restoring: true });
    options.authority.beginOperation?.();
    initializing = (async () => {
      try {
        if (options.offline) { await bounded(options.offline.load()); fence(); }
        const loaded = await options.store.load(); fence();
        if (loaded.kind !== "ready") {
          publish({ restoring: false, restoreError: true, error: "Your saved session needs recovery before continuing." });
          return;
        }
        journal = loaded.journal;
        for (const record of journal.records) {
          if (["running", "paused", "not_started"].includes(record.state)
            || record.state === "completed" && ["pending", "waiting_auth"].includes(record.sync.state)) recoveredIds.add(record.clientSessionId);
        }
        chooseRecord();
        // Render the durable countdown before either account or session reads.
        publish({ restoring: false, restoreError: false });
        durableEpoch = journal.admission.epoch + 1;
        const saved = await options.store.update(current => {
          fence();
          durableEpoch = current.admission.epoch + 1;
          return applyJournalAction(current, { type: "admit", epoch: durableEpoch, expectedRevision: current.revision });
        });
        fence(); journal = saved; initialized = true;
        localDuringRemote = !!selected()?.clientTiming || offlineAvailable() && !legacyPending()
          && !journal.records.some(item => ["running", "paused", "not_started"].includes(item.state));
        publish();
        await refreshInternal(false);
      } catch (error) {
        if (initialized) await noteFailure(error, pending()?.operationId);
        else if (live()) publish({ restoring: false, restoreError: true, error: storageMessage() });
      } finally {
        locked = false; localDuringRemote = false; initializing = null;
        if (live()) publish({ busy: localLocked, restoring: false });
        options.authority.endOperation?.();
      }
    })();
    return initializing;
  }

  return {
    getSnapshot: () => {
      if (!live() && (state.record !== null || state.receipt !== null || state.ending || state.unsyncedSessionCount > 0 || state.interaction !== null || state.offlineAvailable)) {
        state = { ...state, record: null, receipt: null, timeLeft: 0, rewardsVisible: false,
          busy: false, error: null, ending: false, unsyncedSessionCount: 0, interaction: null, displayTimeLeft: null, recovered: false, offlineAvailable: false };
      }
      return state;
    },
    subscribe(listener: (snapshot: SessionTimerControllerSnapshot) => void) {
      listeners.add(listener); return () => { listeners.delete(listener); };
    },
    nextTickDelayMs(): number {
      if (!live()) return 200;
      const clock = now(), record = selected();
      // Keep the existing retry heartbeat, but land the display tick just after
      // either countdown's next whole-second boundary. No timing is changed.
      const remaining = [record?.state === "running" ? deriveJournalTimer(record, clock).remainingMs : null,
        displayClock?.running ? Math.max(0, displayClock.remainingMs - Math.max(0, clock.wallTimeMs - displayClock.atMs)) : null];
      return remaining.reduce<number>((delay, value) => value === null || value <= 0 ? delay
        : Math.min(delay, Math.max(1, Math.ceil(value % 1000 || 1000) + 4)), 200);
    },
    initialize,
    start: (setup: JournalSetup) => locked && localDuringRemote && offlineAvailable()
      ? runLocal(() => startInternal(setup, true)) : run(() => startInternal(setup)),
    pause: () => locked && selected()?.clientTiming ? runLocal(() => controlInternal("pause")) : run(() => controlInternal("pause")),
    resume: () => locked && selected()?.clientTiming ? runLocal(() => controlInternal("resume")) : run(() => controlInternal("resume")),
    end: () => locked && selected()?.clientTiming ? runLocal(() => controlInternal("cancel")) : run(() => controlInternal("cancel")),
    async tick(): Promise<boolean> {
      if (!live()) return false;
      if (!initialized) { publish(); return false; }
      if (locked) {
        if (localDuringRemote && selected()?.clientTiming && !pending(selected()) && deriveJournalTimer(selected()!, now()).expired) {
          return runLocal(async () => { await expireLocal(); });
        }
        publish(); return false;
      }
      const record = selected();
      const command = pending(record);
      const expiry = !!record && !command && !startStopRequested(record) && (record.state === "running" || record.state === "paused")
        && deriveJournalTimer(record, now()).expired;
      const retryDue = record?.state === "completed" && record.verification === "server_timed"
        && command?.kind === "complete" && due(record, false);
      const clientRetryDue = !!options.offline && !options.offline.isLocalOnly() && !!journal
        && journal.records.some(item => !!item.clientTiming && ["completed", "cancelled"].includes(item.state)
          && ["pending", "waiting_auth"].includes(item.sync.state) && due(item, false));
      const reconcileDue = !!command && command.kind !== "complete" && command.kind !== "import" && (now().wallTimeMs >= remoteRetryAtMs
        || remoteRetryAtMs - now().wallTimeMs > MAX_RETRY_MS);
      if (!expiry && !retryDue && !reconcileDue && !clientRetryDue) { publish(); return true; }
      return run(async () => {
        if (reconcileDue) { await refreshInternal(false); return; }
        await expireLocal();
        await syncClientQueue(false);
        if (!selected()?.clientTiming) await syncCompletion(false);
        publish();
      }, true);
    },
    refresh: (forceRetry = false) => run(() => refreshInternal(forceRetry), true),
    retry: () => run(async () => {
      const failed = lastAction;
      const confirmingUnknownStart = pending()?.kind === "start";
      await refreshInternal(true);
      if (pending()) return false;
      if (failed === "start" && !confirmingUnknownStart && lastSetup
          && !journal!.records.some(record => ["running", "paused", "not_started"].includes(record.state))) {
        return startInternal(lastSetup);
      }
      if (failed === "cancel" && !selected()) return true;
      if (failed === "pause" || failed === "resume" || failed === "cancel") return controlInternal(failed);
    }),
    dismissSummary() {
      const record = selected();
      if (record) dismissedRewardIds.add(record.clientSessionId);
      rewardId = null;
      if (record?.clientTiming && ["completed", "cancelled"].includes(record.state)) {
        if (record.sync.state === "rejected") discoverAfterConflictDismissal = true;
        hiddenId = record.clientSessionId; selectedId = null;
        pendingDismissals.set(record.clientSessionId, now().wallTimeMs);
        if (!locked) void run(async () => { /* finally persists the presentation change */ });
        else if (localDuringRemote) void runLocal(async () => { /* no network wait to dismiss locally */ });
      }
      if (live()) publish();
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true; rewardId = null; interaction = null; displayClock = null;
      options.authority.endOperation?.();
      publish({ restoring: false, busy: false, error: null, restoreError: false }); listeners.clear();
      const epoch = durableEpoch;
      if (epoch === null) return;
      try {
        await options.store.update(current => current.admission.active && current.admission.epoch === epoch
          ? applyJournalAction(current, { type: "revoke", epoch, expectedRevision: current.revision }) : current);
      } catch { /* Work stays durable if teardown storage is unavailable. */ }
    },
  };
}

export type SessionTimerController = ReturnType<typeof createSessionTimerController>;
