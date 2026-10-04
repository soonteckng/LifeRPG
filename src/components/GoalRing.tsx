import { Text } from "./AppText";
import { StyleSheet, View } from "react-native";
import { colors } from "../constants/theme";
import ProgressRing from "./ProgressRing";

export default function GoalRing({ seconds, targetMinutes, compact = false, size: requestedSize, label }: {
  seconds: number; targetMinutes: number; compact?: boolean; size?: number; label: string;
}) {
  const size = requestedSize ?? (compact ? 156 : 172);
  const progress = Math.max(0, Math.min(1, seconds / Math.max(1, targetMinutes * 60)));
  const clock = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  return <View accessible accessibilityRole="progressbar" accessibilityLabel="Today's goal"
    accessibilityValue={{ min: 0, max: targetMinutes * 60, now: Math.min(seconds, targetMinutes * 60), text: label }}>
    <ProgressRing size={size} progress={progress} stroke={size >= 220 ? 12 : 10} color={progress >= 1 ? "#7BDCC4" : colors.accent}>
      <View style={s.center} importantForAccessibility="no-hide-descendants">
        <Text style={[s.clock, { fontSize: Math.round(size * 0.20) }]} adjustsFontSizeToFit numberOfLines={1} maxFontSizeMultiplier={1.3}>{clock}</Text>
        <Text style={s.target}>of {targetMinutes} min</Text>
      </View>
    </ProgressRing>
  </View>;
}
const s = StyleSheet.create({
  center: { alignItems: "center", paddingHorizontal: 20, gap: 2 },
  clock: { color: colors.text, fontSize: 34, letterSpacing: -1, fontWeight: "600", fontVariant: ["tabular-nums"] },
  target: { color: colors.secondary, fontSize: 16 },
});
