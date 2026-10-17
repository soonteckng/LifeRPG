import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { useSavedRoutines } from "../hooks/useSavedRoutines";
import { pinSavedRoutine, routineWidgetsSupported } from "../services/routineWidgetService";
import { resolveSavedRoutine } from "../services/savedRoutineService";
import { focusAreaTitle } from "../utils/focusAreas";
import { lifeAreaColor } from "../utils/lifeAreaColor";
import { routineDuration } from "../utils/savedRoutine";
import { routinePresentation, type RoutineEntry } from "../utils/routinePresentation";
import type { SavedRoutine } from "../types/savedRoutine";
import type { Subject, Task } from "../services/taskService";
import { colors } from "../constants/theme";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import AppSheet from "./AppSheet";
import RoutineEditorSheet from "./RoutineEditorSheet";
import QuestSheet from "./QuestSheet";

export default function SavedRoutinesCard({ subjects, initialSeconds = 1800, initialAreaId = null, active = true, onStarted, legacyTasks = [], onStartLegacy }: { subjects: Pick<Subject, "id" | "title" | "color_code">[]; initialSeconds?: number; initialAreaId?: number | null; active?: boolean; onStarted?: () => void; legacyTasks?: Task[]; onStartLegacy?: (task: Task) => void }) {
  const routines = useSavedRoutines(), timer = useTimer(), { hapticsEnabled, profile } = useUser(), router = useRouter();
  const [manage, setManage] = useState(false), [editor, setEditor] = useState<{ routine: SavedRoutine | null } | null>(null), [widget, setWidget] = useState(false), [message, setMessage] = useState("");
  const [legacyEditor, setLegacyEditor] = useState<Task | null>(null), [showDone, setShowDone] = useState(false);
  // Starting asks first; the row itself opens its editor.
  const [confirm, setConfirm] = useState<RoutineEntry | null>(null);
  const { entries, done } = routinePresentation(routines.routines, legacyTasks);
  const scopeKey = `${routines.scope?.backendId ?? ""}:${routines.scope?.ownerId ?? ""}`;
  const admissionEpoch = routines.admissionEpoch ?? 0;
  const nextEditor = useRef<SavedRoutine | null | undefined>(undefined), locked = useRef<object | null>(null), currentScope = useRef(scopeKey);
  const nextLegacyEditor = useRef<Task | null>(null);
  const afterManageDismiss = useRef<{ surfaceKey: string; open: () => void } | null>(null);
  const [previousSurface, setPreviousSurface] = useState({ active, scopeKey, admissionEpoch, online: routines.online, generation: 0 });
  if (previousSurface.active !== active || previousSurface.scopeKey !== scopeKey || previousSurface.admissionEpoch !== admissionEpoch || previousSurface.online !== routines.online) {
    setPreviousSurface({ active, scopeKey, admissionEpoch, online: routines.online, generation: previousSurface.generation + 1 });
    setManage(false); setConfirm(null); setEditor(null); setLegacyEditor(null); setShowDone(false); setMessage("");
  }
  const surfaceKey = JSON.stringify([scopeKey, admissionEpoch, previousSurface.generation]);
  const currentSurface = useRef(active ? surfaceKey : "");
  useLayoutEffect(() => { currentScope.current = active ? scopeKey : ""; currentSurface.current = active ? surfaceKey : "";
    locked.current = null; nextEditor.current = undefined; nextLegacyEditor.current = null; afterManageDismiss.current = null;
    return () => { currentScope.current = ""; currentSurface.current = ""; };
  }, [active, scopeKey, surfaceKey]);
  useEffect(() => { let live = true; if (Platform.OS === "android") void routineWidgetsSupported().then(value => { if (live) setWidget(value); }); return () => { live = false; }; }, []);
  const feedback = () => { if (hapticsEnabled) void Haptics.selectionAsync().catch(() => {}); };
  const blocked = !active || !routines.ready || !!(timer.hasOpenSession || timer.actionBusy || timer.endingSession || timer.isRestoring || timer.restoreError || (timer.isCompleted && !timer.summaryViewed));
  const latestLegacy = useRef({ tasks: legacyTasks, start: onStartLegacy, blocked, online: routines.online, subjects });
  useLayoutEffect(() => { latestLegacy.current = { tasks: legacyTasks, start: onStartLegacy, blocked, online: routines.online, subjects }; }, [legacyTasks, onStartLegacy, blocked, routines.online, subjects]);
  const start = async (routine: SavedRoutine) => {
    if (blocked || locked.current || !routines.scope) return;
    const scope = routines.scope, operation = {}; locked.current = operation; setMessage(""); feedback();
    try {
      const latest = await resolveSavedRoutine(scope, routine.id);
      if (!latest || currentSurface.current !== surfaceKey || latestLegacy.current.blocked) return;
      if (latest.focusAreaId !== null && !latestLegacy.current.subjects.some(item => item.id === latest.focusAreaId)) { setMessage("Choose an available focus area in Edit routine before starting."); return; }
      const request = timer.startFreeTimer(latest.durationSeconds, latest.focusAreaId, latest.name);
      // Present the controller's starting state immediately, just like Home's
      // quick start. A server reply must not delay opening the timer.
      const open = () => { if (onStarted) onStarted(); else if (routines.online) router.push("/session"); };
      if (manage || confirm) {
        if (onStarted || routines.online) afterManageDismiss.current = { surfaceKey, open };
        setManage(false); setConfirm(null);
      } else open();
      const started = await request;
      if (currentSurface.current !== surfaceKey) return;
      if (!started) setMessage(timer.actionError ?? "Couldn't start this routine. Your saved settings are still here.");
    } catch {
      if (currentSurface.current === surfaceKey) setMessage("Couldn't start this routine. Your saved settings are still here.");
    } finally { if (locked.current === operation) locked.current = null; }
  };
  const edit = (routine: SavedRoutine | null) => { feedback(); if (manage) { nextEditor.current = routine; setManage(false); } else setEditor({ routine }); };
  const editLegacy = (task: Task) => {
    if (!active || !routines.online) return;
    feedback();
    if (manage) { nextLegacyEditor.current = task; setManage(false); }
    else setLegacyEditor(task);
  };
  const startLegacy = async (task: Task) => {
    if (blocked || locked.current || !routines.online || !onStartLegacy || !routines.scope || !task.is_due_today) return;
    // Keep the original task link. Converting it to a free routine would lose
    // completion/schedule behaviour and change its recorded session history.
    const expectedScope = scopeKey, expectedSurface = surfaceKey;
    const open = () => {
      const current = latestLegacy.current;
      if (currentScope.current !== expectedScope || currentSurface.current !== expectedSurface || current.blocked || !current.online) return;
      const latest = current.tasks.find(item => item.id === task.id);
      if (latest && latest.is_due_today && !latest.is_completed_today && (latest.is_recurring || !latest.is_completed)) current.start?.(latest);
    };
    const operation = {}; locked.current = operation; feedback();
    try {
      if (manage || confirm) { afterManageDismiss.current = { surfaceKey, open }; setManage(false); setConfirm(null); }
      else await open();
    } finally { if (locked.current === operation) locked.current = null; }
  };
  const pin = async (routine: SavedRoutine) => {
    if (!routines.scope || locked.current || !active) return;
    const scope = routines.scope, operation = {}; locked.current = operation; feedback();
    try { const result = await pinSavedRoutine(scope, routine.id); if (currentSurface.current === surfaceKey) setMessage(result ? "Choose where to place your routine widget." : "Your phone couldn't add the widget. You can also add LifeRPG from your launcher’s widget list."); }
    catch { if (currentSurface.current === surfaceKey) setMessage("Your phone couldn't add the widget. Try again from your launcher’s widget list."); }
    finally { if (locked.current === operation) locked.current = null; }
  };
  const afterSheetDismiss = () => {
      if (currentSurface.current !== surfaceKey) return;
      const pending = afterManageDismiss.current;
      afterManageDismiss.current = null;
      if (pending && active && currentSurface.current === pending.surfaceKey) { pending.open(); return; }
      if (nextLegacyEditor.current && active && routines.online) { setLegacyEditor(nextLegacyEditor.current); nextLegacyEditor.current = null; return; }
      if (nextEditor.current !== undefined && active) { setEditor({ routine: nextEditor.current }); nextEditor.current = undefined; }
  };
  const ask = (entry: RoutineEntry) => { if (blocked) return; feedback(); setMessage(""); setConfirm(entry); };
  const savedRow = (routine: SavedRoutine, inSheet = false) => <View key={`routine:${routine.id}`} style={[s.row, inSheet && s.sheetRow]}>
    <View style={[s.areaDot, { backgroundColor: lifeAreaColor(routine.focusAreaId, subjects.find(area => area.id === routine.focusAreaId)?.color_code) }]} />
    <Pressable disabled={!active} onPress={() => edit(routine)} accessibilityRole="button" accessibilityLabel={`Edit ${routine.name}, ${routineDuration(routine.durationSeconds)}`} style={s.detail}>
      <Text style={s.name} numberOfLines={2}>{routine.name}</Text><Text style={s.caption}>{routineDuration(routine.durationSeconds)} · {focusAreaTitle(subjects.find(area => area.id === routine.focusAreaId)?.title)}{routine.reminder.enabled ? ` · ${String(routine.reminder.hour).padStart(2,"0")}:${String(routine.reminder.minute).padStart(2,"0")}` : ""}</Text>
    </Pressable>
    {inSheet ? <><Pressable onPress={() => edit(routine)} accessibilityRole="button" accessibilityLabel={`Edit ${routine.name}`} style={s.icon}><Ionicons name="create-outline" size={21} color={colors.accent} /></Pressable>{widget && <Pressable onPress={() => void pin(routine)} accessibilityRole="button" accessibilityLabel={`Add ${routine.name} widget`} style={s.icon}><Ionicons name="grid-outline" size={20} color={colors.accent} /></Pressable>}</> : <Pressable disabled={blocked} onPress={() => ask({ kind: "saved", key: `routine:${routine.id}`, name: routine.name, seconds: routine.durationSeconds, areaId: routine.focusAreaId, routine })} accessibilityRole="button" accessibilityLabel={`Start routine ${routine.name}`} style={s.icon}><Ionicons name="play" size={18} color={blocked ? colors.secondary : colors.accent} /></Pressable>}
  </View>;
  const legacyRow = (task: Task, completed = false, inSheet = false) => {
    const disabled = blocked || completed || !task.is_due_today || !onStartLegacy || !routines.online;
    const area = subjects.find(item => item.id === task.subject_id);
    return <View key={`task:${task.id}`} style={[s.row, inSheet && s.sheetRow]}>
      <View style={[s.areaDot, { backgroundColor: completed ? colors.success : lifeAreaColor(task.subject_id, area?.color_code) }]} />
      <Pressable disabled={!active || !routines.online} onPress={() => editLegacy(task)} accessibilityRole="button" accessibilityLabel={`Edit ${task.title}, ${task.target_minutes || 30} minutes`} style={s.detail}>
        <Text style={[s.name, completed && s.completed]} numberOfLines={2}>{task.title}</Text>
        <Text style={s.caption}>{routineDuration((task.target_minutes || 30) * 60)} · {focusAreaTitle(area?.title)}{task.is_recurring ? task.repeat_rule === "daily" ? " · Daily" : ` · ${task.repeat_rule.split(",").join(", ")}` : " · Once"}{completed ? " · Done today" : !task.is_due_today ? " · Upcoming" : ""}</Text>
      </Pressable>
      {inSheet ? <Pressable disabled={!routines.online} onPress={() => editLegacy(task)} accessibilityRole="button" accessibilityLabel={`Edit routine ${task.title}`} style={s.icon}><Ionicons name="create-outline" size={21} color={colors.accent} /></Pressable>
        : <Pressable disabled={disabled} onPress={() => ask({ kind: "legacy", key: `task:${task.id}`, name: task.title, seconds: (task.target_minutes || 30) * 60, areaId: task.subject_id, task })} accessibilityRole="button" accessibilityLabel={`Start routine ${task.title}`} style={s.icon}><Ionicons name="play" size={18} color={disabled ? colors.secondary : colors.accent} /></Pressable>}
    </View>;
  };
  const row = (entry: RoutineEntry, inSheet = false) => entry.kind === "saved" ? savedRow(entry.routine, inSheet) : legacyRow(entry.task, false, inSheet);
  return <>
    <View style={s.card} testID="saved-routines-card"><View style={s.heading}><Text accessibilityRole="header" style={s.title}>Your routines</Text><Pressable disabled={!active || !routines.ready} onPress={() => { if (entries.length || done.length) { feedback(); setShowDone(false); setManage(true); } else edit(null); }} accessibilityRole="button" accessibilityLabel="Manage your routines" style={s.manage}><Text style={s.link}>{entries.length || done.length ? "Manage" : "Add routine"}</Text></Pressable></View>
      {!routines.ready ? <Text style={s.caption}>{routines.error ?? "Loading your routines…"}</Text> : entries.length ? entries.slice(0, 3).map(entry => row(entry)) : <Pressable disabled={!active} onPress={() => edit(null)} accessibilityRole="button" accessibilityLabel="Create your first routine" style={s.empty}><View style={s.emptyIcon}><Ionicons name="add" size={20} color={colors.accent} /></View><View style={{ flex: 1, gap: 3 }}><Text style={s.emptyTitle}>Make room for a little routine</Text><Text style={s.caption}>Save an activity you’d like to return to.</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted} /></Pressable>}
      {!!done.length && <Text style={s.caption}>{done.length} completed today</Text>}
      {!!message && <Text accessibilityLiveRegion="polite" style={s.caption}>{message}</Text>}
      {!!routines.pendingCount && <Text style={s.caption}>Saved on this phone. {routines.online ? routines.busy ? "Syncing routine changes…" : routines.error ? "Couldn't sync yet. We'll retry automatically." : "Waiting to sync routine changes…" : "Syncs when you reconnect."}</Text>}
      {!routines.ready && routines.error && <Pressable accessibilityRole="button" onPress={() => void routines.retry()} style={s.manage}><Text style={s.link}>Retry loading routines</Text></Pressable>}
    </View>
    <AppSheet key={`manage:${surfaceKey}`} visible={manage && active} onRequestClose={() => setManage(false)} onDismiss={afterSheetDismiss} compact maxHeightRatio={0.82} label="routines" header={<View style={s.sheetHeading}><Text style={s.title}>Your routines</Text><Text style={s.caption}>Start here again without setting everything up.</Text></View>}>
      <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.list}>
        {showDone ? done.map(task => legacyRow(task, true, true)) : entries.map(entry => row(entry, true))}
        {!!done.length && <Pressable accessibilityRole="button" onPress={() => { feedback(); setShowDone(value => !value); }} style={s.manage}><Text style={s.link}>{showDone ? "Back to your routines" : `Done today (${done.length})`}</Text></Pressable>}
        <Pressable onPress={() => edit(null)} disabled={routines.routines.length >= 32} accessibilityRole="button" style={s.add}><Ionicons name="add" size={22} color={colors.accent} /><Text style={s.link}>Add routine</Text></Pressable>
        {Platform.OS === "android" && !widget && <Text style={s.caption}>Routine widgets need the updated Android app. Saved routines already work here.</Text>}
        {routines.conflicts.map(conflict => <View key={conflict.operation.operationId} style={s.conflict}><Text style={s.name}>{conflict.operation.draft.name}</Text><Text style={s.caption}>{conflict.reason}</Text><View style={s.heading}><Pressable accessibilityRole="button" onPress={() => void routines.resolveConflict(conflict.operation.operationId, false)} style={s.manage}><Text style={s.link}>Use other device’s version</Text></Pressable>{(!conflict.latest || conflict.latest.deletedAt === null) && <Pressable accessibilityRole="button" onPress={() => void routines.resolveConflict(conflict.operation.operationId, true)} style={s.manage}><Text style={s.link}>Keep my changes</Text></Pressable>}</View></View>)}
        {!!routines.error && <Text accessibilityRole="alert" style={s.caption}>{routines.error}</Text>}
        {!!message && <Text accessibilityLiveRegion="polite" style={s.caption}>{message}</Text>}
      </BottomSheetScrollView>
    </AppSheet>
    <AppSheet key={`confirm:${surfaceKey}`} visible={!!confirm && active} onRequestClose={() => setConfirm(null)} onDismiss={afterSheetDismiss} compact label="start routine"
      header={confirm ? <View style={s.sheetHeading}><Text style={s.confirmTitle} numberOfLines={2}>Start “{confirm.name}”?</Text><View style={s.confirmMeta}><View style={[s.areaDot, { backgroundColor: lifeAreaColor(confirm.areaId, subjects.find(area => area.id === confirm.areaId)?.color_code) }]} /><Text style={s.caption}>{routineDuration(confirm.seconds)} · {focusAreaTitle(subjects.find(area => area.id === confirm.areaId)?.title)}</Text></View></View> : null}>
      <BottomSheetScrollView contentContainerStyle={s.confirmBody}>
        <Pressable disabled={blocked} onPress={() => { if (!confirm) return; if (confirm.kind === "saved") void start(confirm.routine); else void startLegacy(confirm.task); }} accessibilityRole="button" accessibilityLabel={confirm ? `Start ${confirm.name} now` : "Start now"} style={[s.confirmStart, blocked && s.confirmDisabled]}>
          <Text style={s.confirmStartText}>Start session</Text><View style={s.confirmPlay}><Ionicons name="play" size={18} color={colors.primary} /></View>
        </Pressable>
        <Pressable onPress={() => setConfirm(null)} accessibilityRole="button" accessibilityLabel="Not now" style={s.confirmCancel}><Text style={s.link}>Not now</Text></Pressable>
      </BottomSheetScrollView>
    </AppSheet>
    <RoutineEditorSheet key={`edit:${surfaceKey}`} visible={!!editor && active} onClose={() => setEditor(null)} routine={editor?.routine} subjects={subjects} initialAreaId={initialAreaId} initialSeconds={initialSeconds} />
    {legacyEditor && active && <QuestSheet key={`legacy:${scopeKey}:${legacyEditor.id}`} visible onClose={() => setLegacyEditor(null)} editorOnly initialTask={legacyEditor} expectedOwnerId={profile?.id} routineLanguage />}
  </>;
}
const s = StyleSheet.create({
  card: { paddingHorizontal: 0, paddingVertical: 0, gap: 10 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }, title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "600", letterSpacing: -0.3 },
  manage: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }, link: { color: colors.accent, fontSize: 15, fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingLeft: 16, paddingRight: 10, borderRadius: 20, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, detail: { flex: 1, minWidth: 0, gap: 3, minHeight: 44, justifyContent: "center" },
  areaDot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" }, completed: { color: colors.secondary }, caption: { color: colors.secondary, fontSize: 13, lineHeight: 20 }, icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }, empty: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, emptyIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft }, emptyTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  sheetHeading: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 }, list: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 }, add: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, backgroundColor: colors.accentSoft }, conflict: { paddingVertical: 12, gap: 6 },
  confirmTitle: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.4 }, confirmMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  confirmBody: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 28, gap: 6 },
  confirmStart: { minHeight: 60, paddingLeft: 20, paddingRight: 10, borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.primary },
  confirmStartText: { color: colors.primaryText, fontSize: 18, lineHeight: 24, fontWeight: "600", letterSpacing: -0.3 },
  confirmPlay: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryText },
  confirmCancel: { minHeight: 48, alignItems: "center", justifyContent: "center" }, confirmDisabled: { opacity: 0.5 },
  sheetRow: { backgroundColor: colors.sheetCard, borderColor: "transparent" },
});
