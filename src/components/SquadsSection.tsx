import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import { SquadFace } from "./SquadSheets";
import { colors } from "../constants/theme";
import { focusingCount, goalProgress, squadTotal, standings, weekStart } from "../utils/squads";
import { studyTime } from "../utils/studyPlan";
import type { Squad } from "../types/squads";

const DAY = 86_400_000;
/** Whole days until the squad week resets on Monday. */
export function daysLeftInWeek(now = new Date()): number {
  return Math.max(1, Math.ceil((weekStart(now) + 7 * DAY - now.getTime()) / DAY));
}
const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
/** Where you stand this week: only once you've focused, and a shared place says so. */
export function yourPlace(squad: Squad): string | null {
  if (squad.members.length < 2) return null;
  const table = standings(squad), you = table.find(item => item.member.isYou);
  if (!you?.place) return null;
  const tied = table.some(item => item !== you && item.place === you.place);
  return `you're ${tied ? "tied " : ""}${ORDINAL[you.place - 1]}`;
}

/**
 * A squad's week at a glance: who's in it, who's focusing, and the goal.
 * `large` is the Squads tab's card, with this week's top three underneath.
 * The arrow only shows where tapping the card opens something.
 */
export function SquadSummary({ squad, large = false, chevron = true }: { squad: Squad; large?: boolean; chevron?: boolean }) {
  const total = squadTotal(squad), progress = goalProgress(squad), live = focusingCount(squad), left = daysLeftInWeek(), place = yourPlace(squad);
  const face = large ? 38 : 30, top = large ? standings(squad).filter(item => item.place).slice(0, 3) : [];
  return <View style={[s.summary, large && s.summaryLarge]}>
    <View style={s.head}>
      <View style={s.faces}>{squad.members.slice(0, 3).map((member, i) => <View key={member.id} style={[s.faceSlot, { borderRadius: face / 2 + 2 }, i > 0 && { marginLeft: -10 }]}><SquadFace member={{ ...member, focusingNow: false }} size={face} /></View>)}</View>
      <View style={s.flex}>
        <Text style={[s.name, large && s.nameLarge]} numberOfLines={1}>{squad.name}</Text>
        {live ? <Text style={s.live} numberOfLines={1}>{live} focusing now{place ? ` · ${place}` : ""}</Text>
          : <Text style={s.caption} numberOfLines={1}>{squad.members.length} {squad.members.length === 1 ? "member" : "members"}{place ? ` · ${place}` : ""}</Text>}
      </View>
      {chevron && <Ionicons name="chevron-forward" size={large ? 18 : 15} color={colors.tertiary} />}
    </View>
    {progress !== null && <View style={[s.track, large && s.trackLarge]}><View style={[s.fill, { width: `${Math.max(progress > 0 ? 3 : 0, Math.round(progress * 100))}%` }, progress >= 1 && { backgroundColor: colors.success }]} /></View>}
    <View style={s.meta}>
      <Text style={[s.caption, large && s.captionLarge]} numberOfLines={1}><Text style={s.strong}>{studyTime(total)}</Text>{squad.goalMinutes ? ` of ${squad.goalMinutes / 60}h together` : " together this week"}</Text>
      <Text style={[s.caption, large && s.captionLarge]}>{progress !== null && progress >= 1 ? "Goal reached" : `${left} ${left === 1 ? "day" : "days"} left`}</Text>
    </View>
    {top.length > 0 && <View style={s.leaders}>{top.map(({ member, place }) => <View key={member.id} style={s.leader}>
      <Text style={s.place}>{place}</Text>
      <SquadFace member={member} size={24} />
      <Text style={[s.caption, s.flex]} numberOfLines={1}>{member.isYou ? "You" : member.name}</Text>
      <Text style={s.leaderTime}>{studyTime(member.weekSeconds)}</Text>
    </View>)}</View>}
  </View>;
}

const s = StyleSheet.create({
  summary: { gap: 10 }, summaryLarge: { gap: 14 }, flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  faces: { flexDirection: "row", alignItems: "center" }, faceSlot: { borderRadius: 17, borderWidth: 2, borderColor: colors.surface },
  name: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "600" }, nameLarge: { fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  live: { color: colors.success, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 }, captionLarge: { fontSize: 14, lineHeight: 19 }, strong: { color: colors.text, fontWeight: "700" },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.selection, overflow: "hidden" }, fill: { height: "100%", borderRadius: 5, backgroundColor: colors.accent },
  meta: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  trackLarge: { height: 10, borderRadius: 5 },
  leaders: { gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  leader: { flexDirection: "row", alignItems: "center", gap: 10 },
  place: { width: 14, textAlign: "center", color: colors.secondary, fontSize: 13, fontWeight: "700" },
  leaderTime: { color: colors.secondary, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
