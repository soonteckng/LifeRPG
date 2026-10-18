import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import Pressable from "./SheetTouchable";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { monthGrid } from "../utils/studyPlan";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** A small month view for sheets. Dates outside [min, max] can't be picked. */
export default function MonthCalendar({ value, min, max, today, onChange }: { value: string; min: string; max: string; today: string; onChange: (key: string) => void }) {
  const [view, setView] = useState(() => ({ year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) - 1 }));
  const label = new Date(view.year, view.month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const monthKey = `${view.year}-${String(view.month + 1).padStart(2, "0")}`;
  const canBack = monthKey > min.slice(0, 7), canForward = monthKey < max.slice(0, 7);
  const shift = (delta: number) => setView(current => { const next = new Date(current.year, current.month + delta, 1); return { year: next.getFullYear(), month: next.getMonth() }; });
  return <View style={s.card}>
    <View style={s.head}>
      <Text style={s.month} accessibilityRole="header">{label}</Text>
      <View style={s.nav}>
        <Pressable disabled={!canBack} onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="Previous month" style={s.navButton}><Ionicons name="chevron-back" size={16} color={canBack ? colors.accent : colors.tertiary} /></Pressable>
        <Pressable disabled={!canForward} onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="Next month" style={s.navButton}><Ionicons name="chevron-forward" size={16} color={canForward ? colors.accent : colors.tertiary} /></Pressable>
      </View>
    </View>
    <View style={s.row}>{WEEKDAYS.map((day, index) => <Text key={index} style={s.weekday}>{day}</Text>)}</View>
    {monthGrid(view.year, view.month).map((week, index) => <View key={index} style={s.row}>
      {week.map((key, column) => {
        if (!key) return <View key={column} style={s.cell} />;
        const selected = key === value, disabled = key < min || key > max;
        return <View key={key} style={s.cell}><Pressable disabled={disabled} onPress={() => onChange(key)} accessibilityRole="radio"
          accessibilityLabel={new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8))).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          accessibilityState={{ checked: selected, disabled }} style={[s.day, selected && s.selected]}>
          <Text style={[s.dayText, key === today && s.today, disabled && s.disabled, selected && s.selectedText]}>{Number(key.slice(8))}</Text>
        </Pressable></View>;
      })}
    </View>)}
  </View>;
}
const s = StyleSheet.create({
  card: { borderRadius: 22, backgroundColor: colors.sheetCard, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 6, paddingBottom: 6 },
  month: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  nav: { flexDirection: "row", gap: 6 },
  navButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.selection },
  row: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", color: colors.tertiary, fontSize: 12, lineHeight: 20, fontWeight: "600" },
  cell: { flex: 1, height: 38, alignItems: "center", justifyContent: "center" },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  selected: { backgroundColor: colors.accent },
  dayText: { color: colors.text, fontSize: 15, fontVariant: ["tabular-nums"] },
  today: { color: colors.accent, fontWeight: "700" },
  disabled: { color: colors.tertiary, opacity: 0.6 },
  selectedText: { color: colors.primaryText, fontWeight: "700" },
});
