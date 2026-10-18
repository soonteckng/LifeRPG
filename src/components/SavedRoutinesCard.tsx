import { tapHaptic } from "../utils/tapHaptics";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { useSavedRoutines } from "../hooks/useSavedRoutines";
import { pinSavedRoutine, routineWidgetsSupported } from "../services/routineWidgetService";
import { resolveSavedRoutine } from "../services/savedRoutineService";
import { setupMode } from "../services/setupMode";
import { encodeRoutineSession } from "../utils/routineSession";
import { focusAreaTitle, suggestedArea, type FocusAreaKind } from "../utils/focusAreas";
import { lifeAreaColor } from "../utils/lifeAreaColor";
import { routineDuration } from "../utils/savedRoutine";
import { routinePresentation, type RoutineEntry } from "../utils/routinePresentation";
import type { SavedRoutine } from "../types/savedRoutine";
import type { Subject, Task } from "../services/taskService";
import { colors, radius, edge } from "../constants/theme";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import AppSheet from "./AppSheet";
import RoutineEditorSheet from "./RoutineEditorSheet";
import QuestSheet from "./QuestSheet";
import SheetHeader from "./SheetHeader";
import SwipeRow from "./SwipeRow";
import SectionHeader, { CircleButton, SeeAll } from "./SectionHeader";
import OneTimeHint from "./OneTimeHint";
import { appPreferences } from "../services/appPreferences";

type RoutineTemplate = { name: string; minutes: number; area: FocusAreaKind };
const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  { name: "Review today’s notes", minutes: 30, area: "learning" },
  { name: "Read before bed", minutes: 20, area: "wellbeing" },
  { name: "Plan tomorrow", minutes: 15, area: "personal" },
];

