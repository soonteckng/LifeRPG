import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { countdownLabel, courseColor, daysUntil, examDateLabel } from "../utils/studyPlan";
import type { StudyCourse, StudyExam } from "../types/studyPlan";

/**
 * One exam as a list row: the days left, its name, subject and date. Every
 * row starts at the same edge; the divider is drawn inside the row, so it
 * never pushes a row sideways.
 */
export default function ExamRow({ exam, course, first = false, onPress, onLongPress, onStudy, inSheet = false, label }: {
  exam: StudyExam; course: StudyCourse | null; first?: boolean; onPress: () => void; onLongPress?: () => void; onStudy?: () => void; inSheet?: boolean;
  /** What tapping the row does, for screen readers. */
  label?: string;
}) {
  const days = daysUntil(exam.examDate), soon = days <= 7;
  return <View style={[s.row, { backgroundColor: inSheet ? colors.sheetCard : colors.surface }]} testID="exam-row">
    {!first && <View style={s.line} />}
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} accessibilityRole="button"
      accessibilityLabel={`${exam.title}, ${countdownLabel(days)}, ${examDateLabel(exam.examDate)}${label ? `. ${label}` : ""}`}
      accessibilityActions={onLongPress ? [{ name: "longpress", label: "More actions" }] : undefined} onAccessibilityAction={onLongPress} style={s.main}>
      <View style={[s.days, inSheet && s.daysInSheet, soon && s.daysSoon]}>
        {days === 0 ? <Text style={s.today}>Today</Text> : <>
          <Text style={[s.number, soon && s.hot]} numberOfLines={1} adjustsFontSizeToFit>{days}</Text>
          <Text style={[s.unit, soon && s.hot]}>{days === 1 ? "day" : "days"}</Text></>}
      </View>
      <View style={s.copy}>
        <Text style={s.title} numberOfLines={1}>{exam.title}</Text>
        <View style={s.meta}>{course && <View style={[s.dot, { backgroundColor: courseColor(course.id) }]} />}
          <Text style={s.caption} numberOfLines={1}>{[course?.name, examDateLabel(exam.examDate)].filter(Boolean).join(" · ")}</Text></View>
      </View>
      {!onStudy && <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />}
    </Pressable>
    {onStudy && <Pressable onPress={onStudy} accessibilityRole="button" accessibilityLabel={`Study ${course?.name ?? exam.title}`} hitSlop={6} style={s.study}>
      <Ionicons name="play" size={12} color={colors.accent} /><Text style={s.studyText}>Study</Text></Pressable>}
  </View>;
}
const s = StyleSheet.create({
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingRight: 14 },
  line: { position: "absolute", top: 0, left: 70, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  main: { flex: 1, minWidth: 0, minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 12 },
  days: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  daysInSheet: { backgroundColor: colors.selection },
  daysSoon: { backgroundColor: "rgba(255,105,97,0.14)" },
  number: { color: colors.text, fontSize: 19, lineHeight: 21, fontWeight: "800", fontVariant: ["tabular-nums"] },
  unit: { color: colors.secondary, fontSize: 10, lineHeight: 12, fontWeight: "600" }, hot: { color: "#FFB4AE" },
  today: { color: "#FFB4AE", fontSize: 12, fontWeight: "800" },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  caption: { flexShrink: 1, color: colors.secondary, fontSize: 13, lineHeight: 18 },
  study: { minHeight: 34, flexDirection: "row", gap: 5, paddingHorizontal: 13, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft, marginLeft: 8 },
  studyText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
});
