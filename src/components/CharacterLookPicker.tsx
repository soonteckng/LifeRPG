import { StyleSheet, View } from "react-native";
import { memo } from "react";
import { TouchableOpacity } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import CharacterArt from "./CharacterArt";
import { Text } from "./AppText";
import { CHARACTER_LOOKS } from "../constants/characterLooks";
import { colors } from "../constants/theme";
import { characterLook } from "../utils/characterAppearance";

export default memo(function CharacterLookPicker({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (id: string) => void }) {
  const selected = characterLook(value).id;
  return <View style={s.grid}>{CHARACTER_LOOKS.map(look => <TouchableOpacity key={look.id} disabled={disabled}
    onPress={() => onChange(look.id)} accessibilityRole="radio" accessibilityLabel={`Choose ${look.title}`} accessibilityHint={look.detail}
    accessibilityState={{ checked: selected === look.id, disabled }} style={[s.tile, selected === look.id && s.selected]}>
    <CharacterArt avatar={look.id} size={70} />
    <Text style={s.title} numberOfLines={1}>{look.title}</Text>
    {selected === look.id && <View style={s.check}><Ionicons name="checkmark-circle" size={17} color={colors.accent} /></View>}
  </TouchableOpacity>)}</View>;
});
const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, tile: { width: "31%", flexGrow: 0, minHeight: 108, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", paddingVertical: 9, gap: 4 },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, title: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "500" }, check: { position: "absolute", top: 6, right: 6 },
});
