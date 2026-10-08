import { Easing } from "react-native";
// Fast response followed by a short, bounded settle, on the native driver.
export function navigationTiming(duration: number) {
  return { duration, useNativeDriver: true, easing: Easing?.out?.(Easing.cubic) };
}
