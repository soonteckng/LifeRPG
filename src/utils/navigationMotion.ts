import { Easing } from "react-native";
// Fast response followed by a short, bounded settle, on the native driver.
export function navigationTiming(duration: number) {
  return { duration, useNativeDriver: true, easing: Easing?.out?.(Easing.cubic) };
}
// Growing out of a button: a quick start that lands softly, and a return that
// eases out and in so the page never snaps into its button. No overshoot.
export function zoomTiming(duration: number, closing: boolean) {
  const curve = closing ? Easing?.bezier?.(0.4, 0, 0.2, 1) : Easing?.bezier?.(0.2, 0.9, 0.25, 1);
  return { duration, useNativeDriver: true, easing: curve ?? Easing?.out?.(Easing.cubic) };
}
