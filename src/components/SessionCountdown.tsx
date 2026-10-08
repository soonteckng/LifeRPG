import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { sessionTime } from "../utils/sessionSetup";
import { timerLayout } from "../utils/timerLayout";

// Display-only countdown. Duration editing belongs to FocusLengthControl.
export default function SessionCountdown({ seconds, compact = true, caption }: {
  seconds: number; compact?: boolean; caption?: string;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const { fontSize, labelHeight, rowHeight } = timerLayout(width, height, fontScale, compact);
  return <View testID="duration-display">
    <View style={[s.labels, { height: labelHeight }, compact && { opacity: 0 }]}>
      <Text style={s.unit} maxFontSizeMultiplier={1.4}>Minutes</Text>
      <View style={{ width: 22 }} />
      <Text style={s.unit} maxFontSizeMultiplier={1.4}>Seconds</Text>
    </View>
    <View style={{ height: rowHeight * 3 }}>
      <View testID="session-countdown" accessible accessibilityLabel={sessionTime(seconds)}
        pointerEvents="none" style={[s.digits, { top: rowHeight, height: rowHeight }]}>
        <Text allowFontScaling={false} style={[s.time, { fontSize, height: rowHeight, lineHeight: rowHeight }]}>{sessionTime(seconds)}</Text>
      </View>
    </View>
    {compact && caption && <Text style={[s.caption, { top: labelHeight + rowHeight * 2 + 8 }]}>{caption}</Text>}
    <View style={{ height: 44 }} />
  </View>;
}

const s = StyleSheet.create({
  labels: { flexDirection: "row", alignItems: "center" }, unit: { flex: 1, textAlign: "center", color: colors.secondary, fontSize: 15 },
  digits: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  time: { width: "100%", includeFontPadding: false, textAlignVertical: "center", textAlign: "center", fontVariant: ["tabular-nums"], color: colors.text, fontWeight: "500" },
  caption: { position: "absolute", width: "100%", textAlign: "center", color: colors.secondary, fontSize: 15 },
});
