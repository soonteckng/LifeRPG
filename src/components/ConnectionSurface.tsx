import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { colors } from "../constants/theme";
import { navigationTiming } from "../utils/navigationMotion";

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
  const latest = useRef({ localOnly, onlineReady });
  useLayoutEffect(() => { latest.current = { localOnly, onlineReady }; }, [localOnly, onlineReady]);
  const initialized = useRef(false);
  const [onlineOpacity] = useState(() => new Animated.Value(1));
  const [offlineOpacity] = useState(() => new Animated.Value(localOnly || !onlineReady ? 1 : 0));
  useLayoutEffect(() => {
    let live = true;
    // The online page stays opaque underneath. Fade only the offline layer,
    // so there is never an empty frame between the two complete layouts.
    const instant = reducedMotion || !initialized.current;
    initialized.current = true;
    const settle = () => setSurface(current => (current.localOnly || !current.onlineReady) === toOffline
      && (current.retained !== toOffline || current.transitioning)
      ? { ...current, retained: toOffline, transitioning: false } : current);
    if (instant) {
      onlineOpacity.setValue(1); offlineOpacity.setValue(toOffline ? 1 : 0);
      // A layout effect can run alongside the render-time prop latch. Commit
      // the exact incoming props here rather than waiting for an animation.
      const { localOnly, onlineReady } = latest.current;
      setSurface(current => current.localOnly === localOnly && current.onlineReady === onlineReady
        && current.retained === toOffline && !current.transitioning ? current
        : { localOnly, onlineReady, retained: toOffline, transitioning: false });
      return;
    }
    const animation = Animated.timing(offlineOpacity, { toValue: toOffline ? 1 : 0, ...navigationTiming(160) });
    animation.start(({ finished }) => { if (finished && live) settle(); });
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
