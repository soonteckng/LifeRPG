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
    <View style={s.halo}><Ionicons name="checkmark" size={44} color={colors.primary} /></View>
    <Text style={s.title} accessibilityRole="header">You’re in.</Text><Text style={s.body}>Today is ready for you.{"\n"}Make a little room, whenever you like.</Text>
  </Animated.View></SafeAreaView>;
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: 32 }, content: { width: "100%", maxWidth: 460, alignItems: "center", gap: 24 }, halo: { width: 112, height: 112, borderRadius: 56, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }, title: { color: colors.text, fontSize: 40, lineHeight: 48, fontFamily: "display", fontWeight: "400", letterSpacing: -0.8, textAlign: "center" }, body: { color: colors.secondary, fontSize: 17, lineHeight: 22, textAlign: "center" } });
