import { StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/theme";

// Native views keep this OTA-compatible: no new native drawing dependency.
export default function GoalRing({ seconds, targetMinutes, compact = false, label }: {
  seconds: number; targetMinutes: number; compact?: boolean; label: string;
}) {
  const size = compact ? 172 : 204;
  const radius = size / 2 - 9;
  const progress = Math.max(0, Math.min(1, seconds / Math.max(1, targetMinutes * 60)));
  const count = 72;
  const clock = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  return <View style={{ width: size, height: size }} accessible accessibilityRole="progressbar"
    accessibilityLabel="Today's goal" accessibilityValue={{ min: 0, max: targetMinutes * 60, now: Math.min(seconds, targetMinutes * 60), text: label }}>
    {Array.from({ length: count }, (_, index) => {
      const angle = index / count * Math.PI * 2;
      return <View key={index} style={{ position: "absolute", width: 5, height: 12, borderRadius: 3,
        left: size / 2 + Math.sin(angle) * radius - 2.5,
        top: size / 2 - Math.cos(angle) * radius - 6,
        transform: [{ rotate: `${index / count * 360}deg` }],
        backgroundColor: index < Math.ceil(progress * count) ? progress >= 1 ? "#7BDCC4" : colors.accent : colors.line }} />;
    })}
    <View style={s.center} importantForAccessibility="no-hide-descendants">
      <Text style={s.eyebrow}>{"TODAY'S GOAL"}</Text>
      <Text style={[s.clock, compact && { fontSize: 32 }]} adjustsFontSizeToFit numberOfLines={1} maxFontSizeMultiplier={1.3}>{clock}</Text>
      <Text style={s.target}>of {targetMinutes} min</Text>
    </View>
  </View>;
}
const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 25, gap: 5 },
  eyebrow: { color: colors.secondary, fontSize: 10, letterSpacing: 1.1, fontWeight: "600" },
  clock: { color: colors.text, fontSize: 39, letterSpacing: -1.5, fontWeight: "600", fontVariant: ["tabular-nums"] },
  target: { color: colors.secondary, fontSize: 13 },
});
