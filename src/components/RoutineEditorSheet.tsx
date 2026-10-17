import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState, Keyboard, StyleSheet, Switch, View } from "react-native";
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
import { readNotificationPermission, enableNotifications, openNotificationSettings, type NotificationPermission } from "../services/notificationPermissionService";
import type { RoutineDraft, SavedRoutine } from "../types/savedRoutine";
import type { Subject } from "../services/taskService";

export default function RoutineEditorSheet({ visible, onClose, onDismiss, routine, subjects, initialAreaId = null, initialSeconds = 1800, initialName = "", onSaved }: {
  visible: boolean; onClose: () => void; onDismiss?: () => void; routine?: SavedRoutine | null; subjects: Pick<Subject, "id" | "title" | "color_code">[]; initialAreaId?: number | null; initialSeconds?: number; initialName?: string; onSaved?: (draft: RoutineDraft) => void;
}) {
  const routines = useSavedRoutines(), { hapticsEnabled } = useUser(), insets = useSafeAreaInsets();
  const makeDraft = (): RoutineDraft => routine ? { name: routine.name, focusAreaId: routine.focusAreaId, durationSeconds: routine.durationSeconds, reminder: { ...routine.reminder } }
    : { name: initialName, focusAreaId: initialAreaId, durationSeconds: initialSeconds, reminder: { enabled: false, hour: 18, minute: 0 } };
  const [draft, setDraft] = useState(makeDraft), [original, setOriginal] = useState(() => JSON.stringify(makeDraft()));
  const [hour, setHour] = useState(String(draft.reminder.hour)), [minute, setMinute] = useState(String(draft.reminder.minute));
  const [wasVisible, setWasVisible] = useState(visible), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"discard" | "remove" | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null), [permissionBusy, setPermissionBusy] = useState(false);
  const permissionScope = JSON.stringify([visible, draft.reminder.enabled, routines.scope?.ownerId, routines.scope?.backendId]);
  const [permissionView, setPermissionView] = useState(permissionScope);
  if (permissionView !== permissionScope) {
    setPermissionView(permissionScope); setPermission(null); setPermissionBusy(false);
  }
  const permissionGeneration = useRef(0), permissionRequest = useRef(0), permissionLock = useRef(false);
  const lock = useRef(false), generation = useRef(0);
  useLayoutEffect(() => { const epoch = generation.current + 1; generation.current = epoch; return () => { generation.current = epoch + 1; }; }, [visible, routines.scope?.ownerId, routines.scope?.backendId]);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) { const next = makeDraft(); setDraft(next); setOriginal(JSON.stringify(next)); setHour(String(next.reminder.hour)); setMinute(String(next.reminder.minute)); setError(""); setConfirm(null); setBusy(false); }
  }
  useEffect(() => {
    const epoch = ++permissionGeneration.current;
    permissionLock.current = false;
    if (!visible || !draft.reminder.enabled) return;
    const read = async () => {
      if (permissionLock.current) return;
      const request = ++permissionRequest.current;
      const next = await readNotificationPermission();
      if (permissionGeneration.current === epoch && permissionRequest.current === request) setPermission(next);
    };
    void read();
    const listener = AppState.addEventListener("change", state => { if (state === "active") void read(); });
    return () => { listener.remove(); permissionGeneration.current = epoch + 1; };
  }, [visible, draft.reminder.enabled, routines.scope?.ownerId, routines.scope?.backendId]);
  const current = { ...draft, reminder: draft.reminder.enabled ? { ...draft.reminder, hour: Number(hour), minute: Number(minute) } : draft.reminder };
  const general = subjects.find(item => focusAreaKind(item.title) === "general");
  const generalSelected = draft.focusAreaId === null || focusAreaKind(subjects.find(item => item.id === draft.focusAreaId)?.title) === "general";
  const dirty = JSON.stringify(current) !== original;
  const feedback = () => { if (hapticsEnabled) void Haptics.selectionAsync().catch(() => {}); };
  const close = () => { if (busy) return; Keyboard.dismiss(); if (dirty) setConfirm("discard"); else onClose(); };
  const allowReminderNotifications = async () => {
    if (!visible || !draft.reminder.enabled || !permission?.action || permissionLock.current) return;
    const epoch = permissionGeneration.current;
    const request = ++permissionRequest.current;
    permissionLock.current = true; setPermissionBusy(true);
    try {
      if (permission.action === "enable") {
        const next = await enableNotifications();
        if (permissionGeneration.current === epoch && permissionRequest.current === request) setPermission(next);
      } else {
        if (permission.action === "settings") await openNotificationSettings();
        const next = await readNotificationPermission();
        if (permissionGeneration.current === epoch && permissionRequest.current === request) setPermission(next);
      }
    } catch {
      if (permissionGeneration.current === epoch) setPermission({ label: "Couldn't check notifications. Your reminder choice can still be saved.", supported: true, action: "retry" });
    } finally { if (permissionGeneration.current === epoch) { permissionLock.current = false; setPermissionBusy(false); } }
  };
  const save = async () => {
    if (lock.current) return;
    const next = { ...current, name: current.name.trim() };
    if (!validRoutineDraft(next) || (next.reminder.enabled && (!/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute)))) { setError("Add a name and choose a valid reminder time, from 00:00 to 23:59."); return; }
    if (next.focusAreaId !== null && !subjects.some(item => item.id === next.focusAreaId)) { setError("Choose an available focus area before saving."); return; }
    lock.current = true; setBusy(true); const epoch = generation.current;
    try { const saved = await routines.save(next, routine?.id); if (epoch !== generation.current) return; if (saved) { feedback(); onSaved?.(next); onClose(); } else setError("Couldn't save this routine. Your previous settings are still here."); }
    catch { if (epoch === generation.current) setError("Couldn't save this routine. Your previous settings are still here."); }
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
      <BottomSheetTextInput value={draft.name} maxLength={80} editable={!busy} onChangeText={name => { setDraft(previous => ({ ...previous, name })); setError(""); }} placeholder="For example, Review my notes" placeholderTextColor={colors.secondary} accessibilityLabel="Routine name" style={s.input} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
      <Text style={s.label}>Focus area</Text><View style={s.choices}>
        <TouchableOpacity disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: generalSelected }} onPress={() => { feedback(); setDraft(previous => ({ ...previous, focusAreaId: general?.id ?? null })); }} style={[s.choice, generalSelected && s.selected]}><Text style={s.choiceText}>Everyday focus</Text></TouchableOpacity>
        {focusAreaChoices(subjects, draft.focusAreaId).filter(item => focusAreaTitle(item.title) !== "Everyday focus").map(item => <TouchableOpacity key={item.id} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: item.id === draft.focusAreaId }} onPress={() => { feedback(); setDraft(previous => ({ ...previous, focusAreaId: item.id })); }} style={[s.choice, item.id === draft.focusAreaId && s.selected]}><Text style={s.choiceText}>{focusAreaTitle(item.title)}</Text></TouchableOpacity>)}
      </View>
      <FocusLengthControl seconds={draft.durationSeconds} disabled={busy} onChange={durationSeconds => setDraft(previous => ({ ...previous, durationSeconds }))} />
      <View style={s.reminder}><View style={{ flex: 1 }}><Text style={s.label}>Daily reminder</Text><Text style={s.caption}>At the same local time on this phone.</Text></View><Switch accessibilityLabel="Daily routine reminder" value={draft.reminder.enabled} disabled={busy} onValueChange={enabled => { feedback(); setDraft(previous => ({ ...previous, reminder: { ...previous.reminder, enabled } })); }} trackColor={{ true: colors.accent }} /></View>
      {draft.reminder.enabled && <><View style={s.time}><View style={{ flex: 1, gap: 6 }}><Text style={s.caption}>Hour (0–23)</Text><BottomSheetTextInput accessibilityLabel="Reminder hour" value={hour} maxLength={2} keyboardType="number-pad" editable={!busy} onChangeText={setHour} style={s.input} /></View><View style={{ flex: 1, gap: 6 }}><Text style={s.caption}>Minute (0–59)</Text><BottomSheetTextInput accessibilityLabel="Reminder minute" value={minute} maxLength={2} keyboardType="number-pad" editable={!busy} onChangeText={setMinute} style={s.input} /></View></View>
        <View style={s.permission}><Text accessibilityLiveRegion="polite" style={s.label}>{permission?.label ?? "Checking notifications…"}</Text>
          <Text style={s.caption}>Routine reminders use ordinary notification permission. They do not need Usage Access or Display over other apps.</Text>
          {!permission?.granted && permission?.action && <TouchableOpacity accessibilityRole="button" disabled={permissionBusy || busy} onPress={() => void allowReminderNotifications()} style={s.permissionAction}><Text style={s.permissionActionText}>{permissionBusy ? "Please wait…" : permission.action === "enable" ? "Allow notifications" : permission.action === "settings" ? "Open phone settings" : "Check notifications again"}</Text></TouchableOpacity>}
          {!permission?.granted && <Text style={s.caption}>You can save this reminder now. It can notify you after notifications are allowed.</Text>}
          <Text style={s.caption}>Your phone may delay reminders to save battery.</Text>
        </View></>}
      <Text style={s.caption}>Name, focus area, duration and reminder preferences sync to your account. Device permissions stay on each phone.</Text>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {routine && <TouchableOpacity disabled={busy} accessibilityRole="button" onPress={() => setConfirm("remove")} style={s.remove}><Text style={s.error}>Remove routine</Text></TouchableOpacity>}
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 }, title: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "600", letterSpacing: -0.5 },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 }, label: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  body: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 }, input: { minHeight: 54, paddingHorizontal: 16, paddingVertical: 12, color: colors.text, fontSize: 17, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, backgroundColor: colors.sheetCard },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { minHeight: 44, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, justifyContent: "center", backgroundColor: colors.sheetCard, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, selected: { backgroundColor: colors.accentSoft, borderColor: colors.accent }, choiceText: { color: colors.text, fontSize: 15, fontWeight: "500" },
  time: { flexDirection: "row", gap: 12 }, reminder: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.sheetCard, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surfaceRaised },
  permission: { padding: 14, borderRadius: 14, backgroundColor: colors.accentSoft, gap: 8 }, permissionAction: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.selection }, permissionActionText: { color: colors.accent, fontSize: 14, fontWeight: "500" },
  primary: { minHeight: 52, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderRadius: 16 }, primaryText: { color: colors.primaryText, fontSize: 16, fontWeight: "500" }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 }, remove: { minHeight: 44, alignItems: "center", justifyContent: "center" },
});
