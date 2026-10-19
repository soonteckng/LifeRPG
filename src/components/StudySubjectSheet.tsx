import { useRef, useState } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import SheetConfirmation from "./SheetConfirmation";
import Pressable from "./SheetTouchable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { type } from "../constants/typography";
import { focusAreaTitle } from "../utils/focusAreas";
import { countdownLabel, courseColor, daysUntil, examDateLabel, studyDays, studyTime, upcomingExams, validCourseDraft } from "../utils/studyPlan";
import type { Subject } from "../services/taskService";
import type { StudyCourse, StudyCourseDraft, StudyExam, StudyRecent } from "../types/studyPlan";

type Area = Pick<Subject, "id" | "title" | "color_code">;
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/** One subject: its week at a glance, its exams, and a way to study it now. New subjects open straight into editing. */
export default function StudySubjectSheet({ visible, course, areas, defaultAreaId, recent, exams, sessionOpen, onSave, onRemove, onStudy, onAddExam, onEditExam, onClose, onDismiss }: {
  visible: boolean; course: StudyCourse | null; areas: Area[]; defaultAreaId: number | null; recent: StudyRecent[]; exams: StudyExam[]; sessionOpen: boolean;
  onSave: (draft: StudyCourseDraft, id?: string) => Promise<boolean>; onRemove: (id: string) => Promise<boolean>;
  onStudy: (course: StudyCourse) => void; onAddExam: (course: StudyCourse) => void; onEditExam: (exam: StudyExam) => void; onClose: () => void; onDismiss?: () => void;
}) {
  const makeDraft = (): StudyCourseDraft => course ? { name: course.name, focusAreaId: course.focusAreaId } : { name: "", focusAreaId: defaultAreaId };
  const [draft, setDraft] = useState(makeDraft), [original, setOriginal] = useState(() => JSON.stringify(makeDraft()));
  const [editing, setEditing] = useState(!course);
  const [wasVisible, setWasVisible] = useState(visible), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"discard" | "remove" | null>(null);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) { const next = makeDraft(); setDraft(next); setOriginal(JSON.stringify(next)); setEditing(!course); setError(""); setConfirm(null); setBusy(false); }
  }
  const lock = useRef(false);
  const dirty = editing && JSON.stringify(draft) !== original;
  const area = areas.find(item => item.id === course?.focusAreaId);
  const tint = courseColor(course?.id);
  const close = () => { if (busy) return; Keyboard.dismiss(); if (dirty) setConfirm("discard"); else if (editing && course) setEditing(false); else onClose(); };
  const run = async (work: () => Promise<boolean>, failure: string, after: () => void) => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try { if (await work()) { setConfirm(null); after(); } else setError(failure); }
    catch { setError(failure); }
    finally { lock.current = false; setBusy(false); }
  };
  const save = () => {
    const next = { ...draft, name: draft.name.trim() };
    if (!next.name) { setError("Give your subject a name first."); return; }
    if (!validCourseDraft(next)) { setError("Use up to 60 characters for the name."); return; }
    Keyboard.dismiss();
    void run(() => onSave(next, course?.id), "Couldn't save this subject. Your details are still here.", () => { if (course) { setOriginal(JSON.stringify(next)); setEditing(false); } else onClose(); });
  };
  const days = course ? studyDays(recent, course.id) : [];
  const week = days.reduce((sum, value) => sum + value, 0), peak = Math.max(...days, 1);
  const letters = days.map((_, index) => DAY_LETTERS[(new Date().getDay() + 1 + index) % 7]);
  const courseExams = course ? upcomingExams(exams).filter(item => item.courseId === course.id) : [];
  return <AppSheet visible={visible} onRequestClose={close} onDismiss={onDismiss} compact maxHeightRatio={0.9} guardDismiss={dirty || busy} label="subject"
    keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan" motionMode="timed"
    header={<SheetHeader title={editing ? course ? "Edit subject" : "New subject" : course?.name ?? ""} subtitle={editing ? "Revision while an exam is coming up, otherwise Learning." : courseExams.length ? "Counts as Revision · exam coming up" : `Counts as ${focusAreaTitle(area?.title)}`}
      onClose={close} closeLabel={editing && course ? "Stop editing" : "Close subject"} />}
    overlay={confirm && <SheetConfirmation title={confirm === "remove" ? `Remove ${course?.name ?? "this subject"}?` : "Discard your changes?"}
      message={confirm === "remove" ? "Its minutes stay saved. Add it back any time and they return. Its exams stay, without a subject." : "Your previous details stay as they were."}
      confirmLabel={confirm === "remove" ? "Remove subject" : "Discard changes"} cancelLabel="Keep editing" onCancel={() => setConfirm(null)}
      onConfirm={() => { if (confirm === "remove" && course) void run(() => onRemove(course.id), "Couldn't remove this subject. Try again.", onClose); else { setConfirm(null); if (course) { setDraft(makeDraft()); setEditing(false); } else onClose(); } }} />}>
    <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      {editing ? <>
        <BottomSheetTextInput value={draft.name} maxLength={60} editable={!busy} placeholder="For example, Maths" placeholderTextColor={colors.secondary}
          accessibilityLabel="Subject name" style={[s.input, !!error && !draft.name.trim() && s.inputError]} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()}
          onChangeText={name => { setDraft(current => ({ ...current, name })); setError(""); }} />
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <View style={s.actions}>
          {course && <Pressable disabled={busy} onPress={() => setConfirm("remove")} accessibilityRole="button" accessibilityLabel="Remove subject" style={s.remove}><Ionicons name="trash-outline" size={21} color={colors.danger} /></Pressable>}
          <View style={s.flex}><Pressable disabled={busy} onPress={save} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>{busy ? "Saving…" : "Save subject"}</Text></Pressable></View>
        </View>
      </> : course && <>
        <View style={s.card} accessible accessibilityLabel={`Last 7 days, ${studyTime(week)}. ${studyTime(course.totalSeconds)} in total.`}>
          <View style={s.statHead}>
            <View><Text style={s.label}>Last 7 days</Text><Text style={s.big}>{studyTime(week)}</Text></View>
            <Text style={s.caption}>{studyTime(course.totalSeconds)} in total</Text>
          </View>
          <View style={s.bars}>{days.map((value, index) => <View key={index} style={s.barCell}>
            <View style={[s.bar, { height: Math.max(4, Math.round(64 * value / peak)), backgroundColor: value ? tint : colors.selection }]} />
            <Text style={s.barLabel}>{letters[index]}</Text>
          </View>)}</View>
        </View>
        <View style={s.list}>
          {courseExams.map((exam, index) => <Pressable key={exam.id} onPress={() => onEditExam(exam)} accessibilityRole="button"
            accessibilityLabel={`${exam.title}, ${examDateLabel(exam.examDate)}, ${countdownLabel(daysUntil(exam.examDate))}. Edit exam`} style={[s.row, index > 0 && s.rowLine]}>
            <ExamTile date={exam.examDate} />
            <View style={s.flex}><Text style={s.rowTitle} numberOfLines={1}>{exam.title}</Text><Text style={s.caption}>{examDateLabel(exam.examDate)}</Text></View>
            <Text style={[s.countdown, daysUntil(exam.examDate) <= 7 && s.countdownSoon]}>{countdownLabel(daysUntil(exam.examDate))}</Text>
          </Pressable>)}
          <Pressable onPress={() => onAddExam(course)} accessibilityRole="button" accessibilityLabel={`Add an exam for ${course.name}`} style={[s.row, courseExams.length > 0 && s.rowLine]}>
            <View style={[s.tile, { backgroundColor: colors.accentSoft }]}><Ionicons name="add" size={20} color={colors.accent} /></View>
            <Text style={[s.rowTitle, s.flex, { color: colors.accent }]}>Add an exam</Text>
          </Pressable>
        </View>
        <View style={s.actions}>
          <View style={s.flex}><Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel={`Edit ${course.name}`} style={s.secondary}><Text style={s.secondaryText}>Edit</Text></Pressable></View>
          <View style={s.wide}><Pressable disabled={sessionOpen} onPress={() => onStudy(course)} accessibilityRole="button" accessibilityLabel={sessionOpen ? "A session is already open" : `Study ${course.name}`} style={[s.primary, sessionOpen && s.disabled]}>
            <Text style={s.primaryText} numberOfLines={1}>{sessionOpen ? "Session open" : `Study ${course.name}`}</Text></Pressable></View>
        </View>
      </>}
    </BottomSheetScrollView>
  </AppSheet>;
}

