import { useCallback, useEffect, useSyncExternalStore } from "react";
import { guidedPreferenceStore, type GuidedPreference } from "../services/guidedPreferenceService";
export function useGuidedPreference(owner: string) {
  const subscribe = useCallback((listener: () => void) => guidedPreferenceStore.subscribe(owner, listener), [owner]);
  const snapshot = useCallback(() => guidedPreferenceStore.snapshot(owner), [owner]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { void guidedPreferenceStore.load(owner); }, [owner]);
  return { ...state, save: (value: GuidedPreference) => guidedPreferenceStore.save(owner, value), retry: () => guidedPreferenceStore.load(owner) };
}
