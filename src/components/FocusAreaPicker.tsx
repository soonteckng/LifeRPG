import { StyleSheet, View } from "react-native";
import TouchableOpacity from "./SheetTouchable";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { focusAreaHint, focusAreaIcon, focusAreaTitle } from "../utils/focusAreas";
import { areaTint, lifeAreaColor } from "../utils/lifeAreaColor";

type Area = { id: number | null; title: string; color_code?: string | null };

// One category picker for every sheet: each category with its colour and a
// line saying what belongs there. Used wherever a session or routine picks one.
export default function FocusAreaPicker({ areas, selectedId, disabled = false, onSelect }: {
  areas: Area[]; selectedId: number | null; disabled?: boolean; onSelect: (id: number | null) => void;
}) {
  return <View style={s.list}>
    {areas.map(area => {
      const selected = area.id === selectedId, tint = lifeAreaColor(area.id, area.color_code), hint = focusAreaHint(area.title);
      return <TouchableOpacity key={area.id ?? "general"} disabled={disabled} onPress={() => onSelect(area.id)} accessibilityRole="radio"
        accessibilityLabel={hint ? `${focusAreaTitle(area.title)}. ${hint}` : focusAreaTitle(area.title)}
        accessibilityState={{ checked: selected, disabled }} style={[s.row, selected && { backgroundColor: areaTint(tint, 0.12), borderColor: tint }]}>
        <View style={[s.icon, { backgroundColor: areaTint(tint, selected ? 0.24 : 0.16) }]}><Ionicons name={focusAreaIcon(area.title)} size={17} color={tint} /></View>
        <View style={s.copy}>
          <Text style={[s.name, selected && s.selectedName]} numberOfLines={1}>{focusAreaTitle(area.title)}</Text>
          {!!hint && <Text style={s.hint} numberOfLines={2}>{hint}</Text>}
        </View>
        <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={20} color={selected ? tint : colors.tertiary} />
      </TouchableOpacity>;
    })}
  </View>;
}
const s = StyleSheet.create({
  list: { gap: 8 },
  row: { ...edge, minHeight: 62, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, backgroundColor: colors.sheetCard, borderWidth: 1.5 },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  name: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "500" },
  selectedName: { fontWeight: "600" },
  hint: { color: colors.secondary, fontSize: 13, lineHeight: 17 },
});
