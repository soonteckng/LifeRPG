import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
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
import { useTabDockInset } from "../../hooks/useTabDockInset";
import { useQuickStart } from "../../hooks/useQuickStart";
import { useAuth } from "../../context/AuthContext";
import FreeFocusCard from "../../components/FreeFocusCard";
import SubjectSetupRow from "../../components/SubjectSetupRow";
import SessionProtectionControl from "../../components/SessionProtectionControl";
import ExamRow from "../../components/ExamRow";
import { PinnedRoute } from "../../components/PinnedAction";
import { generalArea, suggestedArea } from "../../utils/focusAreas";
import { countdownLabel, courseArea, courseColor, daysUntil, QUICK_SUBJECTS, studyTime, subjectSuggestions, upcomingExams, weekSeconds } from "../../utils/studyPlan";
import { areaTint, lifeAreaColor } from "../../utils/lifeAreaColor";
import { setupMode } from "../../services/setupMode";
import AppSheet from "../../components/AppSheet";
import SheetHeader from "../../components/SheetHeader";
import SubjectPicker from "../../components/SubjectPicker";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { StudyCourse, StudyExam } from "../../types/studyPlan";

type Sheet = { kind: "exam"; exam: StudyExam | null; courseId: string | null; title?: string } | { kind: "subject"; course: StudyCourse | null }
  | { kind: "add" } | { kind: "how" } | { kind: "exams" } | null;
// Exams beyond these open in a full list, so the tab stays short in exam season.
const EXAMS_SHOWN = 3;

