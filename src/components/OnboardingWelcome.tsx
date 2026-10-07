import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Animated, BackHandler, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";

export default function OnboardingWelcome({ owner, onDone }: { owner: string; onDone: () => void }) {
  const reduced = useReducedMotion();
  const [words] = useState(() => [new Animated.Value(reduced ? 1 : 0), new Animated.Value(reduced ? 1 : 0), new Animated.Value(reduced ? 1 : 0)]);
  const [detail] = useState(() => new Animated.Value(reduced ? 1 : 0));
  const [curtain] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => back.remove();
  }, []);
  useEffect(() => {
    let live = true, done = false;
    const key = `liferpg:welcome:v1:${owner}`;
    const finish = () => {
      if (!live || done) return;
      done = true;
      void AsyncStorage.setItem(key, "seen").catch(() => {});
      onDone();
    };
    const animation = Animated.sequence([
      ...words.map(value => Animated.timing(value, { toValue: 1, duration: 260, useNativeDriver: true, isInteraction: false })),
      Animated.timing(detail, { toValue: 1, duration: 420, useNativeDriver: true, isInteraction: false }),
      Animated.delay(800),
      Animated.timing(curtain, { toValue: 0, duration: 320, useNativeDriver: true, isInteraction: false }),
    ]);
    // A missing storage/animation callback must not block the first-run journey.
    const deadline = setTimeout(finish, reduced ? 1000 : 3600);
    void AsyncStorage.getItem(key).then(receipt => {
      if (!live || done) return;
      if (receipt === "seen") { finish(); return; }
      if (reduced) { words.forEach(value => value.setValue(1)); detail.setValue(1); }
      else animation.start(({ finished }) => { if (finished) finish(); });
    }).catch(() => { if (live && !done && !reduced) animation.start(({ finished }) => { if (finished) finish(); }); });
    return () => { live = false; clearTimeout(deadline); animation.stop(); };
  }, [owner, onDone, reduced, words, detail, curtain]);
  return <SafeAreaView style={s.page}><Animated.View testID="onboarding-welcome" style={[s.content, { opacity: curtain }]}>
    <View style={s.halo}><Ionicons name="leaf-outline" size={44} color={colors.accent} /></View>
    <View style={s.words} accessible accessibilityRole="header" accessibilityLabel="Welcome to LifeRPG">
      {["Welcome", "to", "LifeRPG"].map((word, index) => <Animated.View key={word} style={{ opacity: words[index], transform: [{ translateY: reduced ? 0 : words[index].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}><Text style={[s.word, index === 2 && s.brand]}>{word}</Text></Animated.View>)}
    </View>
    <Animated.View style={{ opacity: detail, transform: [{ translateY: reduced ? 0 : detail.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}><Text style={s.detail}>A little space for what matters.{"\n"}A new rhythm, one day at a time.</Text></Animated.View>
  </Animated.View></SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: 32 }, content: { alignItems: "center", gap: 28 },
  halo: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.line },
  words: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 8, rowGap: 4 }, word: { fontSize: 30, lineHeight: 40, fontWeight: "500", letterSpacing: -0.5, color: colors.text }, brand: { color: colors.accent },
  detail: { textAlign: "center", fontSize: 17, lineHeight: 27, color: colors.secondary },
});
