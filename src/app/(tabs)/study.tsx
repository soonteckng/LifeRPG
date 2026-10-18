import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Pressable from "../../components/MotionPressable";
import ContentReveal from "../../components/ContentReveal";
import { PersonalPage } from "../../components/PersonalUI";
import { Text } from "../../components/AppText";
import StudyExamSheet from "../../components/StudyExamSheet";
import StudySubjectSheet from "../../components/StudySubjectSheet";
import { requestStudySync } from "../../components/StudyLifecycle";
import { colors, radius, edge } from "../../constants/theme";
import { useQuests } from "../../context/QuestContext";
import { useTimer } from "../../context/TimerContext";
import { useStudyPlan } from "../../hooks/useStudyPlan";
import { studySelection } from "../../services/studySelection";
import { floatingTabInset } from "../../utils/floatingTabInset";
import { generalArea, suggestedArea } from "../../utils/focusAreas";
import { countdownLabel, courseColor, daysUntil, examDateLabel, QUICK_SUBJECTS, studyTime, subjectSuggestions, upcomingExams, weekSeconds } from "../../utils/studyPlan";
import { areaTint } from "../../utils/lifeAreaColor";
import { setupMode } from "../../services/setupMode";
import AppSheet from "../../components/AppSheet";
import SheetHeader from "../../components/SheetHeader";
import SubjectPicker from "../../components/SubjectPicker";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { StudyCourse, StudyExam } from "../../types/studyPlan";

