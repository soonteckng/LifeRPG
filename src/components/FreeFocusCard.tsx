import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { colors } from "../constants/theme";

export default function FreeFocusCard({ duration, area, tint, active, running, starting, blocked, disabled, changeDisabled, restoring, failed, error, onChange, onStart }: {
  duration: string; area: string; tint: string; active: boolean; running: boolean;
  starting: boolean; blocked: boolean; disabled: boolean; changeDisabled: boolean; restoring: boolean;
  failed: boolean; error?: string; onChange: () => void; onStart: () => void;
}) {
  const locked = starting || (!active && disabled);
  return <View style={s.card} testID="home-quick-start">
    <View style={s.heading}>
      <Text style={s.label}>{active ? running ? "In focus" : "Paused" : "Ready to focus"}</Text>
      {!active && <Pressable testID="home-change-focus" style={s.change} onPress={onChange} disabled={changeDisabled}
        accessibilityRole="button" accessibilityLabel={blocked ? "Check session status" : "Change duration or area"}>
        <Ionicons name={blocked ? "alert-circle-outline" : "options-outline"} size={18} color={colors.accent} /><Text style={s.changeText}>{blocked ? "Check" : "Change"}</Text>
      </Pressable>}
    </View>
    <View style={s.introduction}>
      <Text style={s.title} accessibilityRole="header">{active ? "One thing at a time." : "Your focus, your way."}</Text>
      <Text style={s.body}>{active ? running ? "Your block is in progress. Return to your session whenever you’re ready." : "Your session is paused. Continue when you’re ready; your time and Life area are kept." : "Choose one thing to work on. Your time and Life area are ready below."}</Text>
    </View>
    <View style={s.details} testID="free-focus-details">
      <View style={s.detail} accessible accessibilityLabel={`${active ? "Time remaining" : "Duration"}: ${duration}`}>
        <Text style={s.detailLabel}>{active ? "Time remaining" : "Duration"}</Text>
        <View style={s.valueRow}><Ionicons name="timer-outline" size={18} color={colors.accent} /><Text style={s.duration} numberOfLines={2}>{duration}</Text></View>
      </View>
      <View style={s.detail} accessible accessibilityLabel={`Life area: ${area}`}>
        <Text style={s.detailLabel}>Life area</Text>
        <View style={s.valueRow}><View style={[s.dot, { backgroundColor: tint }]} /><Text style={s.area} numberOfLines={2}>{area}</Text></View>
      </View>
    </View>
    <Pressable testID="home-start-focus" style={[s.primary, locked && s.disabled]} onPress={onStart} disabled={locked}
      accessibilityRole="button" accessibilityState={{ disabled: locked, busy: starting }} accessibilityLabel={active ? "Continue session" : `Start ${duration}, ${area}`}>
      <Ionicons name="play-outline" size={22} color="#171827" /><Text style={s.primaryText}>{active ? "Continue session" : starting ? "Starting…" : failed ? "Retry start" : restoring ? "Restoring session…" : "Start focus"}</Text>
    </Pressable>
    {failed && <Text accessibilityRole="alert" style={s.error}>{error ?? "Couldn't start. Please try again."}</Text>}
  </View>;
}
const s = StyleSheet.create({
  card: { width: "100%", padding: 18, borderRadius: 24, gap: 16, backgroundColor: "#171E2B", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(225,235,255,0.16)" },
  heading: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, label: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "500", flexShrink: 1 },
  change: { minHeight: 44, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, changeText: { color: colors.accent, fontSize: 15, lineHeight: 21, fontWeight: "500" },
  introduction: { gap: 8 }, title: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "500", letterSpacing: -0.5 }, body: { color: colors.secondary, fontSize: 16, lineHeight: 23 },
  details: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, detail: { flexGrow: 1, flexBasis: 105, minWidth: 0, padding: 12, borderRadius: 14, gap: 6, backgroundColor: "rgba(255,255,255,0.04)" },
  detailLabel: { color: colors.secondary, fontSize: 13, lineHeight: 18 }, valueRow: { flexDirection: "row", alignItems: "center", gap: 7 }, duration: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "500", fontVariant: ["tabular-nums"], flexShrink: 1 }, area: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: "500", flexShrink: 1 }, dot: { width: 7, height: 7, borderRadius: 4 },
  primary: { minHeight: 52, padding: 14, borderRadius: 16, backgroundColor: "#E5E4FF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, primaryText: { color: "#171827", fontSize: 17, lineHeight: 23, fontWeight: "500", flexShrink: 1, textAlign: "center" },
  disabled: { opacity: 0.5 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
