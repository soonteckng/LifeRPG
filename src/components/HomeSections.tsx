import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import ExamRow from "./ExamRow";
import { SquadSummary } from "./SquadsSection";
import { colors, edge, radius } from "../constants/theme";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { useSquads } from "../hooks/useSquads";
import { useProgressData } from "../hooks/useProgressData";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { upcomingExams, studyTime } from "../utils/studyPlan";
import { squadTotal } from "../utils/squads";
import { buildProgress, dateKey, DEFAULT_TIMEZONE, durationLabel, periodFor } from "../utils/progressAnalytics";

// Home is a summary: each section shows a little and opens its own tab.
function Head({ title, link, label, onPress }: { title: string; link: string; label: string; onPress: () => void }) {
  return <View style={s.head}>
    <Text style={s.title} accessibilityRole="header">{title}</Text>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}><Text style={s.link}>{link}</Text></Pressable>
  </View>;
}
const HOME_EXAMS = 3;

/** The next few exams as short rows; the rest are a tap away in Study. */
export function HomeExams() {
  const router = useRouter(), { exams, courses } = useStudyPlan();
  const coming = upcomingExams(exams), openStudy = () => router.navigate("/study");
  return <View style={s.section} testID="home-exams">
    <Head title="My Exams" link={coming.length > HOME_EXAMS ? `See all ${coming.length}` : "Study"} label="Open Study" onPress={openStudy} />
    {coming.length ? <View style={s.group}>{coming.slice(0, HOME_EXAMS).map((exam, index) =>
      <ExamRow key={exam.id} exam={exam} course={courses.find(item => item.id === exam.courseId) ?? null} first={index === 0} onPress={openStudy} />)}</View>
      : <Pressable onPress={openStudy} accessibilityRole="button" accessibilityLabel="Add an exam in Study" style={[s.card, s.row]}>
        <View style={[s.icon, s.examIcon]}><Ionicons name="calendar-outline" size={20} color={colors.danger} /></View>
        <View style={s.flex}><Text style={s.name}>Got an exam coming up?</Text><Text style={s.caption}>Add it and the days count down here.</Text></View>
        <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
      </Pressable>}
  </View>;
}

/** Your first squad; tapping it opens that squad's own page. */
export function HomeSquad() {
  const router = useRouter(), squads = useSquads(), squad = squads.squads[0];
  const openSquads = () => router.navigate("/squads");
  return <View style={s.section} testID="home-squad-section">
    <Head title="My Squad" link={squads.squads.length > 1 ? `All ${squads.squads.length}` : "Squads"} label="Open Squads" onPress={openSquads} />
    {squad ? <Pressable onPress={() => router.push({ pathname: "/squad/[id]", params: { id: squad.id } })} accessibilityRole="button" testID="home-squad"
      accessibilityLabel={`${squad.name}, ${studyTime(squadTotal(squad))} together this week${squad.goalMinutes ? ` of ${squad.goalMinutes / 60} hours` : ""}. Open squad`} style={s.card}>
      <SquadSummary squad={squad} />
    </Pressable> : <Pressable onPress={openSquads} accessibilityRole="button" accessibilityLabel="Focus with friends. Join or start a squad" testID="home-squad-empty" style={[s.card, s.row]}>
      <View style={[s.icon, { backgroundColor: colors.accentSoft }]}><Ionicons name="people-outline" size={20} color={colors.accent} /></View>
      <View style={s.flex}><Text style={s.name}>Focus with friends</Text><Text style={s.caption}>Start a squad and keep each other going.</Text></View>
      <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
    </Pressable>}
  </View>;
}

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
/** This week in one line and seven small bars. Progress has the detail. */
export function HomeWeek() {
  const router = useRouter(), { profile } = useUser(), { sessionSummary } = useTimer();
  const timeZone = profile?.timezone || DEFAULT_TIMEZONE;
  const [now] = useState(() => new Date());
  const period = useMemo(() => periodFor("week", dateKey(now, timeZone), timeZone, now), [now, timeZone]);
  const { data } = useProgressData(period, timeZone, sessionSummary, profile?.id ?? "");
  const week = useMemo(() => data ? buildProgress(period, data.sessions, data.goals, timeZone, data.areas, now) : null, [data, period, timeZone, now]);
  const top = Math.max(1, ...(week?.days.map(day => day.seconds) ?? [0]));
  const change = week && week.previousSeconds >= 300 ? week.comparisonSeconds - week.previousSeconds : null;
  return <View style={s.section} testID="home-week">
    <Head title="This week" link="Progress" label="Open Progress" onPress={() => router.navigate("/progress")} />
    <Pressable onPress={() => router.navigate("/progress")} accessibilityRole="button"
      accessibilityLabel={`This week, ${durationLabel(week?.seconds ?? 0)}. Open Progress`} style={[s.card, s.week]}>
      <View style={s.flex}>
        <Text style={s.total}>{durationLabel(week?.seconds ?? 0)}</Text>
        <Text style={[s.caption, change !== null && change > 0 && { color: colors.success }]} numberOfLines={1}>
          {change === null ? `${week?.activeDays ?? 0} of 7 days with focus` : change >= 0 ? `${durationLabel(change)} more than last week so far` : `${durationLabel(-change)} behind last week so far`}</Text>
      </View>
      <View style={s.bars} importantForAccessibility="no-hide-descendants">{(week?.days ?? DAYS.map(() => ({ seconds: 0, key: "", future: true }))).map((day, index) =>
        <View key={index} style={s.barColumn}>
          <View style={s.barTrack}><View style={[s.bar, { height: `${day.seconds ? Math.max(10, Math.round(100 * day.seconds / top)) : 0}%` }, day.key === period.today && s.barToday]} /></View>
          <Text style={[s.day, day.key === period.today && s.dayToday]}>{DAYS[index]}</Text>
        </View>)}</View>
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  section: { gap: 10 }, flex: { flex: 1, minWidth: 0, gap: 2 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4 },
  title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  link: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  group: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
  card: { ...edge, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  examIcon: { backgroundColor: "rgba(255,105,97,0.14)" },
  name: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  week: { flexDirection: "row", alignItems: "center", gap: 16 },
  total: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  bars: { flexDirection: "row", gap: 5, alignItems: "flex-end" },
  barColumn: { width: 12, alignItems: "center", gap: 4 },
  barTrack: { width: 12, height: 44, justifyContent: "flex-end", borderRadius: 4, backgroundColor: "rgba(255,255,255,0.05)" },
  bar: { width: 12, borderRadius: 4, backgroundColor: "rgba(99,230,190,0.45)" }, barToday: { backgroundColor: colors.accent },
  day: { color: colors.tertiary, fontSize: 10, fontWeight: "600" }, dayToday: { color: colors.text },
});
