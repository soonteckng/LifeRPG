import { Text } from "./AppText";
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { colors } from "../constants/theme";
import { loadLaunchUpdate, prepareLaunchUpdate } from "../services/launchUpdate";

// The intro waits at most this long for a newer update, so a slow network
// never holds up the app. A later download still applies on the next open.
const UPDATE_WAIT_MS = 3000;

// Keep the native splash until the first LifeRPG frame is ready.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function LaunchIntro({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0.9));
  useEffect(() => {
    let mounted = true, reduced = false;
    let animation: Animated.CompositeAnimation | undefined;
    // The intro leaves once its animation has played and the update check has
    // settled. A ready update loads straight away, before anything is touched,
    // so a new version arrives on the first open instead of the second. The
    // logo stays on screen while the check finishes, never a blank page.
    let played = false, checked = false, leaving = false;
    const leave = () => {
      if (!mounted || !played || !checked || leaving) return;
      leaving = true;
      if (reduced) { setVisible(false); return; }
      animation = Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true });
      animation.start(() => { if (mounted) setVisible(false); });
    };
    const settle = () => { checked = true; leave(); };
    void prepareLaunchUpdate(UPDATE_WAIT_MS).then(ready => {
      if (!mounted) return;
      if (ready) void loadLaunchUpdate().finally(settle); else settle();
    });
    // Whatever happens, the app is never held behind the intro.
    const playedFallback = setTimeout(() => { played = true; leave(); }, 2500);
    const fallback = setTimeout(() => { played = true; checked = true; leave(); }, UPDATE_WAIT_MS + 1500);
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => true).then(isReduced => {
      if (!mounted) return;
      reduced = isReduced;
      if (reduced) { opacity.setValue(1); scale.setValue(1); setTimeout(() => { played = true; leave(); }, 350); return; }
      animation = Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, damping: 16, stiffness: 110, useNativeDriver: true }),
        ]),
        Animated.delay(450),
      ]);
      animation.start(({ finished }) => { if (finished) { played = true; leave(); } });
    });
    return () => { mounted = false; clearTimeout(playedFallback); clearTimeout(fallback); animation?.stop(); };
  }, [opacity, scale]);
  return <View style={{ flex: 1 }}>
    <View style={{ flex: 1 }} accessibilityElementsHidden={visible} importantForAccessibility={visible ? "no-hide-descendants" : "auto"}>{children}</View>
    {visible && <View style={s.screen} testID="launch-intro" onLayout={() => { void SplashScreen.hideAsync().catch(() => {}); }}>
      <Animated.View style={{ alignItems: "center", gap: 20, opacity, transform: [{ scale }] }}>
        <View style={s.orbit}><View style={s.emblem}><Text style={s.star}>✦</Text></View></View>
        <Text style={s.name} accessibilityRole="header">LifeRPG</Text>
        <Text style={s.subtitle}>Your effort, reflected.</Text>
      </Animated.View>
    </View>}
  </View>;
}
const s = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 100, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24 },
  orbit: { width: 132, height: 132, borderRadius: 66, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  emblem: { width: 96, height: 96, borderRadius: 32, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] },
  star: { color: colors.accent, fontSize: 58 },
  name: { color: colors.text, fontSize: 38, fontWeight: "500", letterSpacing: -1 },
  subtitle: { color: colors.secondary, fontSize: 15 },
});
