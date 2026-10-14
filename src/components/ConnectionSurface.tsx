import { useLayoutEffect, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { colors } from "../constants/theme";

/** Keep navigation mounted; connectivity changes only the visible surface. */
export default function ConnectionSurface({ localOnly, onlineReady = true, children, offline }: {
  localOnly: boolean; onlineReady?: boolean; children: ReactNode; offline: (active: boolean) => ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const [surface, setSurface] = useState({ localOnly, onlineReady, retained: localOnly || !onlineReady });
  if (surface.localOnly !== localOnly || surface.onlineReady !== onlineReady) {
    setSurface({ localOnly, onlineReady, retained: true });
  }
  const [onlineOpacity] = useState(() => new Animated.Value(localOnly || !onlineReady ? 0 : 1));
  const [offlineOpacity] = useState(() => new Animated.Value(localOnly || !onlineReady ? 1 : 0));
  useLayoutEffect(() => {
    let live = true;
    const toOffline = localOnly || !onlineReady;
    // Let the outgoing page leave before the incoming page becomes readable.
    // Cross-fading two complete layouts made overlapping text look like a jump.
    const leave = reducedMotion ? 0 : 120;
    const enter = reducedMotion ? 0 : 180;
    const animation = Animated.parallel([
      Animated.timing(onlineOpacity, { toValue: toOffline ? 0 : 1, duration: toOffline ? leave : enter, delay: toOffline ? 0 : leave, useNativeDriver: true }),
      Animated.timing(offlineOpacity, { toValue: toOffline ? 1 : 0, duration: toOffline ? enter : leave, delay: toOffline ? leave : 0, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished && live && !localOnly && onlineReady) {
        setSurface(current => current.localOnly === localOnly && current.onlineReady === onlineReady
          ? { ...current, retained: false } : current);
      }
    });
    return () => { live = false; animation.stop(); };
  }, [localOnly, onlineReady, reducedMotion, onlineOpacity, offlineOpacity]);
  return <View style={s.page} testID="connection-surface">
    <Animated.View style={[s.page, { opacity: onlineOpacity }]} pointerEvents={localOnly || !onlineReady ? "none" : "auto"}
      accessibilityElementsHidden={localOnly || !onlineReady} importantForAccessibility={localOnly || !onlineReady ? "no-hide-descendants" : "auto"}
      testID="online-navigation-surface">{children}</Animated.View>
    {(localOnly || surface.retained || !onlineReady) && <Animated.View style={[s.offline, { opacity: offlineOpacity }]}
      pointerEvents={localOnly ? "auto" : "none"} accessibilityElementsHidden={!localOnly}
      importantForAccessibility={localOnly ? "auto" : "no-hide-descendants"} testID="offline-connection-surface">{offline(localOnly)}</Animated.View>}
  </View>;
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background }, offline: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background } });
