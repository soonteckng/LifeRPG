import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { SquadFace, SquadJoinSheet, SquadSheet } from "./SquadSheets";
import { colors, edge, radius } from "../constants/theme";
import { useSquads } from "../hooks/useSquads";
import { focusingCount, goalProgress, ranked, squadTotal, weekStart } from "../utils/squads";
import { studyTime } from "../utils/studyPlan";
import type { Squad } from "../types/squads";

const DAY = 86_400_000;
/** Whole days until the squad week resets on Monday. */
export function daysLeftInWeek(now = new Date()): number {
  return Math.max(1, Math.ceil((weekStart(now) + 7 * DAY - now.getTime()) / DAY));
}

/** A squad's week at a glance: goal bar, who's focusing, and the top of the table. */
export function SquadSummary({ squad, compact = false }: { squad: Squad; compact?: boolean }) {
  const total = squadTotal(squad), progress = goalProgress(squad), live = focusingCount(squad), members = ranked(squad), top = Math.max(1, members[0]?.weekSeconds ?? 0);
  const left = daysLeftInWeek();
  return <View style={s.summary}>
    <View style={s.head}>
      {compact && <View style={s.faces}>{squad.members.slice(0, 3).map((member, i) => <View key={member.id} style={[s.faceSlot, i > 0 && { marginLeft: -10 }]}><SquadFace member={{ ...member, focusingNow: false }} size={28} /></View>)}</View>}
      <View style={s.flex}>
        <Text style={s.name} numberOfLines={1}>{squad.name}</Text>
        {live ? <Text style={s.live} numberOfLines={1}>● {live} focusing now</Text>
          : <Text style={s.caption} numberOfLines={1}>{squad.members.length} {squad.members.length === 1 ? "member" : "members"}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
    </View>
    {progress !== null && <View style={s.track}><View style={[s.fill, { width: `${Math.max(progress > 0 ? 3 : 0, Math.round(progress * 100))}%` }, progress >= 1 && { backgroundColor: colors.success }]} /></View>}
    <View style={s.meta}>
      <Text style={s.caption} numberOfLines={1}><Text style={s.strong}>{studyTime(total)}</Text>{squad.goalMinutes ? ` of ${squad.goalMinutes / 60}h together` : " together this week"}</Text>
      <Text style={s.caption}>{progress !== null && progress >= 1 ? "Goal reached" : `${left} ${left === 1 ? "day" : "days"} left`}</Text>
    </View>
    {!compact && <View style={s.members}>{members.slice(0, 4).map(member => <View key={member.id} style={s.member}>
      <SquadFace member={member} size={26} ring={colors.surface} />
      <View style={s.flex}><Text style={s.memberName} numberOfLines={1}>{member.name}{member.isYou ? <Text style={s.caption}> (you)</Text> : null}</Text>
        <View style={s.thin}><View style={[s.thinFill, { width: `${Math.round(100 * member.weekSeconds / top)}%` }]} /></View></View>
      <Text style={s.time}>{studyTime(member.weekSeconds)}</Text>
    </View>)}</View>}
  </View>;
}

/** Squads in Progress: every squad you're in, plus join and create. */
export default function SquadsSection() {
  const squads = useSquads();
  const [sheet, setSheet] = useState<{ kind: "squad"; id: string } | { kind: "join" } | null>(null);
  const [open, setOpen] = useState(false);
  const refresh = squads.refresh;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const show = (next: NonNullable<typeof sheet>) => { setSheet(next); setOpen(true); };
  const leading = squads.squads.find(squad => squad.ownerIsYou)?.name ?? null;
  return <View style={s.section} testID="squads-section">
    <View style={s.sectionHead}>
      <Text style={s.title} accessibilityRole="header">Squads</Text>
      <Pressable onPress={() => show({ kind: "join" })} accessibilityRole="button" accessibilityLabel="Join or create a squad" hitSlop={8} style={s.add}><Ionicons name="add" size={18} color={colors.accent} /></Pressable>
    </View>
    {squads.squads.map(squad => <Pressable key={squad.id} onPress={() => show({ kind: "squad", id: squad.id })} accessibilityRole="button"
      accessibilityLabel={`${squad.name}, ${studyTime(squadTotal(squad))} together this week${squad.goalMinutes ? ` of ${squad.goalMinutes / 60} hours` : ""}. Open squad`} style={s.card}>
      <SquadSummary squad={squad} />
    </Pressable>)}
    {!squads.squads.length && <View style={[s.card, s.empty]}>
      <View style={s.emptyIcon}><Ionicons name="people-outline" size={20} color={colors.accent} /></View>
      <View style={s.flex}><Text style={s.name}>Focus with friends</Text>
        <Text style={s.caption}>{squads.error && !squads.ready ? squads.error : "Make a squad, share the code, and keep each other going each week."}</Text></View>
      <Pressable onPress={() => show({ kind: "join" })} accessibilityRole="button" accessibilityLabel="Join or create a squad" style={s.pill}><Text style={s.pillText}>Start</Text></Pressable>
    </View>}
    <Text style={s.hint}>All focus time counts, routines and study alike.</Text>
    <SquadSheet visible={open && sheet?.kind === "squad"} squad={sheet?.kind === "squad" ? squads.squads.find(item => item.id === sheet.id) ?? null : null}
      onClose={() => setOpen(false)} onLeave={squads.leave} onRemove={squads.remove} onUpdate={squads.update} />
    <SquadJoinSheet visible={open && sheet?.kind === "join"} online={squads.online} leading={leading} memberships={squads.squads.length}
      onClose={() => setOpen(false)} onJoin={squads.join} onCreate={squads.create} />
  </View>;
}

const s = StyleSheet.create({
  section: { gap: 10, marginBottom: 24 }, flex: { flex: 1, minWidth: 0 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  add: { ...edge, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  card: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, padding: 16 },
  summary: { gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  faces: { flexDirection: "row", alignItems: "center" }, faceSlot: { borderRadius: 16, borderWidth: 2, borderColor: colors.surface },
  name: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "600" },
  live: { color: colors.success, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 }, strong: { color: colors.text, fontWeight: "700" },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.selection, overflow: "hidden" }, fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  meta: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  members: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  member: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 34 },
  memberName: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "500" },
  thin: { height: 4, borderRadius: 2, backgroundColor: colors.selection, overflow: "hidden", marginTop: 4 }, thinFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  time: { color: colors.secondary, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"], minWidth: 54, textAlign: "right" },
  empty: { flexDirection: "row", alignItems: "center", gap: 12 },
  emptyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  pill: { minHeight: 36, paddingHorizontal: 16, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  pillText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  hint: { color: colors.tertiary, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
});
