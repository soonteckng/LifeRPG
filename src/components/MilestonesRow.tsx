import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors, edge, radius } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useCharacterData } from "../hooks/useCharacterData";
import { earnedMilestones, nextMilestone } from "../utils/characterGrowth";

/** How many milestones are earned and which one is closest. Opens the collection. */
export default function MilestonesRow() {
  const router = useRouter(), { profile } = useUser(), { data } = useCharacterData();
  const totals = useMemo(() => earnedMilestones(data?.sessions ?? [], profile.timezone), [data, profile.timezone]);
  const earned = totals.milestones.filter(milestone => milestone.unlocked).length, next = nextMilestone(totals.milestones);
  return <Pressable testID="milestones-entry" onPress={() => router.navigate("/rewards")} accessibilityRole="button"
    accessibilityLabel={data ? `My Milestones, ${earned} of ${totals.milestones.length} earned${next ? `. Next: ${next.title}` : ""}` : "My Milestones"} style={s.row}>
    <View style={s.icon}><Ionicons name={next?.icon as never ?? "ribbon-outline"} size={22} color={colors.level} /></View>
    <View style={s.copy}>
      <Text style={s.title}>{data ? `${earned} of ${totals.milestones.length} earned` : "Your milestones"}</Text>
      <Text style={s.caption} numberOfLines={2}>{next ? `Next: ${next.title} · ${next.description}` : data ? "Every milestone earned. Keep going." : "Small beginnings, collected as you go."}</Text>
      {next && <View style={s.track}><View style={[s.fill, { width: `${Math.max(3, Math.round(next.progress * 100))}%` }]} /></View>}
    </View>
    <Ionicons name="chevron-forward" size={16} color={colors.tertiary} />
  </Pressable>;
}
const s = StyleSheet.create({
  row: { ...edge, flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.levelSoft },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.selection, overflow: "hidden", marginTop: 5 }, fill: { height: 4, borderRadius: 2, backgroundColor: colors.level },
});
