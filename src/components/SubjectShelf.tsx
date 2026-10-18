import { useEffect, useRef, useState } from "react";
import { Animated, Easing, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors, edge, radius } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { areaTint } from "../utils/lifeAreaColor";
import { countdownLabel, courseColor, daysUntil, studyTime, upcomingExams, weekSeconds } from "../utils/studyPlan";
import type { StudyCourse, StudyExam, StudyRecent } from "../types/studyPlan";

const GAP = 10;

/**
 * My Subjects as a sideways shelf of cards wide enough for full names; the
 * next card peeks in to invite a swipe. Hold any card to edit: every card
 * wiggles and shows a remove button, like arranging apps on a home screen.
 */
export default function SubjectShelf({ courses, exams, recent, editing, onEditingChange, onOpen, onStudy, onRemove }: {
  courses: StudyCourse[]; exams: StudyExam[]; recent: StudyRecent[]; editing: boolean; onEditingChange: (editing: boolean) => void;
  onOpen: (course: StudyCourse) => void; onStudy: (course: StudyCourse) => void; onRemove: (course: StudyCourse) => void;
}) {
  const { width } = useWindowDimensions();
  // About one and two-thirds cards show: names fit, and the next one peeks in.
  const tile = Math.max(160, Math.min(240, Math.round((Math.min(width, 600) - 40 - GAP) / 1.65)));
  // Removing a card near the end must not leave an empty gap past the last one.
  const scroll = useRef<ScrollView>(null), offset = useRef(0), view = useRef(0);
  const settle = (contentWidth: number) => {
    const max = Math.max(0, contentWidth - view.current);
    if (offset.current > max + 1) { offset.current = max; scroll.current?.scrollTo({ x: max, animated: true }); }
  };
  const upcoming = upcomingExams(exams);
  return <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shelf} testID="subject-shelf"
    onLayout={event => { view.current = event.nativeEvent.layout.width; }} onContentSizeChange={contentWidth => settle(contentWidth)}
    onScroll={event => { offset.current = event.nativeEvent.contentOffset.x; }} scrollEventThrottle={32}>
    {courses.map((course, index) => <View key={course.id} style={index > 0 && { marginLeft: GAP }}>
      <SubjectTile course={course} width={tile} editing={editing}
        exam={upcoming.find(item => item.courseId === course.id)} week={weekSeconds(recent, course.id)}
        onPress={() => editing ? onEditingChange(false) : onOpen(course)} onLongPress={() => onEditingChange(true)}
        onStudy={() => onStudy(course)} onRemove={() => onRemove(course)} />
    </View>)}
  </ScrollView>;
}

function SubjectTile({ course, width, editing, exam, week, onPress, onLongPress, onStudy, onRemove }: {
  course: StudyCourse; width: number; editing: boolean; exam?: StudyExam; week: number;
  onPress: () => void; onLongPress: () => void; onStudy: () => void; onRemove: () => void;
}) {
  const reduced = useReducedMotion(), tint = courseColor(course.id);
  const [wiggle] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!editing || reduced) { wiggle.stopAnimation(); wiggle.setValue(0); return; }
    // Each card starts at a slightly different point, so they don't move in lockstep.
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(wiggle, { toValue: 1, duration: 130, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: -1, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: 0, duration: 130, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const start = setTimeout(() => loop.start(), (course.id.charCodeAt(0) % 5) * 40);
    return () => { clearTimeout(start); loop.stop(); };
  }, [editing, reduced, wiggle, course.id]);
  const days = exam ? daysUntil(exam.examDate) : null;
  return <Animated.View style={[s.tileFrame, { width, transform: [{ rotate: wiggle.interpolate({ inputRange: [-1, 1], outputRange: ["-1.4deg", "1.4deg"] }) }] }]}>
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
    {!editing && <Pressable onPress={onStudy} accessibilityRole="button" accessibilityLabel={`Study ${course.name}`} hitSlop={6} style={s.play}>
      <Ionicons name="play" size={13} color={colors.text} /></Pressable>}
    {editing && <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${course.name}`} hitSlop={8} style={s.remove}>
      <Ionicons name="remove" size={16} color="#FFFFFF" /></Pressable>}
  </Animated.View>;
}
/** Days to an exam as a soft pill: red only in the last week, never raw red text. */
export function ExamPill({ days }: { days: number }) {
  const soon = days <= 7;
  return <View style={[s.badge, soon && s.badgeSoon]}><Text style={[s.badgeText, soon && s.badgeTextSoon]}>{days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}</Text></View>;
}
const s = StyleSheet.create({
  shelf: { paddingTop: 8, paddingRight: 8, paddingLeft: 2 },
  tileFrame: { position: "relative", flex: 1 },
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
  play: { ...edge, position: "absolute", right: 10, bottom: 10, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  remove: { position: "absolute", top: -7, right: -7, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger,
    borderWidth: 2, borderColor: colors.background },
});