export default function SavedRoutinesCard({ subjects, initialSeconds = 1800, initialAreaId = null, active = true, onStarted, legacyTasks = [], onStartLegacy, limit = 3, suggestions: offerSuggestions = true, onSeeAll }: {
  subjects: Pick<Subject, "id" | "title" | "color_code">[]; initialSeconds?: number; initialAreaId?: number | null; active?: boolean; onStarted?: () => void; legacyTasks?: Task[]; onStartLegacy?: (task: Task) => void;
  /** How many routines show before "See all"; the Routines tab shows them all. */
  limit?: number; suggestions?: boolean;
  /** Home hands "See all" to the Routines tab instead of opening a sheet. */
  onSeeAll?: () => void;
}) {
  const routines = useSavedRoutines(), timer = useTimer(), { hapticsEnabled, profile } = useUser(), router = useRouter();
  const [manage, setManage] = useState(false), [editor, setEditor] = useState<{ routine: SavedRoutine | null; template?: RoutineTemplate } | null>(null), [widget, setWidget] = useState(false), [message, setMessage] = useState("");
  const [legacyEditor, setLegacyEditor] = useState<Task | null>(null), [showDone, setShowDone] = useState(false);
  // Play asks before starting; holding a row offers its other actions; the
  // row itself opens its editor. One small card carries all three.
  const [menu, setMenu] = useState<{ entry: RoutineEntry; mode: "start" | "options" | "remove" } | null>(null);
  const confirm = menu?.entry ?? null;
  const setConfirm = (entry: RoutineEntry | null) => setMenu(entry ? { entry, mode: "start" } : null);
  // Starting from a sheet opens the session at once rather than after the slide.
  const [leaving, setLeaving] = useState(false);
  const { entries, done } = routinePresentation(routines.routines, legacyTasks);
  const scopeKey = `${routines.scope?.backendId ?? ""}:${routines.scope?.ownerId ?? ""}`;
  const admissionEpoch = routines.admissionEpoch ?? 0;
  const nextEditor = useRef<SavedRoutine | null | undefined>(undefined), locked = useRef<object | null>(null), currentScope = useRef(scopeKey);
  const nextLegacyEditor = useRef<Task | null>(null);
  const afterManageDismiss = useRef<{ surfaceKey: string; open: () => void } | null>(null);
  const [previousSurface, setPreviousSurface] = useState({ active, scopeKey, admissionEpoch, online: routines.online, generation: 0 });
  if (previousSurface.active !== active || previousSurface.scopeKey !== scopeKey || previousSurface.admissionEpoch !== admissionEpoch || previousSurface.online !== routines.online) {
    setPreviousSurface({ active, scopeKey, admissionEpoch, online: routines.online, generation: previousSurface.generation + 1 });
    setManage(false); setMenu(null); setLeaving(false); setEditor(null); setLegacyEditor(null); setShowDone(false); setMessage("");
  }
  const surfaceKey = JSON.stringify([scopeKey, admissionEpoch, previousSurface.generation]);
  const currentSurface = useRef(active ? surfaceKey : "");
  useLayoutEffect(() => { currentScope.current = active ? scopeKey : ""; currentSurface.current = active ? surfaceKey : "";
    locked.current = null; nextEditor.current = undefined; nextLegacyEditor.current = null; afterManageDismiss.current = null;
    return () => { currentScope.current = ""; currentSurface.current = ""; };
  }, [active, scopeKey, surfaceKey]);
  useEffect(() => { let live = true; if (Platform.OS === "android") void routineWidgetsSupported().then(value => { if (live) setWidget(value); }); return () => { live = false; }; }, []);
  const feedback = () => { if (hapticsEnabled) tapHaptic(); };
  const blocked = !active || !routines.ready || !!(timer.hasOpenSession || timer.actionBusy || timer.endingSession || timer.isRestoring || timer.restoreError || (timer.isCompleted && !timer.summaryViewed));
  const latestLegacy = useRef({ tasks: legacyTasks, start: onStartLegacy, blocked, online: routines.online, subjects });
  useLayoutEffect(() => { latestLegacy.current = { tasks: legacyTasks, start: onStartLegacy, blocked, online: routines.online, subjects }; }, [legacyTasks, onStartLegacy, blocked, routines.online, subjects]);
  const start = async (routine: SavedRoutine) => {
    if (blocked || locked.current || !routines.scope) return;
    const scope = routines.scope, operation = {}; locked.current = operation; setMessage(""); feedback();
    setupMode.choose("routine");
    try {
      const latest = await resolveSavedRoutine(scope, routine.id);
      if (!latest || currentSurface.current !== surfaceKey || latestLegacy.current.blocked) return;
      if (latest.focusAreaId !== null && !latestLegacy.current.subjects.some(item => item.id === latest.focusAreaId)) { setMessage("Choose an available category in Edit routine before starting."); return; }
      if (!routines.online) {
        // Offline, the session runs here in the workspace; there's no setup screen to open.
        const started = await timer.startFreeTimer(latest.durationSeconds, latest.focusAreaId, latest.name);
        if (currentSurface.current === surfaceKey && !started) setMessage(timer.actionError ?? "Couldn't start this routine. Your saved settings are still here.");
        return;
      }
      const notes = encodeRoutineSession(latest.name);
      if (notes === null) return;
      // Every start goes through the same setup screen, filled in with this routine.
      timer.setLinkedTaskId(null); timer.setTargetAttributeId(latest.focusAreaId);
      timer.setNotes(notes); timer.setDurationInSeconds(latest.durationSeconds);
      setupMode.chooseRoutine(`routine:${latest.id}`); timer.reviewSummary?.();
      const open = () => { if (onStarted) onStarted(); else router.push("/session"); };
      if (manage || confirm) {
        afterManageDismiss.current = { surfaceKey, open }; setLeaving(true);
        setManage(false); setConfirm(null);
      } else open();
    } catch {
      if (currentSurface.current === surfaceKey) setMessage("Couldn't start this routine. Your saved settings are still here.");
    } finally { if (locked.current === operation) locked.current = null; }
  };
  const edit = (routine: SavedRoutine | null) => { feedback(); if (manage || menu) { nextEditor.current = routine; setManage(false); setMenu(null); } else setEditor({ routine }); };
  const editLegacy = (task: Task) => {
    if (!active || !routines.online) return;
    feedback();
    if (manage || menu) { nextLegacyEditor.current = task; setManage(false); setMenu(null); }
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
    const operation = {}; locked.current = operation; feedback(); setupMode.choose("routine");
    try {
      if (manage || confirm) { afterManageDismiss.current = { surfaceKey, open }; setLeaving(true); setManage(false); setConfirm(null); }
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
  const remove = async (routine: SavedRoutine) => {
    if (!active || locked.current) return;
    const operation = {}; locked.current = operation; feedback();
    try { const removed = await routines.remove(routine.id); if (currentSurface.current !== surfaceKey) return; setMenu(null); if (!removed) setMessage("Couldn't remove this routine. Try again."); }
    catch { if (currentSurface.current === surfaceKey) { setMenu(null); setMessage("Couldn't remove this routine. Try again."); } }
    finally { if (locked.current === operation) locked.current = null; }
  };
  const hold = (entry: RoutineEntry) => { if (!active) return; feedback(); setMessage(""); setMenu({ entry, mode: "options" }); void appPreferences.retireHint("routine-hold"); };
  const afterSheetDismiss = () => {
      setLeaving(false);
      if (currentSurface.current !== surfaceKey) return;
      const pending = afterManageDismiss.current;
      afterManageDismiss.current = null;
      if (pending && active && currentSurface.current === pending.surfaceKey) { pending.open(); return; }
      if (nextLegacyEditor.current && active && routines.online) { setLegacyEditor(nextLegacyEditor.current); nextLegacyEditor.current = null; return; }
      if (nextEditor.current !== undefined && active) { setEditor({ routine: nextEditor.current }); nextEditor.current = undefined; }
  };
  // Play opens the session setup with this routine filled in; Start is pressed there.
  const ask = (entry: RoutineEntry) => { if (blocked) return; setMessage(""); if (entry.kind === "saved") void start(entry.routine); else void startLegacy(entry.task); };
  const areaOf = (id: number | null | undefined) => subjects.find(area => area.id === id);
  const savedEntry = (routine: SavedRoutine): RoutineEntry => ({ kind: "saved", key: `routine:${routine.id}`, name: routine.name, seconds: routine.durationSeconds, areaId: routine.focusAreaId, routine });
  const legacyEntry = (task: Task): RoutineEntry => ({ kind: "legacy", key: `task:${task.id}`, name: task.title, seconds: (task.target_minutes || 30) * 60, areaId: task.subject_id, task });
  const savedRow = (routine: SavedRoutine, inSheet = false) => {
    const area = areaOf(routine.focusAreaId), entry = savedEntry(routine);
    return <View key={`routine:${routine.id}`} style={[s.row, inSheet && s.sheetRow]}>
      <View style={[s.areaDot, { backgroundColor: lifeAreaColor(routine.focusAreaId, area?.color_code) }]} />
      <Pressable disabled={!active} onPress={() => edit(routine)} onLongPress={inSheet ? undefined : () => hold(entry)} delayLongPress={350}
        accessibilityRole="button" accessibilityLabel={`Edit ${routine.name}, ${routineDuration(routine.durationSeconds)}`}
        accessibilityActions={inSheet ? undefined : [{ name: "longpress", label: "More actions" }]} onAccessibilityAction={() => hold(entry)} style={s.detail}>
        <Text style={s.name} numberOfLines={2}>{routine.name}</Text><Text style={s.caption}>{routineDuration(routine.durationSeconds)} · {focusAreaTitle(area?.title)}{routine.reminder.enabled ? ` · ${String(routine.reminder.hour).padStart(2,"0")}:${String(routine.reminder.minute).padStart(2,"0")}` : ""}</Text>
      </Pressable>
      {inSheet ? <><Pressable onPress={() => edit(routine)} accessibilityRole="button" accessibilityLabel={`Edit ${routine.name}`} style={s.icon}><Ionicons name="create-outline" size={20} color={colors.accent} /></Pressable>{widget && <Pressable onPress={() => void pin(routine)} accessibilityRole="button" accessibilityLabel={`Add ${routine.name} widget`} style={s.icon}><Ionicons name="grid-outline" size={19} color={colors.accent} /></Pressable>}</>
        : <Pressable disabled={blocked} onPress={() => ask(entry)} accessibilityRole="button" accessibilityLabel={`Start routine ${routine.name}`} style={s.play}><Ionicons name="play" size={15} color={blocked ? colors.tertiary : colors.text} /></Pressable>}
    </View>;
  };
  const legacyRow = (task: Task, completed = false, inSheet = false) => {
    const disabled = blocked || completed || !task.is_due_today || !onStartLegacy || !routines.online;
    const area = areaOf(task.subject_id), entry = legacyEntry(task);
    return <View key={`task:${task.id}`} style={[s.row, inSheet && s.sheetRow]}>
      <View style={[s.areaDot, { backgroundColor: completed ? colors.success : lifeAreaColor(task.subject_id, area?.color_code) }]} />
      <Pressable disabled={!active || !routines.online} onPress={() => editLegacy(task)} onLongPress={inSheet || completed ? undefined : () => hold(entry)} delayLongPress={350}
        accessibilityRole="button" accessibilityLabel={`Edit ${task.title}, ${task.target_minutes || 30} minutes`} style={s.detail}>
        <Text style={[s.name, completed && s.completed]} numberOfLines={2}>{task.title}</Text>
        <Text style={s.caption}>{routineDuration((task.target_minutes || 30) * 60)} · {focusAreaTitle(area?.title)}{task.is_recurring ? task.repeat_rule === "daily" ? " · Daily" : ` · ${task.repeat_rule.split(",").join(", ")}` : " · Once"}{completed ? " · Done today" : !task.is_due_today ? " · Upcoming" : ""}</Text>
      </Pressable>
      {inSheet ? <Pressable disabled={!routines.online} onPress={() => editLegacy(task)} accessibilityRole="button" accessibilityLabel={`Edit routine ${task.title}`} style={s.icon}><Ionicons name="create-outline" size={20} color={colors.accent} /></Pressable>
        : <Pressable disabled={disabled} onPress={() => ask(entry)} accessibilityRole="button" accessibilityLabel={`Start routine ${task.title}`} style={s.play}><Ionicons name="play" size={15} color={disabled ? colors.tertiary : colors.text} /></Pressable>}
    </View>;
  };
  const row = (entry: RoutineEntry, inSheet = false) => entry.kind === "saved" ? savedRow(entry.routine, inSheet) : legacyRow(entry.task, false, inSheet);
  // Home rows also slide left to reveal Edit and Remove, as in Mail or Reminders.
  const homeRow = (entry: RoutineEntry) => <SwipeRow key={entry.key} enabled={active && (entry.kind === "saved" || routines.online)} label={entry.name}
    onEdit={() => entry.kind === "saved" ? edit(entry.routine) : editLegacy(entry.task)}
    onRemove={entry.kind === "saved" ? () => { feedback(); setMenu({ entry, mode: "remove" }); } : undefined}>{row(entry)}</SwipeRow>;
  const visibleEntries = entries.slice(0, limit);
  const savedNames = new Set([...routines.routines.map(item => item.name.trim().toLowerCase()), ...legacyTasks.map(task => task.title.trim().toLowerCase())]);
  const suggestions = ROUTINE_TEMPLATES.filter(template => !savedNames.has(template.name.toLowerCase()));
  const menuArea = menu ? areaOf(menu.entry.areaId) : undefined;
  const menuRoutine = menu?.entry.kind === "saved" ? menu.entry.routine : null;
  const startMenu = () => { if (!menu) return; if (menu.entry.kind === "saved") void start(menu.entry.routine); else void startLegacy(menu.entry.task); };
  return <>
    <View style={s.card} testID="saved-routines-card">
      {/* On Home, See all opens Routines; in Routines the header has Edit and +. */}
      {onSeeAll ? <SectionHeader title="My Routines" right={<SeeAll label={entries.length > limit ? `See all ${entries.length}` : "See all"} accessibilityLabel="My Routines. Open Routines" onPress={() => { feedback(); onSeeAll(); }} />} />
        : <SectionHeader title="My Routines" right={<View style={s.headingActions}>
          {!!(entries.length || done.length) && active && routines.ready && <SeeAll label="Edit" accessibilityLabel="Manage your routines" onPress={() => { feedback(); setShowDone(false); setManage(true); }} />}
          <CircleButton disabled={!active || !routines.ready || routines.routines.length >= 32} onPress={() => edit(null)} label="New routine" />
        </View>} />}
      <OneTimeHint id="routine-hold" text="Hold or swipe a routine to edit or remove it." show={routines.ready && visibleEntries.some(entry => entry.kind === "saved")} />
      {!routines.ready ? <Text style={s.caption}>{routines.error ?? "Loading your routines…"}</Text> : visibleEntries.length ? <View style={s.stack}>
        {/* Each routine is its own small card; swipe actions stay inside it. */}
        {visibleEntries.map(entry => <View key={entry.key} style={s.itemCard}>{homeRow(entry)}</View>)}
      </View> : <View style={s.itemCard}>
        <Pressable disabled={!active} onPress={() => { if (onSeeAll) { feedback(); onSeeAll(); } else edit(null); }} accessibilityRole="button" accessibilityLabel={onSeeAll ? "Create your first routine in Routines" : "Create your first routine"} style={s.empty}><View style={s.emptyIcon}><Ionicons name="repeat" size={19} color={colors.accent} /></View><View style={{ flex: 1, gap: 3 }}><Text style={s.emptyTitle}>Make room for a little routine</Text><Text style={s.caption}>Save an activity you’d like to return to.</Text></View><Ionicons name="chevron-forward" size={15} color={colors.tertiary} /></Pressable>
      </View>}
      {/* Ready-made starting points stay offered until each one is saved. */}
      {offerSuggestions && routines.ready && !!suggestions.length && <View style={s.suggested}>
        <SectionHeader title="Ideas to start with" />
        <View style={s.ideas}>{suggestions.map(template => {
          const area = suggestedArea(subjects as Subject[], template.area);
          return <Pressable key={template.name} disabled={!active} onPress={() => { feedback(); setEditor({ routine: null, template }); }} accessibilityRole="button"
            accessibilityLabel={`Add ${template.name}, ${template.minutes} minutes, ${focusAreaTitle(area?.title)}`} style={s.idea}>
            <Ionicons name="add" size={15} color={colors.accent} /><Text style={s.ideaText}>{template.name}</Text>
          </Pressable>;
        })}</View>
      </View>}
      {!!done.length && <Text style={s.caption}>{done.length} completed today</Text>}
      {!!message && <Text accessibilityLiveRegion="polite" style={s.caption}>{message}</Text>}
      {!!routines.pendingCount && <Text style={s.caption}>Saved on this phone. {routines.online ? routines.busy ? "Syncing routine changes…" : routines.error ? "Couldn't sync yet. We'll retry automatically." : "Waiting to sync routine changes…" : "Syncs when you reconnect."}</Text>}
      {!routines.ready && routines.error && <Pressable accessibilityRole="button" onPress={() => void routines.retry()} style={s.manage}><Text style={s.link}>Retry loading routines</Text></Pressable>}
    </View>
    <AppSheet key={`manage:${surfaceKey}`} visible={manage && active} onRequestClose={() => setManage(false)} onDismiss={afterSheetDismiss} closeInstantly={leaving} compact maxHeightRatio={0.82} label="routines" header={<SheetHeader title="My Routines" subtitle="Start here again without setting everything up." onClose={() => setManage(false)} />}>
      <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.list}>
        {showDone ? done.map(task => legacyRow(task, true, true)) : entries.map(entry => row(entry, true))}
        {!!done.length && <Pressable accessibilityRole="button" onPress={() => { feedback(); setShowDone(value => !value); }} style={s.manage}><Text style={s.link}>{showDone ? "Back to your routines" : `Done today (${done.length})`}</Text></Pressable>}
        <Pressable onPress={() => edit(null)} disabled={routines.routines.length >= 32} accessibilityRole="button" style={s.addRow}><Ionicons name="add" size={22} color={colors.accent} /><Text style={s.link}>Add routine</Text></Pressable>
        {Platform.OS === "android" && !widget && <Text style={s.caption}>Routine widgets need the updated Android app. Saved routines already work here.</Text>}
        {routines.conflicts.map(conflict => <View key={conflict.operation.operationId} style={s.conflict}><Text style={s.name}>{conflict.operation.draft.name}</Text><Text style={s.caption}>{conflict.reason}</Text><View style={s.heading}><Pressable accessibilityRole="button" onPress={() => void routines.resolveConflict(conflict.operation.operationId, false)} style={s.manage}><Text style={s.link}>Use other device’s version</Text></Pressable>{(!conflict.latest || conflict.latest.deletedAt === null) && <Pressable accessibilityRole="button" onPress={() => void routines.resolveConflict(conflict.operation.operationId, true)} style={s.manage}><Text style={s.link}>Keep my changes</Text></Pressable>}</View></View>)}
        {!!routines.error && <Text accessibilityRole="alert" style={s.caption}>{routines.error}</Text>}
        {!!message && <Text accessibilityLiveRegion="polite" style={s.caption}>{message}</Text>}
      </BottomSheetScrollView>
    </AppSheet>
    <AppSheet key={`confirm:${surfaceKey}`} visible={!!menu && active} onRequestClose={() => setMenu(null)} onDismiss={afterSheetDismiss} closeInstantly={leaving} compact floating
      label={menu?.mode === "options" ? "routine options" : menu?.mode === "remove" ? "remove routine" : "start routine"}
      header={menu ? <View style={s.sheetHeading}><Text style={s.confirmTitle} numberOfLines={2}>{menu.mode === "start" ? `Start “${menu.entry.name}”?` : menu.mode === "remove" ? `Remove “${menu.entry.name}”?` : menu.entry.name}</Text>
        <View style={s.confirmMeta}><View style={[s.areaDot, { backgroundColor: lifeAreaColor(menu.entry.areaId, menuArea?.color_code) }]} /><Text style={s.caption}>{menu.mode === "remove" ? "Your recorded sessions and progress stay saved." : `${routineDuration(menu.entry.seconds)} · ${focusAreaTitle(menuArea?.title)}`}</Text></View></View> : null}>
      <BottomSheetScrollView contentContainerStyle={s.confirmBody}>
        {menu?.mode === "options" ? <View style={s.menuGroup}>
          <MenuAction first icon="play" label="Start" onPress={startMenu} disabled={blocked || (menu.entry.kind === "legacy" && (!menu.entry.task.is_due_today || !onStartLegacy || !routines.online))} />
          <MenuAction icon="create-outline" label="Edit routine" onPress={() => menu.entry.kind === "saved" ? edit(menu.entry.routine) : editLegacy(menu.entry.task)} />
          {menuRoutine && widget && <MenuAction icon="grid-outline" label="Add widget" onPress={() => { setMenu(null); void pin(menuRoutine); }} />}
          {menuRoutine && <MenuAction danger icon="trash-outline" label="Remove routine" onPress={() => { feedback(); setMenu({ entry: menu.entry, mode: "remove" }); }} />}
        </View> : menu?.mode === "remove" ? <>
          <Pressable onPress={() => { if (menuRoutine) void remove(menuRoutine); }} accessibilityRole="button" accessibilityLabel="Remove routine" style={s.removeButton}><Text style={s.removeText}>Remove routine</Text></Pressable>
          <Pressable onPress={() => setMenu(null)} accessibilityRole="button" accessibilityLabel="Keep routine" style={s.confirmCancel}><Text style={s.cancelText}>Keep routine</Text></Pressable>
        </> : <>
          <Pressable disabled={blocked} onPress={startMenu} accessibilityRole="button" accessibilityLabel={confirm ? `Start ${confirm.name} now` : "Start now"} style={[s.confirmStart, blocked && s.confirmDisabled]}>
            <Text style={s.confirmStartText}>Start session</Text><View style={s.confirmPlay}><Ionicons name="play" size={17} color={colors.primary} /></View>
          </Pressable>
          <Pressable onPress={() => setMenu(null)} accessibilityRole="button" accessibilityLabel="Not now" style={s.confirmCancel}><Text style={s.cancelText}>Not now</Text></Pressable>
        </>}
      </BottomSheetScrollView>
    </AppSheet>
    <RoutineEditorSheet key={`edit:${surfaceKey}`} visible={!!editor && active} onClose={() => setEditor(null)} routine={editor?.routine} subjects={subjects}
      initialAreaId={editor?.template ? suggestedArea(subjects as Subject[], editor.template.area)?.id ?? initialAreaId : initialAreaId}
      initialSeconds={editor?.template ? editor.template.minutes * 60 : initialSeconds} initialName={editor?.template?.name} />
    {legacyEditor && active && <QuestSheet key={`legacy:${scopeKey}:${legacyEditor.id}`} visible onClose={() => setLegacyEditor(null)} editorOnly initialTask={legacyEditor} expectedOwnerId={profile?.id} routineLanguage />}
  </>;
}

function MenuAction({ icon, label, onPress, danger = false, disabled = false, first = false }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; danger?: boolean; disabled?: boolean; first?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[s.menuRow, !first && s.menuDivider, disabled && s.confirmDisabled]}>
    <Text style={[s.menuText, danger && s.danger]}>{label}</Text><Ionicons name={icon} size={19} color={danger ? colors.danger : colors.text} />
  </Pressable>;
}

