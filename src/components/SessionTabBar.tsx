import { Text } from "./AppText";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomTabBar, type BottomTabBarProps } from "expo-router/js-tabs";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../constants/theme";
import { useTimer } from "../context/TimerContext";
import { sessionDockState } from "../utils/sessionReporting";

// This dock occupies layout space inside the tabs, underneath the root modal.
// It cannot draw over Session while Session is entering or leaving.
export default function SessionTabBar(props: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const timer = useTimer();
  const { hasOpenSession, isRunning, isCompleted, sessionSummary } = timer;
  const dock = sessionDockState(timer);
  return <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.fade}>
      {Array.from({length:16}, (_, index) => <View key={index} style={{flex:1, backgroundColor: colors.background, opacity: (index + 1) / 16}} />)}
    </View>
    {(hasOpenSession || (sessionSummary && !timer.summaryViewed)) && <TouchableOpacity style={styles.banner} onPress={() => router.navigate("/session")}
      accessibilityRole="button" accessibilityLabel={isCompleted ? "Open session completion" : isRunning ? "Expand running session" : "Expand paused session"}>
      <Ionicons name={dock.icon} size={20} color={colors.accent} />
      <Text style={styles.title}>{dock.label}</Text>
      <Text style={styles.time}>{dock.detail}</Text>
      <Ionicons name="chevron-up" size={18} color={colors.secondary} />
    </TouchableOpacity>}
    <BottomTabBar {...props} />
  </View>;
}
const styles = StyleSheet.create({
  fade: { position: "absolute", top: -24, left: 0, right: 0, height: 24 },
  dock: { backgroundColor: colors.background, paddingHorizontal: 18, paddingTop: 8, gap: 8 },
  banner: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.accentSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent },
  title: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "500" },
  time: { color: colors.accent, fontSize: 16, fontWeight: "500", flexShrink: 1, fontVariant: ["tabular-nums"] },
});

