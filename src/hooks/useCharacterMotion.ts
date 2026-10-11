import { useCallback, useContext, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { NavigationContext } from "expo-router/react-navigation";
import { cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useReducedMotion } from "./useReducedMotion";

// UI-thread motion with direct lifecycle cancellation, including frozen tabs.
// The optional screen context also lets the sign-in portrait work before a
// navigator exists; it simply follows the app's foreground state.
export function useCharacterMotion(enabled: boolean, greetOnFocus = false) {
  const reduced = useReducedMotion(), navigation = useContext(NavigationContext);
  const breathe = useSharedValue(0), eyes = useSharedValue(1), wave = useSharedValue(0);
  const gaze = useSharedValue(0), visitGreeted = useRef(false);
  const greet = useCallback(() => {
    if (!enabled || reduced || (AppState.currentState && AppState.currentState !== "active") || (navigation && !navigation.isFocused())) return;
    cancelAnimation(wave); wave.set(0);
    wave.set(withDelay(140, withTiming(1, { duration: 900 })));
  }, [enabled, reduced, navigation, wave]);
  useEffect(() => {
    let foreground = !AppState.currentState || AppState.currentState === "active";
    const stop = () => { cancelAnimation(breathe); cancelAnimation(eyes); cancelAnimation(wave); cancelAnimation(gaze); breathe.set(0); eyes.set(1); wave.set(0); gaze.set(0); };
    const start = () => {
      stop();
      if (!enabled || reduced || !foreground || (navigation && !navigation.isFocused())) return;
      breathe.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true));
      eyes.set(withRepeat(withSequence(withDelay(4300, withTiming(0.08, { duration: 110 })), withTiming(1, { duration: 160 })), -1, false));
      gaze.set(withRepeat(withSequence(
        withDelay(5600, withTiming(2, { duration: 650 })),
        withDelay(1100, withTiming(0, { duration: 650 })),
        withDelay(6200, withTiming(-2, { duration: 650 })),
        withDelay(1100, withTiming(0, { duration: 650 })),
      ), -1, false));
      // The retained Profile tab greets once per visit, not after every profile
      // refresh, editor dismissal or return from the phone's background.
      if (greetOnFocus && !visitGreeted.current) { visitGreeted.current = true; greet(); }
    };
    start();
    const focus = navigation?.addListener("focus", start), blur = navigation?.addListener("blur", () => { visitGreeted.current = false; stop(); });
    const app = AppState.addEventListener("change", state => { foreground = state === "active"; if (foreground) start(); else stop(); });
    return () => { focus?.(); blur?.(); app.remove(); stop(); };
  }, [enabled, reduced, greetOnFocus, navigation, breathe, eyes, wave, gaze, greet]);
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(breathe.get(), [0, 1], [0, -3]) }, { scale: interpolate(breathe.get(), [0, 1], [1, 1.012]) }, { rotate: `${interpolate(wave.get(), [0, 0.25, 0.5, 0.75, 1], [0, -2, 1, -1, 0])}deg` }] }));
  const eyeStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: eyes.get() }, { translateX: gaze.get() }] }));
  const armStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(wave.get(), [0, 0.25, 0.5, 0.75, 1], [0, -10, -10, -10, 0]) }, { rotate: `${interpolate(wave.get(), [0, 0.25, 0.5, 0.75, 1], [-12, -115, -80, -115, -12])}deg` }] }));
  return { bodyStyle, eyeStyle, armStyle, greet };
}
