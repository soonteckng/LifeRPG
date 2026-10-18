import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import Pressable from "../../components/MotionPressable";
import ContentReveal from "../../components/ContentReveal";
import { PersonalPage } from "../../components/PersonalUI";
import { Text } from "../../components/AppText";
import StudyExamSheet from "../../components/StudyExamSheet";
import StudySubjectSheet from "../../components/StudySubjectSheet";
import { requestStudySync } from "../../components/StudyLifecycle";
import SectionHeader, { CircleButton } from "../../components/SectionHeader";
import SubjectShelf from "../../components/SubjectShelf";
import ExamsCard from "../../components/ExamsCard";
import SheetConfirmation from "../../components/SheetConfirmation";
import AppSheet from "../../components/AppSheet";
import SheetHeader from "../../components/SheetHeader";
import SubjectPicker from "../../components/SubjectPicker";
import { colors, radius, edge } from "../../constants/theme";
import { useQuests } from "../../context/QuestContext";
import { useTimer } from "../../context/TimerContext";
import { useStudyPlan } from "../../hooks/useStudyPlan";
import { useStudyLauncher } from "../../hooks/useStudyLauncher";
import { useTabDockInset } from "../../hooks/useTabDockInset";
import { suggestedArea } from "../../utils/focusAreas";
import { countdownLabel, daysUntil, QUICK_SUBJECTS, sortCoursesByExam, subjectSuggestions, upcomingExams } from "../../utils/studyPlan";
import type { StudyCourse, StudyExam } from "../../types/studyPlan";

type Sheet = { kind: "exam"; exam: StudyExam | null; courseId: string | null; title?: string } | { kind: "subject"; course: StudyCourse | null }
  | { kind: "add" } | { kind: "how" } | null;

/**
 * Study: your subjects first, then your exams. A session starts from a
 * subject's ▶, its card, or Study on an exam; there is no setup form here.
 */
