import { useRef, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, Switch, View } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import SheetConfirmation from "./SheetConfirmation";
import MonthCalendar from "./MonthCalendar";
import Pressable from "./SheetTouchable";
import { Text } from "./AppText";
import { colors, radius } from "../constants/theme";
import { type } from "../constants/typography";
import { areaTint } from "../utils/lifeAreaColor";
import { addDays, countdownLabel, courseColor, dateKey, daysUntil, EXAM_DAYS_AHEAD, examDateLabel, examTimeLabel, validExamDraft } from "../utils/studyPlan";
import { enableNotifications, readNotificationPermission } from "../services/notificationPermissionService";
import { tapHaptic, tapHapticsEnabled } from "../utils/tapHaptics";
import type { StudyCourse, StudyExam, StudyExamDraft } from "../types/studyPlan";

// Half-hour steps across a school or university day.
const EXAM_TIMES = Array.from({ length: 27 }, (_, index) => 7 * 60 + index * 30);

/** Add or edit one exam: a name, an optional subject and a day. */
export default function StudyExamSheet({ visible, exam, courses, initialCourseId = null, onSave, onRemove, onClose, onDismiss }: {
  visible: boolean; exam: StudyExam | null; courses: StudyCourse[]; initialCourseId?: string | null;
  onSave: (draft: StudyExamDraft, id?: string) => Promise<boolean>; onRemove: (id: string) => Promise<boolean>; onClose: () => void; onDismiss?: () => void;
}) {
  const today = dateKey(new Date());
  const makeDraft = (): StudyExamDraft => exam ? { title: exam.title, courseId: exam.courseId, examDate: exam.examDate, examMinute: exam.examMinute ?? null, remind: exam.remind ?? true }
    : { title: "", courseId: initialCourseId, examDate: addDays(today, 14), examMinute: null, remind: true };
  const [draft, setDraft] = useState(makeDraft), [original, setOriginal] = useState(() => JSON.stringify(makeDraft()));
  const [wasVisible, setWasVisible] = useState(visible), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"discard" | "remove" | null>(null);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) { const next = makeDraft(); setDraft(next); setOriginal(JSON.stringify(next)); setError(""); setConfirm(null); setBusy(false); }
  }
  const lock = useRef(false);
  const dirty = JSON.stringify(draft) !== original;
  const days = daysUntil(draft.examDate);
  const close = () => { if (busy) return; Keyboard.dismiss(); if (dirty) setConfirm("discard"); else onClose(); };
  const run = async (work: () => Promise<boolean>, failure: string) => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try { if (await work()) { setConfirm(null); onClose(); } else setError(failure); }
    catch { setError(failure); }
    finally { lock.current = false; setBusy(false); }
  };
  const save = () => {
    const next = { ...draft, title: draft.title.trim() };
    if (!next.title) { setError("Give your exam a name first."); return; }
    if (!validExamDraft(next) || days < 0) { setError("Pick a date from today onwards."); return; }
    Keyboard.dismiss();
    void run(async () => {
      // Ask for notifications only when a reminder is actually being saved.
      if (next.remind) { const permission = await readNotificationPermission().catch(() => null); if (permission && !permission.granted && permission.action === "enable") await enableNotifications().catch(() => null); }
      return onSave(next, exam?.id);
    }, "Couldn't save this exam. Your details are still here.");
  };
  const subjects = [...courses.map(course => ({ id: course.id as string | null, name: course.name })), { id: null, name: "None" }];
  return <AppSheet visible={visible} onRequestClose={close} onDismiss={onDismiss} floating compact maxHeightRatio={0.9} guardDismiss={dirty || busy} label="exam editor"
    keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan" motionMode="timed"
    header={<SheetHeader title={exam ? "Edit exam" : "New exam"} subtitle={`${days >= 0 ? `${countdownLabel(days)} · ` : ""}${examDateLabel(draft.examDate)}${draft.examMinute !== null ? ` · ${examTimeLabel(draft.examMinute)}` : ""}`} onClose={close} closeLabel="Close exam editor" />}
    // Save stays in view while the calendar and times scroll.
    footer={<View style={s.footer}>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <View style={s.actions}>
        {exam && <Pressable disabled={busy} onPress={() => setConfirm("remove")} accessibilityRole="button" accessibilityLabel="Remove exam" style={s.remove}><Ionicons name="trash-outline" size={21} color={colors.danger} /></Pressable>}
        <View style={s.saveCell}><Pressable disabled={busy} onPress={save} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>{busy ? "Saving…" : "Save exam"}</Text></Pressable></View>
      </View>
    </View>}
    overlay={confirm && <SheetConfirmation title={confirm === "remove" ? "Remove this exam?" : "Discard your changes?"}
      message={confirm === "remove" ? "Your study time stays saved." : "Your previous details stay as they were."}
      confirmLabel={confirm === "remove" ? "Remove exam" : "Discard changes"} cancelLabel="Keep editing" onCancel={() => setConfirm(null)}
      onConfirm={() => { if (confirm === "remove" && exam) void run(() => onRemove(exam.id), "Couldn't remove this exam. Try again."); else { setConfirm(null); onClose(); } }} />}>
    <BottomSheetScrollView enableFooterMarginAdjustment keyboardShouldPersistTaps="handled" contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <BottomSheetTextInput value={draft.title} maxLength={80} editable={!busy} placeholder="For example, Calculus final" placeholderTextColor={colors.secondary}
        accessibilityLabel="Exam name" style={[s.input, !!error && !draft.title.trim() && s.inputError]} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()}
        onChangeText={title => { setDraft(current => ({ ...current, title })); setError(""); }} />
      {courses.length > 0 && <View style={s.group}>
        <Text style={s.label}>Subject</Text>
        <View style={s.chips}>{subjects.map(item => {
          const selected = item.id === draft.courseId, tint = item.id ? courseColor(item.id) : colors.secondary;
          return <Pressable key={item.id ?? "none"} disabled={busy} onPress={() => setDraft(current => ({ ...current, courseId: item.id }))} accessibilityRole="radio"
            accessibilityState={{ checked: selected }} accessibilityLabel={item.id ? item.name : "No subject"} style={[s.chip, selected && { backgroundColor: areaTint(tint, 0.18) }]}>
            <Text style={[s.chipText, selected && { color: item.id ? tint : colors.text }]} numberOfLines={1}>{item.name}</Text>
          </Pressable>;
        })}</View>
      </View>}
      <MonthCalendar key={`${visible}:${exam?.id ?? "new"}`} value={draft.examDate} min={today} max={addDays(today, EXAM_DAYS_AHEAD)} today={today}
        onChange={examDate => { setDraft(current => ({ ...current, examDate })); setError(""); }} />
      <View style={s.group}>
        <Text style={s.label}>Time</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.times} keyboardShouldPersistTaps="handled">
          {[null, ...EXAM_TIMES].map(minute => {
            const selected = draft.examMinute === minute;
            return <Pressable key={minute ?? "none"} disabled={busy} onPress={() => setDraft(current => ({ ...current, examMinute: minute }))} accessibilityRole="radio" accessibilityState={{ checked: selected }}
              accessibilityLabel={minute === null ? "No time" : examTimeLabel(minute)} style={[s.chip, selected && s.chipOn]}>
              <Text style={[s.chipText, selected && s.chipTextOn]}>{minute === null ? "No time" : examTimeLabel(minute)}</Text>
            </Pressable>;
          })}
        </ScrollView>
      </View>
      <View style={s.remind}>
        <View style={s.flex}><Text style={s.remindTitle}>Remind me</Text><Text style={s.caption}>A week before, the day before and on the day.</Text></View>
        <Switch value={draft.remind} disabled={busy} onValueChange={remind => { if (tapHapticsEnabled()) tapHaptic(); setDraft(current => ({ ...current, remind })); }}
          accessibilityLabel="Remind me about this exam" trackColor={{ true: colors.accent, false: colors.selection }} thumbColor={colors.text} />
      </View>
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  input: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, color: colors.text, fontSize: 17, borderRadius: 16, backgroundColor: colors.sheetCard },
  inputError: { borderWidth: 1, borderColor: colors.danger },
  group: { gap: 8 }, label: { ...type.label, paddingHorizontal: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: "center", backgroundColor: colors.sheetCard },
  chipText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  chipOn: { backgroundColor: colors.accentSoft }, chipTextOn: { color: colors.accent },
  times: { gap: 8, paddingRight: 4 }, flex: { flex: 1, minWidth: 0, gap: 2 },
  remind: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, backgroundColor: colors.sheetCard },
  remindTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" }, caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  footer: { gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, backgroundColor: colors.surface, borderBottomLeftRadius: radius.sheet, borderBottomRightRadius: radius.sheet }, actions: { flexDirection: "row", gap: 10 }, saveCell: { flex: 1 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  primary: { minHeight: 54, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderRadius: 27 },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
  remove: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)" },
});
