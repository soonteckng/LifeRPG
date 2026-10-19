import { useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import StartButton from "./StartButton";
import { Text } from "./AppText";
import { colors, edge, radius } from "../constants/theme";
import { EditBadges, Wiggle } from "./EditMode";
import { areaTint } from "../utils/lifeAreaColor";
import { countdownLabel, courseColor, daysUntil, studyTime, upcomingExams, weekSeconds } from "../utils/studyPlan";
import type { StudyCourse, StudyExam, StudyRecent } from "../types/studyPlan";

const GAP = 10;

/**
 * My Subjects as a two-column grid, so every subject shows at once and the
 * page never looks empty. ▶ studies it (as Revision when its exam is near).
 * Hold any card to edit: every card wiggles and shows ✎ and −, the same as
 * routines and exams.
 */
export default function SubjectShelf({ courses, exams, recent, editing, onEditingChange, onOpen, onEdit, onStudy, onRemove }: {
  courses: StudyCourse[]; exams: StudyExam[]; recent: StudyRecent[]; editing: boolean; onEditingChange: (editing: boolean) => void;
  onOpen: (course: StudyCourse) => void; onEdit: (course: StudyCourse) => void; onStudy: (course: StudyCourse) => void; onRemove: (course: StudyCourse) => void;
}) {
  const { width } = useWindowDimensions();
  const [box, setBox] = useState(0);
  // Two equal columns of the measured width; before layout, the page's usual width.
  const tile = Math.floor(((box || Math.min(width, 600) - 40) - GAP) / 2);
  const upcoming = upcomingExams(exams);
  return <View style={s.grid} testID="subject-shelf" onLayout={event => setBox(event.nativeEvent.layout.width)}>
    {courses.map(course => <SubjectTile key={course.id} course={course} width={tile} editing={editing}
      exam={upcoming.find(item => item.courseId === course.id)} week={weekSeconds(recent, course.id)}
      onPress={() => editing ? onEditingChange(false) : onOpen(course)} onLongPress={() => onEditingChange(true)}
      onStudy={() => onStudy(course)} onEdit={() => onEdit(course)} onRemove={() => onRemove(course)} />)}
  </View>;
}

function SubjectTile({ course, width, editing, exam, week, onPress, onLongPress, onStudy, onEdit, onRemove }: {
  course: StudyCourse; width: number; editing: boolean; exam?: StudyExam; week: number;
  onPress: () => void; onLongPress: () => void; onStudy: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const tint = courseColor(course.id);
  const days = exam ? daysUntil(exam.examDate) : null;
  return <Wiggle active={editing} seed={course.id} degrees={0.9} style={[s.tileFrame, { width }]}>
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={400} accessibilityRole="button"
      accessibilityLabel={`${course.name}, ${studyTime(week)} this week${exam ? `, exam ${countdownLabel(days!)}` : ""}. ${editing ? "Done editing" : "Open subject"}`}
      accessibilityActions={[{ name: "longpress", label: "Edit subjects" }]} onAccessibilityAction={onLongPress} style={s.tile}>
      <View style={s.tileTop}>
        <View style={[s.icon, { backgroundColor: areaTint(tint, 0.2) }]}><Ionicons name="school-outline" size={15} color={tint} /></View>
        {exam && <ExamPill days={days!} />}
      </View>
      <Text style={s.name} numberOfLines={2}>{course.name}</Text>
      <Text style={s.caption} numberOfLines={1}>{studyTime(week)} this week</Text>
      {!exam && <Text style={s.noExam} numberOfLines={1}>No exam yet</Text>}
    </Pressable>
    {!editing && <StartButton label={`Study ${course.name}`} onPress={onStudy} size={34} style={s.play} />}
    {editing && <EditBadges placement="corner" name={course.name} onEdit={onEdit} onRemove={onRemove} />}
  </Wiggle>;
}
/** Days to an exam as a soft pill: red only in the last week, never raw red text. */
export function ExamPill({ days }: { days: number }) {
  const soon = days <= 7;
  return <View style={[s.badge, soon && s.badgeSoon]}><Text style={[s.badgeText, soon && s.badgeTextSoon]}>{days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}</Text></View>;
}
const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, paddingTop: 8 },
  tileFrame: { position: "relative" },
  tile: { ...edge, flex: 1, minHeight: 120, padding: 12, gap: 3, borderRadius: radius.tile, backgroundColor: colors.surface },
  tileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  badge: { minWidth: 34, height: 24, paddingHorizontal: 9, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  badgeSoon: { backgroundColor: "rgba(255,105,97,0.18)" },
  badgeText: { color: colors.neutral, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }, badgeTextSoon: { color: "#FFB4AE" },
  name: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  // The last lines leave room for the ▶ in the corner.
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18, paddingRight: 36 },
  noExam: { color: colors.muted, fontSize: 12, lineHeight: 17, paddingRight: 36 },
  play: { position: "absolute", right: 10, bottom: 10 },
});
