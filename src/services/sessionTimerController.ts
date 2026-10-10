import type {
  JournalAction, JournalClock, JournalCommand, JournalEnvelope, JournalRecord, JournalReceipt, JournalScope,
  JournalServerSnapshot, JournalSetup,
} from "../types/sessionJournal";
import { JournalStorageError, type SessionJournalStore } from "./sessionJournalStore";
import { applyJournalAction, deriveJournalTimer } from "../utils/sessionJournal";
import { reconcileLegacyUnknownStart } from "../utils/sessionJournalRecovery";
import { isJournalUuid, validateJournalClock, validateJournalScope, validateJournalSetup } from "../utils/sessionJournalSchema";

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
  start(setup: JournalSetup): Promise<string>;
  pause(serverSessionId: string): Promise<void>;
  resume(serverSessionId: string): Promise<void>;
  cancel(serverSessionId: string): Promise<void>;
  complete(serverSessionId: string): Promise<JournalReceipt>;
  readSession(serverSessionId: string): Promise<SessionTimerRemoteSession | null>;
  readOpenSessions(): Promise<{ complete: boolean; sessions: SessionTimerRemoteSession[] }>;
}

export interface SessionTimerAuthority {
  currentScope(): JournalScope | null;
  currentEpoch(): number;
  verify(): Promise<JournalScope | null>;
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
}

type ActionInput = JournalAction extends infer A ? A extends JournalAction
  ? Omit<A, "epoch" | "expectedRevision"> : never : never;
const sameScope = (left: JournalScope | null, right: JournalScope) =>
  !!left && left.ownerId === right.ownerId && left.backendId === right.backendId;
const unresolved = (command: JournalCommand) => command.status === "prepared" || command.status === "unknown";
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const MAX_RETRY_MS = 60_000;

class ControllerFenceError extends Error {}
class ControllerAuthorityError extends Error {}
class ControllerRemoteError extends Error {}
class ControllerTimeoutError extends Error {}
class ControllerReceiptUnavailableError extends Error {}

