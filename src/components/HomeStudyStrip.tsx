import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { SquadSummary } from "./SquadsSection";
import { colors, edge, radius } from "../constants/theme";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { useSquads } from "../hooks/useSquads";
import { countdownLabel, courseColor, daysUntil, examDateLabel, studyTime, upcomingExams } from "../utils/studyPlan";
import { squadTotal } from "../utils/squads";

// Fixed-width cards leave the next one peeking, so it's clear the row scrolls.
const EXAM_CARD = 148;

/** Home's view of your squad and every coming exam. */
export default function HomeStudyStrip() {
  const router = useRouter();
  const { exams, courses } = useStudyPlan(), squads = useSquads();
  const coming = upcomingExams(exams), squad = squads.squads[0];
  const openStudy = () => router.navigate("/study"), openSquads = () => router.navigate("/progress");
  return <View style={s.stack} testID="home-study">
    <View style={s.section}>
      <View style={s.head}><Text style={s.title} accessibilityRole="header">My Squad</Text>
        <Pressable onPress={openSquads} accessibilityRole="button" accessibilityLabel="Open Squads in Progress" hitSlop={8}><Text style={s.link}>Squads</Text></Pressable></View>
      {squad ? <Pressable onPress={openSquads} accessibilityRole="button" testID="home-squad"
        accessibilityLabel={`${squad.name}, ${studyTime(squadTotal(squad))} together this week${squad.goalMinutes ? ` of ${squad.goalMinutes / 60} hours` : ""}. Open Squads`} style={s.card}>
        <SquadSummary squad={squad} compact />
      </Pressable> : <Pressable onPress={openSquads} accessibilityRole="button" accessibilityLabel="Focus with friends. Join or create a squad" testID="home-squad-empty" style={[s.card, s.empty]}>
        <View style={[s.emptyIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="people-outline" size={20} color={colors.accent} /></View>
        <View style={s.flex}><Text style={s.name}>Focus with friends</Text><Text style={s.caption}>Make a squad and keep each other going.</Text></View>
        <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
      </Pressable>}
    </View>
    <View style={s.section}>
      <View style={s.head}><Text style={s.title} accessibilityRole="header">My Exams</Text>
        <Pressable onPress={openStudy} accessibilityRole="button" accessibilityLabel="Open Study" hitSlop={8}><Text style={s.link}>Study</Text></Pressable></View>
      {coming.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.row}>
        {coming.map(exam => {
          const days = daysUntil(exam.examDate), course = courses.find(item => item.id === exam.courseId);
          return <Pressable key={exam.id} onPress={openStudy} accessibilityRole="button" testID="home-exam-card"
            accessibilityLabel={`${exam.title}, ${countdownLabel(days)}, ${examDateLabel(exam.examDate)}. Open Study`} style={[s.card, s.exam]}>
            <Text style={s.days}>{days === 0 ? "Today" : days}{days > 0 && <Text style={s.unit}> {days === 1 ? "day" : "days"}</Text>}</Text>
            <Text style={s.name} numberOfLines={2}>{exam.title}</Text>
            <View style={s.meta}>{course && <View style={[s.dot, { backgroundColor: courseColor(course.id) }]} />}<Text style={s.caption} numberOfLines={1}>{examDateLabel(exam.examDate)}</Text></View>
          </Pressable>;
        })}
      </ScrollView> : <Pressable onPress={openStudy} accessibilityRole="button" accessibilityLabel="Add an exam in Study" style={[s.card, s.empty]}>
        <View style={s.emptyIcon}><Ionicons name="calendar-outline" size={20} color={colors.danger} /></View>
        <View style={s.flex}><Text style={s.name}>Got an exam coming up?</Text><Text style={s.caption}>Add it and the days count down here.</Text></View>
        <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
      </Pressable>}
    </View>
  </View>;
}
const s = StyleSheet.create({
  stack: { gap: 24 }, section: { gap: 10 }, flex: { flex: 1, minWidth: 0, gap: 2 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4 },
  title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  link: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  // The row runs to the screen edge so a card is cut off by the edge, not the margin.
  bleed: { marginRight: -20 }, row: { gap: 10, paddingRight: 20 },
  card: { ...edge, padding: 14, gap: 4, borderRadius: radius.card, backgroundColor: colors.surface },
  exam: { width: EXAM_CARD, minHeight: 116 },
  days: { color: colors.danger, fontSize: 28, lineHeight: 32, fontWeight: "800", fontVariant: ["tabular-nums"] },
  unit: { color: colors.danger, fontSize: 14, fontWeight: "600" },
  name: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: "auto" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  empty: { flexDirection: "row", alignItems: "center", gap: 12 },
  emptyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)" },
});
