import { useLayoutEffect, useRef, useState } from "react";
import { Keyboard, StyleSheet, Switch, View } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput, TouchableOpacity } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AppSheet from "./AppSheet";
import SheetConfirmation from "./SheetConfirmation";
import FocusLengthControl from "./FocusLengthControl";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useSavedRoutines } from "../hooks/useSavedRoutines";
import { focusAreaChoices, focusAreaKind, focusAreaTitle } from "../utils/focusAreas";
import { validRoutineDraft } from "../utils/savedRoutine";
import type { RoutineDraft, SavedRoutine } from "../types/savedRoutine";
import type { Subject } from "../services/taskService";

export default function RoutineEditorSheet({ visible, onClose, onDismiss, routine, subjects, initialAreaId = null, initialSeconds = 1800 }: {
  visible: boolean; onClose: () => void; onDismiss?: () => void; routine?: SavedRoutine | null; subjects: Pick<Subject, "id" | "title" | "color_code">[]; initialAreaId?: number | null; initialSeconds?: number;
}) {
  const routines = useSavedRoutines(), { hapticsEnabled } = useUser(), insets = useSafeAreaInsets();
  const makeDraft = (): RoutineDraft => routine ? { name: routine.name, focusAreaId: routine.focusAreaId, durationSeconds: routine.durationSeconds, reminder: { ...routine.reminder } }
    : { name: "", focusAreaId: initialAreaId, durationSeconds: initialSeconds, reminder: { enabled: false, hour: 18, minute: 0 } };
  const [draft, setDraft] = useState(makeDraft), [original, setOriginal] = useState(() => JSON.stringify(makeDraft()));
  const [hour, setHour] = useState(String(draft.reminder.hour)), [minute, setMinute] = useState(String(draft.reminder.minute));
  const [wasVisible, setWasVisible] = useState(visible), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"discard" | "remove" | null>(null);
  const lock = useRef(false), generation = useRef(0);
  useLayoutEffect(() => { const epoch = generation.current + 1; generation.current = epoch; return () => { generation.current = epoch + 1; }; }, [visible, routines.scope?.ownerId, routines.scope?.backendId]);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) { const next = makeDraft(); setDraft(next); setOriginal(JSON.stringify(next)); setHour(String(next.reminder.hour)); setMinute(String(next.reminder.minute)); setError(""); setConfirm(null); setBusy(false); }
  }
  const current = { ...draft, reminder: draft.reminder.enabled ? { ...draft.reminder, hour: Number(hour), minute: Number(minute) } : draft.reminder };
  const general = subjects.find(item => focusAreaKind(item.title) === "general");
  const generalSelected = draft.focusAreaId === null || focusAreaKind(subjects.find(item => item.id === draft.focusAreaId)?.title) === "general";
  const dirty = JSON.stringify(current) !== original;
  const feedback = () => { if (hapticsEnabled) void Haptics.selectionAsync().catch(() => {}); };
  const close = () => { if (busy) return; Keyboard.dismiss(); if (dirty) setConfirm("discard"); else onClose(); };
  const save = async () => {
    if (lock.current) return;
    const next = { ...current, name: current.name.trim() };
    if (!validRoutineDraft(next) || (next.reminder.enabled && (!/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute)))) { setError("Add a name and choose a valid reminder time, from 00:00 to 23:59."); return; }
    if (next.focusAreaId !== null && !subjects.some(item => item.id === next.focusAreaId)) { setError("Choose an available focus area before saving."); return; }
    lock.current = true; setBusy(true); const epoch = generation.current;
    try { const saved = await routines.save(next, routine?.id); if (epoch !== generation.current) return; if (saved) { feedback(); onClose(); } else setError("Couldn't save this routine. Your previous settings are still here."); }
    finally { lock.current = false; if (epoch === generation.current) setBusy(false); }
  };
  const remove = async () => {
    if (!routine || lock.current) return;
    lock.current = true; setBusy(true); const epoch = generation.current;
    try { const removed = await routines.remove(routine.id); if (epoch === generation.current) { setConfirm(null); if (removed) onClose(); else setError("Couldn't remove this routine. Try again."); } }
    finally { lock.current = false; if (epoch === generation.current) setBusy(false); }
  };
  return <AppSheet visible={visible} onRequestClose={close} onDismiss={onDismiss} expanded heightRatio={0.78} guardDismiss={dirty || busy} label="routine editor"
    keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan" motionMode="timed"
    header={<View style={s.header}><Text style={s.title}>{routine ? "Edit routine" : "Make it a routine"}</Text><Text style={s.caption}>A saved starting point for something that matters.</Text></View>}
    overlay={confirm && <SheetConfirmation title={confirm === "remove" ? "Remove this routine?" : "Discard your changes?"} message={confirm === "remove" ? "Your recorded sessions and progress stay saved." : "Your previous routine stays saved."} confirmLabel={confirm === "remove" ? "Remove routine" : "Discard changes"} cancelLabel="Keep editing" onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm === "remove") void remove(); else { setConfirm(null); onClose(); } }} />}
    footer={<View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}><TouchableOpacity accessibilityRole="button" disabled={busy || !routines.ready} onPress={() => void save()} style={s.primary}><Text style={s.primaryText}>{busy ? "Saving…" : "Save routine"}</Text></TouchableOpacity></View>}>
    <BottomSheetScrollView enableFooterMarginAdjustment keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
      <Text style={s.label}>Routine name</Text>
      <BottomSheetTextInput value={draft.name} maxLength={80} editable={!busy} onChangeText={name => { setDraft({ ...draft, name }); setError(""); }} placeholder="For example, Review my notes" placeholderTextColor={colors.secondary} accessibilityLabel="Routine name" style={s.input} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
      <Text style={s.label}>Focus area</Text><View style={s.choices}>
        <TouchableOpacity disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: generalSelected }} onPress={() => { feedback(); setDraft({ ...draft, focusAreaId: general?.id ?? null }); }} style={[s.choice, generalSelected && s.selected]}><Text style={s.choiceText}>Everyday focus</Text></TouchableOpacity>
        {focusAreaChoices(subjects, draft.focusAreaId).filter(item => focusAreaTitle(item.title) !== "Everyday focus").map(item => <TouchableOpacity key={item.id} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: item.id === draft.focusAreaId }} onPress={() => { feedback(); setDraft({ ...draft, focusAreaId: item.id }); }} style={[s.choice, item.id === draft.focusAreaId && s.selected]}><Text style={s.choiceText}>{focusAreaTitle(item.title)}</Text></TouchableOpacity>)}
      </View>
      <FocusLengthControl seconds={draft.durationSeconds} disabled={busy} onChange={durationSeconds => setDraft({ ...draft, durationSeconds })} />
      <View style={s.reminder}><View style={{ flex: 1 }}><Text style={s.label}>Daily reminder</Text><Text style={s.caption}>At the same local time on this phone.</Text></View><Switch accessibilityLabel="Daily routine reminder" value={draft.reminder.enabled} disabled={busy} onValueChange={enabled => { feedback(); setDraft({ ...draft, reminder: { ...draft.reminder, enabled } }); }} trackColor={{ true: colors.accent }} /></View>
      {draft.reminder.enabled && <><View style={s.time}><View style={{ flex: 1, gap: 6 }}><Text style={s.caption}>Hour (0–23)</Text><BottomSheetTextInput accessibilityLabel="Reminder hour" value={hour} maxLength={2} keyboardType="number-pad" editable={!busy} onChangeText={setHour} style={s.input} /></View><View style={{ flex: 1, gap: 6 }}><Text style={s.caption}>Minute (0–59)</Text><BottomSheetTextInput accessibilityLabel="Reminder minute" value={minute} maxLength={2} keyboardType="number-pad" editable={!busy} onChangeText={setMinute} style={s.input} /></View></View><Text style={s.caption}>Reminders need notification permission. You can enable it in Profile → Settings.</Text></>}
      <Text style={s.caption}>Name, focus area, duration and reminder preferences sync to your account. Device permissions stay on each phone.</Text>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {routine && <TouchableOpacity disabled={busy} accessibilityRole="button" onPress={() => setConfirm("remove")} style={s.remove}><Text style={s.error}>Remove routine</Text></TouchableOpacity>}
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 }, title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "500" },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 20 }, label: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "500" },
  body: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 }, input: { minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: colors.surface }, selected: { backgroundColor: colors.selection }, choiceText: { color: colors.text, fontSize: 14 },
  time: { flexDirection: "row", gap: 12 }, reminder: { flexDirection: "row", alignItems: "center", gap: 12 }, footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surfaceRaised },
  primary: { minHeight: 52, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderRadius: 16 }, primaryText: { color: colors.primaryText, fontSize: 16, fontWeight: "500" }, error: { color: colors.danger, fontSize: 14, lineHeight: 21 }, remove: { minHeight: 44, alignItems: "center", justifyContent: "center" },
});
