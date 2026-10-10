import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { FOCUS_AREAS } from "../utils/focusAreas";
import { colors } from "../constants/theme";
import { FOCUS_DIRECTIONS, STUDY_NEEDS, defaultFocusId, focusDirection, focusOptions } from "../constants/guidedQuests";
import type { GuidedPreference } from "../services/guidedPreferenceService";
import { preferenceForFocusMode } from "../utils/focusPreference";

interface ChoiceProps { value: GuidedPreference; onChange: (value: GuidedPreference) => void; disabled?: boolean }
const directionVisuals = {
  learning: { icon: "book-outline" }, work: { icon: "briefcase-outline" },
  creative: { icon: "color-palette-outline" }, "life-admin": { icon: "checkbox-outline" },
  restore: { icon: "leaf-outline" },
} as const;

export function FocusDirectionPicker({ value, onChange, disabled = false, compact = false }: ChoiceProps & { compact?: boolean }) {
  const current = focusDirection(value.need);
  const choose = (direction: (typeof FOCUS_DIRECTIONS)[number]) => onChange(current.id === direction.id ? value : { ...value, areaId: undefined, need: direction.defaultNeed, templateId: defaultFocusId(direction.defaultNeed), smaller: false });
  if (!compact) return <View style={s.directions}>
    <View style={s.directionGrid}>{FOCUS_DIRECTIONS.map(direction => {
      const selected = current.id === direction.id, visual = directionVisuals[direction.id];
      const tint = FOCUS_AREAS[FOCUS_DIRECTIONS.indexOf(direction) + 1].color;
      return <Pressable key={direction.id} disabled={disabled} accessibilityRole="radio" accessibilityLabel={direction.title} accessibilityHint={direction.hint} accessibilityState={{ checked: selected }}
        onPress={() => choose(direction)} style={[s.directionTile, selected && s.selected]}>
        <Ionicons name={visual.icon} size={20} color={tint} />
        <View style={s.tileCopy}><Text style={[s.tileTitle, selected && s.selectedTitle]}>{direction.title}</Text><Text style={s.tileHint}>{direction.hint}</Text></View>
      </Pressable>;
    })}</View>
  </View>;
  return <View style={s.directions}>{FOCUS_DIRECTIONS.map(direction => <Pressable key={direction.id} disabled={disabled}
    accessibilityRole="radio" accessibilityLabel={direction.title} accessibilityHint={direction.hint} accessibilityState={{ checked: current.id === direction.id }}
    onPress={() => choose(direction)}
    style={[s.row, s.compactRow, current.id === direction.id && s.selected]}>
    <Ionicons name={current.id === direction.id ? "radio-button-on" : "radio-button-off"} size={22} color={current.id === direction.id ? colors.accent : colors.secondary} />
    <View style={s.detail}><Text style={s.title}>{direction.title}</Text><Text style={s.body}>{direction.hint}</Text></View>
  </Pressable>)}</View>;
}

export default function GuidedChoice({ value, onChange, disabled = false }: ChoiceProps) {
  const direction = (enabled: boolean, title: string, hint: string, label: string) => <Pressable accessibilityRole="radio" accessibilityLabel={title} accessibilityHint={hint} accessibilityState={{ checked: value.enabled === enabled }} disabled={disabled}
    onPress={() => { if (value.enabled !== enabled) onChange(preferenceForFocusMode(value, enabled)); }} style={[s.modeButton, value.enabled === enabled && s.selected]}>
    <Text style={[s.modeTitle, value.enabled === enabled && s.selectedTitle]}>{label}</Text>
  </Pressable>;
  return <View style={s.group}>
    <View style={s.modeRow}>
      {direction(true, "Help me choose a focus", "A small starting point for work, learning or everyday life.", "Suggestions")}
      {direction(false, "Just let me focus", "Start with Everyday focus. You can choose another area on Home.", "Free focus")}
    </View>
    {value.enabled && <><View style={s.section}><Text style={s.heading}>Choose a direction</Text><FocusDirectionPicker value={value} onChange={onChange} disabled={disabled} /></View>
      <View style={s.section}><Text style={s.heading}>Your starting point</Text>{focusOptions(value.need).map(task => {
        const title = STUDY_NEEDS.find(need => need.id === task.need)?.title ?? task.title;
        const selected = value.templateId === task.id;
        return <Pressable key={task.id} disabled={disabled} accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: selected }}
          onPress={() => onChange({ ...value, areaId: undefined, need: task.need, templateId: task.id, smaller: false })} style={[s.row, s.promptRow, selected && s.selected]}>
          <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={22} color={selected ? colors.accent : colors.secondary} />
          <Text style={[s.title, s.detail]}>{title}</Text>
        </Pressable>;
      })}</View></>}
  </View>;
}
const s = StyleSheet.create({
  group: { gap: 12 }, directions: { gap: 6 }, section: { gap: 6 }, heading: { color: colors.secondary, fontSize: 15, lineHeight: 21 },
  modeRow: { flexDirection: "row", gap: 4, padding: 4, backgroundColor: colors.surfaceRaised, borderRadius: 16 }, modeButton: { flex: 1, minWidth: 0, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10 }, modeTitle: { color: colors.secondary, fontSize: 16, lineHeight: 22, fontWeight: "500", textAlign: "center" },
  directionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, directionTile: { flexBasis: "47%", flexGrow: 1, minWidth: 0, minHeight: 98, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 8 }, tileCopy: { flex: 1, minWidth: 0, gap: 4 }, tileHint: { color: colors.secondary, fontSize: 12, lineHeight: 17 }, tileTitle: { minWidth: 0, color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "500" }, selectedTitle: { color: colors.accent }, directionHint: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 2 },
  row: { paddingHorizontal: 12, paddingVertical: 12, minHeight: 56, borderRadius: 14, gap: 12, flexDirection: "row", alignItems: "center" }, compactRow: { paddingVertical: 9, minHeight: 58 }, promptRow: { minHeight: 52, paddingVertical: 10 },
  selected: { backgroundColor: colors.accentSoft }, detail: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 17, lineHeight: 23, fontWeight: "500", color: colors.text }, body: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
});