type Sheet = { kind: "exam"; exam: StudyExam | null; courseId: string | null; title?: string } | { kind: "subject"; course: StudyCourse | null }
  | { kind: "add" } | { kind: "how" } | null;

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
  // A subject added with one tap says so in place, with an optional exam, then fades.
  const [added, setAdded] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { if (!added) return; const timer = setTimeout(() => setAdded(null), 6000); return () => clearTimeout(timer); }, [added]);

  const exams = upcomingExams(plan.exams);
  const courseFor = (id: string | null) => plan.courses.find(item => item.id === id) ?? null;
  const learning = suggestedArea(subjects, "learning");
  const sessionBlocked = timer.hasOpenSession || timer.actionBusy || timer.isRestoring || !!timer.restoreError || (timer.isCompleted && !timer.sessionSummary);
  const quick = subjectSuggestions("", plan.courses.map(course => course.name), 40).filter(name => (QUICK_SUBJECTS as readonly string[]).includes(name)).slice(0, 6);

  const show = (value: Sheet) => { setSheet(value); setOpen(true); };
  const close = (then?: () => void) => { afterClose.current = then ?? null; setOpen(false); };
  const dismissed = () => { const then = afterClose.current; afterClose.current = null; setSheet(null); then?.(); };
  const study = (course: StudyCourse) => {
    if (sessionBlocked) { router.navigate("/session"); return; }
    timer.setNotes(""); timer.setLinkedTaskId(null);
    timer.setTargetAttributeId(course.focusAreaId ?? learning?.id ?? generalArea(subjects)?.id ?? null);
    studySelection.choose(course.id); setupMode.choose("study");
    timer.reviewSummary?.(); router.navigate("/session");
  };
  // Adding a subject only adds it; an exam is one tap away but never forced.
  const addSubject = async (name: string, courseId: string | null) => {
    const id = courseId ?? await plan.ensureCourse(name, learning?.id ?? null);
    if (id) setAdded({ id, name });
  };
  const ensureSubject = (name: string) => plan.ensureCourse(name, learning?.id ?? null);

  return <PersonalPage title="Study" subtitle="" compact bottomContentInset={bottomInset}
    action={<Pressable onPress={() => show({ kind: "how" })} accessibilityRole="button" accessibilityLabel="How Study works" hitSlop={8} style={s.add}><Ionicons name="help" size={18} color={colors.accent} /></Pressable>}>
    <ContentReveal><View style={s.stack}>
      {!!plan.error && <Text style={s.notice} accessibilityLiveRegion="polite">{plan.error}</Text>}

      <View style={s.section}>
        <SectionHead title="My Exams" addLabel="New exam" onAdd={() => show({ kind: "exam", exam: null, courseId: null })} />
        {exams.length ? exams.map(exam => {
          const course = courseFor(exam.courseId), days = daysUntil(exam.examDate);
          return <View key={exam.id} style={s.hero} testID="study-exam-card">
            {/* The countdown edits the exam; Study sits beside it, never nested inside another button. */}
            <Pressable onPress={() => show({ kind: "exam", exam, courseId: exam.courseId })} accessibilityRole="button"
              accessibilityLabel={`${exam.title}, ${countdownLabel(days)}, ${examDateLabel(exam.examDate)}. Edit exam`} style={s.heroTop}>
              <View style={s.bigDays}>{days === 0 ? <Text style={s.bigToday}>Today</Text> : <>
                <Text style={s.bigNumber} adjustsFontSizeToFit numberOfLines={1}>{days}</Text>
                <Text style={s.bigUnit}>{days === 1 ? "day" : "days"}</Text></>}</View>
              <View style={s.flex}>
                <Text style={s.heroTitle} numberOfLines={2}>{exam.title}</Text>
                <View style={s.metaRow}>{course && <View style={[s.dot, { backgroundColor: courseColor(course.id) }]} />}
                  <Text style={s.caption} numberOfLines={1}>{[course?.name, examDateLabel(exam.examDate)].filter(Boolean).join(" · ")}</Text></View>
              </View>
            </Pressable>
            {course && <View style={s.heroFoot}>
              <Text style={[s.caption, s.flex]} numberOfLines={1}>{studyTime(weekSeconds(plan.recent, course.id))} this week</Text>
              <Pressable onPress={() => study(course)} accessibilityRole="button" accessibilityLabel={`Study ${course.name}`} style={s.pill}>
                <Ionicons name="play" size={12} color={colors.accent} /><Text style={s.pillText} numberOfLines={1}>Study</Text>
              </Pressable>
            </View>}
          </View>;
        }) : <View style={s.hero} testID="study-exam-empty">
          <View style={s.emptyIcon}><Ionicons name="calendar-outline" size={26} color={colors.danger} /></View>
          <View style={{ gap: 4 }}><Text style={s.heroTitle}>Got an exam coming up?</Text><Text style={s.caption}>Add it and watch the days count down here and on Home.</Text></View>
          <Pressable onPress={() => show({ kind: "exam", exam: null, courseId: null })} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>Add an exam</Text></Pressable>
        </View>}
      </View>

      <View style={s.section}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle} accessibilityRole="header">My Subjects</Text>
          <Pressable onPress={() => show({ kind: "add" })} accessibilityRole="button" accessibilityLabel="Add a subject" hitSlop={8}><Text style={s.link}>Add</Text></Pressable>
        </View>
        {plan.courses.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tiles}>
          {plan.courses.map(course => {
            const exam = exams.find(item => item.courseId === course.id), tint = courseColor(course.id);
            return <Pressable key={course.id} onPress={() => show({ kind: "subject", course })} accessibilityRole="button"
              accessibilityLabel={`${course.name}, ${studyTime(weekSeconds(plan.recent, course.id))} this week${exam ? `, exam ${countdownLabel(daysUntil(exam.examDate))}` : ""}. Open subject`} style={s.tile}>
              <View style={[s.tileIcon, { backgroundColor: areaTint(tint, 0.2) }]}><Ionicons name="school-outline" size={16} color={tint} /></View>
              <Text style={s.rowTitle} numberOfLines={1}>{course.name}</Text>
              <Text style={s.caption} numberOfLines={1}>{studyTime(weekSeconds(plan.recent, course.id))} this week</Text>
              <Text style={[s.tileExam, !exam && { color: colors.tertiary }]} numberOfLines={1}>{exam ? `Exam ${countdownLabel(daysUntil(exam.examDate)).toLowerCase()}` : "No exam yet"}</Text>
            </Pressable>;
          })}
        </ScrollView>}
        <View style={s.chips}>{quick.map(name => <Pressable key={name} disabled={!plan.ready} onPress={() => void addSubject(name, null)} accessibilityRole="button" accessibilityLabel={`Add ${name}`} style={s.chip}>
          <Ionicons name="add" size={14} color={colors.accent} /><Text style={s.chipText}>{name}</Text>
        </Pressable>)}
          <Pressable disabled={!plan.ready} onPress={() => show({ kind: "add" })} accessibilityRole="button" accessibilityLabel="More subjects" style={s.chip}>
            <Ionicons name="search" size={14} color={colors.accent} /><Text style={s.chipText}>More</Text></Pressable>
        </View>
        {added ? <View style={s.added} accessibilityLiveRegion="polite" testID="subject-added">
          <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
          <Text style={[s.body, s.flex]} numberOfLines={1}>{added.name} added</Text>
          <Pressable onPress={() => { const subject = added; setAdded(null); show({ kind: "exam", exam: null, courseId: subject.id, title: `${subject.name} exam` }); }}
            accessibilityRole="button" accessibilityLabel={`Add an exam for ${added.name}`} style={s.pill}><Text style={s.pillText}>Add exam</Text></Pressable>
        </View> : <Text style={s.hint}>Tap + to add a subject. Add an exam any time from its card. Study time counts toward Learning.</Text>}
      </View>

    </View></ContentReveal>

    <StudyExamSheet visible={open && sheet?.kind === "exam"} exam={sheet?.kind === "exam" ? sheet.exam : null} courses={plan.courses}
      initialCourseId={sheet?.kind === "exam" ? sheet.courseId : null} initialTitle={sheet?.kind === "exam" ? sheet.title ?? "" : ""}
      onSave={plan.saveExam} onEnsureSubject={ensureSubject} onRemove={id => plan.remove("exam", id)} onClose={() => close()} onDismiss={dismissed} />
    <StudySubjectSheet visible={open && sheet?.kind === "subject"} course={sheet?.kind === "subject" && sheet.course ? courseFor(sheet.course.id) ?? sheet.course : null}
      areas={subjects} defaultAreaId={learning?.id ?? null} recent={plan.recent} exams={plan.exams} sessionOpen={timer.hasOpenSession}
      onSave={plan.saveCourse} onRemove={id => plan.remove("course", id)} onClose={() => close()} onDismiss={dismissed}
      onStudy={course => close(() => study(course))}
      onAddExam={course => close(() => show({ kind: "exam", exam: null, courseId: course.id, title: `${course.name} exam` }))}
      onEditExam={exam => close(() => show({ kind: "exam", exam, courseId: exam.courseId }))} />
    <AppSheet visible={open && sheet?.kind === "add"} onRequestClose={() => close()} onDismiss={dismissed} floating compact maxHeightRatio={0.85} label="add subject"
      keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan" motionMode="timed"
      header={<SheetHeader title="Add a subject" subtitle="Pick one or type your own." onClose={() => close()} />}>
      <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetBody} showsVerticalScrollIndicator={false}>
        <SubjectPicker courses={plan.courses} selectedName={null} onPick={choice => close(() => void addSubject(choice.name, choice.id))} />
      </BottomSheetScrollView>
    </AppSheet>
    <AppSheet visible={open && sheet?.kind === "how"} onRequestClose={() => close()} onDismiss={dismissed} floating compact label="how study works" motionMode="timed"
      header={<SheetHeader title="How Study works" onClose={() => close()} />}>
      <BottomSheetScrollView contentContainerStyle={s.sheetBody}>
        <View style={s.howList}>{HOW_IT_WORKS.map(([title, body], index) => <View key={title} style={[s.howRow, index > 0 && s.line]}>
          <View style={s.step}><Text style={s.stepText}>{index + 1}</Text></View>
          <View style={s.flex}><Text style={s.rowTitle}>{title}</Text><Text style={s.caption}>{body}</Text></View>
        </View>)}</View>
      </BottomSheetScrollView>
    </AppSheet>
  </PersonalPage>;
}

