import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import { SquadFace } from "./SquadSheets";
import { colors } from "../constants/theme";
import { focusingCount, goalProgress, ranked, squadTotal, weekStart } from "../utils/squads";
import { studyTime } from "../utils/studyPlan";
import type { Squad } from "../types/squads";

const DAY = 86_400_000;
/** Whole days until the squad week resets on Monday. */
export function daysLeftInWeek(now = new Date()): number {
  return Math.max(1, Math.ceil((weekStart(now) + 7 * DAY - now.getTime()) / DAY));
}
const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
/** Where you stand in the squad this week, once anyone has focused. */
export function yourPlace(squad: Squad): string | null {
  if (squad.members.length < 2 || !squadTotal(squad)) return null;
  const index = ranked(squad).findIndex(member => member.isYou);
  return index < 0 ? null : `you're ${ORDINAL[index]}`;
}

/** A squad's week at a glance: who's in it, who's focusing, and the goal. */
export function SquadSummary({ squad }: { squad: Squad }) {
  const total = squadTotal(squad), progress = goalProgress(squad), live = focusingCount(squad), left = daysLeftInWeek(), place = yourPlace(squad);
  return <View style={s.summary}>
    <View style={s.head}>
      <View style={s.faces}>{squad.members.slice(0, 3).map((member, i) => <View key={member.id} style={[s.faceSlot, i > 0 && { marginLeft: -10 }]}><SquadFace member={{ ...member, focusingNow: false }} size={30} /></View>)}</View>
      <View style={s.flex}>
        <Text style={s.name} numberOfLines={1}>{squad.name}</Text>
        {live ? <Text style={s.live} numberOfLines={1}>{live} focusing now{place ? ` · ${place}` : ""}</Text>
          : <Text style={s.caption} numberOfLines={1}>{squad.members.length} {squad.members.length === 1 ? "member" : "members"}{place ? ` · ${place}` : ""}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
    </View>
    {progress !== null && <View style={s.track}><View style={[s.fill, { width: `${Math.max(progress > 0 ? 3 : 0, Math.round(progress * 100))}%` }, progress >= 1 && { backgroundColor: colors.success }]} /></View>}
    <View style={s.meta}>
      <Text style={s.caption} numberOfLines={1}><Text style={s.strong}>{studyTime(total)}</Text>{squad.goalMinutes ? ` of ${squad.goalMinutes / 60}h together` : " together this week"}</Text>
      <Text style={s.caption}>{progress !== null && progress >= 1 ? "Goal reached" : `${left} ${left === 1 ? "day" : "days"} left`}</Text>
    </View>
  </View>;
}

const s = StyleSheet.create({
  summary: { gap: 10 }, flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  faces: { flexDirection: "row", alignItems: "center" }, faceSlot: { borderRadius: 17, borderWidth: 2, borderColor: colors.surface },
  name: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "600" },
  live: { color: colors.success, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 }, strong: { color: colors.text, fontWeight: "700" },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.selection, overflow: "hidden" }, fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  meta: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
});
