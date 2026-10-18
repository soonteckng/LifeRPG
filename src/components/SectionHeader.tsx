import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";

/** A section's title, an optional line under it, and one control on the right. */
export default function SectionHeader({ title, subtitle, right, onLongPress }: { title: string; subtitle?: string; right?: ReactNode; onLongPress?: () => void }) {
  const copy = <View style={s.copy}>
    <Text style={s.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
    {!!subtitle && <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>}
  </View>;
  return <View style={s.head}>
    {onLongPress ? <Pressable onLongPress={onLongPress} delayLongPress={450} accessibilityActions={[{ name: "longpress", label: "Rearrange Home" }]}
      onAccessibilityAction={onLongPress} style={s.copy}>{copy}</Pressable> : copy}
    {right}
  </View>;
}

/** The round, bordered + (or other icon) button used next to section titles. */
export function CircleButton({ icon = "add", label, onPress, disabled = false, size = 32, testID }: {
  icon?: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; disabled?: boolean; size?: number; testID?: string;
}) {
  return <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} testID={testID}
    style={[s.circle, { width: size, height: size, borderRadius: size / 2 }, disabled && s.disabled]}>
    <Ionicons name={icon} size={size * 0.58} color={colors.accent} />
  </Pressable>;
}
const s = StyleSheet.create({
  head: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingLeft: 4 },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  subtitle: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  circle: { ...edge, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  disabled: { opacity: 0.4 },
});
