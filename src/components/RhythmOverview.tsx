import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { colors, radius } from "../constants/theme";
import { calendarLabel, totalLabel, type ProgressDay } from "../utils/progressAnalytics";
import type { QuietMarker } from "../utils/quietMarkers";

export type RhythmActivity = { key: string; title: string; seconds: number };

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();

/** What the lilac card says under the week's circles. */
export function restLine(restedThisWeek: string[], restDays: number, daysHere: number) {
  const ready = restDays > 0 ? `${restDays} more rest ${restDays === 1 ? "day is" : "days are"} ready if you need ${restDays === 1 ? "it" : "them"}.` : "";
  if (restedThisWeek.length) {
    const names = restedThisWeek.map(key => WEEKDAYS[weekday(key)]);
    const said = names.length === 1 ? `${names[0]} was a rest day` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} were rest days`;
    return `${said}, so your streak kept going.${ready ? ` ${ready}` : ""}`;
  }
  if (ready) return `Missed a day? ${ready}`;
  return daysHere ? "A little time, day after day." : "Your first session starts this week’s story. Even 15 minutes counts.";
}

/**
 * Mockup 08: this week at a glance. The detailed charts live under History.
 */
export default function RhythmOverview({ start, end, seconds, days, today, streak, restDays = 0, rested = [], activities, goalMinutes, markers, onGoal }: {
  start: string; end: string; seconds: number; days: ProgressDay[]; today: string;
  streak: number; restDays?: number; rested?: string[];
  activities: RhythmActivity[]; goalMinutes?: number | null; markers: QuietMarker[];
  onGoal?: () => void;
}) {
  const daysHere = days.filter(day => day.seconds > 0).length;
  const restedThisWeek = days.filter(day => day.seconds <= 0 && rested.includes(day.key)).map(day => day.key);
  const top = Math.max(1, ...activities.map(item => item.seconds));
  return <View style={s.page} testID="rhythm-overview">
    <View style={s.total}>
      <Text style={s.range}>This week · {calendarLabel(start, { day: "numeric", month: "short" })} to {calendarLabel(end, { day: "numeric", month: "short" })}</Text>
      <View style={s.totalRow} accessible accessibilityLabel={`${totalLabel(seconds)} focused this week`}>
        <Text style={s.totalValue} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6}>{totalLabel(seconds)}</Text>
        <Text style={s.totalUnit}>focused</Text>
      </View>
    </View>

    <View style={s.week} testID="rhythm-week">
      <View style={s.weekHead}>
        <Text style={s.weekTitle}>{daysHere} {daysHere === 1 ? "day" : "days"} here</Text>
        {streak > 0 && <Text style={s.weekStreak}>{streak}-day streak</Text>}
      </View>
      <View style={s.circles}>
        {days.map(day => {
          const done = day.seconds > 0, rest = !done && rested.includes(day.key), future = day.key > today;
          const label = `${WEEKDAYS[weekday(day.key)]}, ${done ? `${totalLabel(day.seconds)} focused` : rest ? "rest day" : future ? "still ahead" : "no session"}`;
          return <View key={day.key} style={s.dayCol} accessible accessibilityLabel={label} testID={`rhythm-day-${day.key}`}>
            <Text style={s.letter}>{LETTERS[weekday(day.key)]}</Text>
            <View style={[s.circle, done && s.circleDone, rest && s.circleRest, day.key === today && !done && s.circleToday]}>
              {done ? <Ionicons name="checkmark" size={16} color={colors.primaryText} /> : rest ? <Text style={s.restText}>rest</Text> : null}
            </View>
          </View>;
        })}
      </View>
      <Text style={s.weekLine}>{restLine(restedThisWeek, restDays, daysHere)}</Text>
    </View>

    {activities.length > 0 && <View style={s.section} testID="rhythm-activities">
      <Text style={s.sectionTitle} accessibilityRole="header">Time by activity</Text>
      {activities.map(item => <View key={item.key} style={s.activity} accessible accessibilityLabel={`${item.title}, ${totalLabel(item.seconds)}`}>
        <View style={s.activityRow}>
          <Text style={s.activityTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={s.activityValue}>{totalLabel(item.seconds)}</Text>
        </View>
        <View style={s.track}><View style={[s.fill, { width: `${Math.max(4, Math.round(item.seconds / top * 100))}%` }]} /></View>
      </View>)}
    </View>}

    {!!goalMinutes && <>
      <View style={s.rule} />
      <Pressable style={s.goal} onPress={onGoal} disabled={!onGoal} accessibilityRole={onGoal ? "button" : undefined}
        accessibilityLabel={`Daily goal, ${goalMinutes} minutes${onGoal ? ". Change it on Today" : ""}`} testID="rhythm-goal">
        <Text style={s.goalLabel}>Daily goal</Text>
        <Text style={s.goalValue}>{goalMinutes} min{onGoal ? " ›" : ""}</Text>
      </Pressable>
    </>}

    {markers.length > 0 && <View style={s.section}>
      <Text style={s.sectionTitle} accessibilityRole="header">Along the way</Text>
      <View testID="quiet-markers">
        {markers.map((marker, index) => <View key={marker.id} style={[s.marker, index > 0 && s.markerLine]} accessible accessibilityLabel={marker.text}>
          <Ionicons name={marker.icon} size={18} color={colors.accent} />
          <Text style={s.markerText}>{marker.text}</Text>
        </View>)}
      </View>
    </View>}
  </View>;
}

const s = StyleSheet.create({
  page: { gap: 24 },
  total: { gap: 2 },
  range: { color: colors.secondary, fontSize: 15, lineHeight: 20 },
  totalRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  totalValue: { color: colors.text, fontFamily: "display", fontWeight: "400", fontSize: 56, lineHeight: 64, letterSpacing: -1.2, flexShrink: 1 },
  totalUnit: { color: colors.secondary, fontSize: 18, lineHeight: 24, paddingBottom: 10 },
  week: { borderRadius: radius.card + 4, backgroundColor: colors.focusSurface, paddingHorizontal: 20, paddingVertical: 20, gap: 14 },
  weekHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  weekTitle: { color: colors.text, fontFamily: "display", fontWeight: "400", fontSize: 28, lineHeight: 34 },
  weekStreak: { color: colors.secondary, fontSize: 15, lineHeight: 20 },
  circles: { flexDirection: "row", justifyContent: "space-between" },
  dayCol: { alignItems: "center", gap: 8, flex: 1 },
  letter: { color: colors.neutral, fontSize: 14, lineHeight: 18, fontWeight: "600" },
  circle: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "rgba(59,39,55,0.22)", alignItems: "center", justifyContent: "center" },
  circleDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  circleRest: { borderStyle: "dashed", borderColor: colors.secondary },
  circleToday: { borderColor: colors.primary, borderWidth: 1.5 },
  restText: { color: colors.neutral, fontSize: 10, lineHeight: 12, fontWeight: "600" },
  weekLine: { color: colors.neutral, fontSize: 15, lineHeight: 22 },
  section: { gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "700" },
  activity: { gap: 8 },
  activityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  activityTitle: { color: colors.text, fontSize: 17, lineHeight: 22, flexShrink: 1 },
  activityValue: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "700" },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  rule: { height: 1, backgroundColor: colors.line },
  goal: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  goalLabel: { color: colors.text, fontSize: 17, lineHeight: 22 },
  goalValue: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "700" },
  marker: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  markerLine: { borderTopWidth: 1, borderTopColor: colors.line },
  markerText: { color: colors.text, fontSize: 16, lineHeight: 22, flexShrink: 1 },
});
