import { Redirect, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { traceSession } from "../utils/sessionTransition";

// Minimal native-stack reproduction: no timer, removal guard, local back
// handler, sheets, conditional content, or JS screen animation.
export default function SessionTransitionTest() {
  const navigation = useNavigation();
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const reduced = useReducedMotion();
  useEffect(() => {
    traceSession("repro mount", { mode });
    return () => traceSession("repro React unmount", { mode });
  }, [mode]);
  if (!__DEV__) return <Redirect href="/" />;
  return <SafeAreaView collapsable={false} style={styles.screen}>
    <Text style={styles.title}>Native transition test</Text>
    <Text style={styles.text}>Mode: {mode === "card" ? "Card baseline" : "Retained Home"}. Reduced motion: {String(reduced)}.</Text>
    <View style={styles.marker}><Text style={styles.title}>Watch this entire surface slide down</Text></View>
    <Text style={styles.text}>Try this button, then reopen and try Android back. Home should remain visible underneath. Compare both modes from Home.</Text>
    <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => {
      const state = navigation.getState();
      traceSession("repro header close", { navigator: state?.key, routes: state?.routes.map(r => r.name) });
      navigation.goBack();
    }}><Text style={styles.title}>Close test</Text></TouchableOpacity>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 24, gap: 24 },
  title: { color: colors.text, fontSize: 22, fontWeight: "600" }, text: { color: colors.secondary, fontSize: 16, lineHeight: 24 },
  marker: { flex: 1, backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accent, padding: 24, justifyContent: "center" },
  button: { padding: 18, backgroundColor: colors.surface, borderRadius: 16 },
});
