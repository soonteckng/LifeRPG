import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { INTEREST_KINDS, type InterestKind } from "../constants/guidedQuests";
import { colors, edge } from "../constants/theme";
import { FOCUS_AREAS } from "../utils/focusAreas";
import { areaTint } from "../utils/lifeAreaColor";
import { orderedIdeas } from "../utils/interests";

const ICONS: Record<InterestKind, React.ComponentProps<typeof Ionicons>["name"]> = {
  learning: "book-outline", work: "briefcase-outline", creative: "color-palette-outline", personal: "checkbox-outline", wellbeing: "leaf-outline",
};
export const interestTitle = (kind: InterestKind) => FOCUS_AREAS.find(area => area.kind === kind)?.title ?? kind;
const interestHint = (kind: InterestKind) => FOCUS_AREAS.find(area => area.kind === kind)?.hint ?? "";
const interestColor = (kind: InterestKind) => FOCUS_AREAS.find(area => area.kind === kind)?.color ?? colors.primary;

/**
 * Pick any number of areas. Nothing is ticked for you. Once something is
 * picked, an example idea shows right away, so the choice visibly matters.
 */
export default function InterestPicker({ value, onChange, disabled = false, onSelection, inSheet = false }: {
  value: readonly InterestKind[]; onChange: (next: InterestKind[]) => void; disabled?: boolean; onSelection?: () => void; inSheet?: boolean;
}) {
  const toggle = (kind: InterestKind) => {
    if (disabled) return;
    onSelection?.();
    onChange(INTEREST_KINDS.filter(item => item === kind ? !value.includes(item) : value.includes(item)));
  };
  const example = value.length ? orderedIdeas(value)[0] : null;
  return <View style={s.stack}>
    <View style={s.list}>{INTEREST_KINDS.map(kind => {
      const on = value.includes(kind), tint = interestColor(kind);
      return <Pressable key={kind} disabled={disabled} onPress={() => toggle(kind)} accessibilityRole="checkbox" accessibilityLabel={interestTitle(kind)}
        accessibilityHint={interestHint(kind)} accessibilityState={{ checked: on, disabled }} testID={`interest-${kind}`}
        style={[s.row, inSheet && s.rowInSheet, on && { borderColor: tint, backgroundColor: areaTint(tint, 0.12) }]}>
        <View style={[s.icon, { backgroundColor: areaTint(tint, on ? 0.24 : 0.14) }]}><Ionicons name={ICONS[kind]} size={18} color={tint} /></View>
        <View style={s.copy}><Text style={s.title}>{interestTitle(kind)}</Text><Text style={s.hint} numberOfLines={2}>{interestHint(kind)}</Text></View>
        <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={24} color={on ? tint : colors.tertiary} />
      </Pressable>;
    })}</View>
    <Text style={s.note}>Choose any. You can change these anytime.</Text>
    {example && <View style={s.example} testID="interest-example">
      <Text style={s.exampleLabel}>An idea for you</Text>
      <Text style={s.exampleText}>{example.name} · {example.minutes} min</Text>
    </View>}
  </View>;
}
const s = StyleSheet.create({
  stack: { gap: 12 }, list: { gap: 8 },
  row: { ...edge, minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  rowInSheet: { backgroundColor: colors.sheetCard },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  hint: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  note: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  example: { ...edge, gap: 2, padding: 14, borderRadius: 16, backgroundColor: colors.accentSoft },
  exampleLabel: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" },
  exampleText: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
});
