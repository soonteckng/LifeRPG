import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import type { GlassViewProps } from "expo-glass-effect";
import type { ComponentType } from "react";

// Native liquid glass on compatible iOS; a deliberately denser, shaded material
// elsewhere. Android's fallback is translucent shading, not a claimed live blur.
export default function GlassSurface({radius = 24}: {radius?: number}) {
  const [opaque, setOpaque] = useState(Platform.OS === "ios");
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let mounted = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {if (mounted) setOpaque(value);}).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setOpaque);
    return () => {mounted = false; subscription.remove();};
  }, []);
  const NativeGlass = useMemo(() => {
    if (Platform.OS !== "ios" || opaque) return null;
    try {
      // Existing dependency; don't evaluate its native entry on Android.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const glass = require("expo-glass-effect") as typeof import("expo-glass-effect");
      return glass.isLiquidGlassAvailable() ? glass.GlassView as ComponentType<GlassViewProps> : null;
    } catch { return null; }
  }, [opaque]);
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
    testID="glass-surface" style={[StyleSheet.absoluteFill, {borderRadius:radius, overflow:"hidden", backgroundColor:opaque ? "#1B2230" : NativeGlass ? "transparent" : "rgba(24,30,44,0.94)", borderWidth:StyleSheet.hairlineWidth, borderColor:"rgba(225,235,255,0.20)"}]}>
    {NativeGlass && <NativeGlass style={StyleSheet.absoluteFill} glassEffectStyle="regular" tintColor="rgba(24,30,44,0.75)" colorScheme="dark" />}
    {!opaque && <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs><LinearGradient id="surfaceSheen" x1="0" y1="0" x2="0.7" y2="1"><Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.10} /><Stop offset="0.45" stopColor="#C9D5FF" stopOpacity={0.025} /><Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} /></LinearGradient></Defs>
      <Rect width="100" height="100" fill="url(#surfaceSheen)" />
    </Svg>}
  </View>;
}
