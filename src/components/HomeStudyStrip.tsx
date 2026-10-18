import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { SquadFace } from "./SquadSheets";
import { colors, edge, radius } from "../constants/theme";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { useSquads } from "../hooks/useSquads";
import { countdownLabel, courseColor, daysUntil, examDateLabel, studyTime, upcomingExams } from "../utils/studyPlan";
import { focusingCount, squadTotal } from "../utils/squads";

/** Home's view of Study: every coming exam as its own card, and your squad's week. */
export default function HomeStudyStrip() {
  const router = useRouter(), { width } = useWindowDimensions();
  const { exams, courses } = useStudyPlan(), squads = useSquads();
  const coming = upcomingExams(exams), squad = squads.squads[0];
  const cardWidth = Math.max(150, (width - 32 - 10) / 2);
  const openStudy = () => router.navigate("/study");
  return <View style={s.stack} testID="home-study">
    <View style={s.section}>
      <View style={s.head}><Text style={s.title} accessibilityRole="header">My Exams</Text>
        <Pressable onPress={openStudy} accessibilityRole="button" accessibilityLabel="Open Study" hitSlop={8}><Text style={s.link}>Study</Text></Pressable></View>
      {coming.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {coming.map(exam => {
          const days = daysUntil(exam.examDate), course = courses.find(item => item.id === exam.courseId);
          return <Pressable key={exam.id} onPress={openStudy} accessibilityRole="button" testID="home-exam-card"
            accessibilityLabel={`${exam.title}, ${countdownLabel(days)}, ${examDateLabel(exam.examDate)}. Open Study`} style={[s.card, { width: cardWidth }]}>
            <Text style={s.days}>{days === 0 ? "Today" : days}{days > 0 && <Text style={s.unit}> {days === 1 ? "day" : "days"}</Text>}</Text>
            <Text style={s.exam} numberOfLines={2}>{exam.title}</Text>
            <View style={s.meta}>{course && <View style={[s.dot, { backgroundColor: courseColor(course.id) }]} />}<Text style={s.caption} numberOfLines={1}>{examDateLabel(exam.examDate)}</Text></View>
          </Pressable>;
        })}
      </ScrollView> : <Pressable onPress={openStudy} accessibilityRole="button" accessibilityLabel="Add an exam in Study" style={[s.card, s.empty]}>
        <View style={s.emptyIcon}><Ionicons name="calendar-outline" size={20} color={colors.danger} /></View>
        <View style={s.flex}><Text style={s.exam}>Got an exam coming up?</Text><Text style={s.caption}>Add it and the days count down here.</Text></View>
        <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
      </Pressable>}
    </View>
    {squad && <Pressable onPress={openStudy} accessibilityRole="button" testID="home-squad"
      accessibilityLabel={`${squad.name}${focusingCount(squad) ? `, ${focusingCount(squad)} focusing now` : ""}, ${studyTime(squadTotal(squad))} together this week. Open Study`} style={[s.card, s.squad]}>
      <View style={s.faces}>{squad.members.slice(0, 3).map((member, i) => <View key={member.id} style={[s.faceSlot, i > 0 && { marginLeft: -10 }]}><SquadFace member={{ ...member, focusingNow: false }} size={28} /></View>)}</View>
      <View style={s.flex}><Text style={s.exam} numberOfLines={1}>{squad.name}</Text>
        {focusingCount(squad) ? <Text style={s.live} numberOfLines={1}>● {focusingCount(squad)} focusing now</Text> : <Text style={s.caption}>{studyTime(squadTotal(squad))} together this week</Text>}</View>
      <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
    </Pressable>}
  </View>;
}
const s = StyleSheet.create({
  stack: { gap: 16 }, section: { gap: 10 }, flex: { flex: 1, minWidth: 0, gap: 2 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4 },
  title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  link: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  row: { gap: 10 },
  card: { ...edge, padding: 14, gap: 4, borderRadius: radius.card, backgroundColor: colors.surface },
  days: { color: colors.danger, fontSize: 28, lineHeight: 32, fontWeight: "800", fontVariant: ["tabular-nums"] },
  unit: { color: colors.danger, fontSize: 14, fontWeight: "600" },
  exam: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  empty: { flexDirection: "row", alignItems: "center", gap: 12 },
  emptyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)" },
  squad: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64 },
  faces: { flexDirection: "row", alignItems: "center" },
  faceSlot: { borderRadius: 16, borderWidth: 2, borderColor: colors.surface },
  live: { color: colors.success, fontSize: 14, lineHeight: 20, fontWeight: "600" },
});
