import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Pressable from "../../components/MotionPressable";
import ContentReveal from "../../components/ContentReveal";
import { PersonalPage } from "../../components/PersonalUI";
import { Text } from "../../components/AppText";
import StudyExamSheet from "../../components/StudyExamSheet";
import StudySubjectSheet, { ExamTile } from "../../components/StudySubjectSheet";
import { requestStudySync } from "../../components/StudyLifecycle";
import { colors, radius } from "../../constants/theme";
import { type } from "../../constants/typography";
import { useQuests } from "../../context/QuestContext";
import { useTimer } from "../../context/TimerContext";
import { useStudyPlan } from "../../hooks/useStudyPlan";
import { studySelection } from "../../services/studySelection";
import { floatingTabInset } from "../../utils/floatingTabInset";
import { focusAreaTitle, generalArea, suggestedArea } from "../../utils/focusAreas";
import { countdownLabel, courseColor, daysUntil, examDateLabel, STARTER_SUBJECTS, studyTime, upcomingExams, weekSeconds } from "../../utils/studyPlan";
import type { StudyCourse, StudyExam } from "../../types/studyPlan";

type Sheet = { kind: "exam"; exam: StudyExam | null; courseId: string | null } | { kind: "subject"; course: StudyCourse | null } | null;

export default function StudyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const timer = useTimer();
  const bottomInset = floatingTabInset(useBottomTabBarHeight(), insets.bottom, timer);
  const { subjects = [] } = useQuests();
  const plan = useStudyPlan();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [open, setOpen] = useState(false);
  const afterClose = useRef<(() => void) | null>(null);
  useFocusEffect(useCallback(() => { requestStudySync(); }, []));

  const exams = upcomingExams(plan.exams), next = exams[0], rest = exams.slice(1);
  const courseFor = (id: string | null) => plan.courses.find(item => item.id === id) ?? null;
  const nextCourse = next ? courseFor(next.courseId) : null;
  const learning = suggestedArea(subjects, "learning");
  const sessionBlocked = timer.hasOpenSession || timer.actionBusy || timer.isRestoring || !!timer.restoreError || (timer.isCompleted && !timer.sessionSummary);

  const show = (value: Sheet) => { setSheet(value); setOpen(true); };
  const close = (then?: () => void) => { afterClose.current = then ?? null; setOpen(false); };
  const dismissed = () => { const then = afterClose.current; afterClose.current = null; setSheet(null); then?.(); };
  const study = (course: StudyCourse) => {
    if (sessionBlocked) { router.navigate("/session"); return; }
    timer.setNotes(""); timer.setLinkedTaskId(null);
    timer.setTargetAttributeId(course.focusAreaId ?? generalArea(subjects)?.id ?? null);
    studySelection.choose(course.id);
    timer.reviewSummary?.(); router.navigate("/session");
  };
  const quickAdd = (name: string) => { void plan.saveCourse({ name, focusAreaId: learning?.id ?? null }); };

  return <PersonalPage title="Study" subtitle="" compact bottomContentInset={bottomInset}>
    <ContentReveal><View style={s.stack}>
      {!!plan.error && <Text style={s.notice} accessibilityLiveRegion="polite">{plan.error}</Text>}

      {next ? <View testID="study-next-exam" style={s.hero}>
        {/* The countdown edits the exam; Study sits beside it, never nested inside another button. */}
        <Pressable onPress={() => show({ kind: "exam", exam: next, courseId: next.courseId })} accessibilityRole="button"
          accessibilityLabel={`Next exam, ${next.title}, ${countdownLabel(daysUntil(next.examDate))}, ${examDateLabel(next.examDate)}. Edit exam`} style={s.heroTop}>
          <View style={s.bigDays}>{daysUntil(next.examDate) === 0 ? <Text style={s.bigToday}>Today</Text> : <>
            <Text style={s.bigNumber} adjustsFontSizeToFit numberOfLines={1}>{daysUntil(next.examDate)}</Text>
            <Text style={s.bigUnit}>{daysUntil(next.examDate) === 1 ? "day" : "days"}</Text></>}</View>
          <View style={s.flex}>
            <Text style={s.label}>Next exam</Text>
            <Text style={s.heroTitle} numberOfLines={2}>{next.title}</Text>
            <Text style={s.caption} numberOfLines={1}>{nextCourse ? `${nextCourse.name} · ` : ""}{examDateLabel(next.examDate)}</Text>
          </View>
        </Pressable>
        {nextCourse && <View style={s.heroFoot}>
          <Text style={[s.body, s.flex]} numberOfLines={1}>{studyTime(weekSeconds(plan.recent, nextCourse.id))} this week</Text>
          <Pressable onPress={() => study(nextCourse)} accessibilityRole="button" accessibilityLabel={`Study ${nextCourse.name}`} style={s.pill}>
            <Ionicons name="play" size={12} color={colors.primaryText} /><Text style={s.pillText} numberOfLines={1}>Study {nextCourse.name}</Text>
          </Pressable>
        </View>}
      </View> : <View style={s.hero} testID="study-exam-empty">
        <View style={s.emptyIcon}><Ionicons name="calendar-outline" size={26} color={colors.danger} /></View>
        <View style={{ gap: 4 }}><Text style={s.heroTitle}>Got an exam coming up?</Text><Text style={s.caption}>Add it and watch the days count down here and on Home.</Text></View>
        <Pressable onPress={() => show({ kind: "exam", exam: null, courseId: null })} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>Add an exam</Text></Pressable>
      </View>}

      {next && <View style={s.section}>
        {rest.length > 0 && <SectionHead title="Exams" addLabel="New exam" onAdd={() => show({ kind: "exam", exam: null, courseId: null })} />}
        <View style={s.group}>
          {rest.map((exam, index) => <Pressable key={exam.id} onPress={() => show({ kind: "exam", exam, courseId: exam.courseId })} accessibilityRole="button"
            accessibilityLabel={`${exam.title}, ${examDateLabel(exam.examDate)}, ${countdownLabel(daysUntil(exam.examDate))}. Edit exam`} style={[s.row, index > 0 && s.line]}>
            <ExamTile date={exam.examDate} />
            <View style={s.flex}><Text style={s.rowTitle} numberOfLines={1}>{exam.title}</Text>
              <Text style={s.caption} numberOfLines={1}>{courseFor(exam.courseId)?.name ?? "No subject"} · {examDateLabel(exam.examDate)}</Text></View>
            <Text style={s.after}>{countdownLabel(daysUntil(exam.examDate))}</Text>
          </Pressable>)}
          {!rest.length && <Pressable onPress={() => show({ kind: "exam", exam: null, courseId: null })} accessibilityRole="button" style={s.row}>
            <Ionicons name="add-circle-outline" size={22} color={colors.accent} /><Text style={[s.rowTitle, s.flex, { color: colors.accent }]}>Add another exam</Text>
          </Pressable>}
        </View>
      </View>}

      <View style={s.section}>
        <SectionHead title="Subjects" addLabel="New subject" onAdd={() => show({ kind: "subject", course: null })} />
        {plan.courses.length ? <>
          <View style={s.group}>{plan.courses.map((course, index) => <Pressable key={course.id} onPress={() => show({ kind: "subject", course })} accessibilityRole="button"
            accessibilityLabel={`${course.name}, ${studyTime(weekSeconds(plan.recent, course.id))} in the last 7 days. Open subject`} style={[s.row, index > 0 && s.line]}>
            <View style={[s.dot, { backgroundColor: courseColor(course.id) }]} />
            <View style={s.flex}><Text style={s.rowTitle} numberOfLines={1}>{course.name}</Text>
              <Text style={s.caption} numberOfLines={1}>{focusAreaTitle(subjects.find(area => area.id === course.focusAreaId)?.title)}</Text></View>
            <Text style={s.after}>{studyTime(weekSeconds(plan.recent, course.id))}</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
          </Pressable>)}</View>
          <Text style={s.hint}>Time from the last 7 days. Pick a subject when you set up a session.</Text>
        </> : <View style={[s.group, s.starter]}>
          <Text style={s.caption}>Track time for each subject you study. Tap one to add it.</Text>
          <View style={s.chips}>{STARTER_SUBJECTS.map(name => <Pressable key={name} disabled={!plan.ready} onPress={() => quickAdd(name)} accessibilityRole="button" accessibilityLabel={`Add ${name}`} style={s.chip}>
            <Ionicons name="add" size={14} color={colors.accent} /><Text style={s.chipText}>{name}</Text>
          </Pressable>)}</View>
        </View>}
      </View>

      {!next && !plan.courses.length && <View style={s.section}>
        <Text style={s.sectionTitle}>How it works</Text>
        <View style={s.group}>{["Add your exams and subjects", "Pick a subject when you set up a session", "See where your time went, per subject"].map((line, index) =>
          <View key={line} style={[s.row, index > 0 && s.line]}><View style={s.step}><Text style={s.stepText}>{index + 1}</Text></View><Text style={[s.body, s.flex]}>{line}</Text></View>)}</View>
      </View>}
    </View></ContentReveal>

    <StudyExamSheet visible={open && sheet?.kind === "exam"} exam={sheet?.kind === "exam" ? sheet.exam : null} courses={plan.courses}
      initialCourseId={sheet?.kind === "exam" ? sheet.courseId : null} onSave={plan.saveExam} onRemove={id => plan.remove("exam", id)} onClose={() => close()} onDismiss={dismissed} />
    <StudySubjectSheet visible={open && sheet?.kind === "subject"} course={sheet?.kind === "subject" && sheet.course ? courseFor(sheet.course.id) ?? sheet.course : null}
      areas={subjects} defaultAreaId={learning?.id ?? null} recent={plan.recent} exams={plan.exams} sessionOpen={timer.hasOpenSession}
      onSave={plan.saveCourse} onRemove={id => plan.remove("course", id)} onClose={() => close()} onDismiss={dismissed}
      onStudy={course => close(() => study(course))}
      onAddExam={course => close(() => show({ kind: "exam", exam: null, courseId: course.id }))}
      onEditExam={exam => close(() => show({ kind: "exam", exam, courseId: exam.courseId }))} />
  </PersonalPage>;
}

