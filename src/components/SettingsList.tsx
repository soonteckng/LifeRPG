import type { ReactNode } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors, edge, radius } from "../constants/theme";

/** A titled group of settings rows in one bordered card, like the phone's own Settings. */
export function SettingsGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return <View style={s.group}>
    {!!title && <Text style={s.title} accessibilityRole="header">{title}</Text>}
    <View style={s.card}>{children}</View>
    {!!footer && <Text style={s.footer}>{footer}</Text>}
  </View>;
}
type Icon = React.ComponentProps<typeof Ionicons>["name"];
/** One setting: a tinted icon, a name, and a value, switch or chevron. Rows after the first get an inset divider. */
export function SettingsRow({ icon, tint = colors.accent, title, value, subtitle, onPress, toggle, first = false, danger = false, disabled = false }: {
  icon: Icon; tint?: string; title: string; value?: string; subtitle?: string; onPress?: () => void; first?: boolean; danger?: boolean; disabled?: boolean;
  toggle?: { value: boolean; onChange: (value: boolean) => void };
}) {
  const body = <>
    {!first && <View style={s.divider} />}
    <View style={[s.icon, { backgroundColor: `${danger ? colors.danger : tint}26` }]}><Ionicons name={icon} size={18} color={danger ? colors.danger : tint} /></View>
    <View style={[s.copy, !!value && s.copyFirst]}>
      <Text style={[s.rowTitle, danger && { color: colors.danger }]} numberOfLines={1}>{title}</Text>
      {!!subtitle && <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text>}
    </View>
    {!!value && <Text style={s.value} numberOfLines={1} ellipsizeMode="tail">{value}</Text>}
    {toggle ? <Switch accessibilityLabel={title} value={toggle.value} disabled={disabled} onValueChange={toggle.onChange}
      trackColor={{ false: colors.selection, true: colors.accentFill }} />
      : onPress ? <Ionicons name="chevron-forward" size={16} color={colors.tertiary} /> : null}
  </>;
  return onPress && !toggle ? <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={value ? `${title}, ${value}` : title}
    style={[s.row, disabled && s.disabled]}>{body}</Pressable> : <View style={[s.row, disabled && s.disabled]}>{body}</View>;
}
const s = StyleSheet.create({
  group: { gap: 8 },
  title: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase", paddingHorizontal: 16 },
  card: { ...edge, borderRadius: radius.card - 4, backgroundColor: colors.surface, overflow: "hidden" },
  footer: { color: colors.secondary, fontSize: 13, lineHeight: 18, paddingHorizontal: 16 },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  divider: { position: "absolute", top: 0, left: 58, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  icon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  // A row's name always shows in full; a long value gives way instead.
  copyFirst: { flex: 0, flexShrink: 0, maxWidth: "64%" },
  rowTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "500" },
  subtitle: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  value: { flex: 1, minWidth: 0, textAlign: "right", color: colors.secondary, fontSize: 15 },
  disabled: { opacity: 0.45 },
});
