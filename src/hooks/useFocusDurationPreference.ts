import { useCallback, useEffect, useSyncExternalStore } from "react";
import { focusDurationPreferenceStore } from "../services/focusDurationPreference";

export function useFocusDurationPreference(owner: string) {
  const subscribe = useCallback((listener: () => void) => focusDurationPreferenceStore.subscribe(owner, listener), [owner]);
  const snapshot = useCallback(() => focusDurationPreferenceStore.snapshot(owner), [owner]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { void focusDurationPreferenceStore.load(owner); }, [owner]);
  return {
    ...state,
    choose: (seconds: number, custom = false) => focusDurationPreferenceStore.choose(owner, seconds, custom),
    retry: () => focusDurationPreferenceStore.load(owner),
  };
}
