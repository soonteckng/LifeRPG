import { StyleSheet, View } from "react-native";
import { TouchableOpacity } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { focusAreaIcon, focusAreaTitle } from "../utils/focusAreas";
import { areaTint, lifeAreaColor } from "../utils/lifeAreaColor";

type Area = { id: number | null; title: string; color_code?: string | null };

// One focus-area picker for sheets: two even columns, full names, the area's
// own colour. Used wherever a block, routine or direction picks an area.
export default function FocusAreaPicker({ areas, selectedId, disabled = false, onSelect }: {
  areas: Area[]; selectedId: number | null; disabled?: boolean; onSelect: (id: number | null) => void;
}) {
  return <View style={s.grid}>
    {areas.map(area => {
      const selected = area.id === selectedId, tint = lifeAreaColor(area.id, area.color_code);
      // Sheet touchables wrap their style in an inner view, so the cell takes the width.
      return <View key={area.id ?? "general"} style={s.cell}>
        <TouchableOpacity disabled={disabled} onPress={() => onSelect(area.id)} accessibilityRole="radio" accessibilityLabel={focusAreaTitle(area.title)}
          accessibilityState={{ checked: selected, disabled }} style={[s.tile, selected && { backgroundColor: areaTint(tint, 0.14), borderColor: tint }]}>
          <View style={[s.icon, { backgroundColor: areaTint(tint, selected ? 0.22 : 0.14) }]}><Ionicons name={focusAreaIcon(area.title)} size={16} color={tint} /></View>
          <Text style={[s.name, selected && s.selectedName]} numberOfLines={2}>{focusAreaTitle(area.title)}</Text>
        </TouchableOpacity>
      </View>;
    })}
  </View>;
}
const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { flexBasis: "47%", flexGrow: 1 },
  tile: { minHeight: 56, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, backgroundColor: colors.sheetCard, borderWidth: 1.5, borderColor: "transparent" },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  name: { flex: 1, color: colors.neutral, fontSize: 15, lineHeight: 20, fontWeight: "500" },
  selectedName: { color: colors.text, fontWeight: "600" },
});
