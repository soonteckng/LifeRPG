import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
// Sheet touchables cooperate with the sheet's own drag gesture in its header.
import Pressable from "./SheetTouchable";
import { colors } from "../constants/theme";

// One header for every sheet: a title, an optional line beneath, and a round close.
export default function SheetHeader({ title, subtitle, onClose, closeLabel = "Close", closeTestID }: { title: string; subtitle?: string; onClose?: () => void; closeLabel?: string; closeTestID?: string }) {
  return <View style={s.header}>
    <View style={s.copy}>
      <Text style={s.title} accessibilityRole="header" numberOfLines={2}>{title}</Text>
      {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
    </View>
    {onClose && <Pressable testID={closeTestID} onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={closeLabel} style={s.close}>
      <Ionicons name="close" size={17} color={colors.secondary} />
    </Pressable>}
  </View>;
}
const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.4 },
  subtitle: { color: colors.secondary, fontSize: 15, lineHeight: 20 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
});
