import { useEffect, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";
import { appPreferences } from "../services/appPreferences";

// A newly opened screen should reuse the resolved app preference rather than
// briefly changing its animation mode on every mount.
let lastKnownReducedMotion: boolean | undefined;

// The phone's setting, or the app's own Reduce motion switch in Settings.
const appReduced = () => appPreferences.get().reduceMotion;
export function useReducedMotion() {
  const own = useSyncExternalStore(appPreferences.subscribe, appReduced, appReduced);
  const [reduced, setReduced] = useState(lastKnownReducedMotion ?? true);
  useEffect(() => {
    let mounted = true;
    const update = (value: boolean) => {
      lastKnownReducedMotion = value;
      if (mounted) setReduced(value);
    };
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) update(value);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", update);
    void appPreferences.load();
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced || own;
}
