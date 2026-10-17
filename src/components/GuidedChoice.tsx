import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { FOCUS_AREAS } from "../utils/focusAreas";
import { colors } from "../constants/theme";
import { FOCUS_DIRECTIONS, STUDY_NEEDS, focusDirection, focusOptions } from "../constants/guidedQuests";
import type { GuidedPreference } from "../services/guidedPreferenceService";
import { preferenceForFocusDirection, preferenceForFocusMode } from "../utils/focusPreference";

interface ChoiceProps { value: GuidedPreference; onChange: (value: GuidedPreference) => void; disabled?: boolean; onSelection?: () => void }
const directionVisuals = {
  learning: { icon: "book-outline" }, work: { icon: "briefcase-outline" },
  creative: { icon: "color-palette-outline" }, "life-admin": { icon: "checkbox-outline" },
  restore: { icon: "leaf-outline" },
} as const;

export function FocusDirectionPicker({ value, onChange, disabled = false, compact = false, includeFreeFocus = false, onSelection }: ChoiceProps & { compact?: boolean; includeFreeFocus?: boolean; onSelection?: () => void }) {
  const current = focusDirection(value.need);
  const choose = (direction: (typeof FOCUS_DIRECTIONS)[number] | null) => {
    if (disabled) return;
    onSelection?.();
    onChange(direction ? preferenceForFocusDirection(value, direction) : preferenceForFocusMode(value, false));
  };
  const selectedDirection = (id: string) => (!includeFreeFocus || value.enabled) && current.id === id;
  const directions = includeFreeFocus ? [...FOCUS_DIRECTIONS, null] : FOCUS_DIRECTIONS;
  if (!compact) return <View style={s.directions}>
    <View style={s.directionGrid}>{directions.map(direction => {
      const selected = direction ? selectedDirection(direction.id) : !value.enabled;
      const visual = direction ? directionVisuals[direction.id] : { icon: "sparkles-outline" as const };
      const tint = FOCUS_AREAS.find(area => area.title === direction?.title)?.color ?? FOCUS_AREAS[0].color;
      const title = direction?.title ?? "Free focus";
      const hint = direction?.hint ?? "Your own idea, at your own pace.";
      // Compact tiles leave the next section in view, so the sheet reads as scrollable.
      return <Pressable key={direction?.id ?? "free-focus"} disabled={disabled} accessibilityRole="radio" accessibilityLabel={title} accessibilityHint={hint} accessibilityState={{ checked: selected, disabled }}
        onPress={() => choose(direction)} style={[s.directionTile, selected && s.selected]}>
        <View style={[s.tileIcon, { backgroundColor: tint + "1F" }]}><Ionicons name={visual.icon} size={18} color={tint} /></View>
        <Text style={[s.tileTitle, selected && s.selectedTitle]} numberOfLines={2}>{title}</Text>
      </Pressable>;
    })}</View>
  </View>;
  return <View style={s.directions}>{FOCUS_DIRECTIONS.map(direction => <Pressable key={direction.id} disabled={disabled}
    accessibilityRole="radio" accessibilityLabel={direction.title} accessibilityHint={direction.hint} accessibilityState={{ checked: selectedDirection(direction.id), disabled }}
    onPress={() => choose(direction)}
    style={[s.row, s.compactRow, selectedDirection(direction.id) && s.selected]}>
    <Ionicons name={selectedDirection(direction.id) ? "radio-button-on" : "radio-button-off"} size={22} color={selectedDirection(direction.id) ? colors.accent : colors.secondary} />
    <View style={s.detail}><Text style={s.title}>{direction.title}</Text><Text style={s.body}>{direction.hint}</Text></View>
  </Pressable>)}</View>;
}

export default function GuidedChoice({ value, onChange, disabled = false, onSelection }: ChoiceProps) {
  const direction = focusDirection(value.need);
  return <View style={s.group}>
    <View style={s.section}><Text style={s.heading}>Direction</Text><FocusDirectionPicker value={value} onChange={onChange} disabled={disabled} includeFreeFocus onSelection={onSelection} /></View>
    <View style={s.section}>
      <View style={s.startingPointHeader}><Text style={s.heading}>Suggested first step</Text>
        <Text style={s.body}>{value.enabled ? `${direction.hint} Your choice shows on Home as the suggestion.` : "No suggestion. Bring your own idea and choose your time on Home."}</Text></View>
      {!value.enabled ? <View style={s.freeRow}>
        <View style={[s.tileIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="sparkles-outline" size={18} color={colors.accent} /></View>
        <Text style={[s.body, s.flexText]}>Sessions count toward Everyday focus, a simple category for any activity.</Text>
      </View> : focusOptions(value.need).map(task => {
        const studyNeed = STUDY_NEEDS.find(need => need.id === task.need);
        const title = studyNeed?.title ?? task.title;
        const hint = studyNeed?.hint ?? startingPointHints[task.id];
        const selected = value.templateId === task.id;
        return <Pressable key={task.id} disabled={disabled} accessibilityRole="radio" accessibilityLabel={title} accessibilityHint={hint} accessibilityState={{ checked: selected, disabled }}
          onPress={() => { if (disabled) return; onSelection?.(); onChange({ ...value, areaId: undefined, need: task.need, templateId: task.id, smaller: false }); }} style={[s.promptRow, selected && s.selectedPrompt]}>
          <View style={s.detail}><Text style={[s.promptTitle, selected && s.selectedTitle]}>{title}</Text><Text style={s.body}>{hint}</Text></View>
          <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? colors.accent : colors.muted} />
        </Pressable>;
      })}
    </View>
  </View>;
}
const startingPointHints: Record<string, string> = {
  "project-next-step": "Pick the next unfinished part of your project.",
  "work-priority": "Give one useful task your attention.",
  "creative-first-draft": "Write, sketch or build a rough first idea.",
  "creative-practice": "Spend a little time practising a skill you enjoy.",
  "life-small-task": "Take care of a form, plan or small everyday task.",
  "life-reset-space": "Put one part of your space back in order.",
  "quiet-screen-free": "Read, journal, move gently or take time to recharge.",
};
const s = StyleSheet.create({
  group: { gap: 24 }, directions: { gap: 6 }, section: { gap: 10 },
  heading: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  directionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  directionTile: { flexBasis: "47%", flexGrow: 1, minWidth: 0, minHeight: 60, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.sheetCard, borderWidth: 1, borderColor: "transparent", flexDirection: "row", alignItems: "center", gap: 10 },
  tileIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tileTitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "500" }, selectedTitle: { color: colors.accent },
  row: { paddingHorizontal: 12, paddingVertical: 12, minHeight: 56, borderRadius: 14, gap: 12, flexDirection: "row", alignItems: "center" }, compactRow: { paddingVertical: 9, minHeight: 58 },
  startingPointHeader: { gap: 4 },
  promptRow: { minHeight: 64, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: "transparent", gap: 12, flexDirection: "row", alignItems: "center", backgroundColor: colors.sheetCard }, selectedPrompt: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, promptTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  freeRow: { minHeight: 64, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, gap: 12, flexDirection: "row", alignItems: "center", backgroundColor: colors.sheetCard },
  flexText: { flex: 1 },
  selected: { backgroundColor: colors.accentSoft, borderColor: colors.accent }, detail: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: "500", color: colors.text }, body: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
});
