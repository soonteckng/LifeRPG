import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// A newly opened screen should reuse the resolved app preference rather than
// briefly changing its animation mode on every mount.
let lastKnownReducedMotion: boolean | undefined;

export function useReducedMotion() {
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
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}
