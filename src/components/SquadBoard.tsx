import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { SquadFace, SquadMemberSheet } from "./SquadSheets";
import { PinnedAction } from "./PinnedAction";
import { daysLeftInWeek } from "./SquadsSection";
import { colors, edge, radius } from "../constants/theme";
import { circleOrder, focusingCount, goalProgress, squadTotal } from "../utils/squads";
import { studyTime } from "../utils/studyPlan";
import type { Squad, SquadMember } from "../types/squads";

const SQUAD_SIZE = 8;

/**
 * A whole squad on one page: who's in it and the week together. Members are
 * a circle, never a ranking: whoever is focusing now comes first, then
 * everyone by name. Tap someone to see their week; the leader removes people
 * from there, never with a stray hold.
 */
export default function SquadBoard({ squad, busy, onSetGoal, onRemove, onInvite }: {
  squad: Squad; busy: boolean; onSetGoal: () => void; onRemove: (member: SquadMember, newCode: boolean) => void; onInvite: () => void;
}) {
  const total = squadTotal(squad), progress = goalProgress(squad), goal = squad.goalMinutes ? squad.goalMinutes * 60 : 0, live = focusingCount(squad);
  const members = circleOrder(squad), left = daysLeftInWeek();
  const seats = Math.max(0, Math.min(SQUAD_SIZE - squad.members.length, 4 - squad.members.length));
  const [open, setOpen] = useState<string | null>(null), [shown, setShown] = useState<string | null>(null);
  if (open && open !== shown) setShown(open);
  const picked = members.find(member => member.id === shown) ?? null;
  const label = (member: SquadMember) => `${member.name}${member.isYou ? ", you" : ""}, ${member.weekSeconds > 0 ? `${studyTime(member.weekSeconds)} this week` : "not started this week"}${member.focusingNow ? ", focusing now" : ""}`;
  return <View style={s.board} testID="squad-board">
    <View style={s.hero}>
      <View style={s.faces}>{squad.members.slice(0, 5).map((member, i) => <View key={member.id} style={[s.faceSlot, i > 0 && { marginLeft: -12 }]}><SquadFace member={member} size={54} ring={colors.background} /></View>)}</View>
      <Text style={s.name} accessibilityRole="header" numberOfLines={2}>{squad.name}</Text>
      <Text style={s.caption}>{squad.members.length} {squad.members.length === 1 ? "member" : "members"}{squad.ownerIsYou ? " · you lead this squad" : ""}{live ? ` · ${live} focusing now` : ""}</Text>
    </View>

    <View style={s.card} accessible accessibilityLabel={`Together this week, ${studyTime(total)}${goal ? ` of a ${squad.goalMinutes! / 60} hour goal` : ""}`}>
      <Text style={s.label}>Together this week</Text>
      <View style={s.bigRow}><Text style={s.big}>{studyTime(total)}</Text>{goal > 0 && <Text style={s.of}>of {squad.goalMinutes! / 60}h goal</Text>}</View>
      {progress !== null && <View style={s.track}><View style={[s.fill, { width: `${Math.max(progress > 0 ? 3 : 0, Math.round(progress * 100))}%` }, progress >= 1 && { backgroundColor: colors.success }]} /></View>}
      <Text style={s.caption}>{!total ? `Nobody has focused yet this week. Be the first · ${left} ${left === 1 ? "day" : "days"} left` : progress !== null && progress >= 1 ? "Goal reached. Nice work, everyone." : goal ? `${studyTime(goal - total)} to go · ${left} ${left === 1 ? "day" : "days"} left` : `Resets on Monday · ${left} ${left === 1 ? "day" : "days"} left`}</Text>
      {squad.ownerIsYou && !goal && <Pressable onPress={onSetGoal} accessibilityRole="button" hitSlop={8}><Text style={s.link}>Set a weekly goal</Text></Pressable>}
    </View>

    <View style={s.section}>
      <View style={s.sectionHead}><Text style={s.sectionTitle} accessibilityRole="header">Your circle</Text><Text style={s.caption}>This week · resets Monday</Text></View>
      <View style={s.table} testID="squad-members">{members.map((member, index) => <Pressable key={member.id} onPress={() => setOpen(member.id)}
        accessibilityRole="button" accessibilityLabel={label(member)} accessibilityHint="Shows their week" style={[s.row, index > 0 && s.line, member.isYou && s.rowYou]}>
        <SquadFace member={member} ring={member.isYou ? colors.sheetCard : colors.surface} />
        <View style={s.flex}>
          <Text style={s.rowName} numberOfLines={1}>{member.isYou ? "You" : member.name}</Text>
          <Text style={[s.idle, member.focusingNow && s.live]} numberOfLines={1}>{member.focusingNow ? "Focusing now" : member.weekSeconds > 0 ? `${studyTime(member.weekSeconds)} this week` : "Not started this week"}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.tertiary} />
      </Pressable>)}</View>
      {/* A small squad shows its empty seats, each one an invite. */}
      {Array.from({ length: seats }, (_, index) => <Pressable key={`seat-${index}`} onPress={onInvite} accessibilityRole="button" accessibilityLabel="Open seat. Invite a friend" testID="squad-open-seat" style={[s.row, s.seat]}>
        <View style={s.seatFace}><Ionicons name="add" size={18} color={colors.tertiary} /></View>
        <Text style={[s.flex, s.seatText]}>Open seat</Text>
        <Text style={s.seatInvite}>Invite</Text>
      </Pressable>)}
    </View>
    {/* The invite pins to the bottom, so it never needs a scroll to find. */}
    <PinnedAction><View style={s.invite}>
      <View style={s.code} accessible accessibilityLabel={`Invite code ${squad.code.split("").join(" ")}`}><Text style={s.codeLabel}>Invite code</Text><Text style={s.codeText}>{squad.code}</Text></View>
      <Pressable onPress={onInvite} accessibilityRole="button" accessibilityLabel="Invite friends" style={s.primary}><Ionicons name="share-outline" size={17} color={colors.primaryText} /><Text style={s.primaryText}>Invite friends</Text></Pressable>
    </View></PinnedAction>
    <SquadMemberSheet member={open ? picked : null} leader={squad.ownerIsYou} busy={busy}
      onClose={() => setOpen(null)} onDismiss={() => setShown(null)}
      onRemove={(member, newCode) => { setOpen(null); onRemove(member, newCode); }} />
  </View>;
}
const s = StyleSheet.create({
  board: { gap: 16 }, flex: { flex: 1, minWidth: 0 },
  hero: { gap: 8, paddingHorizontal: 4 },
  faces: { flexDirection: "row", alignItems: "flex-start", marginBottom: 2 }, faceSlot: {},
  name: { color: colors.text, fontSize: 30, lineHeight: 36, fontFamily: "display", letterSpacing: -0.6 },
  card: { ...edge, gap: 8, borderRadius: radius.card, backgroundColor: colors.surface, padding: 16 },
  label: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase" },
  bigRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  big: { color: colors.text, fontSize: 34, lineHeight: 40, fontFamily: "display", fontVariant: ["tabular-nums"] }, of: { color: colors.secondary, fontSize: 15 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.selection, overflow: "hidden", marginTop: 2 }, fill: { height: 8, borderRadius: 4, backgroundColor: colors.progress },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, link: { color: colors.accent, fontSize: 15, fontWeight: "600", marginTop: 2 },
  section: { gap: 10, marginTop: 6 },
  sectionHead: { gap: 1, paddingHorizontal: 4 },
  sectionTitle: { color: colors.text, fontSize: 22, lineHeight: 28, fontFamily: "display", fontWeight: "500", letterSpacing: -0.3 },
  table: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  rowYou: { backgroundColor: colors.sheetCard },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  seat: { ...edge, borderRadius: 18, borderStyle: "dashed", borderColor: colors.border, backgroundColor: "transparent" },
  seatFace: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  seatText: { color: colors.secondary, fontSize: 15 }, seatInvite: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  rowName: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  idle: { color: colors.secondary, fontSize: 13, lineHeight: 18 }, live: { color: colors.success, fontWeight: "600" },
  invite: { flexDirection: "row", gap: 10 },
  code: { ...edge, flex: 1, minHeight: 54, borderRadius: 27, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  codeLabel: { color: colors.secondary, fontSize: 12, lineHeight: 15 }, codeText: { color: colors.text, fontSize: 17, lineHeight: 21, fontWeight: "700", letterSpacing: 2 },
  primary: { flex: 1, minHeight: 54, borderRadius: 27, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
});
