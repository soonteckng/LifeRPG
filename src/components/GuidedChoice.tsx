import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { FOCUS_AREAS } from "../utils/focusAreas";
import { colors, edge } from "../constants/theme";
import { type } from "../constants/typography";
import { areaTint } from "../utils/lifeAreaColor";
import { FOCUS_DIRECTIONS, focusDirection, focusOptions } from "../constants/guidedQuests";
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
      const tint = FOCUS_AREAS.find(area => area.title === direction?.title)?.color ?? colors.accent;
      const title = direction?.title ?? "Free focus";
      const hint = direction?.hint ?? "Your own idea, at your own pace.";
      // Compact tiles leave the next section in view, so the sheet reads as scrollable.
      return <Pressable key={direction?.id ?? "free-focus"} disabled={disabled} accessibilityRole="radio" accessibilityLabel={title} accessibilityHint={hint} accessibilityState={{ checked: selected, disabled }}
        onPress={() => choose(direction)} style={[s.directionTile, selected && { backgroundColor: areaTint(tint, 0.14), borderColor: tint }]}>
        <View style={[s.tileIcon, { backgroundColor: areaTint(tint, selected ? 0.22 : 0.14) }]}><Ionicons name={visual.icon} size={16} color={tint} /></View>
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
    <View style={s.section}><Text style={s.heading}>Category</Text><FocusDirectionPicker value={value} onChange={onChange} disabled={disabled} includeFreeFocus onSelection={onSelection} /></View>
    <View style={s.section}>
      <Text style={s.heading}>{value.enabled ? `First step · ${direction.title}` : "First step"}</Text>
      {!value.enabled ? <View style={[s.list, s.freeRow]}>
        <View style={[s.tileIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="sparkles-outline" size={16} color={colors.accent} /></View>
        <Text style={[s.body, s.flexText]}>Bring your own idea. Sessions count toward Everyday focus.</Text>
      </View> : <View style={s.list}>{focusOptions(value.need).map((task, index) => {
        const hint = startingPointHints[task.id];
        const selected = value.templateId === task.id;
        // A grouped list with a single checkmark, as in iOS Settings.
        return <Pressable key={task.id} disabled={disabled} accessibilityRole="radio" accessibilityLabel={task.title} accessibilityHint={hint} accessibilityState={{ checked: selected, disabled }}
          onPress={() => { if (disabled) return; onSelection?.(); onChange({ ...value, areaId: undefined, need: task.need, templateId: task.id, smaller: false }); }} style={[s.promptRow, index > 0 && s.promptDivider]}>
          <View style={s.detail}><Text style={[s.promptTitle, selected && s.promptChosen]}>{task.title}</Text>{!!hint && <Text style={s.body}>{hint}</Text>}</View>
          {selected ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : <View style={s.checkSpace} />}
        </Pressable>;
      })}</View>}
      {value.enabled && <Text style={s.footnote}>Your first step shows on Home as the suggestion.</Text>}
    </View>
  </View>;
}
// Short, concrete lines: what to do, not why it is good for you.
const startingPointHints: Record<string, string> = {
  "review-topic": "Go over one topic until it makes sense.",
  "next-deadline": "Pick up the next unfinished part.",
  "practice-question": "Past papers, problem sets or flashcards.",
  "read-chapter": "Read closely, then note what stuck.",
  "project-next-step": "Open it up and do the next part.",
  "work-priority": "Close the other tabs. Just this one thing.",
  "work-plan-week": "Put the important things on your calendar.",
  "work-inbox": "Reply, file or archive, oldest first.",
  "creative-first-draft": "Messy is fine. Just get it down.",
  "creative-practice": "Scales, sketches, drills — whatever you practise.",
  "creative-learn-technique": "Follow a tutorial, then try it yourself.",
  "creative-finish-piece": "Wrap up something that’s nearly done.",
  "life-small-task": "A form, a booking or a reply you’ve put off.",
  "life-reset-space": "One drawer, desk or folder at a time.",
  "life-money": "Check spending, pay a bill, update the budget.",
  "life-plan-meals": "Decide the meals, write the list.",
  "quiet-screen-free": "Unplug and do something restful.",
  "wellbeing-read": "A book, not a feed.",
  "wellbeing-journal": "A few honest lines about today.",
  "wellbeing-move": "A walk, a stretch or a short workout.",
};
const s = StyleSheet.create({
  group: { gap: 22 }, directions: { gap: 6 }, section: { gap: 8 },
  heading: { ...type.label, paddingHorizontal: 4 },
  directionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  directionTile: { flexBasis: "47%", flexGrow: 1, minWidth: 0, minHeight: 56, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.sheetCard, borderWidth: 1.5, borderColor: colors.line, flexDirection: "row", alignItems: "center", gap: 10 },
  tileIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tileTitle: { flex: 1, minWidth: 0, color: colors.neutral, fontSize: 15, lineHeight: 20, fontWeight: "500" }, selectedTitle: { color: colors.text, fontWeight: "600" },
  row: { paddingHorizontal: 12, paddingVertical: 12, minHeight: 56, borderRadius: 14, gap: 12, flexDirection: "row", alignItems: "center" }, compactRow: { paddingVertical: 9, minHeight: 58 },
  list: { ...edge, borderRadius: 16, backgroundColor: colors.sheetCard, overflow: "hidden" },
  promptRow: { minHeight: 60, paddingHorizontal: 16, paddingVertical: 10, gap: 12, flexDirection: "row", alignItems: "center" },
  promptDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  promptTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" }, promptChosen: { fontWeight: "600" },
  checkSpace: { width: 20 },
  freeRow: { minHeight: 60, paddingHorizontal: 14, paddingVertical: 12, gap: 12, flexDirection: "row", alignItems: "center" },
  footnote: { color: colors.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
  flexText: { flex: 1 },
  selected: { backgroundColor: colors.accentSoft, borderColor: colors.accent }, detail: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: "500", color: colors.text }, body: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
});
