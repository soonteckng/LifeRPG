import { useContext, useEffect } from "react";
import { AppState } from "react-native";
import { NavigationContext } from "expo-router/react-navigation";
import { cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useReducedMotion } from "./useReducedMotion";

// UI-thread motion with direct lifecycle cancellation, including frozen tabs.
// The optional screen context also lets the sign-in portrait work before a
// navigator exists; it simply follows the app's foreground state.
export function useCharacterMotion(enabled: boolean) {
  const reduced = useReducedMotion(), navigation = useContext(NavigationContext);
  const breathe = useSharedValue(0), eyes = useSharedValue(1), wave = useSharedValue(0);
  useEffect(() => {
    let foreground = !AppState.currentState || AppState.currentState === "active";
    const stop = () => { cancelAnimation(breathe); cancelAnimation(eyes); cancelAnimation(wave); breathe.set(0); eyes.set(1); wave.set(0); };
    const start = () => {
      stop();
      if (!enabled || reduced || !foreground || (navigation && !navigation.isFocused())) return;
      breathe.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true));
      eyes.set(withRepeat(withSequence(withDelay(4300, withTiming(0.08, { duration: 110 })), withTiming(1, { duration: 160 })), -1, false));
    };
    start();
    const focus = navigation?.addListener("focus", start), blur = navigation?.addListener("blur", stop);
    const app = AppState.addEventListener("change", state => { foreground = state === "active"; if (foreground) start(); else stop(); });
    return () => { focus?.(); blur?.(); app.remove(); stop(); };
  }, [enabled, reduced, navigation, breathe, eyes, wave]);
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(breathe.get(), [0, 1], [0, -3]) }, { scale: interpolate(breathe.get(), [0, 1], [1, 1.012]) }] }));
  const eyeStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: eyes.get() }] }));
  const armStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(wave.get(), [0, 0.25, 0.5, 0.75, 1], [-12, -56, -30, -56, -12])}deg` }] }));
  const greet = () => {
    if (!enabled || reduced || (AppState.currentState && AppState.currentState !== "active") || (navigation && !navigation.isFocused())) return;
    cancelAnimation(wave); wave.set(0); wave.set(withTiming(1, { duration: 750 }));
  };
  return { bodyStyle, eyeStyle, armStyle, greet };
}
