import { View, StyleSheet } from "react-native";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { colors } from "../constants/theme";
import { STUDY_NEEDS, STARTER_QUESTS } from "../constants/guidedQuests";
import type { GuidedPreference } from "../services/guidedPreferenceService";
export default function GuidedChoice({ value, onChange, disabled = false }: { value: GuidedPreference; onChange: (value: GuidedPreference) => void; disabled?: boolean }) {
  return <View style={s.group}>
    <Text style={s.heading}>What would you like help with?</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ selected: value.enabled }} disabled={disabled}
      onPress={() => onChange({ ...value, enabled: true, invited: true })} style={[s.row, value.enabled && s.selected]}>
      <Text style={s.title}>Study and assignments</Text><Text style={s.body}>A few manageable steps to help you begin.</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !value.enabled }} disabled={disabled}
      onPress={() => onChange({ ...value, enabled: false, invited: true })} style={[s.row, !value.enabled && s.selected]}>
      <Text style={s.title}>Just let me focus</Text><Text style={s.body}>Keep free focus and your own quests.</Text>
    </Pressable>
    {value.enabled && <><Text style={s.heading}>What would help you right now?</Text>{STUDY_NEEDS.map(need => <Pressable key={need.id} disabled={disabled}
      accessibilityRole="button" accessibilityState={{ selected: value.need === need.id }}
      onPress={() => onChange({ ...value, need: need.id, templateId: STARTER_QUESTS.find(task => task.need === need.id)!.id, smaller: false })}
      style={[s.row, value.need === need.id && s.selected]}><Text style={s.title}>{need.title}</Text><Text style={s.body}>{need.hint}</Text></Pressable>)}</>}
  </View>;
}
const s = StyleSheet.create({ group: { gap: 10 }, heading: { color: colors.secondary, fontSize: 15, lineHeight: 21, marginTop: 12 }, row: { padding: 14, minHeight: 64, borderRadius: 16, gap: 4, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, title: { fontSize: 17, lineHeight: 23, fontWeight: "500", color: colors.text }, body: { color: colors.secondary, fontSize: 14, lineHeight: 20 } });
