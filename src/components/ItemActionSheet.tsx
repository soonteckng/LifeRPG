import { StyleSheet, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import AppSheet from "./AppSheet";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";

export type ItemAction = { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; danger?: boolean; disabled?: boolean };

/**
 * What holding a row opens: its name, one line about it, and its actions. In
 * "remove" mode it asks before removing. Routines and exams look the same.
 */
export default function ItemActionSheet({ visible, title, meta, tint, mode, actions, removeLabel, keepLabel, removeNote, onRemove, onClose, onDismiss, label }: {
  visible: boolean; title: string; meta: string; tint?: string; mode: "options" | "remove"; actions: ItemAction[];
  removeLabel: string; keepLabel: string; removeNote: string; onRemove: () => void; onClose: () => void; onDismiss?: () => void; label: string;
}) {
  return <AppSheet visible={visible} onRequestClose={onClose} onDismiss={onDismiss} compact floating label={label}
    header={<View style={s.heading}>
      <Text style={s.title} numberOfLines={2}>{mode === "remove" ? `Remove “${title}”?` : title}</Text>
      <View style={s.meta}>{!!tint && <View style={[s.dot, { backgroundColor: tint }]} />}<Text style={s.caption}>{mode === "remove" ? removeNote : meta}</Text></View>
    </View>}>
    <BottomSheetScrollView contentContainerStyle={s.body}>
      {mode === "options" ? <View style={s.group}>{actions.map((action, index) => <Pressable key={action.label} disabled={action.disabled} onPress={action.onPress}
        accessibilityRole="button" accessibilityLabel={action.label} style={[s.row, index > 0 && s.divider, action.disabled && s.disabled]}>
        <Text style={[s.rowText, action.danger && s.danger]}>{action.label}</Text><Ionicons name={action.icon} size={19} color={action.danger ? colors.danger : colors.text} />
      </Pressable>)}</View> : <>
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={removeLabel} style={s.remove}><Text style={s.removeText}>{removeLabel}</Text></Pressable>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={keepLabel} style={s.keep}><Text style={s.keepText}>{keepLabel}</Text></Pressable>
      </>}
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  heading: { paddingHorizontal: 20, paddingBottom: 14, gap: 6 },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.4 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 }, dot: { width: 10, height: 10, borderRadius: 5 },
  caption: { flexShrink: 1, color: colors.secondary, fontSize: 14, lineHeight: 20 },
  body: { paddingHorizontal: 16, paddingBottom: 12, gap: 4 },
  group: { ...edge, borderRadius: 20, backgroundColor: colors.sheetCard, overflow: "hidden", marginBottom: 4 },
  row: { minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowText: { color: colors.text, fontSize: 16, lineHeight: 22 }, danger: { color: colors.danger }, disabled: { opacity: 0.5 },
  remove: { minHeight: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.16)" },
  removeText: { color: colors.danger, fontSize: 17, fontWeight: "600" },
  keep: { minHeight: 50, alignItems: "center", justifyContent: "center" }, keepText: { color: colors.text, fontSize: 16, fontWeight: "500" },
});