export default function StudyScreen() {
  return <PinnedRoute name="study"><Study /></PinnedRoute>;
}
function Study() {
  const router = useRouter();
  const timer = useTimer(), { accessMode } = useAuth();
  const bottomInset = useTabDockInset("study");
  const { subjects = [] } = useQuests();
  const plan = useStudyPlan();
  const quickStart = useQuickStart();
  const chosenId = useSyncExternalStore(studySelection.subscribe, studySelection.get, studySelection.get);
  const [subjectOpen, setSubjectOpen] = useState(false);
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
  // The setup at the top: a subject, its length and protection, then Start.
  const general = generalArea(subjects);
  const chosen = plan.courses.find(item => item.id === chosenId) ?? null;
  const studyAreaId = chosen ? courseArea(chosen, general?.id) : learning?.id ?? null;
  const sessionOpen = !!timer.hasOpenSession;
  const shownArea = subjects.find(area => area.id === (sessionOpen ? timer.targetAttributeId : studyAreaId));
  const startStudy = () => {
    if (!chosen) { setSubjectOpen(true); return; }
    setupMode.choose("study");
    void quickStart.start(quickStart.seconds, studyAreaId, chosen.name);
  };
  const shownExams = exams.slice(0, EXAMS_SHOWN);

  return <PersonalPage title="Study" subtitle="" compact bottomContentInset={bottomInset}
    action={<Pressable onPress={() => show({ kind: "how" })} accessibilityRole="button" accessibilityLabel="How Study works" hitSlop={8} style={s.add}><Ionicons name="help" size={18} color={colors.accent} /></Pressable>}>
    <ContentReveal><View style={s.stack}>
      {!!plan.error && <Text style={s.notice} accessibilityLiveRegion="polite">{plan.error}</Text>}

      {!quickStart.ready ? <View style={s.loading}><Text style={s.caption}>Getting your study setup ready…</Text></View>
        : <FreeFocusCard label="Study" seconds={sessionOpen ? timer.finishing ? 0 : timer.timeLeft : quickStart.seconds} duration={sessionOpen ? timer.duration : undefined}
        area={sessionOpen ? shownArea?.title ?? "General" : chosen?.name ?? "Study"} areaId={sessionOpen ? timer.targetAttributeId : studyAreaId} subjects={subjects}
        tint={sessionOpen ? lifeAreaColor(timer.targetAttributeId, shownArea?.color_code) : chosen ? courseColor(chosen.id) : colors.accent}
        active={sessionOpen} running={!!timer.isRunning} awaitingStart={timer.awaitingStart} finishing={sessionOpen && timer.finishing} breakSeconds={sessionOpen ? timer.breakSecondsLeft : 0}
        dimmed={quickStart.unavailable} starting={quickStart.starting} restoring={!!timer.isRestoring}
        disabled={quickStart.blocked || (!sessionOpen && (quickStart.areasLoading || quickStart.questsError))}
        changeDisabled={quickStart.starting || !!timer.actionBusy || quickStart.areasLoading || quickStart.questsError}
        failed={quickStart.failed} error={timer.actionError ?? undefined} onChange={() => {}} onStart={sessionOpen ? quickStart.openSession : startStudy}
        protection={<SessionProtectionControl activeSurface={accessMode === "online"} />}
        onDuration={quickStart.chooseDuration} customSeconds={quickStart.duration.value.customSeconds} onCustomDuration={next => quickStart.chooseDuration(next, true)}
        leadRow={<SubjectSetupRow areas={subjects} areaId={studyAreaId} generalId={general?.id} learningId={learning?.id} disabled={quickStart.starting}
          onArea={() => {}} open={subjectOpen} onOpenChange={setSubjectOpen} />} />}

      <View style={s.section}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle} accessibilityRole="header">My Exams</Text>
          <View style={s.headActions}>
            {exams.length > EXAMS_SHOWN && <Pressable onPress={() => show({ kind: "exams" })} accessibilityRole="button" accessibilityLabel={`See all ${exams.length} exams`} hitSlop={8}><Text style={s.link}>See all {exams.length}</Text></Pressable>}
            <Pressable onPress={() => show({ kind: "exam", exam: null, courseId: null })} accessibilityRole="button" accessibilityLabel="New exam" hitSlop={8} style={s.add}><Ionicons name="add" size={18} color={colors.accent} /></Pressable>
          </View>
        </View>
        {exams.length ? <View style={s.group}>{shownExams.map((exam, index) => {
          const course = courseFor(exam.courseId);
          return <ExamRow key={exam.id} exam={exam} course={course} first={index === 0} onPress={() => show({ kind: "exam", exam, courseId: exam.courseId })} onStudy={course ? () => study(course) : undefined} />;
        })}</View> : <Pressable onPress={() => show({ kind: "exam", exam: null, courseId: null })} accessibilityRole="button" accessibilityLabel="Add an exam" testID="study-exam-empty" style={[s.group, s.emptyRow]}>
          <View style={s.emptyIcon}><Ionicons name="calendar-outline" size={20} color={colors.danger} /></View>
          <View style={s.flex}><Text style={s.rowTitle}>Got an exam coming up?</Text><Text style={s.caption}>Add it and the days count down here and on Home.</Text></View>
          <Ionicons name="add-circle" size={24} color={colors.accent} />
        </Pressable>}
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
    <AppSheet visible={open && sheet?.kind === "exams"} onRequestClose={() => close()} onDismiss={dismissed} floating compact maxHeightRatio={0.86} label="all exams" motionMode="timed"
      header={<SheetHeader title="My Exams" subtitle={`${exams.length} coming up, nearest first.`} onClose={() => close()} />}>
      <BottomSheetScrollView contentContainerStyle={s.sheetBody} showsVerticalScrollIndicator={false}>
        <View style={[s.group, s.sheetGroup]}>{exams.map((exam, index) => {
          const course = courseFor(exam.courseId);
          return <ExamRow key={exam.id} exam={exam} course={course} first={index === 0} onPress={() => close(() => show({ kind: "exam", exam, courseId: exam.courseId }))} onStudy={course ? () => close(() => study(course)) : undefined} />;
        })}</View>
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
  ["Study with a subject", "Pick one at the top and start, or tap Study on an exam."],
  ["See where your time went", "Time per subject shows here, in Progress and on your Profile."],
  ["Keep each other going", "Join a squad in Squads. Everyone's focus time counts, study and routines."],
] as const;

const s = StyleSheet.create({
  stack: { gap: 24 }, flex: { flex: 1, minWidth: 0 }, section: { gap: 10 },
  notice: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, body: { color: colors.text, fontSize: 15, lineHeight: 20 },
  pill: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, borderRadius: 19, backgroundColor: colors.accentSoft },
  pillText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  link: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  tiles: { gap: 10, paddingRight: 4 },
  tile: { ...edge, width: 148, padding: 12, gap: 6, borderRadius: radius.tile, backgroundColor: colors.surface },
  tileIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  tileExam: { color: colors.danger, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
  howList: { ...edge, borderRadius: 20, backgroundColor: colors.sheetCard, overflow: "hidden" },
  howRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  group: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" }, sheetGroup: { backgroundColor: colors.sheetCard },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  headActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  loading: { minHeight: 140, alignItems: "center", justifyContent: "center", borderRadius: radius.card, backgroundColor: colors.surface },
  emptyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)" },
  added: { ...edge, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, paddingLeft: 14, paddingRight: 6, borderRadius: 25, backgroundColor: colors.surface },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  sectionTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3, paddingHorizontal: 4 },
  add: { ...edge, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  hint: { color: colors.tertiary, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { ...edge, minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.sheetCard },
  chipText: { color: colors.text, fontSize: 15, fontWeight: "500" },
  step: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  stepText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
});
