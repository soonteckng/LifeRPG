import AsyncStorage from "@react-native-async-storage/async-storage";
import { MIN_SESSION_SECONDS, MAX_SESSION_SECONDS, validSessionSeconds } from "../utils/sessionSetup";

export interface FocusDurationPreference {
  version: 1;
  presetSeconds: 1800 | 3600;
  customSeconds: number | null;
}
interface State {
  value: FocusDurationPreference;
  selectedSeconds: number;
  ready: boolean;
  error: boolean;
}
interface Storage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}
export const DEFAULT_FOCUS_DURATION: FocusDurationPreference = { version: 1, presetSeconds: 1800, customSeconds: null };
export const focusDurationKey = (owner: string) => `liferpg:focus-duration:v1:${owner}`;
export function parseFocusDurationPreference(raw: string | null): FocusDurationPreference {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value?.version !== 1 || ![1800, 3600].includes(value.presetSeconds) ||
      !(value.customSeconds === null || typeof value.customSeconds === "number" && Number.isInteger(value.customSeconds)
        && value.customSeconds > 0 && value.customSeconds <= MAX_SESSION_SECONDS)) return { ...DEFAULT_FOCUS_DURATION };
    // Only the future editor default changes. Existing sessions and saved
    // routines keep their recorded duration and recovery rules.
    return { version: 1, presetSeconds: value.presetSeconds,
      customSeconds: value.customSeconds === null ? null : Math.max(MIN_SESSION_SECONDS, value.customSeconds) };
  } catch { return { ...DEFAULT_FOCUS_DURATION }; }
}

export function createFocusDurationPreferenceStore(storage: Storage) {
  const empty: State = { value: DEFAULT_FOCUS_DURATION, selectedSeconds: 1800, ready: false, error: false };
  const inactive: State = { ...empty, ready: true };
  const states = new Map<string, State>();
  const listeners = new Map<string, Set<() => void>>();
  const reads = new Map<string, Promise<void>>();
  const writes = new Map<string, Promise<boolean>>();
  const revisions = new Map<string, number>();
  function publish(owner: string, state: State) {
    states.set(owner, state);
    listeners.get(owner)?.forEach(listener => listener());
  }
  const store = {
    snapshot: (owner: string): State => owner ? states.get(owner) ?? empty : inactive,
    subscribe(owner: string, listener: () => void) {
      if (!listeners.has(owner)) listeners.set(owner, new Set());
      listeners.get(owner)!.add(listener);
      return () => { listeners.get(owner)?.delete(listener); };
    },
    async load(owner: string): Promise<void> {
      if (!owner || states.get(owner)?.ready) return;
      const pending = reads.get(owner);
      if (pending) return pending;
      const request = storage.getItem(focusDurationKey(owner)).then(raw => {
        const value = parseFocusDurationPreference(raw);
        // A cold Home starts on the user's last preset, not a session-history row.
        // Custom is a separate remembered editor default until explicitly chosen.
        publish(owner, { value, selectedSeconds: value.presetSeconds, ready: true, error: false });
      }).catch(() => publish(owner, { ...empty, error: true })).finally(() => reads.delete(owner));
      reads.set(owner, request);
      return request;
    },
    choose(owner: string, seconds: number, custom: boolean): Promise<boolean> {
      const before = store.snapshot(owner);
      // Waiting for the initial read prevents a late saved value from replacing
      // a user edit, or a new edit from erasing an unread Custom preference.
      if (!owner || !before.ready || !validSessionSeconds(seconds) || (!custom && seconds !== 1800 && seconds !== 3600)) return Promise.resolve(false);
      const value: FocusDurationPreference = custom ? { ...before.value, customSeconds: seconds } : { ...before.value, presetSeconds: seconds as 1800 | 3600 };
      const revision = (revisions.get(owner) ?? 0) + 1;
      revisions.set(owner, revision);
      publish(owner, { value, selectedSeconds: seconds, ready: true, error: false });
      // Persist quick consecutive preset/custom edits in order, so an older
      // AsyncStorage completion cannot restore the wrong default on restart.
      const request = (writes.get(owner) ?? Promise.resolve(true)).then(async () => {
        try { await storage.setItem(focusDurationKey(owner), JSON.stringify(value)); return true; }
        catch {
          if (revisions.get(owner) === revision) publish(owner, { ...store.snapshot(owner), error: true });
          return false;
        }
      });
      writes.set(owner, request);
      void request.finally(() => { if (writes.get(owner) === request) writes.delete(owner); });
      return request;
    },
  };
  return store;
}

export const focusDurationPreferenceStore = createFocusDurationPreferenceStore(AsyncStorage);
