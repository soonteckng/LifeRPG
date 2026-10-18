import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { SquadFace } from "./SquadSheets";
import { daysLeftInWeek } from "./SquadsSection";
import { colors, edge, radius } from "../constants/theme";
import { focusingCount, goalProgress, ranked, squadTotal } from "../utils/squads";
import { studyTime } from "../utils/studyPlan";
import type { Squad, SquadMember } from "../types/squads";

const PODIUM = [{ place: 2, height: 54, medal: "#C7CBD1" }, { place: 1, height: 78, medal: "#FFD60A" }, { place: 3, height: 40, medal: "#D9A066" }] as const;

/**
 * A whole squad on one page: who's in it, the week together, and a
 * leaderboard with a podium for the top three. Leaders hold someone to remove them.
 */
export default function SquadBoard({ squad, busy, onSetGoal, onRemove, onInvite }: {
  squad: Squad; busy: boolean; onSetGoal: () => void; onRemove: (member: SquadMember) => void; onInvite: () => void;
}) {
  const total = squadTotal(squad), progress = goalProgress(squad), goal = squad.goalMinutes ? squad.goalMinutes * 60 : 0, live = focusingCount(squad);
  const members = ranked(squad), left = daysLeftInWeek(), anyTime = members.some(member => member.weekSeconds > 0);
  const top = Math.max(1, members[0]?.weekSeconds ?? 0);
  const podium = anyTime && members.length >= 2 ? members.slice(0, 3) : [];
  const rest = members.slice(podium.length);
  const label = (member: SquadMember, index: number) => `${index + 1}. ${member.name}${member.isYou ? ", you" : ""}, ${studyTime(member.weekSeconds)} this week, level ${member.level}${member.focusingNow ? ", focusing now" : ""}`;
  const holdable = (member: SquadMember) => squad.ownerIsYou && !member.isYou;
  return <View style={s.stack} testID="squad-board">
    <View style={s.hero}>
      <View style={s.faces}>{squad.members.slice(0, 5).map((member, i) => <View key={member.id} style={[s.faceSlot, i > 0 && { marginLeft: -12 }]}><SquadFace member={member} size={40} ring={colors.background} /></View>)}</View>
      <Text style={s.name} accessibilityRole="header" numberOfLines={2}>{squad.name}</Text>
      <Text style={s.caption}>{squad.members.length} {squad.members.length === 1 ? "member" : "members"}{squad.ownerIsYou ? " · you lead this squad" : ""}{live ? ` · ${live} focusing now` : ""}</Text>
    </View>

    <View style={s.card} accessible accessibilityLabel={`Together this week, ${studyTime(total)}${goal ? ` of a ${squad.goalMinutes! / 60} hour goal` : ""}`}>
      <Text style={s.label}>Together this week</Text>
      <View style={s.bigRow}><Text style={s.big}>{studyTime(total)}</Text>{goal > 0 && <Text style={s.of}>of {squad.goalMinutes! / 60}h goal</Text>}</View>
      {progress !== null && <View style={s.track}><View style={[s.fill, { width: `${Math.max(progress > 0 ? 3 : 0, Math.round(progress * 100))}%` }, progress >= 1 && { backgroundColor: colors.success }]} /></View>}
      <Text style={s.caption}>{progress !== null && progress >= 1 ? "Goal reached. Nice work, everyone." : goal ? `${studyTime(goal - total)} to go · ${left} ${left === 1 ? "day" : "days"} left` : `Resets on Monday · ${left} ${left === 1 ? "day" : "days"} left`}</Text>
      {squad.ownerIsYou && !goal && <Pressable onPress={onSetGoal} accessibilityRole="button" hitSlop={8}><Text style={s.link}>Set a weekly goal</Text></Pressable>}
    </View>

    <View style={s.section}>
      <View style={s.sectionHead}><Text style={s.sectionTitle} accessibilityRole="header">Leaderboard</Text><Text style={s.caption}>This week · resets Monday</Text></View>
      {podium.length > 0 && <View style={s.podium} testID="squad-podium">
        {PODIUM.filter(slot => slot.place <= podium.length).map(slot => {
          const member = podium[slot.place - 1], hold = holdable(member);
          return <Pressable key={member.id} disabled={!hold || busy} onLongPress={hold ? () => onRemove(member) : undefined} delayLongPress={450}
            accessibilityRole={hold ? "button" : undefined} accessibilityLabel={label(member, slot.place - 1)} accessibilityHint={hold ? "Hold to remove from the squad" : undefined} style={s.podiumSlot}>
            <View style={[s.medal, { backgroundColor: slot.medal }]}><Text style={s.medalText}>{slot.place}</Text></View>
            <SquadFace member={member} size={slot.place === 1 ? 56 : 46} ring={colors.background} />
            <Text style={s.podiumName} numberOfLines={1}>{member.isYou ? "You" : member.name}</Text>
            <Text style={s.podiumTime}>{studyTime(member.weekSeconds)}</Text>
            <View style={[s.pillar, { height: slot.height }, slot.place === 1 && s.pillarFirst]} />
          </Pressable>;
        })}
      </View>}
      {rest.length > 0 && <View style={s.list}>{rest.map((member, index) => {
        const place = podium.length + index, hold = holdable(member);
        const row = <>
          <Text style={s.rank}>{place + 1}</Text>
          <SquadFace member={member} ring={colors.surface} />
          <View style={s.flex}>
            <View style={s.nameRow}><Text style={s.rowName} numberOfLines={1}>{member.name}{member.isYou ? <Text style={s.you}> (you)</Text> : null}</Text><Text style={s.time}>{studyTime(member.weekSeconds)}</Text></View>
            <View style={s.nameRow}><View style={s.thin}><View style={[s.thinFill, { width: `${Math.round(100 * member.weekSeconds / top)}%` }]} /></View><Text style={s.meta}>Lv {member.level}</Text></View>
          </View>
        </>;
        return hold ? <Pressable key={member.id} disabled={busy} onLongPress={() => onRemove(member)} delayLongPress={450} accessibilityRole="button" accessibilityLabel={label(member, place)}
          accessibilityHint="Hold to remove from the squad" style={[s.row, index > 0 && s.line]}>{row}</Pressable>
          : <View key={member.id} accessible accessibilityLabel={label(member, place)} style={[s.row, index > 0 && s.line]}>{row}</View>;
      })}</View>}
      {!anyTime && <Text style={s.hint}>No focus time yet this week. The first session puts someone on the podium.</Text>}
    </View>

    <View style={s.invite}>
      <View style={s.code} accessible accessibilityLabel={`Invite code ${squad.code.split("").join(" ")}`}><Text style={s.codeLabel}>Invite code</Text><Text style={s.codeText}>{squad.code}</Text></View>
      <Pressable onPress={onInvite} accessibilityRole="button" accessibilityLabel="Invite friends" style={s.primary}><Ionicons name="share-outline" size={17} color={colors.primaryText} /><Text style={s.primaryText}>Invite friends</Text></Pressable>
    </View>
    <Text style={s.hint}>{squad.ownerIsYou && squad.members.length > 1 ? "Hold someone to remove them. " : ""}Only members see each other’s time. All focus counts, routines and study alike.</Text>
  </View>;
}
const s = StyleSheet.create({
  stack: { gap: 16 }, flex: { flex: 1, minWidth: 0 },
  hero: { gap: 8, paddingHorizontal: 4 },
  faces: { flexDirection: "row", alignItems: "center", marginBottom: 2 }, faceSlot: { borderRadius: 22, borderWidth: 2, borderColor: colors.background },
  name: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: "800", letterSpacing: -0.6 },
  card: { ...edge, gap: 8, borderRadius: radius.card, backgroundColor: colors.surface, padding: 16 },
  label: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase" },
  bigRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  big: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "800", fontVariant: ["tabular-nums"] }, of: { color: colors.secondary, fontSize: 15 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.selection, overflow: "hidden", marginTop: 2 }, fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, link: { color: colors.accent, fontSize: 15, fontWeight: "600", marginTop: 2 },
  section: { gap: 10, marginTop: 6 },
  sectionHead: { gap: 1, paddingHorizontal: 4 },
  sectionTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  podium: { ...edge, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 10, paddingTop: 18, paddingHorizontal: 12, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
  podiumSlot: { flex: 1, maxWidth: 120, alignItems: "center", gap: 4 },
  medal: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  medalText: { color: "#1C1C1E", fontSize: 12, fontWeight: "800" },
  podiumName: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "600", marginTop: 4, maxWidth: "100%" },
  podiumTime: { color: colors.secondary, fontSize: 13, lineHeight: 17, fontVariant: ["tabular-nums"] },
  pillar: { alignSelf: "stretch", marginTop: 6, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: colors.sheetCard },
  pillarFirst: { backgroundColor: "rgba(255,214,10,0.18)" },
  list: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rank: { width: 18, textAlign: "center", color: colors.secondary, fontSize: 15, fontWeight: "700" },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowName: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" }, you: { color: colors.secondary, fontWeight: "500" },
  time: { color: colors.secondary, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
  thin: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.selection, overflow: "hidden" }, thinFill: { height: 5, borderRadius: 3, backgroundColor: colors.accent },
  meta: { color: colors.secondary, fontSize: 13, minWidth: 40, textAlign: "right" },
  invite: { flexDirection: "row", gap: 10, marginTop: 4 },
  code: { ...edge, flex: 1, minHeight: 54, borderRadius: 27, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  codeLabel: { color: colors.secondary, fontSize: 12, lineHeight: 15 }, codeText: { color: colors.text, fontSize: 17, lineHeight: 21, fontWeight: "700", letterSpacing: 2 },
  primary: { flex: 1, minHeight: 54, borderRadius: 27, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
  hint: { color: colors.tertiary, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
});
