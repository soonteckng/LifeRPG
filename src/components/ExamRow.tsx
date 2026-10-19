import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { countdownLabel, courseColor, daysUntil, examDateLabel, localDate } from "../utils/studyPlan";
import type { StudyCourse, StudyExam } from "../types/studyPlan";

/**
 * One exam as a list row: its date as a small calendar tile, then its name,
 * subject and how many days are left. Every
 * row starts at the same edge; the divider is drawn inside the row, so it
 * never pushes a row sideways.
 */
export default function ExamRow({ exam, course, first = false, onPress, onLongPress, onStudy, inSheet = false, label }: {
  exam: StudyExam; course: StudyCourse | null; first?: boolean; onPress: () => void; onLongPress?: () => void; onStudy?: () => void; inSheet?: boolean;
  /** What tapping the row does, for screen readers. */
  label?: string;
}) {
  const days = daysUntil(exam.examDate), soon = days <= 7, date = localDate(exam.examDate);
  const left = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days left`;
  return <View style={[s.row, { backgroundColor: inSheet ? colors.sheetCard : colors.surface }]} testID="exam-row">
    {!first && <View style={s.line} />}
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} accessibilityRole="button"
      accessibilityLabel={`${exam.title}, ${countdownLabel(days)}, ${examDateLabel(exam.examDate)}${label ? `. ${label}` : ""}`}
      accessibilityActions={onLongPress ? [{ name: "longpress", label: "More actions" }] : undefined} onAccessibilityAction={onLongPress} style={s.main}>
      {/* A calendar tile: the month over the day, so the number always reads as a date. */}
      <View style={[s.days, inSheet && s.daysInSheet]} testID="exam-date-tile">
        <Text style={[s.unit, soon && s.hot]}>{date.toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}</Text>
        <Text style={s.number} numberOfLines={1} adjustsFontSizeToFit>{date.getDate()}</Text>
      </View>
      <View style={s.copy}>
        <Text style={s.title} numberOfLines={1}>{exam.title}</Text>
        <View style={s.meta}>{course && <View style={[s.dot, { backgroundColor: courseColor(course.id) }]} />}
          {!!course && <Text style={s.caption} numberOfLines={1}>{course.name} ·</Text>}
          <Text style={[s.left, soon && s.hot]} numberOfLines={1} testID="exam-days-left">{left}</Text></View>
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
  number: { color: colors.text, fontSize: 19, lineHeight: 22, fontWeight: "700", fontVariant: ["tabular-nums"] },
  unit: { color: colors.secondary, fontSize: 10, lineHeight: 12, fontWeight: "700", letterSpacing: 0.4 }, hot: { color: "#FFB4AE" },
  left: { flexShrink: 0, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  caption: { flexShrink: 1, color: colors.secondary, fontSize: 13, lineHeight: 18 },
  study: { minHeight: 34, flexDirection: "row", gap: 5, paddingHorizontal: 13, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft, marginLeft: 8 },
  studyText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
});
