import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TourAnchor } from "../../components/FeatureTour";
import { useFocusEffect, useRouter } from "expo-router";
import ContentReveal from "../../components/ContentReveal";
import { PersonalPage } from "../../components/PersonalUI";
import { Text } from "../../components/AppText";
import Pressable from "../../components/MotionPressable";
import SavedRoutinesCard from "../../components/SavedRoutinesCard";
import HowItWorksSheet from "../../components/HowItWorksSheet";
import { CircleButton } from "../../components/SectionHeader";
import { colors } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { useQuests } from "../../context/QuestContext";
import { useTimer } from "../../context/TimerContext";
import { useStudyPlan } from "../../hooks/useStudyPlan";
import { daysUntil } from "../../utils/studyPlan";
import { useTabDockInset } from "../../hooks/useTabDockInset";
import { setupMode } from "../../services/setupMode";
import type { Task } from "../../services/taskService";

/**
 * Your activities (mockup 03): everything you do, in one quiet list. Routines
 * with a daily reminder sit under Repeats, the rest under Any time, and a tag
 * filter narrows them. Study subjects and exams have their own page, one row
 * away. New routines start from "+ New".
 */
export default function RoutinesScreen() {
  const timer = useTimer({ live: false }), { accessMode } = useAuth();
  const { tasks, subjects = [], refresh } = useQuests();
  const router = useRouter(), plan = useStudyPlan();
  const bottomInset = useTabDockInset("routines");
  const [how, setHow] = useState(false), [newRequest, setNewRequest] = useState(0);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const open = !!timer.hasOpenSession;
  // Old routines keep their task link; the setup screen confirms before starting.
  const startLegacy = (task: Task) => {
    if (!open && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !(timer.isCompleted && !timer.sessionSummary)) {
      timer.setNotes(""); timer.setLinkedTaskId(task.id);
      timer.setDurationInMinutes(task.target_minutes || 30); timer.setTargetAttributeId(task.subject_id ?? null);
      setupMode.choose("routine");
    }
    timer.reviewSummary?.(); router.navigate("/session");
  };
  const subjectsCount = plan.courses.filter(course => course.deletedAt == null).length;
  const examsCount = plan.exams.filter(exam => daysUntil(exam.examDate) >= 0).length;
  return <PersonalPage title="Your activities" subtitle="" compact today bottomContentInset={bottomInset}
    action={<View style={s.actions}>
      <CircleButton icon="help" size={40} label="How activities work" onPress={() => setHow(true)} />
      <Pressable onPress={() => setNewRequest(n => n + 1)} accessibilityRole="button" accessibilityLabel="New routine" testID="activities-new" style={s.newButton}>
        <Ionicons name="add" size={18} color={colors.primaryText} /><Text style={s.newText}>New</Text>
      </Pressable>
    </View>}>
    <ContentReveal><View style={s.stack}>
      <Text style={s.subtitle}>Your time. Your rules.</Text>
      <SavedRoutinesCard layout="activities" newRequest={newRequest} wrapMine={mine => <TourAnchor id="routines-mine" style={s.mine}>{mine}</TourAnchor>} subjects={subjects}
        limit={Number.MAX_SAFE_INTEGER} active={accessMode === "online" || subjects.length > 0} legacyTasks={tasks} onStartLegacy={startLegacy}
        afterList={<>
      {/* Study keeps its own page for subjects and exam dates. */}
      <View style={s.group}>
        <Text style={s.groupLabel} accessibilityRole="header">STUDY</Text>
        <Pressable onPress={() => router.navigate("/study")} accessibilityRole="button" testID="activities-study"
          accessibilityLabel={`Subjects and exams. ${subjectsCount} ${subjectsCount === 1 ? "subject" : "subjects"}, ${examsCount} ${examsCount === 1 ? "exam" : "exams"} coming up`} style={s.row}>
          <View style={s.copy}><Text style={s.title}>Subjects and exams</Text>
            <Text style={s.caption}>{subjectsCount ? `${subjectsCount} ${subjectsCount === 1 ? "subject" : "subjects"}` : "Add what you’re studying"}{examsCount ? ` · ${examsCount} ${examsCount === 1 ? "exam" : "exams"} coming up` : ""}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.tertiary} />
        </Pressable>
      </View>
        </>} />
    </View></ContentReveal>
    <HowItWorksSheet visible={how} onClose={() => setHow(false)} title="How activities work" label="how routines work" steps={HOW_IT_WORKS} />
  </PersonalPage>;
}
const HOW_IT_WORKS = [
  ["Repeats or any time", "A routine with a daily reminder repeats at its time and shows up on Today when it’s next. One without a reminder waits under Any time."],
  ["Save a routine", "Tap New. Give it a name, a length and a category, plus a daily reminder if you like."],
  ["Start in one tap", "Tap ▶ here, or Start on Today, and you’re straight into a session."],
  ["Change or remove", "Hold a routine to edit or remove it. We’ll always check before removing anything."],
  ["Need ideas?", "Grab one of the ideas below and make it yours."],
] as const;

const s = StyleSheet.create({
  stack: { gap: 22 },
  // Same spacing as the routines list, so the guide's highlight changes nothing on screen.
  mine: { gap: 18 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  newButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary },
  newText: { color: colors.primaryText, fontSize: 15, fontWeight: "600" },
  subtitle: { color: colors.secondary, fontSize: 16, lineHeight: 22, marginTop: -10 },
  group: { gap: 0 },
  groupLabel: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 1.2, paddingBottom: 6 },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 19 },
});
