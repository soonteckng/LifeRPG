import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useCharacterData } from "../hooks/useCharacterData";
import { earnedMilestones, MILESTONE_TRACKS, nextMilestone } from "../utils/characterGrowth";
import { durationLabel } from "../utils/progressAnalytics";

export type Milestone = ReturnType<typeof earnedMilestones>["milestones"][number];
export function milestoneProgressLabel(milestone: Milestone) {
  return milestone.unit === "seconds" ? `${durationLabel(milestone.value)} of ${durationLabel(milestone.target)}` : `${milestone.value} of ${milestone.target} ${milestone.unit}`;
}
/** Earned milestones, the nearest next one, and the totals behind them. */
export function useMilestones() {
  const { profile } = useUser(), growth = useCharacterData();
  const totals = useMemo(() => earnedMilestones(growth.data?.sessions ?? [], profile.timezone), [growth.data, profile.timezone]);
  return { ready: !!growth.data, error: growth.error, retry: growth.refresh, totals, earned: totals.milestones.filter(item => item.unlocked), next: nextMilestone(totals.milestones) };
}

/**
 * Every milestone in one sheet: what you've earned, what's within reach and
 * each track's path. Tap one to see how far along it is. Opens from Home and Progress.
 */
export default function MilestonesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { ready, error, retry, totals, earned, next } = useMilestones();
  const { profile } = useUser();
  const [open, setOpen] = useState<string | null>(null), [showAll, setShowAll] = useState(false);
  // Another account starts with the collection folded.
  const [owner, setOwner] = useState(profile.id);
  if (owner !== profile.id) { setOwner(profile.id); setOpen(null); setShowAll(false); }
  const upcoming = totals.milestones.filter(item => !item.unlocked);
  const row = (milestone: Milestone, index: number) => {
    const expanded = open === milestone.id;
    return <Pressable key={milestone.id} onPress={() => setOpen(expanded ? null : milestone.id)} accessibilityRole="button" accessibilityState={{ expanded }}
      accessibilityLabel={`${milestone.title}, ${milestone.unlocked ? "earned" : milestoneProgressLabel(milestone)}`} style={[s.row, index > 0 && s.line]}>
      <View style={s.rowHead}>
        <View style={[s.icon, milestone.unlocked && s.iconEarned]}><Ionicons name={milestone.icon as never} size={19} color={milestone.unlocked ? colors.success : colors.level} /></View>
        <View style={s.flex}><Text style={s.rowTitle}>{milestone.title}</Text><Text style={s.caption} numberOfLines={expanded ? undefined : 1}>{milestone.description}</Text></View>
        <Ionicons name={milestone.unlocked ? "checkmark-circle" : expanded ? "chevron-up" : "chevron-down"} size={18} color={milestone.unlocked ? colors.success : colors.tertiary} />
      </View>
      {!milestone.unlocked && <View style={s.meterRow}><View style={s.track}><View style={[s.fill, { width: `${Math.max(3, Math.round(milestone.progress * 100))}%` }]} /></View>
        <Text style={s.small}>{Math.round(milestone.progress * 100)}%</Text></View>}
      {expanded && <Text style={s.caption}>{milestone.unlocked ? "Earned automatically. Yours to keep, even after a missed day." : `${milestoneProgressLabel(milestone)}. It’s earned automatically when you get there.`}</Text>}
    </Pressable>;
  };
  return <AppSheet visible={visible} onRequestClose={onClose} onDismiss={() => setOpen(null)} attached maxHeightRatio={0.9} label="milestones" motionMode="timed"
    header={<SheetHeader title="My Milestones" subtitle={ready ? `${earned.length} of ${totals.milestones.length} earned` : "Getting your collection ready…"} onClose={onClose} />}>
    <BottomSheetScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      {error && <Pressable onPress={() => void retry()} accessibilityRole="button" style={s.card}><Text style={s.error}>Couldn’t refresh milestones. Tap to try again.</Text></Pressable>}
      {/* Nothing is counted until this account's history has arrived. */}
      {!ready && !error && <View style={s.card}><Text style={s.caption}>Getting your collection ready…</Text></View>}
      {ready && <>
      <View style={s.card} accessible accessibilityLabel={`${earned.length} of ${totals.milestones.length} milestones earned`}>
        <View style={s.summaryRow}>
          <Text style={s.big}>{earned.length}<Text style={s.of}> / {totals.milestones.length}</Text></Text>
          <View style={s.stats}><Text style={s.stat}>{durationLabel(totals.seconds)} focused</Text><Text style={s.stat}>{totals.sessions} sessions · {totals.days} days</Text></View>
        </View>
        <View style={s.track}><View style={[s.fill, s.fillGold, { width: `${Math.max(2, Math.round(100 * earned.length / Math.max(1, totals.milestones.length)))}%` }]} /></View>
      </View>
      {next && <View style={[s.card, s.next]} testID="milestone-next">
        <Text style={s.label}>Within reach</Text>
        <View style={s.rowHead}><Ionicons name={next.icon as never} size={26} color={colors.level} /><Text style={[s.nextTitle, s.flex]}>{next.title}</Text></View>
        <Text style={s.caption}>{next.description}</Text>
        <View style={s.track}><View style={[s.fill, s.fillGold, { width: `${Math.max(3, Math.round(next.progress * 100))}%` }]} /></View>
        <Text style={s.small}>{milestoneProgressLabel(next)}</Text>
      </View>}
      {!!earned.length && <>
        <Text style={s.label}>Earned</Text>
        <View style={s.badges}>{earned.map(milestone => <View key={milestone.id} style={s.badge} accessible accessibilityLabel={`${milestone.title}, earned`}>
          <Ionicons name={milestone.icon as never} size={22} color={colors.success} /><Text style={s.badgeText} numberOfLines={2}>{milestone.title}</Text>
        </View>)}</View>
      </>}
      {!!upcoming.length && <>
        <View style={s.pathHead}><Text style={[s.label, s.flex]}>Your path</Text>
          <Pressable onPress={() => setShowAll(value => !value)} accessibilityRole="button" accessibilityState={{ expanded: showAll }} hitSlop={8}>
            <Text style={s.link}>{showAll ? "Show next" : "Show all"}</Text></Pressable></View>
        {MILESTONE_TRACKS.map(track => {
          const remaining = upcoming.filter(item => item.track === track.id);
          if (!remaining.length) return null;
          return <View key={track.id} style={s.group}>
            <View style={s.groupHead}><Text style={s.rowTitle}>{track.title}</Text><Text style={s.caption}>{track.description}</Text></View>
            {(showAll ? remaining : remaining.slice(0, 1)).map((item, index) => row(item, index + 1))}
          </View>;
        })}
      </>}
      </>}
      {ready && !upcoming.length && <View style={s.card}><Text style={s.rowTitle}>A collection worth being proud of.</Text><Text style={s.caption}>You’ve earned every milestone. Each session still grows your character.</Text></View>}
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 }, flex: { flex: 1, minWidth: 0 },
  card: { ...edge, padding: 16, gap: 10, borderRadius: 22, backgroundColor: colors.sheetCard },
  next: { borderColor: "rgba(255,214,10,0.28)" },
  summaryRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  big: { color: colors.text, fontSize: 34, lineHeight: 40, fontWeight: "800", fontVariant: ["tabular-nums"] }, of: { color: colors.secondary, fontSize: 18, fontWeight: "600" },
  stats: { alignItems: "flex-end", gap: 2 }, stat: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  label: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: 4 },
  nextTitle: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: "700" },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.selection, overflow: "hidden", flex: 1 }, fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  fillGold: { backgroundColor: colors.level },
  small: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontVariant: ["tabular-nums"] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: { ...edge, width: "31.5%", minHeight: 88, padding: 10, gap: 6, borderRadius: 18, backgroundColor: colors.sheetCard, alignItems: "flex-start" },
  badgeText: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: "600" },
  pathHead: { flexDirection: "row", alignItems: "center", paddingRight: 4, marginTop: 4 },
  link: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  group: { ...edge, borderRadius: 22, backgroundColor: colors.sheetCard, overflow: "hidden" },
  groupHead: { padding: 14, paddingBottom: 10, gap: 2 },
  row: { padding: 14, gap: 8 }, line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.levelSoft },
  iconEarned: { backgroundColor: "rgba(48,209,88,0.14)" },
  meterRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
