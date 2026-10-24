import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

// Buttons, portraits and screens all follow the same OS setting. Reading it
// and adding a native listener for every button made large lists expensive to
// open. Share one subscription, retaining the last value between screens.
let reducedMotion = true;
const listeners = new Set<() => void>();
let subscription: ReturnType<typeof AccessibilityInfo.addEventListener> | null = null;
let lifetime: object | null = null;
const snapshot = () => reducedMotion;
const serverSnapshot = () => true;

function publish(value: boolean) {
  if (reducedMotion === value) return;
  reducedMotion = value;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!subscription) {
    const current = {};
    lifetime = current;
    let changed = false;
    subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
      if (lifetime !== current) return;
      changed = true;
      publish(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      // A slow initial read must not override a newer accessibility event, or
      // update a later subscription after all previous consumers unmounted.
      if (lifetime === current && !changed) publish(value);
    }).catch(() => {});
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    lifetime = null;
    subscription?.remove();
    subscription = null;
  };
}

// Only the phone's own accessibility setting. Unknown means no motion until
// resolved, and every mounted consumer reacts to an OS change together.
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
