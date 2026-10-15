import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { colors } from "../constants/theme";

/** Keep navigation mounted; connectivity changes only the visible surface. */
export default function ConnectionSurface({ localOnly, onlineReady = true, children, offline }: {
  localOnly: boolean; onlineReady?: boolean; children: ReactNode; offline: (active: boolean) => ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const toOffline = localOnly || !onlineReady;
  const [surface, setSurface] = useState({ localOnly, onlineReady, retained: toOffline, transitioning: false });
  if (surface.localOnly !== localOnly || surface.onlineReady !== onlineReady) {
    const changesVisibleSurface = (surface.localOnly || !surface.onlineReady) !== toOffline;
    setSurface({ localOnly, onlineReady, retained: toOffline || surface.retained || changesVisibleSurface,
      transitioning: surface.transitioning || changesVisibleSurface });
  }
  const initialized = useRef(false);
  const [onlineOpacity] = useState(() => new Animated.Value(localOnly || !onlineReady ? 0 : 1));
  const [offlineOpacity] = useState(() => new Animated.Value(localOnly || !onlineReady ? 1 : 0));
  useLayoutEffect(() => {
    let live = true;
    // Let the outgoing page leave before the incoming page becomes readable.
    // Cross-fading two complete layouts made overlapping text look like a jump.
    const instant = reducedMotion || !initialized.current;
    initialized.current = true;
    const leave = instant ? 0 : 90;
    const enter = instant ? 0 : 170;
    const animation = Animated.parallel([
      Animated.timing(onlineOpacity, { toValue: toOffline ? 0 : 1, duration: toOffline ? leave : enter, delay: toOffline ? 0 : leave, useNativeDriver: true }),
      Animated.timing(offlineOpacity, { toValue: toOffline ? 1 : 0, duration: toOffline ? enter : leave, delay: toOffline ? leave : 0, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished && live) {
        setSurface(current => (current.localOnly || !current.onlineReady) === toOffline
          ? { ...current, retained: toOffline, transitioning: false } : current);
      }
    });
    return () => { live = false; animation.stop(); };
  }, [toOffline, reducedMotion, onlineOpacity, offlineOpacity]);
  const onlineInteractive = !toOffline && !surface.transitioning;
  const offlineInteractive = localOnly && !surface.transitioning;
  return <View style={s.page} testID="connection-surface">
    <Animated.View style={[s.page, { opacity: onlineOpacity }]} pointerEvents={onlineInteractive ? "auto" : "none"}
      accessibilityElementsHidden={!onlineInteractive} importantForAccessibility={onlineInteractive ? "auto" : "no-hide-descendants"}
      testID="online-navigation-surface">{children}</Animated.View>
    {(localOnly || surface.retained || !onlineReady) && <Animated.View style={[s.offline, { opacity: offlineOpacity }]}
      pointerEvents={offlineInteractive ? "auto" : "none"} accessibilityElementsHidden={!offlineInteractive}
      importantForAccessibility={offlineInteractive ? "auto" : "no-hide-descendants"} testID="offline-connection-surface">{offline(localOnly)}</Animated.View>}
  </View>;
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background }, offline: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background } });
