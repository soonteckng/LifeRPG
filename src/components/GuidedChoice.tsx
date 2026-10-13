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
      const tint = direction ? FOCUS_AREAS[FOCUS_DIRECTIONS.indexOf(direction) + 1].color : FOCUS_AREAS[0].color;
      const title = direction?.title ?? "Free focus";
      const hint = direction?.hint ?? "Your own idea, at your own pace.";
      return <Pressable key={direction?.id ?? "free-focus"} disabled={disabled} accessibilityRole="radio" accessibilityLabel={title} accessibilityHint={hint} accessibilityState={{ checked: selected, disabled }}
        onPress={() => choose(direction)} style={[s.directionTile, selected && s.selected]}>
        <Ionicons name={visual.icon} size={20} color={tint} />
        <View style={s.tileCopy}><Text style={[s.tileTitle, selected && s.selectedTitle]}>{title}</Text><Text style={s.tileHint}>{hint}</Text></View>
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
  return <View style={s.group}>
    <View style={s.section}><Text style={s.heading}>Choose a direction</Text><FocusDirectionPicker value={value} onChange={onChange} disabled={disabled} includeFreeFocus onSelection={onSelection} /></View>
    <View style={[s.startingPoint, !value.enabled && s.freeStartingPoint]}>
      <View style={s.startingPointHeader}><Text style={s.startingPointTitle}>Your starting point</Text>{value.enabled && <Text style={s.body}>Choose a small step to begin with.</Text>}</View>
      {!value.enabled ? <>
        <View style={s.freePoint}>
          <View style={s.freeSymbol}><Ionicons name="sparkles-outline" size={26} color={colors.accent} /></View>
          <Text style={s.freeTitle}>Make this time your own.</Text>
          <Text style={s.freeBody}>Bring one thing you want to do. Choose your time on Home and begin at your own pace.</Text>
        </View>
        <View style={s.freeAreaHint}><View style={s.freeAreaDot} /><Text style={s.freeAreaCopy}>Everyday focus to start. Change the area on Home anytime.</Text></View>
      </> : focusOptions(value.need).map(task => {
        const studyNeed = STUDY_NEEDS.find(need => need.id === task.need);
        const title = studyNeed?.title ?? task.title;
        const hint = studyNeed?.hint ?? startingPointHints[task.id];
        const selected = value.templateId === task.id;
        return <Pressable key={task.id} disabled={disabled} accessibilityRole="radio" accessibilityLabel={title} accessibilityHint={hint} accessibilityState={{ checked: selected, disabled }}
          onPress={() => { if (disabled) return; onSelection?.(); onChange({ ...value, areaId: undefined, need: task.need, templateId: task.id, smaller: false }); }} style={[s.promptRow, selected && s.selectedPrompt]}>
          <View style={s.detail}><Text style={[s.promptTitle, selected && s.selectedTitle]}>{title}</Text><Text style={s.body}>{hint}</Text></View>
          <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={23} color={selected ? colors.accent : colors.muted} />
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
  group: { gap: 20 }, directions: { gap: 6 }, section: { gap: 8 }, heading: { color: colors.secondary, fontSize: 15, lineHeight: 21 },
  directionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, directionTile: { flexBasis: "47%", flexGrow: 1, minWidth: 0, minHeight: 98, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 8 }, tileCopy: { flex: 1, minWidth: 0, gap: 4 }, tileHint: { color: colors.secondary, fontSize: 12, lineHeight: 17 }, tileTitle: { minWidth: 0, color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "500" }, selectedTitle: { color: colors.accent }, directionHint: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 2 },
  row: { paddingHorizontal: 12, paddingVertical: 12, minHeight: 56, borderRadius: 14, gap: 12, flexDirection: "row", alignItems: "center" }, compactRow: { paddingVertical: 9, minHeight: 58 },
  startingPoint: { gap: 8, padding: 12, borderRadius: 20, backgroundColor: colors.surfaceRaised }, startingPointHeader: { paddingHorizontal: 2, paddingTop: 2, paddingBottom: 4, gap: 4 }, startingPointTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "500" },
  promptRow: { minHeight: 72, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.line, gap: 12, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface }, selectedPrompt: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, promptTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  freeStartingPoint: { padding: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: 16 },
  freePoint: { alignItems: "center", gap: 12, paddingHorizontal: 6, paddingVertical: 8 }, freeSymbol: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: colors.accentSoft },
  freeTitle: { color: colors.text, fontSize: 21, lineHeight: 28, fontWeight: "500", textAlign: "center" }, freeBody: { color: colors.secondary, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 300 },
  freeAreaHint: { paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: "row", alignItems: "center", gap: 8 }, freeAreaDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: FOCUS_AREAS[0].color }, freeAreaCopy: { flex: 1, color: colors.secondary, fontSize: 12, lineHeight: 18 },
  selected: { backgroundColor: colors.accentSoft }, detail: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 17, lineHeight: 23, fontWeight: "500", color: colors.text }, body: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
});
