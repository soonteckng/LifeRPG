import { tapHaptic } from "../utils/tapHaptics";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState, Keyboard, StyleSheet, Switch, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import TouchableOpacity from "./SheetTouchable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import SheetConfirmation from "./SheetConfirmation";
import FocusLengthControl from "./FocusLengthControl";
import FocusAreaPicker from "./FocusAreaPicker";
import SheetHeader from "./SheetHeader";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { type } from "../constants/typography";
import { useUser } from "../context/UserContext";
import { useSavedRoutines } from "../hooks/useSavedRoutines";
import { focusAreaChoices, focusAreaKind, focusAreaTitle } from "../utils/focusAreas";
import { validRoutineDraft } from "../utils/savedRoutine";
import { validSessionSeconds } from "../utils/sessionSetup";
import { readNotificationPermission, enableNotifications, openNotificationSettings, type NotificationPermission } from "../services/notificationPermissionService";
import type { RoutineDraft, SavedRoutine } from "../types/savedRoutine";
import type { Subject } from "../services/taskService";
import { lastRoutineArea } from "../services/lastRoutineArea";
import { lifeAreaColor } from "../utils/lifeAreaColor";
import SheetTextInput from "./SheetTextInput";

export default function RoutineEditorSheet({ visible, onClose, onDismiss, routine, subjects, initialAreaId = null, initialSeconds = 1800, initialName = "", idea, onSaved, onAddWidget, widgetOnSave = false }: {
  visible: boolean; onClose: () => void; onDismiss?: () => void; routine?: SavedRoutine | null; subjects: Pick<Subject, "id" | "title" | "color_code">[]; initialAreaId?: number | null; initialSeconds?: number; initialName?: string; onSaved?: (draft: RoutineDraft, options?: { addWidget: boolean }) => void;
  /** A new routine can go straight onto the home screen once it is saved. */
  widgetOnSave?: boolean;
  /** Pins this saved routine to the phone's home screen, where the launcher supports it. */
  onAddWidget?: () => void;
  /** A ready-made idea keeps its own category while it keeps its name. */
  idea?: { name: string; areaId: number | null };
}) {
  const routines = useSavedRoutines(), { hapticsEnabled, profile } = useUser(), insets = useSafeAreaInsets();
  const owner = profile?.id ?? "";
  useEffect(() => { void lastRoutineArea.load(owner); }, [owner]);
  // A brand-new routine starts in the category you picked last time.
  const startingArea = () => {
    if (initialAreaId !== null || initialName) return initialAreaId;
    const last = lastRoutineArea.get(owner);
    return last !== null && subjects.some(item => item.id === last) ? last : null;
  };
  const makeDraft = (): RoutineDraft => routine ? { name: routine.name, focusAreaId: routine.focusAreaId, durationSeconds: routine.durationSeconds, reminder: { ...routine.reminder } }
    : { name: initialName, focusAreaId: startingArea(), durationSeconds: initialSeconds, reminder: { enabled: false, hour: 18, minute: 0 } };
  const [draft, setDraft] = useState(makeDraft), [original, setOriginal] = useState(() => JSON.stringify(makeDraft()));
  const [hour, setHour] = useState(String(draft.reminder.hour)), [minute, setMinute] = useState(String(draft.reminder.minute));
  const [wasVisible, setWasVisible] = useState(visible), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"discard" | "remove" | null>(null);
  const [addWidget, setAddWidget] = useState(false);
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
    if (visible) { const next = makeDraft(); setDraft(next); setOriginal(JSON.stringify(next)); setHour(String(next.reminder.hour)); setMinute(String(next.reminder.minute)); setError(""); setConfirm(null); setAddWidget(false); setBusy(false); }
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
  // "Review today's notes" is always Learning: an idea's category is fixed
  // until it is renamed into a routine of your own.
  const locked = !!idea && draft.name.trim().toLowerCase() === idea.name.trim().toLowerCase() && draft.focusAreaId === idea.areaId;
  const lockedArea = locked ? subjects.find(item => item.id === draft.focusAreaId) : undefined;
  const feedback = () => { if (hapticsEnabled) tapHaptic(); };
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
    if (!next.name) { setError("Give your routine a name first."); return; }
    if (!validSessionSeconds(next.durationSeconds)) { setError("Choose a time from 1 minute to 8 hours before saving."); return; }
    if (!validRoutineDraft(next) || (next.reminder.enabled && (!/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute)))) { setError("Add a name and choose a valid reminder time, from 00:00 to 23:59."); return; }
    if (next.focusAreaId !== null && !subjects.some(item => item.id === next.focusAreaId)) { setError("Choose an available category before saving."); return; }
    lock.current = true; setBusy(true); const epoch = generation.current;
    try { const saved = await routines.save(next, routine?.id); if (epoch !== generation.current) return; if (saved) { feedback(); if (!locked) lastRoutineArea.remember(owner, next.focusAreaId); onSaved?.(next, { addWidget: !routine && widgetOnSave && addWidget }); onClose(); } else setError("Couldn't save this routine. Your previous settings are still here."); }
    catch { if (epoch === generation.current) setError("Couldn't save this routine. Your previous settings are still here."); }
    finally { lock.current = false; if (epoch === generation.current) setBusy(false); }
  };
  const remove = async () => {
    if (!routine || lock.current) return;
    lock.current = true; setBusy(true); const epoch = generation.current;
    try { const removed = await routines.remove(routine.id); if (epoch === generation.current) { setConfirm(null); if (removed) onClose(); else setError("Couldn't remove this routine. Try again."); } }
    finally { lock.current = false; if (epoch === generation.current) setBusy(false); }
  };
  // Sized to its content, so Save sits right under the last row with no empty gap.
  return <AppSheet visible={visible} onRequestClose={close} onDismiss={onDismiss} attached compact maxHeightRatio={0.9} guardDismiss={dirty || busy} label="routine editor"
    keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan" motionMode="timed"
    header={<SheetHeader title={routine ? "Edit routine" : "New routine"} subtitle="A saved starting point for something that matters." onClose={close} closeLabel="Close routine editor" />}
    overlay={confirm && <SheetConfirmation title={confirm === "remove" ? "Remove this routine?" : "Discard your changes?"} message={confirm === "remove" ? "Your recorded sessions and progress stay saved." : "Your previous routine stays saved."} confirmLabel={confirm === "remove" ? "Remove routine" : "Discard changes"} cancelLabel="Keep editing" onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm === "remove") void remove(); else { setConfirm(null); onClose(); } }} />}
    footer={<View style={[s.footerArea, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
      {/* Problems show right above Save, so they are never half hidden below the fold. */}
      {!!error && <Text accessibilityRole="alert" style={s.footerError}>{error}</Text>}
      <View style={s.footer}>
      {routine && <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityLabel="Remove routine" onPress={() => setConfirm("remove")} style={s.remove}><Ionicons name="trash-outline" size={21} color={colors.danger} /></TouchableOpacity>}
      <View style={s.saveCell}><TouchableOpacity accessibilityRole="button" disabled={busy || !routines.ready} onPress={() => void save()} style={s.primary}><Text style={s.primaryText}>{busy ? "Saving…" : "Save routine"}</Text></TouchableOpacity></View>
    </View></View>}>
    <BottomSheetScrollView enableFooterMarginAdjustment keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
      <Text style={s.label}>Routine name</Text>
      <SheetTextInput value={draft.name} maxLength={80} editable={!busy} onChangeText={name => { setDraft(previous => ({ ...previous, name })); setError(""); }} placeholder="For example, Review my notes" placeholderTextColor={colors.secondary} accessibilityLabel="Routine name" style={[s.input, !!error && !draft.name.trim() && s.inputError]} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
      <Text style={s.label}>Category</Text>
      {locked ? <View style={s.lockedArea} testID="routine-idea-category" accessible accessibilityLabel={`Category, ${focusAreaTitle(lockedArea?.title)}`}>
        <View style={[s.lockedDot, { backgroundColor: lifeAreaColor(lockedArea?.id ?? null, lockedArea?.color_code) }]} />
        <Text style={[s.rowTitle, { flex: 1 }]}>{focusAreaTitle(lockedArea?.title)}</Text>
      </View> : <FocusAreaPicker disabled={busy} selectedId={generalSelected ? general?.id ?? null : draft.focusAreaId}
        areas={[{ id: general?.id ?? null, title: "Everyday focus", color_code: general?.color_code }, ...focusAreaChoices(subjects, draft.focusAreaId).filter(item => focusAreaTitle(item.title) !== "Everyday focus")]}
        onSelect={focusAreaId => { feedback(); setDraft(previous => ({ ...previous, focusAreaId })); }} />}
      {/* Length, reminder and widget sit in one tidy card, like Settings. The
          length uses the same choices as a session: 15, 30, 45, 60, 90 or your own. */}
      <Text style={s.label}>Details</Text>
      <View style={s.group}>
      <FocusLengthControl compact flat showLabel={false} seconds={draft.durationSeconds} disabled={busy} onChange={durationSeconds => setDraft(previous => ({ ...previous, durationSeconds }))} />
      <View style={[s.groupRow, s.divider]}><View style={s.groupIcon}><Ionicons name="notifications-outline" size={17} color={colors.secondary} /></View><View style={{ flex: 1 }}><Text style={s.rowTitle}>Daily reminder</Text><Text style={s.caption}>At the same local time on this phone.</Text></View><Switch accessibilityLabel="Daily routine reminder" value={draft.reminder.enabled} disabled={busy} onValueChange={enabled => { feedback(); setDraft(previous => ({ ...previous, reminder: { ...previous.reminder, enabled } })); }} trackColor={{ true: colors.accentFill }} /></View>
      {!routine && widgetOnSave && <View style={[s.groupRow, s.divider]}><View style={s.groupIcon}><Ionicons name="grid-outline" size={17} color={colors.secondary} /></View>
        <View style={{ flex: 1 }}><Text style={s.rowTitle}>Add widget</Text><Text style={s.caption}>Put it on your home screen once it’s saved.</Text></View>
        <Switch accessibilityLabel="Add a home screen widget after saving" value={addWidget} disabled={busy} onValueChange={value => { feedback(); setAddWidget(value); }} trackColor={{ true: colors.accentFill }} /></View>}
      {routine && onAddWidget && <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityLabel="Add widget to your home screen" onPress={onAddWidget} style={[s.groupRow, s.divider]}>
        <View style={s.groupIcon}><Ionicons name="grid-outline" size={17} color={colors.secondary} /></View>
        <View style={{ flex: 1 }}><Text style={s.rowTitle}>Add widget</Text><Text style={s.caption}>Start this routine from your phone’s home screen.</Text></View>
        <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
      </TouchableOpacity>}
      </View>
      {draft.reminder.enabled && <><View style={s.time}><View style={{ flex: 1, gap: 6 }}><Text style={s.caption}>Hour (0–23)</Text><SheetTextInput accessibilityLabel="Reminder hour" value={hour} maxLength={2} keyboardType="number-pad" editable={!busy} onChangeText={setHour} style={s.input} /></View><View style={{ flex: 1, gap: 6 }}><Text style={s.caption}>Minute (0–59)</Text><SheetTextInput accessibilityLabel="Reminder minute" value={minute} maxLength={2} keyboardType="number-pad" editable={!busy} onChangeText={setMinute} style={s.input} /></View></View>
        <View style={s.permission}><Text accessibilityLiveRegion="polite" style={s.rowTitle}>{permission?.label ?? "Checking notifications…"}</Text>
          <Text style={s.caption}>Routine reminders use ordinary notification permission. They do not need Usage Access or Display over other apps.</Text>
          {!permission?.granted && permission?.action && <TouchableOpacity accessibilityRole="button" disabled={permissionBusy || busy} onPress={() => void allowReminderNotifications()} style={s.permissionAction}><Text style={s.permissionActionText}>{permissionBusy ? "Please wait…" : permission.action === "enable" ? "Allow notifications" : permission.action === "settings" ? "Open phone settings" : "Check notifications again"}</Text></TouchableOpacity>}
          {!permission?.granted && <Text style={s.caption}>You can save this reminder now. It can notify you after notifications are allowed.</Text>}
          <Text style={s.caption}>Your phone may delay reminders to save battery.</Text>
        </View></>}
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 }, label: { ...type.label, paddingHorizontal: 4, marginTop: 4 }, rowTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 }, input: { ...edge, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, color: colors.text, fontSize: 17, borderRadius: 16, backgroundColor: colors.sheetCard },

  group: { ...edge, borderRadius: 16, backgroundColor: colors.sheetCard, overflow: "hidden" },
  groupRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  groupIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  lockedArea: { ...edge, minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.sheetCard },
  lockedDot: { width: 10, height: 10, borderRadius: 5 },
  time: { flexDirection: "row", gap: 12 }, reminder: { ...edge, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.sheetCard }, footerArea: { paddingHorizontal: 16, paddingTop: 12, gap: 10, backgroundColor: colors.surfaceRaised }, footer: { flexDirection: "row", gap: 10 }, saveCell: { flex: 1 }, footerError: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 }, inputError: { borderWidth: 1, borderColor: colors.danger },
  permission: { ...edge, padding: 14, borderRadius: 16, backgroundColor: colors.sheetCard, gap: 8 }, permissionAction: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.selection }, permissionActionText: { color: colors.accent, fontSize: 14, fontWeight: "500" },
  primary: { minHeight: 54, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderRadius: 27 }, primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  remove: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)" },
});
