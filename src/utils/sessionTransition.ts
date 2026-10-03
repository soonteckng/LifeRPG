import { Platform } from "react-native";

export function sessionNativeOptions() {
  return {
    // Retain Home's native surface under the moving screen. This changes view
    // retention, not the already-configured direction or navigation action.
    presentation: "transparentModal" as const,
    // The retained Session surface owns entrance, interactive drag and exit.
    animation: "none" as const,
    gestureEnabled: false,
    freezeOnBlur: false,
    contentStyle: { backgroundColor: "transparent" },
  };
}

// Opt in only while investigating native transitions; normal Expo Go stays quiet.
const transitionDebug =
  __DEV__ && process.env.EXPO_PUBLIC_DEBUG_SESSION_TRANSITIONS === "true";

export function traceSession(
  event: string,
  details: Record<string, unknown> = {},
) {
  if (transitionDebug)
    console.debug("[Session transition]", event, {
      at: Date.now(),
      ...details,
    });
}

// Android pages keep their opaque surface until their controlled exit finishes.
// iOS keeps native horizontal navigation and its edge-back gesture.
export function secondaryNativeOptions(reducedMotion: boolean) {
  return {
    presentation:
      Platform.OS === "android"
        ? ("transparentModal" as const)
        : ("card" as const),
    animation:
      Platform.OS === "android" || reducedMotion
        ? ("none" as const)
        : ("slide_from_right" as const),
    freezeOnBlur: false,
    contentStyle: {
      backgroundColor: Platform.OS === "android" ? "transparent" : "#0B0D13",
    },
  };
}
