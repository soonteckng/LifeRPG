import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { colors } from "../constants/theme";
import { STUDY_NEEDS, STARTER_QUESTS } from "../constants/guidedQuests";
import type { GuidedPreference } from "../services/guidedPreferenceService";
export default function GuidedChoice({ value, onChange, disabled = false }: { value: GuidedPreference; onChange: (value: GuidedPreference) => void; disabled?: boolean }) {
  const Button = Pressable;
  const direction = (enabled: boolean, title: string, hint: string) => <Button accessibilityRole="button" accessibilityLabel={title} accessibilityHint={hint} accessibilityState={{ selected: value.enabled === enabled }} disabled={disabled}
    onPress={() => onChange({ ...value, enabled, invited: true })} style={[s.row, value.enabled === enabled && s.selected]}>
    <Ionicons name={value.enabled === enabled ? "radio-button-on" : "radio-button-off"} size={22} color={value.enabled === enabled ? colors.accent : colors.secondary} />
    <View style={s.detail}><Text style={s.title}>{title}</Text><Text style={s.body}>{hint}</Text></View>
  </Button>;
  return <View style={s.group}>
    <Text style={s.heading}>What would you like help with?</Text>
    {direction(true, "Study and assignments", "A few manageable steps to help you begin.")}
    {direction(false, "Just let me focus", "Keep free focus and your own quests.")}
    {value.enabled && <><View style={s.divider} /><Text style={s.heading}>What would help you right now?</Text>{STUDY_NEEDS.map(need => <Button key={need.id} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={need.title} accessibilityHint={need.hint} accessibilityState={{ selected: value.need === need.id }}
      onPress={() => onChange({ ...value, need: need.id, templateId: STARTER_QUESTS.find(task => task.need === need.id)!.id, smaller: false })}
      style={[s.row, s.needRow, value.need === need.id && s.selected]}>
      <Ionicons name={value.need === need.id ? "radio-button-on" : "radio-button-off"} size={22} color={value.need === need.id ? colors.accent : colors.secondary} />
      <Text style={[s.title, s.detail]}>{need.title}</Text>
    </Button>)}</>}
  </View>;
}
const s = StyleSheet.create({ group: { gap: 6 }, heading: { color: colors.secondary, fontSize: 15, lineHeight: 21, marginTop: 8, marginBottom: 4 }, row: { paddingHorizontal: 12, paddingVertical: 12, minHeight: 56, borderRadius: 12, gap: 12, flexDirection: "row", alignItems: "center" }, needRow: { minHeight: 52, paddingVertical: 10 }, selected: { backgroundColor: colors.accentSoft }, detail: { flex: 1, minWidth: 0, gap: 3 }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 4 }, title: { fontSize: 17, lineHeight: 23, fontWeight: "500", color: colors.text }, body: { color: colors.secondary, fontSize: 14, lineHeight: 20 } });
