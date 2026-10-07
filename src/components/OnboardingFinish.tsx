import { useEffect, useState } from "react";
import { Animated, BackHandler, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
export default function OnboardingFinish({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => { const back = BackHandler.addEventListener("hardwareBackPress", () => true); return () => back.remove(); }, []);
  useEffect(() => {
    if (reduced) { onDone(); return; }
    opacity.setValue(0); scale.setValue(0.94);
    const animation = Animated.sequence([
      Animated.parallel([Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }), Animated.timing(scale, { toValue: 1, duration: 500, useNativeDriver: true })]),
      Animated.delay(650),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true, isInteraction: false }),
    ]);
    let alive = true, done = false;
    const finish = () => { if (alive && !done) { done = true; onDone(); } };
    const deadline = setTimeout(finish, 1900);
    animation.start(({ finished }) => { if (finished) finish(); });
    return () => { alive = false; clearTimeout(deadline); animation.stop(); };
  }, [onDone, opacity, scale, reduced]);
  return <SafeAreaView style={s.page}><Animated.View testID="onboarding-finish" style={[s.content, { opacity, transform: [{ scale }] }]} accessibilityLiveRegion="polite">
    <View style={s.halo}><Ionicons name="checkmark" size={44} color={colors.accent} /></View>
    <Text style={s.title} accessibilityRole="header">You’re ready.</Text><Text style={s.body}>A little focus. A little growth.{"\n"}Your journey starts here.</Text>
  </Animated.View></SafeAreaView>;
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: 32 }, content: { width: "100%", maxWidth: 460, alignItems: "center", gap: 24 }, halo: { width: 112, height: 112, borderRadius: 56, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }, title: { fontSize: 34, lineHeight: 42, fontWeight: "500", letterSpacing: -0.7, color: colors.text, textAlign: "center" }, body: { color: colors.secondary, fontSize: 18, lineHeight: 28, textAlign: "center" } });
