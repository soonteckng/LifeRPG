import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { colors, edge } from "../constants/theme";
import { IDEA_AREAS, ROUTINE_IDEAS, type IdeaArea } from "../constants/routineIdeas";
import { FOCUS_AREAS, focusAreaTitle } from "../utils/focusAreas";
import { areaTint } from "../utils/lifeAreaColor";

export const FIRST_ROUTINE_LIMIT = 3;
const areaColor = (kind: IdeaArea) => FOCUS_AREAS.find(area => area.kind === kind)?.color ?? colors.primary;
const areaName = (kind: IdeaArea) => focusAreaTitle(FOCUS_AREAS.find(area => area.kind === kind)?.title);

/**
 * "What would you like to try first?" Real routines to pick, not a question
 * about interests. Popular shows six everyday ideas so the choice stays
 * small; the chips browse the rest. Up to three, nothing pre-picked, and
 * "Create my own" covers anything the ideas don't.
 */
export default function FirstRoutinesPicker({ picked, added, onToggle, onCreate, disabled = false }: {
  /** Ideas picked here and not yet saved. */
  picked: readonly string[];
  /** Routines already saved during this setup (picked earlier, or created). */
  added: readonly string[];
  onToggle: (name: string) => void; onCreate: () => void; disabled?: boolean;
}) {
  const [filter, setFilter] = useState<IdeaArea | "popular">("popular");
  const full = picked.length + added.length >= FIRST_ROUTINE_LIMIT;
  const ideas = ROUTINE_IDEAS.filter(idea => filter === "popular" ? idea.popular : idea.area === filter);
  const customAdded = added.filter(name => !ROUTINE_IDEAS.some(idea => idea.name === name));
  return <View style={s.stack}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} accessibilityRole="tablist">
      {(["popular", ...IDEA_AREAS] as const).map(kind => {
        const selected = filter === kind, title = kind === "popular" ? "Popular" : areaName(kind);
        return <Pressable key={kind} onPress={() => setFilter(kind)} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={`${title} ideas`}
          style={[s.chip, selected && s.chipOn]}><Text style={[s.chipText, selected && s.chipTextOn]} numberOfLines={1}>{title}</Text></Pressable>;
      })}
    </ScrollView>
    <View style={s.grid}>{ideas.map(idea => {
      const isAdded = added.includes(idea.name), on = isAdded || picked.includes(idea.name), tint = areaColor(idea.area);
      const locked = disabled || isAdded || (!on && full);
      return <Pressable key={idea.name} disabled={locked} onPress={() => onToggle(idea.name)} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: locked }}
        accessibilityLabel={`${idea.name}, ${idea.minutes} minutes, ${areaName(idea.area)}${isAdded ? ", added" : ""}`} testID="first-routine-idea"
        style={[s.card, on && { borderColor: tint, backgroundColor: areaTint(tint, 0.12) }, !on && full && s.dim]}>
        <View style={s.cardTop}>
          <View style={[s.icon, { backgroundColor: areaTint(tint, on ? 0.24 : 0.14) }]}><Ionicons name={idea.icon} size={17} color={tint} /></View>
          <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={22} color={on ? tint : colors.tertiary} />
        </View>
        <Text style={s.name} numberOfLines={2}>{idea.name}</Text>
        <Text style={s.meta} numberOfLines={1}>{isAdded ? "Added" : `${idea.minutes} min · ${areaName(idea.area)}`}</Text>
      </Pressable>;
    })}</View>
    {customAdded.map(name => <View key={name} style={[s.custom, s.customAdded]} accessible accessibilityLabel={`${name}, added`}>
      <Ionicons name="checkmark-circle" size={20} color={colors.primary} /><Text style={[s.name, s.flex]} numberOfLines={1}>{name}</Text><Text style={s.meta}>Added</Text>
    </View>)}
    <Pressable disabled={disabled || full} onPress={onCreate} accessibilityRole="button" accessibilityLabel="Create my own" testID="first-routine-create" style={[s.custom, (disabled || full) && s.dim]}>
      <View style={s.plus}><Ionicons name="add" size={18} color={colors.text} /></View>
      <View style={s.flex}><Text style={s.name}>Create my own</Text><Text style={s.meta}>Any activity, your name and length.</Text></View>
    </Pressable>
    <Text style={s.note}>{full ? "That’s three. You can add more anytime in Routines." : "Choose up to 3. Saving a routine won’t turn on reminders."}</Text>
  </View>;
}
const s = StyleSheet.create({
  stack: { gap: 12 }, flex: { flex: 1, minWidth: 0 },
  chips: { gap: 8, paddingRight: 8 },
  chip: { ...edge, minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: "center", backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.secondary, fontSize: 14, fontWeight: "600" }, chipTextOn: { color: colors.background },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { ...edge, flexBasis: "40%", flexGrow: 1, maxWidth: "50%", minHeight: 112, padding: 12, gap: 4, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  name: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  meta: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  custom: { ...edge, minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, backgroundColor: colors.surface },
  customAdded: { borderColor: colors.primary },
  plus: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  dim: { opacity: 0.45 },
  note: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
});
