import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./SheetTouchable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { type } from "../constants/typography";
import { areaTint } from "../utils/lifeAreaColor";
import { courseColor, subjectSuggestions } from "../utils/studyPlan";
import type { StudyCourse } from "../types/studyPlan";
import SheetTextInput from "./SheetTextInput";

export type SubjectPick = { id: string; name: string } | { id: null; name: string };

/**
 * Any subject: yours first, then common ones, or type your own. Picking a
 * new name creates the subject when the exam is saved.
 */
export default function SubjectPicker({ courses, selectedName, pending = null, onPick }: { courses: StudyCourse[]; selectedName: string | null; pending?: string | null; onPick: (pick: SubjectPick) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().replace(/\s+/g, " "), lower = q.toLowerCase();
  const mine = courses.filter(course => !lower || course.name.toLowerCase().includes(lower));
  // A subject typed on this card isn't saved yet, but it's still yours to pick again.
  const draft = pending && !courses.some(course => course.name.toLowerCase() === pending.toLowerCase()) && (!lower || pending.toLowerCase().includes(lower)) ? pending : null;
  const names = [...courses.map(course => course.name), ...(pending ? [pending] : [])];
  const popular = subjectSuggestions(q, names, q ? 12 : 24);
  const exact = !!q && [...names, ...popular].some(name => name.toLowerCase() === lower);
  const chip = (key: string, label: string, selected: boolean, onPress: () => void, tint?: string, icon?: "add") =>
    <Pressable key={key} onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={icon ? `Add ${label}` : label}
      style={[s.chip, selected && { backgroundColor: areaTint(tint ?? colors.accent, 0.18), borderColor: tint ?? colors.accent }]}>
      {icon && <Ionicons name="add" size={14} color={colors.accent} />}
      {tint && !icon && <View style={[s.dot, { backgroundColor: tint }]} />}
      <Text style={[s.chipText, selected && { color: colors.text }]} numberOfLines={1}>{label}</Text>
    </Pressable>;
  return <View style={s.wrap}>
    <View style={s.search}>
      <Ionicons name="search" size={16} color={colors.secondary} />
      <SheetTextInput value={query} onChangeText={setQuery} maxLength={60} placeholder="Search or type a subject" placeholderTextColor={colors.secondary}
        accessibilityLabel="Search or type a subject" returnKeyType="done" autoCorrect={false} style={s.input}
        onSubmitEditing={() => { if (q && !exact) onPick({ id: null, name: q }); }} />
    </View>
    {!!q && !exact && <View style={s.chips}>{chip("typed", `“${q}”`, false, () => onPick({ id: null, name: q }), undefined, "add")}</View>}
    {(mine.length > 0 || !!draft) && <>
      <Text style={s.label}>My subjects</Text>
      <View style={s.chips}>{draft && chip("pending", `${draft} · new`, draft === selectedName, () => onPick({ id: null, name: draft }), colors.accent)}{mine.map(course => chip(course.id, course.name, course.name === selectedName, () => onPick({ id: course.id, name: course.name }), courseColor(course.id)))}</View>
    </>}
    {popular.length > 0 && <>
      <Text style={s.label}>{q ? "Suggestions" : "Popular"}</Text>
      <View style={s.chips}>{popular.map(name => chip(name, name, name === selectedName, () => onPick({ id: null, name })))}</View>
    </>}
  </View>;
}
const s = StyleSheet.create({
  wrap: { gap: 10 },
  search: { ...edge, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.sheetCard },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 10 },
  label: { ...type.label, paddingHorizontal: 4, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { ...edge, minHeight: 36, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.sheetCard },
  chipText: { color: colors.text, fontSize: 15, fontWeight: "500", flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
