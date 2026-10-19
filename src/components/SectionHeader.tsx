import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";

/**
 * A section's title, an optional line under it, and one control on the right.
 * With onPress the title reads "Title ›" and opens the section in full;
 * holding it runs onLongPress.
 */
export default function SectionHeader({ title, subtitle, right, onPress, onLongPress, pressLabel }: {
  title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; onLongPress?: () => void; pressLabel?: string;
}) {
  const copy = <View style={s.copy}>
    <View style={s.titleRow}>
      <Text style={s.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      {onPress && <Ionicons name="chevron-forward" size={18} color={colors.secondary} style={s.chevron} />}
    </View>
    {!!subtitle && <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>}
  </View>;
  return <View style={s.head}>
    {onPress || onLongPress ? <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={450} disabled={!onPress && !onLongPress}
      accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={onPress ? pressLabel ?? `${title}${subtitle ? `, ${subtitle}` : ""}. Show all` : undefined}
      accessibilityActions={onLongPress ? [{ name: "longpress", label: "More actions" }] : undefined}
      onAccessibilityAction={onLongPress} style={s.copy}>{copy}</Pressable> : copy}
    {right}
  </View>;
}

/** A quiet grey "See all ›" link for a section header; a count shows as a small badge when more are hidden. */
export function SeeAll({ label = "See all", count, onPress, accessibilityLabel, testID }: { label?: string; count?: number; onPress: () => void; accessibilityLabel?: string; testID?: string }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} hitSlop={10} testID={testID} style={s.seeAll}>
    <Text style={s.seeAllText}>{label}</Text>
    {!!count && <View style={s.badge} testID="see-all-count"><Text style={s.badgeText}>{count}</Text></View>}
    <Ionicons name="chevron-forward" size={15} color={colors.muted} />
  </Pressable>;
}

/** Ends edit mode; it takes the section's right-hand control while cards wiggle. */
export function DoneButton({ onPress, label }: { onPress: () => void; label: string }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={s.done}><Text style={s.doneText}>Done</Text></Pressable>;
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: 2, minWidth: 0 }, chevron: { marginTop: 2 },
  title: { flexShrink: 1, color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  subtitle: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  circle: { ...edge, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  disabled: { opacity: 0.4 },
  done: { minHeight: 32, paddingHorizontal: 14, borderRadius: 16, justifyContent: "center", backgroundColor: colors.accentSoft },
  doneText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  seeAll: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 2, paddingLeft: 8 },
  seeAllText: { color: colors.muted, fontSize: 15, fontWeight: "500" },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, marginLeft: 4, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  badgeText: { color: colors.accent, fontSize: 12, lineHeight: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