function SectionHead({ title, addLabel, onAdd }: { title: string; addLabel: string; onAdd: () => void }) {
  return <View style={s.sectionHead}>
    <Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>
    <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={addLabel} hitSlop={8} style={s.add}><Ionicons name="add" size={18} color={colors.accent} /></Pressable>
  </View>;
}

const s = StyleSheet.create({
  stack: { gap: 24 }, flex: { flex: 1, minWidth: 0 }, section: { gap: 10 },
  notice: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  hero: { padding: 18, gap: 14, borderRadius: radius.card, backgroundColor: colors.surface },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 16 },
  bigDays: { width: 84, height: 84, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)", paddingHorizontal: 6 },
  bigNumber: { color: colors.danger, fontSize: 36, lineHeight: 40, fontWeight: "800", fontVariant: ["tabular-nums"] },
  bigToday: { color: colors.danger, fontSize: 20, lineHeight: 24, fontWeight: "800" },
  bigUnit: { color: colors.danger, fontSize: 12, lineHeight: 16, fontWeight: "600" },
  label: { ...type.label }, heroTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, body: { color: colors.text, fontSize: 15, lineHeight: 20 },
  heroFoot: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  pill: { minHeight: 40, maxWidth: 190, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.primary },
  pillText: { color: colors.primaryText, fontSize: 15, fontWeight: "600", flexShrink: 1 },
  emptyIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)" },
  primary: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 25, backgroundColor: colors.primary },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  sectionTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3, paddingHorizontal: 4 },
  add: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  group: { borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
  row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  after: { color: colors.secondary, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
  dot: { width: 10, height: 10, borderRadius: 5 },
  hint: { color: colors.tertiary, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
  starter: { padding: 16, gap: 12 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.sheetCard },
  chipText: { color: colors.text, fontSize: 15, fontWeight: "500" },
  step: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  stepText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
});
