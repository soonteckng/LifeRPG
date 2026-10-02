import { Platform } from "react-native";

export function sessionNativeOptions(reducedMotion: boolean) {
  return {
    // Retain Home's native surface under the moving screen. This changes view
    // retention, not the already-configured direction or navigation action.
    presentation: "transparentModal" as const,
    animation: Platform.OS === "android" ? "none" as const : reducedMotion ? "fade" as const : "slide_from_bottom" as const,
    gestureDirection: "vertical" as const,
    animationMatchesGesture: true,
    freezeOnBlur: false,
    contentStyle: { backgroundColor: "transparent" },
  };
}

// Opt in only while investigating native transitions; normal Expo Go stays quiet.
const transitionDebug = __DEV__ && process.env.EXPO_PUBLIC_DEBUG_SESSION_TRANSITIONS === "true";

export function traceSession(event: string, details: Record<string, unknown> = {}) {
  if (transitionDebug) console.debug("[Session transition]", event, { at: Date.now(), ...details });
}