export function ExamTile({ date, tint = colors.danger }: { date: string; tint?: string }) {
  const [year, month, day] = date.split("-").map(Number);
  return <View style={[s.tile, { backgroundColor: colors.selection }]}>
    <Text style={[s.tileMonth, { color: tint }]}>{new Date(year, month - 1, day).toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}</Text>
    <Text style={s.tileDay}>{String(day).padStart(2, "0")}</Text>
  </View>;
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 }, flex: { flex: 1, minWidth: 0 }, wide: { flex: 2 },
  input: { ...edge, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, color: colors.text, fontSize: 17, borderRadius: 16, backgroundColor: colors.sheetCard },
  inputError: { borderWidth: 1, borderColor: colors.danger },
  label: { ...type.label, paddingHorizontal: 4 }, caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  card: { ...edge, borderRadius: 22, backgroundColor: colors.sheetCard, padding: 16, gap: 12 },
  statHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  big: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "800", paddingHorizontal: 4, fontVariant: ["tabular-nums"] },
  bars: { flexDirection: "row", gap: 10, alignItems: "flex-end" }, barCell: { flex: 1, alignItems: "stretch", gap: 6 },
  bar: { borderRadius: 5 }, barLabel: { color: colors.tertiary, fontSize: 12, lineHeight: 16, textAlign: "center" },
  list: { ...edge, borderRadius: 22, backgroundColor: colors.sheetCard, overflow: "hidden" },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 9 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  countdown: { color: colors.secondary, fontSize: 15, fontWeight: "600" }, countdownSoon: { color: "#FFB4AE" },
  tile: { width: 44, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tileMonth: { fontSize: 10, lineHeight: 12, fontWeight: "700", letterSpacing: 0.6 },
  tileDay: { color: colors.text, fontSize: 20, lineHeight: 23, fontWeight: "800", fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", gap: 10 },
  primary: { minHeight: 54, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, backgroundColor: colors.primary, borderRadius: 27 },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
  secondary: { ...edge, minHeight: 54, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard, borderRadius: 27 },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  remove: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)" },
});