/**
 * The journal is the local authority. This controller never grants rewards,
 * starts offline, or retries uncertain legacy timing mutations blindly.
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
  let initializing: Promise<void> | null = null;
  let selectedId: string | null = null, hiddenId: string | null = null;
  let rewardId: string | null = null;
  let lastAction: "start" | "pause" | "resume" | "cancel" | "complete" | null = null;
  let lastSetup: JournalSetup | null = null;
  let remoteRetryAtMs = 0, remoteRetryAttempts = 0;
  let state: SessionTimerControllerSnapshot = {
    record: null, timeLeft: 0, restoring: true, busy: false, error: null,
    restoreError: false, syncStatus: "idle", receipt: null, rewardsVisible: false,
    ending: false, unsyncedSessionCount: 0,
  };

  const live = () => !disposed && options.authority.currentEpoch() === externalEpoch
    && sameScope(options.authority.currentScope(), scope);
  const fence = () => { if (!live()) throw new ControllerFenceError(); };
  const now = () => { const value = options.clock(); validateJournalClock(value); return value; };
  const uuid = () => { const value = options.uuid(); if (!isJournalUuid(value)) throw new ControllerRemoteError(); return value; };
  const selected = () => journal?.records.find(record => record.clientSessionId === selectedId) ?? null;
  const pending = (record?: JournalRecord | null) => journal?.commands.find(command => unresolved(command)
    && (!record || command.clientSessionId === record.clientSessionId)) ?? null;
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
      && ["pending", "waiting_auth"].includes(record.sync.state));
    if (open || waiting) { selectedId = (open ?? waiting)!.clientSessionId; return; }
    if (selectedId && selected() && selectedId !== hiddenId) return;
    selectedId = [...journal.records].reverse().find(record => record.clientSessionId !== hiddenId
      && record.state === "completed" && record.dismissedAtMs === null)?.clientSessionId ?? null;
  }

  function publish(patch: Partial<SessionTimerControllerSnapshot> = {}): void {
    const record = live() ? selected() : null;
    const timer = record ? deriveJournalTimer(record, now()) : null;
    const receipt = record?.sync.receipt ?? null;
    const waiting = !!record && (!!pending(record) || ["pending", "waiting_auth"].includes(record.sync.state));
    const syncStatus = !record ? "idle" : record.sync.state === "rejected" ? "rejected"
      : waiting ? "waiting" : record.sync.state === "synced" ? "saved" : "idle";
    const unsyncedSessionCount = live() ? journal?.records.filter(item => !!pending(item)
      || ["pending", "waiting_auth"].includes(item.sync.state)
      || (item.sync.state === "rejected" && item.dismissedAtMs === null)).length ?? 0 : 0;
    state = {
      ...state, ...patch, record: record ? copy(record) : null,
      timeLeft: timer ? Math.ceil(timer.remainingMs / 1000) : 0,
      syncStatus, receipt: receipt ? copy(receipt) : null,
      rewardsVisible: !!receipt && rewardId === record?.clientSessionId,
      ending: !!record && pending(record)?.kind === "cancel", unsyncedSessionCount,
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
    const message = error instanceof JournalStorageError ? storageMessage() : record?.state === "completed"
      ? "Saved on this phone. Waiting to confirm your progress."
      : error instanceof ControllerReceiptUnavailableError ? "Your account reports this session as completed, but its saved result isn’t available yet. Your local record is kept while we check again. No new completion will be submitted."
      : command?.kind === "cancel" && unresolved(command) ? "Your stop is saved on this phone. Waiting to confirm it."
      : command && unresolved(command) ? "Waiting to confirm your saved session state."
      : kind === "auth" ? "Connect to the internet to continue."
      : "Couldn’t confirm the session. Connect and retry.";
    publish({ error: message, restoreError: !record && !lastSetup });
  }

  async function reconcileRemote(record: JournalRecord, remote: SessionTimerRemoteSession): Promise<void> {
    checkRemote(remote, record.serverSessionId ?? undefined);
    const verifiedScope = await verify();
    if (remote.status === "completed") {
      let receipt = remote.receipt;
      if (!receipt) {
        // An End intent must never initiate a completion repair or award. Wait
        // for an existing receipt to become readable instead.
        if (pending(record)?.kind === "cancel") throw new ControllerReceiptUnavailableError();
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
    const read = await bounded(options.server.readOpenSessions());
    fence();
    for (const remote of read.sessions) checkRemote(remote);
    const result = reconcileLegacyUnknownStart(journal!, {
      verifiedScope, epoch: durableEpoch!, expectedRevision: journal!.revision, operationId: command.operationId,
      openSessions: { scope, complete: read.complete, sessions: read.sessions.map(remote => {
        if (!remote.snapshot || (remote.status !== "running" && remote.status !== "paused")) throw new ControllerRemoteError();
        return { scope: remote.scope, setup: remote.setup, snapshot: remote.snapshot };
      }) },
    });
    if (result.kind === "acknowledge") await write(result.action);
    else { scheduleRemoteRetry(); publish({ error: "Waiting to confirm whether your session started.", restoreError: false }); }
  }

  async function expireLocal(): Promise<boolean> {
    const record = selected();
    if (!record || pending(record) || (record.state !== "running" && record.state !== "paused")) return false;
    const clock = now();
    if (!deriveJournalTimer(record, clock).expired) return false;
    lastAction = "complete";
    await write({ type: "expire", clientSessionId: record.clientSessionId, operationId: uuid(), clock });
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
      const remote = await readKnown(record);
      if (!remote) throw new ControllerRemoteError();
      if (remote.status === "completed" || remote.status === "cancelled") {
        await reconcileRemote(record, remote);
        return;
      }
      await verify();
      fence();
      rpcAttempted = true;
      const receipt = await bounded(options.server.complete(record.serverSessionId), mutationTimeoutMs);
      fence();
      await write({ type: "acknowledge_completion", operationId: command.operationId, receipt });
      // Only this freshly returned, durably stored result can start celebration.
      rewardId = receipt.result.already_completed === true ? null : record.clientSessionId;
      publish({ error: null, restoreError: false });
    } catch (error) {
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
    await expireLocal();
    let command = pending();
    if (command?.kind === "complete") {
      await syncCompletion(force);
      if (pending()) return;
    } else if (command?.kind === "cancel") {
      await retryCancellation(command);
      if (pending()) return;
    } else if (command?.kind === "start") {
      await reconcileStart(command);
      if (pending()) return;
    } else if (command) {
      if (command.status === "prepared") await write({ type: "mark_unknown", operationId: command.operationId });
      const record = selected();
      if (!record?.serverSessionId) throw new ControllerRemoteError();
      const remote = await readKnown(record);
      if (!remote) throw new ControllerRemoteError();
      await reconcileRemote(record, remote);
      if (pending()) return;
    }
    const record = selected();
    if (record && (record.state === "running" || record.state === "paused")) {
      const remote = await readKnown(record);
      if (!remote) throw new ControllerRemoteError();
      await reconcileRemote(record, remote);
      await expireLocal();
      if (pending()?.kind === "complete") { await syncCompletion(force); return; }
    }
    await verify();
    const read = await bounded(options.server.readOpenSessions());
    fence();
    if (!read.complete || read.sessions.length > 1) throw new ControllerRemoteError();
    if (read.sessions.length === 1) {
      const remote = read.sessions[0];
      checkRemote(remote);
      if (!remote.snapshot || (remote.status !== "running" && remote.status !== "paused")) throw new ControllerRemoteError();
      const known = journal!.records.find(item => item.serverSessionId === remote.serverSessionId);
      if (!known) {
        await write({ type: "adopt_server", clientSessionId: uuid(), setup: remote.setup,
          snapshot: remote.snapshot, verifiedScope: scope, clockWarning: remote.clockWarning });
        await expireLocal();
        if (pending()?.kind === "complete") await syncCompletion(force);
      }
    }
    command = pending();
    publish({ error: command ? "Waiting to confirm your saved session state." : null, restoreError: false });
  }

  async function run(work: () => Promise<boolean | void>): Promise<boolean> {
    if (locked || !initialized || !live()) return false;
    locked = true;
    publish({ busy: true, error: null });
    try { return (await work()) !== false; }
    catch (error) { await noteFailure(error, pending()?.operationId); return false; }
    finally { locked = false; if (live()) publish({ busy: false }); }
  }

  async function startInternal(setup: JournalSetup): Promise<boolean> {
    validateJournalSetup(setup);
    if (pending() || journal!.records.some(record => ["not_started", "running", "paused"].includes(record.state))) return false;
    lastSetup = copy(setup); lastAction = "start";
    // Verification is a read, before any start intent, so an offline attempt
    // cannot create an unsent legacy start that would be unsafe to retry.
    const verifiedScope = await verify();
    const operationId = uuid(), clientSessionId = uuid();
    await write({ type: "prepare_start", operationId, clientSessionId, setup, clock: now() });
    selectedId = clientSessionId; hiddenId = null; rewardId = null;
    let rpcAttempted = false, mutationReplyReceived = false;
    try {
      fence(); rpcAttempted = true;
      const serverSessionId = await bounded(options.server.start(setup), mutationTimeoutMs);
      mutationReplyReceived = true;
      fence();
      await write({ type: "remember_start_identity", operationId, serverSessionId, verifiedScope });
      const record = selected()!;
      const remote = await readKnown(record);
      if (!remote) throw new ControllerRemoteError();
      await reconcileRemote(record, remote);
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
    // With no earlier unresolved intention, reaching the full target wins over
    // a late End tap. A stop saved before expiry still takes precedence.
    if (!pending(record) && (record.state === "running" || record.state === "paused")
        && deriveJournalTimer(record, now()).expired) {
      await expireLocal(); await syncCompletion(true); return false;
    }
    if (kind === "cancel" && (record.state === "completed" || record.state === "cancelled") && !pending(record)) {
      if (record.sync.state === "rejected") await write({ type: "dismiss", clientSessionId: record.clientSessionId, dismissedAtMs: now().wallTimeMs });
      hiddenId = record.clientSessionId; selectedId = null; rewardId = null; publish({ error: null }); return true;
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
    await verify();
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
    initializing = (async () => {
      try {
        const loaded = await options.store.load(); fence();
        if (loaded.kind !== "ready") {
          publish({ restoring: false, restoreError: true, error: "Your saved session needs recovery before continuing." });
          return;
        }
        journal = loaded.journal; chooseRecord();
        // Render the durable countdown before either account or session reads.
        publish({ restoring: false, restoreError: false });
        durableEpoch = journal.admission.epoch + 1;
        const saved = await options.store.update(current => {
          fence();
          durableEpoch = current.admission.epoch + 1;
          return applyJournalAction(current, { type: "admit", epoch: durableEpoch, expectedRevision: current.revision });
        });
        fence(); journal = saved; initialized = true;
        await refreshInternal(false);
      } catch (error) {
        if (initialized) await noteFailure(error, pending()?.operationId);
        else if (live()) publish({ restoring: false, restoreError: true, error: storageMessage() });
      } finally {
        locked = false; initializing = null;
        if (live()) publish({ busy: false, restoring: false });
      }
    })();
    return initializing;
  }

  return {
    getSnapshot: () => {
      if (!live() && (state.record !== null || state.receipt !== null || state.ending || state.unsyncedSessionCount > 0)) {
        state = { ...state, record: null, receipt: null, timeLeft: 0, rewardsVisible: false,
          busy: false, error: null, ending: false, unsyncedSessionCount: 0 };
      }
      return state;
    },
    subscribe(listener: (snapshot: SessionTimerControllerSnapshot) => void) {
      listeners.add(listener); return () => { listeners.delete(listener); };
    },
    initialize,
    start: (setup: JournalSetup) => run(() => startInternal(setup)),
    pause: () => run(() => controlInternal("pause")),
    resume: () => run(() => controlInternal("resume")),
    end: () => run(() => controlInternal("cancel")),
    async tick(): Promise<boolean> {
      if (!live()) return false;
      if (!initialized) { publish(); return false; }
      if (locked) { publish(); return false; }
      const record = selected();
      const command = pending(record);
      const expiry = !!record && !command && (record.state === "running" || record.state === "paused")
        && deriveJournalTimer(record, now()).expired;
      const retryDue = record?.state === "completed" && record.verification === "server_timed"
        && command?.kind === "complete" && due(record, false);
      const reconcileDue = !!command && command.kind !== "complete" && (now().wallTimeMs >= remoteRetryAtMs
        || remoteRetryAtMs - now().wallTimeMs > MAX_RETRY_MS);
      if (!expiry && !retryDue && !reconcileDue) { publish(); return true; }
      return run(async () => {
        if (reconcileDue) { await refreshInternal(false); return; }
        await expireLocal();
        await syncCompletion(false);
        publish();
      });
    },
    refresh: (forceRetry = false) => run(() => refreshInternal(forceRetry)),
    retry: () => run(async () => {
      const failed = lastAction;
      await refreshInternal(true);
      if (pending()) return false;
      if (failed === "start" && lastSetup && !journal!.records.some(record => ["running", "paused", "not_started"].includes(record.state))) {
        return startInternal(lastSetup);
      }
      if (failed === "pause" || failed === "resume" || failed === "cancel") return controlInternal(failed);
    }),
    dismissSummary() { rewardId = null; if (live()) publish(); },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true; rewardId = null;
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