const HOW_IT_WORKS = [
  ["Add your exams", "Each one gets its own countdown, here and on Home, with reminders if you want them."],
  ["Pick a subject when you focus", "Choose Study when you set up a session, or tap Study on an exam."],
  ["See where your time went", "Time per subject shows here, in Progress and on your Profile."],
  ["Keep each other going", "Squads live in Progress. Everyone's focus time counts, study and routines."],
] as const;

function SectionHead({ title, addLabel, onAdd }: { title: string; addLabel: string; onAdd: () => void }) {
  return <View style={s.sectionHead}>
    <Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>
    <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={addLabel} hitSlop={8} style={s.add}><Ionicons name="add" size={18} color={colors.accent} /></Pressable>
  </View>;
}

const s = StyleSheet.create({
  stack: { gap: 24 }, flex: { flex: 1, minWidth: 0 }, section: { gap: 10 },
  notice: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  hero: { ...edge, padding: 16, gap: 12, borderRadius: radius.card, backgroundColor: colors.surface },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 16 },
  bigDays: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)", paddingHorizontal: 6 },
  bigNumber: { color: colors.danger, fontSize: 30, lineHeight: 34, fontWeight: "800", fontVariant: ["tabular-nums"] },
  bigToday: { color: colors.danger, fontSize: 20, lineHeight: 24, fontWeight: "800" },
  bigUnit: { color: colors.danger, fontSize: 12, lineHeight: 16, fontWeight: "600" }, heroTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, body: { color: colors.text, fontSize: 15, lineHeight: 20 },
  heroFoot: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  pill: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, borderRadius: 19, backgroundColor: colors.accentSoft },
  pillText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  link: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  tiles: { gap: 10, paddingRight: 4 },
  tile: { ...edge, width: 148, padding: 12, gap: 6, borderRadius: radius.tile, backgroundColor: colors.surface },
  tileIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  tileExam: { color: colors.danger, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
  howList: { ...edge, borderRadius: 20, backgroundColor: colors.sheetCard, overflow: "hidden" },
  howRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  emptyIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)" },
  primary: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 25, backgroundColor: colors.primary },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
  added: { ...edge, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, paddingLeft: 14, paddingRight: 6, borderRadius: 25, backgroundColor: colors.surface },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  sectionTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3, paddingHorizontal: 4 },
  add: { ...edge, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  hint: { color: colors.tertiary, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { ...edge, minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.sheetCard },
  chipText: { color: colors.text, fontSize: 15, fontWeight: "500" },
  step: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  stepText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
});
