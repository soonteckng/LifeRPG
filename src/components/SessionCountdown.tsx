import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "./AppText";
import { colors, sceneInk } from "../constants/theme";
import { sessionTime } from "../utils/sessionSetup";
import { timerLayout } from "../utils/timerLayout";

// Display-only countdown. Duration editing belongs to FocusLengthControl.
export default function SessionCountdown({ seconds, compact = true, caption, onScene = false, serif = false, progress }: {
  seconds: number; compact?: boolean; caption?: string;
  /** The running timer in Newsreader, inside the arch. */
  serif?: boolean;
  /** Share of the session done, drawn as one smooth bar under the digits (Round 86). */
  progress?: number;
  /** Over the dark session scene: light digits. */
  onScene?: boolean;
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
        <Text allowFontScaling={false} style={[s.time, { fontSize, height: rowHeight, lineHeight: rowHeight }, serif && s.serif, onScene && { color: sceneInk.text }]}>{sessionTime(seconds)}</Text>
      </View>
    </View>
    {progress !== undefined && <View testID="session-progress-line" style={[s.lineRow, { top: labelHeight + rowHeight * 2 + 8 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.line}><View style={[s.lineFill, { width: `${Math.round(Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)) * 100)}%` }]} /></View>
    </View>}
    {compact && caption && <Text style={[s.caption, { top: labelHeight + rowHeight * 2 + (progress !== undefined ? 20 : 8) }, onScene && { color: sceneInk.secondary }]}>{caption}</Text>}
    <View style={{ height: 44 }} />
  </View>;
}

const s = StyleSheet.create({
  labels: { flexDirection: "row", alignItems: "center" }, unit: { flex: 1, textAlign: "center", color: colors.secondary, fontSize: 15 },
  digits: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  time: { width: "100%", includeFontPadding: false, textAlignVertical: "center", textAlign: "center", fontVariant: ["tabular-nums"], color: colors.text, fontWeight: "500" },
  serif: { fontFamily: "display", fontWeight: "400" },
  lineRow: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  line: { width: 200, maxWidth: "80%", height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: "rgba(59,39,55,0.16)" },
  lineFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  caption: { position: "absolute", width: "100%", textAlign: "center", color: colors.secondary, fontSize: 15 },
});
