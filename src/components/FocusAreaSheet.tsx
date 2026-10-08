import { StyleSheet, View } from "react-native";
import { BottomSheetScrollView, TouchableOpacity } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import AppSheet from "./AppSheet";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { focusAreaDescription, focusAreaIcon, focusAreaTitle } from "../utils/focusAreas";
import { lifeAreaColor } from "../utils/lifeAreaColor";
import type { Subject } from "../services/taskService";

export default function FocusAreaSheet({ visible, subjects, selectedId, disabled, onClose, onSelect }: {
  visible: boolean; subjects: Subject[]; selectedId: number | null; disabled: boolean; onClose: () => void; onSelect: (id: number | null) => void;
}) {
  const choices = subjects.length ? subjects : [{ id: null, title: "Everyday focus", color_code: null }];
  return <AppSheet visible={visible} onRequestClose={onClose} compact motionMode="timed" label="focus area"
    header={<View style={s.header}><Text style={s.title}>Choose a focus area</Text><Text style={s.body}>Where would you like this block to count?</Text></View>}>
    <BottomSheetScrollView contentContainerStyle={s.bodyContainer} showsVerticalScrollIndicator={false}>
      {choices.map(area => <TouchableOpacity key={area.id ?? "general"} disabled={disabled} onPress={() => { onSelect(area.id); onClose(); }}
        accessibilityRole="radio" accessibilityLabel={`Choose ${focusAreaTitle(area.title)}`} accessibilityState={{ checked: selectedId === area.id, disabled }} style={s.row}>
        <Ionicons name={focusAreaIcon(area.title)} size={23} color={lifeAreaColor(area.id, area.color_code)} />
        <View style={s.detail}><Text style={s.rowTitle}>{focusAreaTitle(area.title)}</Text><Text style={s.hint}>{focusAreaDescription(area.title)}</Text></View>
        {selectedId === area.id && <Ionicons name="checkmark" size={21} color={colors.accent} />}
      </TouchableOpacity>)}
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 }, title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "500" }, body: { color: colors.secondary, fontSize: 15, lineHeight: 22 },
  bodyContainer: { paddingHorizontal: 20, paddingBottom: 24 }, row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 68, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  detail: { flex: 1, minWidth: 0, gap: 3 }, rowTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" }, hint: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
});
