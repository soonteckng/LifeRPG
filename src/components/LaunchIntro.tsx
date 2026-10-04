import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { colors } from "../constants/theme";

// Keep the native splash until the first LifeRPG frame is ready.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function LaunchIntro({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0.9));
  useEffect(() => {
    let mounted = true;
    let animation: Animated.CompositeAnimation | undefined;
    let brief: ReturnType<typeof setTimeout> | undefined;
    const finish = () => { if (mounted) setVisible(false); };
    const fallback = setTimeout(finish, 2500);
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => true).then((reduced) => {
      if (!mounted) return;
      if (reduced) {
        opacity.setValue(1); scale.setValue(1);
        brief = setTimeout(finish, 350);
        return;
      }
      animation = Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, damping: 16, stiffness: 110, useNativeDriver: true }),
        ]),
        Animated.delay(450),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]);
      animation.start(({ finished }) => { if (finished) finish(); });
    });
    return () => { mounted = false; clearTimeout(fallback); clearTimeout(brief); animation?.stop(); };
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
  orbit: { width: 132, height: 132, borderRadius: 66, borderWidth: 1, borderColor: "rgba(165,180,252,0.3)", alignItems: "center", justifyContent: "center" },
  emblem: { width: 96, height: 96, borderRadius: 32, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] },
  star: { color: colors.accent, fontSize: 58 },
  name: { color: colors.text, fontSize: 38, fontWeight: "700", letterSpacing: -1 },
  subtitle: { color: colors.secondary, fontSize: 15 },
});
