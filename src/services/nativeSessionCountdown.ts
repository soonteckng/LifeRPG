import { SESSION_COUNTDOWN_VERSION, type SessionCountdownActionToken, type SessionCountdownProjection } from "../types/sessionCountdown";
import type { JournalScope } from "../types/sessionJournal";
import { isJournalUuid, validateJournalClock, validateJournalScope } from "../utils/sessionJournalSchema";

export interface NativeSessionCountdownCapabilities {
  supported: true;
  notificationsGranted: boolean;
  exactAlarms: boolean;
}
export interface NativeSessionCountdownModule {
  formatVersion: number;
  activate(leaseId: string, scopeJson: string): Promise<boolean>;
  publish(leaseId: string, projectionJson: string, preferencesJson: string): Promise<boolean>;
  clear(leaseId: string, finished: boolean): Promise<boolean>;
  refresh(leaseId: string, preferencesJson: string): Promise<boolean>;
  capabilities(): Promise<NativeSessionCountdownCapabilities>;
  consumeAction?(leaseId: string, nonce: string): Promise<SessionCountdownActionToken | null>;
  takeForegroundAction?(leaseId: string): Promise<string | null>;
}
export interface SessionCountdownPreferences { sound: boolean; haptics: boolean }
export interface NativeSessionCountdownOptions {
  scope: JournalScope;
  newLeaseId(): string;
  // Must cancel both the old Expo ongoing notification and scheduled finish.
  clearLegacy(): Promise<void>;
  resolveModule?(): Promise<NativeSessionCountdownModule | null>;
}

/** Optional native lookup occurs only for an installed Android API 26+ build. */
export async function getNativeSessionCountdownModule(): Promise<NativeSessionCountdownModule | null> {
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS !== "android" || Number(Platform.Version) < 26) return null;
    const { isRunningInExpoGo } = await import("expo");
    if (isRunningInExpoGo()) return null;
    const { default: Constants } = await import("expo-constants");
    const packageName = Constants.expoConfig?.android?.package;
    if (typeof packageName !== "string" || !/^(?:[A-Za-z_]\w*\.)+[A-Za-z_]\w*$/.test(packageName)) return null;
    const { requireOptionalNativeModule } = await import("expo-modules-core");
    const module = requireOptionalNativeModule<NativeSessionCountdownModule>("LifeRPGSessionCountdown");
    return compatible(module) ? module : null;
  } catch { return null; }
}
function compatible(value: NativeSessionCountdownModule | null): value is NativeSessionCountdownModule {
  return !!value && value.formatVersion === SESSION_COUNTDOWN_VERSION
    && [value.activate, value.publish, value.clear, value.refresh, value.capabilities].every(method => typeof method === "function");
}
const sameScope = (a: JournalScope, b: JournalScope) => a.ownerId === b.ownerId && a.backendId === b.backendId;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
// Cross-instance ordering prevents an outgoing account's cleanup clearing its successor.
let generation = 0;
let queue: Promise<void> = Promise.resolve();
function ordered<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.catch(() => {}).then(work);
  queue = result.then(() => undefined, () => undefined);
  return result;
}
function strictObject(value: unknown, names: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}
function validIdentity(value: unknown, scope: JournalScope): boolean {
  if (!strictObject(value, ["scope", "admissionEpoch", "journalRevision", "recordRevision", "clientSessionId", "serverSessionId"])) return false;
  try { validateJournalScope(value.scope as JournalScope); } catch { return false; }
  return sameScope(value.scope as JournalScope, scope)
    && [value.admissionEpoch, value.journalRevision, value.recordRevision].every(item => Number.isSafeInteger(item) && (item as number) >= 0)
    && (value.admissionEpoch as number) > 0 && isJournalUuid(value.clientSessionId)
    && (value.serverSessionId === null || isJournalUuid(value.serverSessionId));
}
function validProjection(value: SessionCountdownProjection, scope: JournalScope): boolean {
  if (!strictObject(value, ["version", "identity", "phase", "title", "targetMs", "remainingMs", "elapsedMs", "observedClock",
    "deadlineMs", "clockWarning", "showOngoing", "scheduleFinishAlert", "foregroundActions", ...(Object.hasOwn(value ?? {}, "resumeAtMs") ? ["resumeAtMs"] : [])])
    || value.version !== SESSION_COUNTDOWN_VERSION || !validIdentity(value.identity, scope)
    || typeof value.title !== "string" || value.title.length > 256
    || !["running", "paused", "checking", "unconfirmed", "ending", "finished", "settled"].includes(value.phase)
    || !Number.isSafeInteger(value.targetMs) || value.targetMs < 1000 || value.targetMs > 28_800_000
    || ![value.remainingMs, value.elapsedMs].every(item => Number.isSafeInteger(item) && item >= 0 && item <= value.targetMs)
    || value.remainingMs + value.elapsedMs !== value.targetMs
    || ![value.clockWarning, value.showOngoing, value.scheduleFinishAlert].every(item => typeof item === "boolean")
    || !Array.isArray(value.foregroundActions) || value.foregroundActions.length > 2
    || value.foregroundActions.some(item => !["pause", "resume", "end"].includes(item))) return false;
  try { validateJournalClock(value.observedClock); } catch { return false; }
  const running = value.phase === "running", paused = value.phase === "paused";
  return value.showOngoing === (running || paused) && value.scheduleFinishAlert === running
    && (running ? value.remainingMs > 0 && Number.isSafeInteger(value.deadlineMs)
      && value.deadlineMs === (value.resumeAtMs ?? value.observedClock.wallTimeMs) + value.remainingMs
      && (value.resumeAtMs === undefined || Number.isSafeInteger(value.resumeAtMs) && value.resumeAtMs > value.observedClock.wallTimeMs && value.resumeAtMs <= value.observedClock.wallTimeMs + 300000) : value.deadlineMs === null);
}
function validPreferences(value: SessionCountdownPreferences): boolean {
  return strictObject(value, ["sound", "haptics"]) && typeof value.sound === "boolean" && typeof value.haptics === "boolean";
}
function validToken(value: unknown, scope: JournalScope): value is SessionCountdownActionToken {
  return strictObject(value, ["version", "identity", "operationId", "kind"])
    && value.version === SESSION_COUNTDOWN_VERSION && validIdentity(value.identity, scope)
    && isJournalUuid(value.operationId) && ["pause", "resume", "end"].includes(value.kind as string);
}

