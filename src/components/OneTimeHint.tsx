import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { useAppPreferences } from "../hooks/useAppPreferences";
import { appPreferences } from "../services/appPreferences";

/**
 * A tip shown until it is dismissed or its gesture is used, then never again.
 * Screens stay free of permanent instructions.
 */
export default function OneTimeHint({ id, text, show = true }: { id: string; text: string; show?: boolean }) {
  const { hints } = useAppPreferences();
  if (!show || hints.includes(id)) return null;
  return <View style={s.hint} testID={`hint-${id}`} accessibilityLiveRegion="polite">
    <Ionicons name="hand-left-outline" size={15} color={colors.accent} />
    <Text style={s.text}>{text}</Text>
    <Pressable onPress={() => void appPreferences.retireHint(id)} accessibilityRole="button" accessibilityLabel="Got it" hitSlop={10} style={s.close}>
      <Ionicons name="close" size={15} color={colors.secondary} /></Pressable>
  </View>;
}
const s = StyleSheet.create({
  hint: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingLeft: 12, paddingRight: 6, borderRadius: 14, backgroundColor: colors.accentSoft },
  text: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  close: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
});