export default function StudyScreen() {
  const timer = useTimer();
  const bottomInset = useTabDockInset("study");
  const { subjects = [] } = useQuests();
  const plan = useStudyPlan();
  const launcher = useStudyLauncher(plan.exams);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<StudyCourse | null>(null);
  const afterClose = useRef<(() => void) | null>(null);
  useFocusEffect(useCallback(() => { requestStudySync(); return () => setEditing(false); }, []));
  // A subject added with one tap says so in place, with an optional exam, then fades.
  const [added, setAdded] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { if (!added) return; const timer = setTimeout(() => setAdded(null), 6000); return () => clearTimeout(timer); }, [added]);

  const exams = upcomingExams(plan.exams);
  const courses = useMemo(() => sortCoursesByExam(plan.courses, plan.exams), [plan.courses, plan.exams]);
  const courseFor = (id: string | null) => plan.courses.find(item => item.id === id) ?? null;
  const learning = suggestedArea(subjects, "learning");
  const quick = subjectSuggestions("", plan.courses.map(course => course.name), 40).filter(name => (QUICK_SUBJECTS as readonly string[]).includes(name)).slice(0, 5);
  const fresh = plan.ready && !plan.courses.length && !exams.length;
  if (editing && !plan.courses.length) setEditing(false);

  const show = (value: Sheet) => { setEditing(false); setSheet(value); setOpen(true); };
  const close = (then?: () => void) => { afterClose.current = then ?? null; setOpen(false); };
  const dismissed = () => { const then = afterClose.current; afterClose.current = null; setSheet(null); then?.(); };
  // Adding a subject only adds it; an exam is one tap away but never forced.
  const addSubject = async (name: string, courseId: string | null) => {
    const id = courseId ?? await plan.ensureCourse(name, learning?.id ?? null);
    if (id) setAdded({ id, name });
  };
  const ensureSubject = (name: string) => plan.ensureCourse(name, learning?.id ?? null);
  const newExam = () => show({ kind: "exam", exam: null, courseId: null });
  const nearest = exams[0];

  const chips = <View style={s.chips}>{quick.map(name => <Pressable key={name} disabled={!plan.ready} onPress={() => void addSubject(name, null)} accessibilityRole="button" accessibilityLabel={`Add ${name}`} style={s.chip}>
    <Ionicons name="add" size={14} color={colors.accent} /><Text style={s.chipText}>{name}</Text>
  </Pressable>)}
    <Pressable disabled={!plan.ready} onPress={() => show({ kind: "add" })} accessibilityRole="button" accessibilityLabel="More subjects" style={s.chip}>
      <Ionicons name="search" size={14} color={colors.accent} /><Text style={s.chipText}>More</Text></Pressable>
  </View>;

  return <View style={s.screen}><PersonalPage title="Study" subtitle="" compact bottomContentInset={bottomInset}
    action={<CircleButton icon="help" size={36} label="How Study works" onPress={() => show({ kind: "how" })} />}>
    <ContentReveal><View style={s.stack}>
      {!!plan.error && <Text style={s.notice} accessibilityLiveRegion="polite">{plan.error}</Text>}

      <View style={s.section}>
        <SectionHeader title="My Subjects" subtitle={editing ? "Tap − to remove. Their minutes stay saved." : courses.length ? "Nearest exam first. Hold one to edit." : "Start with what you’re taking."}
          right={editing ? <Pressable onPress={() => setEditing(false)} accessibilityRole="button" accessibilityLabel="Done editing subjects" hitSlop={8} style={s.done}><Text style={s.doneText}>Done</Text></Pressable>
            : <CircleButton label="Add a subject" disabled={!plan.ready} onPress={() => show({ kind: "add" })} />} />
        {fresh ? <View style={s.welcome} testID="study-welcome">
          <View style={s.welcomeIcon}><Ionicons name="school" size={24} color={colors.accent} /></View>
          <Text style={s.welcomeTitle}>Your study space</Text>
          <Text style={s.body}>Add the subjects you’re taking. Exams count down here, and time you study counts as Learning, or Revision once an exam is near.</Text>
          {chips}
        </View> : courses.length ? <SubjectShelf courses={courses} exams={plan.exams} recent={plan.recent} editing={editing} onEditingChange={setEditing}
          onOpen={course => show({ kind: "subject", course })} onStudy={launcher.study} onRemove={setRemoving} /> : null}
        {!fresh && courses.length < 3 && !editing && chips}
        {added && <View style={s.added} accessibilityLiveRegion="polite" testID="subject-added">
          <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
          <Text style={[s.body, s.flex]} numberOfLines={1}>{added.name} added</Text>
          <Pressable onPress={() => { const subject = added; setAdded(null); show({ kind: "exam", exam: null, courseId: subject.id, title: `${subject.name} exam` }); }}
            accessibilityRole="button" accessibilityLabel={`Add an exam for ${added.name}`} style={s.pill}><Text style={s.pillText}>Add exam</Text></Pressable>
        </View>}
      </View>

      <View style={s.section}>
        <SectionHeader title="My Exams" subtitle={nearest ? `${exams.length} coming up · next ${countdownLabel(daysUntil(nearest.examDate)).toLowerCase()}` : undefined}
          right={<CircleButton label="New exam" disabled={!plan.ready} onPress={newExam} />} />
        {exams.length ? <ExamsCard exams={exams} courses={plan.courses} onStudy={launcher.study} onRemove={id => plan.remove("exam", id)}
          onEdit={exam => show({ kind: "exam", exam, courseId: exam.courseId })} />
          : <Pressable onPress={newExam} accessibilityRole="button" accessibilityLabel="Add an exam" testID="study-exam-empty" style={[s.group, s.emptyRow]}>
            <View style={s.emptyIcon}><Ionicons name="calendar-outline" size={20} color={colors.danger} /></View>
            <View style={s.flex}><Text style={s.rowTitle}>Got an exam coming up?</Text><Text style={s.caption}>Add it and the days count down here and on Home.</Text></View>
            <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
          </Pressable>}
      </View>
    </View></ContentReveal>

    <StudyExamSheet visible={open && sheet?.kind === "exam"} exam={sheet?.kind === "exam" ? sheet.exam : null} courses={plan.courses}
      initialCourseId={sheet?.kind === "exam" ? sheet.courseId : null} initialTitle={sheet?.kind === "exam" ? sheet.title ?? "" : ""}
      onSave={plan.saveExam} onEnsureSubject={ensureSubject} onRemove={id => plan.remove("exam", id)} onClose={() => close()} onDismiss={dismissed} />
    <StudySubjectSheet visible={open && sheet?.kind === "subject"} course={sheet?.kind === "subject" && sheet.course ? courseFor(sheet.course.id) ?? sheet.course : null}
      areas={subjects} defaultAreaId={learning?.id ?? null} recent={plan.recent} exams={plan.exams} sessionOpen={!!timer.hasOpenSession}
      onSave={plan.saveCourse} onRemove={id => plan.remove("course", id)} onClose={() => close()} onDismiss={dismissed}
      onStudy={course => close(() => launcher.study(course))}
      onAddExam={course => close(() => show({ kind: "exam", exam: null, courseId: course.id, title: `${course.name} exam` }))}
      onEditExam={exam => close(() => show({ kind: "exam", exam, courseId: exam.courseId }))} />
    <AppSheet visible={open && sheet?.kind === "add"} onRequestClose={() => close()} onDismiss={dismissed} floating compact maxHeightRatio={0.85} label="add subject"
      keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan" motionMode="timed"
      header={<SheetHeader title="Add a subject" subtitle="Pick one or type your own. One you removed comes back with its minutes." onClose={() => close()} />}>
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
  </PersonalPage>
    {removing && <SheetConfirmation title={`Remove ${removing.name}?`} destructive
      message="Its minutes stay saved. Add it back any time and they return. Its exams stay, without a subject."
      confirmLabel="Remove subject" cancelLabel="Keep subject" onCancel={() => setRemoving(null)}
      onConfirm={() => { const course = removing; setRemoving(null); void plan.remove("course", course.id); }} />}
  </View>;
}

const HOW_IT_WORKS = [
  ["Add your subjects", "Hold a subject to remove it. Its minutes stay saved, and come back if you add it again."],
  ["Add your exams", "Each one counts down here and on Home, with reminders if you want them."],
  ["Study a subject", "Tap ▶ on a subject or Study on an exam. With an exam coming up it counts as Revision, otherwise Learning."],
  ["See where your time went", "Progress breaks Revision and Learning down by subject."],
] as const;

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, stack: { gap: 26 }, flex: { flex: 1, minWidth: 0 }, section: { gap: 10 },
  notice: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  pill: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, borderRadius: 19, backgroundColor: colors.accentSoft },
  pillText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  done: { minHeight: 32, paddingHorizontal: 14, borderRadius: 16, justifyContent: "center", backgroundColor: colors.accentSoft },
  doneText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  welcome: { ...edge, padding: 18, gap: 10, borderRadius: radius.card, backgroundColor: colors.surface },
  welcomeIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft, marginBottom: 2 },
  welcomeTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
  howList: { ...edge, borderRadius: 20, backgroundColor: colors.sheetCard, overflow: "hidden" },
  howRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  group: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  emptyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)" },
  added: { ...edge, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, paddingLeft: 14, paddingRight: 6, borderRadius: 25, backgroundColor: colors.surface },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { ...edge, minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.sheetCard },
  chipText: { color: colors.text, fontSize: 15, fontWeight: "500" },
  step: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  stepText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
});
