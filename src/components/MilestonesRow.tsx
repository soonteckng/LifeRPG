import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import MilestonesSheet, { milestoneProgressLabel, useMilestones } from "./MilestonesSheet";
import { colors, edge, radius } from "../constants/theme";

/**
 * Your nearest milestone and how many are earned. Tapping opens the whole
 * collection as a sheet, in Progress and on Home alike.
 */
export default function MilestonesRow({ open: openProp, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { ready, totals, earned, next } = useMilestones();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (value: boolean) => { setOwnOpen(value); onOpenChange?.(value); };
  return <>
    <Pressable testID="milestones-entry" onPress={() => setOpen(true)} accessibilityRole="button"
      accessibilityLabel={ready ? `My Milestones, ${earned.length} of ${totals.milestones.length} earned${next ? `. Next: ${next.title}` : ""}` : "My Milestones"} style={s.row}>
      <View style={s.icon}><Ionicons name={next?.icon as never ?? "ribbon-outline"} size={22} color={colors.level} /></View>
      <View style={s.copy}>
        <View style={s.head}><Text style={s.title} numberOfLines={1}>{next ? next.title : ready ? "Every milestone earned" : "Your milestones"}</Text>
          {ready && <Text style={s.count}>{earned.length}/{totals.milestones.length}</Text>}</View>
        <Text style={s.caption} numberOfLines={1}>{next ? milestoneProgressLabel(next) : ready ? "Keep going. Every session still counts." : "Small beginnings, collected as you go."}</Text>
        {next && <View style={s.track}><View style={[s.fill, { width: `${Math.max(3, Math.round(next.progress * 100))}%` }]} /></View>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.tertiary} />
    </Pressable>
    <MilestonesSheet visible={open} onClose={() => setOpen(false)} />
  </>;
}
const s = StyleSheet.create({
  row: { ...edge, flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.levelSoft },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  count: { color: colors.level, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.selection, overflow: "hidden", marginTop: 5 }, fill: { height: 4, borderRadius: 2, backgroundColor: colors.level },
});