const s = StyleSheet.create({
  card: { gap: 10 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingLeft: 4 },
  suggested: { gap: 10, marginTop: 14 },
  ideas: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  idea: { ...edge, minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surface },
  ideaText: { color: colors.text, fontSize: 15, fontWeight: "500" },
  stack: { gap: 8 },
  itemCard: { ...edge, borderRadius: 18, backgroundColor: colors.surface, overflow: "hidden" },
  headingActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  manage: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }, link: { color: colors.accent, fontSize: 16, fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 8, paddingLeft: 16, paddingRight: 10, backgroundColor: colors.surface }, detail: { flex: 1, minWidth: 0, gap: 1, minHeight: 44, justifyContent: "center" },
  areaDot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" }, completed: { color: colors.secondary }, caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  play: { ...edge, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sheetCard, alignItems: "center", justifyContent: "center" },
  icon: { ...edge, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  empty: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, backgroundColor: colors.surface }, emptyIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft }, emptyTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  sheetHeading: { paddingHorizontal: 20, paddingBottom: 14, gap: 6 }, list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 }, addRow: { ...edge, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 25, backgroundColor: colors.accentSoft }, conflict: { paddingVertical: 12, gap: 6 },
  confirmTitle: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.4 }, confirmMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  confirmBody: { paddingHorizontal: 16, paddingBottom: 12, gap: 4 },
  confirmStart: { minHeight: 60, paddingLeft: 22, paddingRight: 9, borderRadius: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.primary },
  confirmStartText: { color: colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.3 },
  confirmPlay: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryText },
  confirmCancel: { minHeight: 50, alignItems: "center", justifyContent: "center" }, confirmDisabled: { opacity: 0.5 }, cancelText: { color: colors.text, fontSize: 16, fontWeight: "500" },
  menuGroup: { ...edge, borderRadius: 20, backgroundColor: colors.sheetCard, overflow: "hidden", marginBottom: 4 },
  menuRow: { minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  menuDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  menuText: { color: colors.text, fontSize: 16, lineHeight: 22 }, danger: { color: colors.danger },
  removeButton: { minHeight: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.16)" },
  removeText: { color: colors.danger, fontSize: 17, fontWeight: "600" },
  sheetRow: { ...edge, backgroundColor: colors.sheetCard, borderRadius: radius.row },
});
