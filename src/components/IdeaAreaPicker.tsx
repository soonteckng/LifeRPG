import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { colors } from "../constants/theme";
import { IDEA_AREAS, IDEA_AREA_LIMIT, type IdeaArea } from "../constants/routineIdeas";
import { FOCUS_AREAS, focusAreaTitle } from "../utils/focusAreas";
import { areaTint } from "../utils/lifeAreaColor";

const ICONS: Record<IdeaArea, React.ComponentProps<typeof Ionicons>["name"]> = {
  learning: "book-outline", work: "briefcase-outline", creative: "color-palette-outline", personal: "home-outline", wellbeing: "leaf-outline",
};
// A softer line than the category hints: what making time for it feels like.
const LINES: Record<IdeaArea, string> = {
  learning: "Classes, exams, curiosity",
  work: "Projects, jobs, side work",
  creative: "Making, writing, drawing",
  personal: "Chores and daily life",
  wellbeing: "Rest, movement, me time",
};
const areaOf = (kind: IdeaArea) => FOCUS_AREAS.find(area => area.kind === kind);
export const ideaAreaTitle = (kind: IdeaArea) => focusAreaTitle(areaOf(kind)?.title);

/**
 * "What would you like to make time for?" A calm list, not a grid of tasks:
 * up to three areas, nothing pre-picked. The ideas they unlock wait in
 * Routines, so the intro stays light.
 */
export default function IdeaAreaPicker({ value, onChange, disabled = false, inSheet = false }: {
  value: readonly IdeaArea[]; onChange: (next: IdeaArea[]) => void; disabled?: boolean; inSheet?: boolean;
}) {
  const full = value.length >= IDEA_AREA_LIMIT;
  const toggle = (kind: IdeaArea) => {
    if (disabled) return;
    if (value.includes(kind)) onChange(value.filter(item => item !== kind));
    else if (!full) onChange(IDEA_AREAS.filter(item => item === kind || value.includes(item)));
  };
  return <View style={s.stack}>
    {IDEA_AREAS.map(kind => {
      const on = value.includes(kind), tint = areaOf(kind)?.color ?? colors.primary, locked = disabled || (!on && full);
      return <Pressable key={kind} disabled={locked} onPress={() => toggle(kind)} accessibilityRole="checkbox" accessibilityLabel={ideaAreaTitle(kind)}
        accessibilityHint={LINES[kind]} accessibilityState={{ checked: on, disabled: locked }} testID={`idea-area-${kind}`}
        style={[s.row, inSheet && s.rowInSheet, on && { backgroundColor: areaTint(tint, 0.14) }, !on && full && s.rest]}>
        <View style={[s.icon, { backgroundColor: areaTint(tint, on ? 0.26 : 0.14) }]}><Ionicons name={ICONS[kind]} size={20} color={tint} /></View>
        <View style={s.copy}><Text style={s.title} numberOfLines={1}>{ideaAreaTitle(kind)}</Text><Text style={s.line} numberOfLines={1}>{LINES[kind]}</Text></View>
        <View style={[s.check, on && { backgroundColor: tint, borderColor: tint }]}>{on && <Ionicons name="checkmark" size={15} color={colors.background} />}</View>
      </Pressable>;
    })}
    {/* In the sheet the limit is in the subtitle, so the list keeps one steady height. */}
    {!inSheet && <Text style={s.note}>{full ? "That’s three. Tap one again to swap it." : "Choose up to three. You can change them anytime in Routines."}</Text>}
  </View>;
}
const s = StyleSheet.create({
  // One line each, so all five and the note fit on the page without scrolling.
  stack: { gap: 8 },
  row: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface },
  // Tighter rows in the sheet, so all five and Done fit without scrolling.
  rowInSheet: { minHeight: 64, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.sheetCard },
  rest: { opacity: 0.45 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  title: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  line: { color: colors.secondary, fontSize: 14, lineHeight: 18 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.tertiary, alignItems: "center", justifyContent: "center" },
  note: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 6, marginTop: 4 },
});