/**
 * Renderer lifecycle only. The existing JS journal/controller remains the sole
 * session writer. Loading the module permanently selects native rendering for
 * this instance; native failures never enable a competing Expo finish alert.
 */
export function createNativeSessionCountdownLifecycle(options: NativeSessionCountdownOptions) {
  validateJournalScope(options.scope);
  const scope = { ...options.scope };
  const usedLeases = new Set<string>();
  let module: NativeSessionCountdownModule | null = null;
  let selectedNative = false, active = false, disposed = false, legacyCleared = false;
  let lease: string | null = null, localGeneration = 0, publication = 0;
  let activation: Promise<boolean> | null = null;
  let lastKey: string | null = null;
  let lastIdentity: string | null = null;
  const current = (expected: number) => !disposed && localGeneration === expected && generation === expected;
  const warn = () => { console.warn("The live session notification could not be updated; your saved session is unchanged."); };
  async function activate(): Promise<boolean> {
    if (disposed || (localGeneration !== 0 && localGeneration !== generation)) return false;
    if (active && legacyCleared && current(localGeneration)) return true;
    if (activation) return activation;
    const expected = ++generation;
    localGeneration = expected;
    const requestPublication = publication;
    activation = ordered(async () => {
      try {
        if (!current(expected)) return false;
        module ??= await (options.resolveModule ?? getNativeSessionCountdownModule)();
        if (!current(expected) || !compatible(module)) return false;
        selectedNative = true;
        if (requestPublication !== publication) return false;
        if (active && lease !== null) {
          await options.clearLegacy();
          if (!current(expected) || requestPublication !== publication) return false;
          legacyCleared = true; return true;
        }
        // An uncertain prior activation must be cleared, not replayed with a new lease.
        if (lease !== null) return false;
        const nextLease = options.newLeaseId();
        if (!isJournalUuid(nextLease) || usedLeases.has(nextLease)) return false;
        usedLeases.add(nextLease); lease = nextLease;
        const accepted = await module.activate(nextLease, JSON.stringify(scope));
        if (!current(expected) || requestPublication !== publication || lease !== nextLease || !accepted) return false;
        active = true;
        if (!legacyCleared) {
          await options.clearLegacy();
          if (!current(expected) || requestPublication !== publication || lease !== nextLease) return false;
          legacyCleared = true;
        }
        return true;
      } catch { warn(); return false; }
    }).finally(() => { activation = null; });
    return activation;
  }
  async function clear(finished = false): Promise<boolean> {
    const previousLease = lease, expected = localGeneration;
    publication++; active = false; lastKey = null; lastIdentity = null;
    if (previousLease === null) return !selectedNative;
    return ordered(async () => {
      if (!current(expected) || !module) return false;
      try {
        const accepted = await module.clear(previousLease, finished);
        if (!current(expected) || !accepted) return false;
        if (lease === previousLease) lease = null;
        return true;
      } catch { warn(); return false; }
    });
  }
  return {
    activate,
    // Selected capability survives terminal clear and failures; active lease does not.
    ownsNative: () => selectedNative,
    isActive: () => active && current(localGeneration),
    async publish(projection: SessionCountdownProjection, preferences: SessionCountdownPreferences, force = false): Promise<boolean> {
      if (disposed || !validProjection(projection, scope) || !validPreferences(preferences)) return false;
      const detached = copy(projection), savedPreferences = copy(preferences);
      // This is notification display text only; keep the saved quest title intact.
      detached.title = detached.title.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").trim() || "Your session";
      if (!await activate()) return false;
      const expected = localGeneration, expectedLease = lease, expectedPublication = publication;
      // Countdown rendering belongs to Android. Elapsed clock samples alone do
      // not generate per-second bridge calls or replacement notifications.
      const key = JSON.stringify([detached.identity, detached.phase, detached.title, detached.targetMs,
        detached.deadlineMs, detached.resumeAtMs, detached.clockWarning, detached.showOngoing, detached.scheduleFinishAlert,
        detached.foregroundActions, savedPreferences]);
      const identityKey = JSON.stringify(detached.identity);
      return ordered(async () => {
        if (!current(expected) || !active || !legacyCleared || lease !== expectedLease
          || publication !== expectedPublication || !module || !expectedLease) return false;
        if (!force && lastKey === key) return true;
        try {
          // Same-revision samples cannot replace native timing or reissue action
          // nonces. Refresh only preferences/presentation from the native cache.
          const accepted = lastIdentity === identityKey
            ? await module.refresh(expectedLease, JSON.stringify(savedPreferences))
            : await module.publish(expectedLease, JSON.stringify(detached), JSON.stringify(savedPreferences));
          if (!current(expected) || lease !== expectedLease || publication !== expectedPublication || !accepted) return false;
          lastKey = key; lastIdentity = identityKey; return true;
        } catch { warn(); return false; }
      });
    },
    clear,
    async capabilities(): Promise<NativeSessionCountdownCapabilities | null> {
      try {
        const api = module ?? await (options.resolveModule ?? getNativeSessionCountdownModule)();
        if (!compatible(api) || disposed) return null;
        const value = await api.capabilities();
        return !disposed && value?.supported === true && typeof value.notificationsGranted === "boolean"
          && typeof value.exactAlarms === "boolean" ? copy(value) : null;
      } catch { return null; }
    },
    async consumeAction(nonce: string): Promise<SessionCountdownActionToken | null> {
      const expected = localGeneration, expectedLease = lease;
      if (!isJournalUuid(nonce)) return null;
      return ordered(async () => {
        if (!current(expected) || !active || !expectedLease || lease !== expectedLease || !module?.consumeAction) return null;
        try {
          const token = await module.consumeAction(expectedLease, nonce);
          return current(expected) && lease === expectedLease && validToken(token, scope) ? copy(token) : null;
        } catch { return null; }
      });
    },
    async takeForegroundAction(): Promise<string | null> {
      const expected = localGeneration, expectedLease = lease;
      return ordered(async () => {
        if (!current(expected) || !active || !expectedLease || lease !== expectedLease || !module?.takeForegroundAction) return null;
        try {
          const nonce = await module.takeForegroundAction(expectedLease);
          return current(expected) && lease === expectedLease && isJournalUuid(nonce) ? nonce : null;
        } catch { return null; }
      });
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      const previousLease = lease, expected = localGeneration;
      disposed = true; publication++; active = false; lastKey = null; lastIdentity = null;
      await ordered(async () => {
        if (!previousLease || !module || localGeneration !== expected || generation !== expected) return;
        try { await module.clear(previousLease, false); } catch { warn(); }
      });
    },
  };
}
