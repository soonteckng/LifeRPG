import { useState, useSyncExternalStore } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import Pressable from "./MotionPressable";
import SheetButton from "./SheetTouchable";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { studySelection } from "../services/studySelection";
import { focusAreaTitle } from "../utils/focusAreas";
import { areaTint } from "../utils/lifeAreaColor";
import { countdownLabel, courseArea, courseColor, daysUntil, subjectForArea, upcomingExams } from "../utils/studyPlan";
import type { Subject } from "../services/taskService";

/**
 * The one Subject row every session setup shares. Picking a subject also sets
 * its focus area; a subject from another area simply shows as None.
 */
export default function SubjectSetupRow({ areas, areaId, generalId, disabled = false, onArea, style }: {
  areas: Pick<Subject, "id" | "title">[]; areaId: number | null; generalId: number | null | undefined; disabled?: boolean;
  onArea: (id: number | null) => void; style?: StyleProp<ViewStyle>;
}) {
  const plan = useStudyPlan();
  const chosen = useSyncExternalStore(studySelection.subscribe, studySelection.get, studySelection.get);
  const [open, setOpen] = useState(false);
  if (!plan.ready || !plan.courses.length) return null;
  const course = subjectForArea(plan.courses, chosen, areaId, generalId);
  const tint = course ? courseColor(course.id) : colors.secondary;
  const nextExam = course ? upcomingExams(plan.exams).find(item => item.courseId === course.id) : undefined;
  const choose = (id: string | null) => {
    studySelection.choose(id);
    const next = id ? plan.courses.find(item => item.id === id) : null;
    if (next) { const area = courseArea(next, generalId); if (area !== areaId && areas.some(item => item.id === area)) onArea(area); }
    setOpen(false);
  };
  return <>
    <Pressable disabled={disabled} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Choose subject" accessibilityValue={{ text: course ? `${course.name}${nextExam ? `, ${nextExam.title} ${countdownLabel(daysUntil(nextExam.examDate))}` : ""}` : "None" }} style={[s.row, style]}>
      <View style={[s.icon, course && { backgroundColor: areaTint(tint) }]}><Ionicons name="school-outline" size={16} color={tint} /></View>
      <View style={s.labelColumn}><Text style={s.label}>Subject</Text>{!!nextExam && <Text style={s.exam} numberOfLines={1}>{nextExam.title} {countdownLabel(daysUntil(nextExam.examDate)).toLowerCase()}</Text>}</View>
      <Text style={[s.value, !!course && s.chosen]} numberOfLines={1}>{course?.name ?? "None"}</Text>
      <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
    </Pressable>
    <AppSheet visible={open} onRequestClose={() => setOpen(false)} floating compact maxHeightRatio={0.8} label="subject choices"
      header={<SheetHeader title="Subject" subtitle="Count this session toward a subject." onClose={() => setOpen(false)} />}>
      <BottomSheetScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        {[...plan.courses, null].map(item => {
          const selected = (item?.id ?? null) === (course?.id ?? null), color = item ? courseColor(item.id) : colors.secondary;
          const exam = item && upcomingExams(plan.exams).find(entry => entry.courseId === item.id);
          const detail = item ? [focusAreaTitle(areas.find(area => area.id === courseArea(item, generalId))?.title), exam && `${exam.title} ${countdownLabel(daysUntil(exam.examDate))}`].filter(Boolean).join(" · ") : "Just this focus area";
          return <SheetButton key={item?.id ?? "none"} disabled={disabled} onPress={() => choose(item?.id ?? null)} accessibilityRole="radio" accessibilityState={{ checked: selected }}
            accessibilityLabel={item ? item.name : "No subject"} style={[s.choice, selected && s.choiceOn]}>
            <View style={[s.choiceIcon, { backgroundColor: areaTint(color) }]}><Ionicons name={item ? "school-outline" : "remove"} size={18} color={color} /></View>
            <View style={s.copy}><Text style={s.choiceTitle}>{item ? item.name : "No subject"}</Text><Text style={s.choiceMeta} numberOfLines={1}>{detail}</Text></View>
            {selected && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
          </SheetButton>;
        })}
      </BottomSheetScrollView>
    </AppSheet>
  </>;
}
const s = StyleSheet.create({
  row: { minHeight: 52, paddingVertical: 11, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  label: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  labelColumn: { flexShrink: 1, minWidth: 0 }, exam: { color: colors.danger, fontSize: 13, lineHeight: 17 },
  value: { flex: 1, textAlign: "right", color: colors.secondary, fontSize: 16, lineHeight: 22 }, chosen: { color: colors.text },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  choice: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, padding: 12, borderRadius: 16, backgroundColor: colors.sheetCard, borderWidth: 1.5, borderColor: "transparent" },
  choiceOn: { borderColor: colors.accent },
  choiceIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  choiceTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "500" },
  choiceMeta: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
});
