import { useState, useSyncExternalStore } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import Pressable from "./MotionPressable";
import SubjectPicker, { type SubjectPick } from "./SubjectPicker";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { studySelection } from "../services/studySelection";
import { areaTint } from "../utils/lifeAreaColor";
import { countdownLabel, courseColor, daysUntil, studyAreaFor, upcomingExams } from "../utils/studyPlan";
import { revisionArea } from "../utils/focusAreas";
import type { Subject } from "../services/taskService";

/**
 * The study session's subject row. Once a subject is set (from an exam, a
 * subject or Study) it just shows it; to study something else, go back and
 * pick that. Without one, any subject can be picked or typed; a new one is
 * added to My Subjects, and picking one moves the session to its focus area.
 */
export default function SubjectSetupRow({ areas, areaId, generalId, learningId, disabled = false, onArea, open: openProp, onOpenChange, style }: {
  areas: Pick<Subject, "id" | "title">[]; areaId: number | null; generalId: number | null | undefined; learningId: number | null | undefined;
  disabled?: boolean; onArea: (id: number | null) => void; open?: boolean; onOpenChange?: (open: boolean) => void; style?: StyleProp<ViewStyle>;
}) {
  const plan = useStudyPlan(), insets = useSafeAreaInsets();
  const chosen = useSyncExternalStore(studySelection.subscribe, studySelection.get, studySelection.get);
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => { setOwnOpen(next); onOpenChange?.(next); };
  const [error, setError] = useState("");
  const course = plan.courses.find(item => item.id === chosen) ?? null;
  const tint = course ? courseColor(course.id) : colors.accent;
  const nextExam = course ? upcomingExams(plan.exams).find(item => item.courseId === course.id) : undefined;
  const pick = async (choice: SubjectPick) => {
    const id = choice.id ?? await plan.ensureCourse(choice.name, learningId ?? null);
    if (!id) { setError("Couldn't add that subject. Try again."); return; }
    setError(""); studySelection.choose(id);
    const picked = plan.courses.find(item => item.id === id);
    // An exam coming up makes it Revision; otherwise the subject's own area.
    const area = picked ? studyAreaFor(picked, plan.exams, revisionArea(areas)?.id, generalId) : learningId ?? generalId ?? null;
    if (area !== areaId && areas.some(item => item.id === area)) onArea(area);
    setOpen(false);
  };
  const value = course ? `${course.name}${nextExam ? `, ${nextExam.title} ${countdownLabel(daysUntil(nextExam.examDate))}` : ""}` : "None";
  const content = <>
    <View style={[s.icon, { backgroundColor: areaTint(tint) }]}><Ionicons name="school-outline" size={16} color={tint} /></View>
    <View style={s.labelColumn}><Text style={s.label}>Subject</Text>{!!nextExam && <Text style={[s.exam, daysUntil(nextExam.examDate) <= 7 && s.examSoon]} numberOfLines={1}>{nextExam.title} {countdownLabel(daysUntil(nextExam.examDate)).toLowerCase()}</Text>}</View>
    <Text style={[s.value, course ? s.chosen : s.prompt]} numberOfLines={1}>{course?.name ?? "Choose"}</Text>
    {!course && <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />}
  </>;
  return <>
    {course ? <View accessible accessibilityLabel="Subject" accessibilityValue={{ text: value }} testID="session-subject" style={[s.row, style]}>{content}</View>
      : <Pressable disabled={disabled} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Choose subject"
        accessibilityValue={{ text: value }} style={[s.row, style]}>{content}</Pressable>}
    <AppSheet visible={open} onRequestClose={() => setOpen(false)} attached compact maxHeightRatio={0.85} label="subject choices"
      keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan" motionMode="timed"
      header={<SheetHeader title="Subject" subtitle="Counts as Revision when an exam is coming up, otherwise Learning." onClose={() => setOpen(false)} />}>
      <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.list, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} showsVerticalScrollIndicator={false}>
        <SubjectPicker courses={plan.courses} selectedName={course?.name ?? null} onPick={choice => void pick(choice)} />
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      </BottomSheetScrollView>
    </AppSheet>
  </>;
}
const s = StyleSheet.create({
  row: { minHeight: 52, paddingVertical: 11, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  label: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  labelColumn: { flexShrink: 1, minWidth: 0 }, exam: { color: colors.secondary, fontSize: 13, lineHeight: 17 }, examSoon: { color: colors.danger },
  value: { flex: 1, textAlign: "right", fontSize: 16, lineHeight: 22 }, chosen: { color: colors.text }, prompt: { color: colors.accent, fontWeight: "600" },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
});
