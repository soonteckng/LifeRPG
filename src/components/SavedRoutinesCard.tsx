import { tapHaptic } from "../utils/tapHaptics";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { useSavedRoutines } from "../hooks/useSavedRoutines";
import { pinNewSavedRoutine, pinSavedRoutine, routineWidgetsSupported } from "../services/routineWidgetService";
import { resolveSavedRoutine } from "../services/savedRoutineService";
import { setupMode } from "../services/setupMode";
import { encodeRoutineSession } from "../utils/routineSession";
import { FOCUS_AREAS, focusAreaTitle, suggestedArea, type FocusAreaKind } from "../utils/focusAreas";
import { areaTint, lifeAreaColor } from "../utils/lifeAreaColor";
import { routineDuration } from "../utils/savedRoutine";
import { routinePresentation, type RoutineEntry } from "../utils/routinePresentation";
import type { SavedRoutine } from "../types/savedRoutine";
import type { Subject, Task } from "../services/taskService";
import { colors, radius, edge } from "../constants/theme";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import StartButton from "./StartButton";
import AppSheet from "./AppSheet";
import RoutineEditorSheet from "./RoutineEditorSheet";
import QuestSheet from "./QuestSheet";
import SheetHeader from "./SheetHeader";
import { EditBadges, Wiggle } from "./EditMode";
import SectionHeader, { CircleButton, DoneButton, SeeAll } from "./SectionHeader";
import OneTimeHint from "./OneTimeHint";
import { appPreferences } from "../services/appPreferences";
import { IDEA_AREAS, ROUTINE_IDEAS, type IdeaArea, type RoutineIdea } from "../constants/routineIdeas";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import IdeaAreasSheet from "./IdeaAreasSheet";
import { ideaAreaTitle } from "./IdeaAreaPicker";

type RoutineTemplate = RoutineIdea;
const kindColor = (kind: FocusAreaKind) => FOCUS_AREAS.find(area => area.kind === kind)?.color ?? colors.accent;

export default function SavedRoutinesCard({ subjects, initialSeconds = 1800, initialAreaId = null, active = true, onStarted, legacyTasks = [], onStartLegacy, limit = 3, suggestions: offerSuggestions = true, onSeeAll, layout = "list", lead, onAnyActivity, wrapMine }: {
  subjects: Pick<Subject, "id" | "title" | "color_code">[]; initialSeconds?: number; initialAreaId?: number | null; active?: boolean; onStarted?: () => void; legacyTasks?: Task[]; onStartLegacy?: (task: Task) => void;
  /** How many routines show before "See all"; the Routines tab shows them all. */
  limit?: number; suggestions?: boolean;
  /** Home hands "See all" to the Routines tab instead of opening a sheet. */
  onSeeAll?: () => void;
  /** "start": Home's Start row, routines as chips that start at once, then Any activity. */
  layout?: "list" | "start" | "grid"; lead?: ReactNode; onAnyActivity?: () => void;
  /** On Routines, the guide wraps your own routines (title, + and grid) to point at them. */
  wrapMine?: (mine: ReactNode) => ReactNode;
}) {
  const routines = useSavedRoutines(), timer = useTimer({ live: false }), { hapticsEnabled, profile } = useUser(), router = useRouter(), insets = useSafeAreaInsets();
  const [manage, setManage] = useState(false), [editor, setEditor] = useState<{ routine: SavedRoutine | null; template?: RoutineTemplate } | null>(null), [widget, setWidget] = useState(false), [message, setMessage] = useState("");
  const [legacyEditor, setLegacyEditor] = useState<Task | null>(null), [showDone, setShowDone] = useState(false);
  // Ideas: "For you" gathers the areas picked in the intro (it opens there);
  // the other chips narrow to one area, and All shows everything.
  const forYou = useGuidedPreference(profile?.id ?? "").value.ideaAreas ?? [];
  const [chosenFilter, setIdeaFilter] = useState<IdeaArea | "all" | "for-you" | null>(null);
  const ideaFilter = chosenFilter === "for-you" && !forYou.length ? "all" : chosenFilter ?? (forYou.length ? "for-you" : "all");
  const [areasOpen, setAreasOpen] = useState(false);
  // Tapping a row edits it, play starts it, and removing asks first in one small card.
  const [menu, setMenu] = useState<{ entry: RoutineEntry; mode: "start" | "remove" } | null>(null);
  // Holding a routine wiggles every card into edit mode, the same as subjects and exams.
  const [arranging, setArranging] = useState(false);
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
    setManage(false); setMenu(null); setArranging(false); setLeaving(false); setEditor(null); setLegacyEditor(null); setShowDone(false); setMessage("");
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
        if (currentSurface.current === surfaceKey && started) setMenu(null);
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
  // The routines that existed when a new one was started, so the new one can be found once it's saved.
  const knownIds = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (editor && !editor.routine) knownIds.current = new Set(routines.routines.map(item => item.id));
    // Only when a new routine's editor opens, not when the list changes as it saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  const pinNew = async () => {
    if (!routines.scope || locked.current || !active) return;
    const scope = routines.scope, operation = {}; locked.current = operation;
    try { const result = await pinNewSavedRoutine(scope, knownIds.current); if (currentSurface.current === surfaceKey) setMessage(result ? "Choose where to place your routine widget." : "Saved. Your phone couldn't add the widget, so try Add widget from the routine."); }
    catch { if (currentSurface.current === surfaceKey) setMessage("Saved. Your phone couldn't add the widget, so try Add widget from the routine."); }
    finally { if (locked.current === operation) locked.current = null; }
  };
  const remove = async (routine: SavedRoutine) => {
    if (!active || locked.current) return;
    const operation = {}; locked.current = operation; feedback();
    try { const removed = await routines.remove(routine.id); if (currentSurface.current !== surfaceKey) return; setMenu(null); if (!removed) setMessage("Couldn't remove this routine. Try again."); }
    catch { if (currentSurface.current === surfaceKey) { setMenu(null); setMessage("Couldn't remove this routine. Try again."); } }
    finally { if (locked.current === operation) locked.current = null; }
  };
  const hold = () => { if (!active) return; feedback(); setMessage(""); setArranging(true); void appPreferences.retireHint("routine-hold"); };
  const finish = () => { feedback(); setArranging(false); };
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
  const ask = (entry: RoutineEntry) => {
    if (blocked) return; setMessage("");
    // Without the cloud (offline, or still connecting just after launch) there
    // is no setup screen, so ▶ asks first instead of starting straight away.
    if (entry.kind === "saved" && !routines.online && !manage && !menu) { feedback(); setConfirm(entry); return; }
    if (entry.kind === "saved") void start(entry.routine); else void startLegacy(entry.task);
  };
  const areaOf = (id: number | null | undefined) => subjects.find(area => area.id === id);
  const savedEntry = (routine: SavedRoutine): RoutineEntry => ({ kind: "saved", key: `routine:${routine.id}`, name: routine.name, seconds: routine.durationSeconds, areaId: routine.focusAreaId, routine });
  const legacyEntry = (task: Task): RoutineEntry => ({ kind: "legacy", key: `task:${task.id}`, name: task.title, seconds: (task.target_minutes || 30) * 60, areaId: task.subject_id, task });
  const savedRow = (routine: SavedRoutine, inSheet = false) => {
    const area = areaOf(routine.focusAreaId), entry = savedEntry(routine), editingRows = arranging && !inSheet;
    const tint = lifeAreaColor(routine.focusAreaId, area?.color_code);
    return <View key={`routine:${routine.id}`} style={[s.row, inSheet && s.sheetRow]}>
      <View style={[s.rowIcon, { backgroundColor: areaTint(tint) }]}><Ionicons name="repeat" size={18} color={tint} /></View>
      <Pressable disabled={!active} onPress={() => editingRows ? finish() : edit(routine)} onLongPress={inSheet ? undefined : hold} delayLongPress={350}
        accessibilityRole="button" accessibilityLabel={`${editingRows ? "" : "Edit "}${routine.name}, ${routineDuration(routine.durationSeconds)}${editingRows ? ". Done editing" : ""}`}
        accessibilityActions={inSheet ? undefined : [{ name: "longpress", label: "Edit routines" }]} onAccessibilityAction={hold} style={s.detail}>
        <Text style={s.name} numberOfLines={2}>{routine.name}</Text><Text style={s.caption}>{routineDuration(routine.durationSeconds)} · {focusAreaTitle(area?.title)}{routine.reminder.enabled ? ` · ${String(routine.reminder.hour).padStart(2,"0")}:${String(routine.reminder.minute).padStart(2,"0")}` : ""}</Text>
      </Pressable>
      {editingRows ? <EditBadges name={routine.name} onEdit={() => { setArranging(false); edit(routine); }} onRemove={() => { feedback(); setMenu({ entry, mode: "remove" }); }} />
        : <StartButton disabled={blocked} onPress={() => ask(entry)} label={`Start routine ${routine.name}`} />}
    </View>;
  };
  const legacyRow = (task: Task, completed = false, inSheet = false) => {
    const disabled = blocked || completed || !task.is_due_today || !onStartLegacy || !routines.online;
    const area = areaOf(task.subject_id), entry = legacyEntry(task), editingRows = arranging && !inSheet && !completed;
    const tint = completed ? colors.success : lifeAreaColor(task.subject_id, area?.color_code);
    return <View key={`task:${task.id}`} style={[s.row, inSheet && s.sheetRow]}>
      <View style={[s.rowIcon, { backgroundColor: areaTint(tint) }]}><Ionicons name={completed ? "checkmark" : "repeat"} size={18} color={tint} /></View>
      <Pressable disabled={!active || !routines.online} onPress={() => editingRows ? finish() : editLegacy(task)} onLongPress={inSheet || completed ? undefined : hold} delayLongPress={350}
        accessibilityRole="button" accessibilityLabel={`${editingRows ? "" : "Edit "}${task.title}, ${task.target_minutes || 30} minutes${editingRows ? ". Done editing" : ""}`} style={s.detail}>
        <Text style={[s.name, completed && s.completed]} numberOfLines={2}>{task.title}</Text>
        <Text style={s.caption}>{routineDuration((task.target_minutes || 30) * 60)} · {focusAreaTitle(area?.title)}{task.is_recurring ? task.repeat_rule === "daily" ? " · Daily" : ` · ${task.repeat_rule.split(",").join(", ")}` : " · Once"}{completed ? " · Done today" : !task.is_due_today ? " · Upcoming" : ""}</Text>
      </Pressable>
      {editingRows ? <EditBadges name={task.title} onEdit={() => { setArranging(false); editLegacy(task); }} />
        : <StartButton disabled={disabled} onPress={() => ask(entry)} label={`Start routine ${task.title}`} />}
    </View>;
  };
  const row = (entry: RoutineEntry, inSheet = false) => entry.kind === "saved" ? savedRow(entry.routine, inSheet) : legacyRow(entry.task, false, inSheet);
  // Routines tab: two tiles to a row, each with its ▶, and a last tile to add one.
  const tile = (entry: RoutineEntry) => {
    const saved = entry.kind === "saved", task = saved ? null : entry.task, routine = saved ? entry.routine : null;
    const area = areaOf(entry.areaId), tint = lifeAreaColor(entry.areaId, area?.color_code), editing = arranging;
    const startDisabled = saved ? blocked : blocked || !task!.is_due_today || !onStartLegacy || !routines.online;
    const caption = `${routineDuration(entry.seconds)} · ${focusAreaTitle(area?.title)}${routine?.reminder.enabled ? ` · ${String(routine.reminder.hour).padStart(2,"0")}:${String(routine.reminder.minute).padStart(2,"0")}` : ""}${task && !task.is_due_today ? " · Upcoming" : ""}`;
    // The same tile as a subject in Study: icon, name, details, ▶ in the corner.
    return <Wiggle key={entry.key} active={editing} seed={entry.key} degrees={0.9} style={s.gridCell}>
      <Pressable disabled={!active || (!saved && !routines.online)} onPress={() => editing ? finish() : saved ? edit(routine) : editLegacy(task!)} onLongPress={hold} delayLongPress={350}
        accessibilityRole="button" accessibilityLabel={`${editing ? "" : "Edit "}${entry.name}, ${routineDuration(entry.seconds)}${editing ? ". Done editing" : ""}`}
        accessibilityActions={[{ name: "longpress", label: "Edit routines" }]} onAccessibilityAction={hold} style={s.gridTile}>
        <View style={s.gridTop}><View style={[s.gridIcon, { backgroundColor: areaTint(tint, 0.2) }]}><Ionicons name="repeat" size={15} color={tint} /></View></View>
        <Text style={s.gridName} numberOfLines={2}>{entry.name}</Text>
        <Text style={s.gridCaption} numberOfLines={2}>{caption}</Text>
      </Pressable>
      {editing ? <EditBadges placement="corner" name={entry.name} onEdit={() => { setArranging(false); if (saved) edit(routine); else editLegacy(task!); }}
        onRemove={saved ? () => { feedback(); setMenu({ entry, mode: "remove" }); } : undefined} />
        : <StartButton disabled={startDisabled} onPress={() => ask(entry)} label={`Start routine ${entry.name}`} size={34} style={s.gridPlay} />}
    </Wiggle>;
  };
  const visibleEntries = entries.slice(0, limit);
  // Once the last routine is removed there is nothing left to edit: Done gives way to + again.
  if (arranging && !visibleEntries.length) setArranging(false);
  const savedNames = new Set([...routines.routines.map(item => item.name.trim().toLowerCase()), ...legacyTasks.map(task => task.title.trim().toLowerCase())]);
  const unsaved = ROUTINE_IDEAS.filter(template => !savedNames.has(template.name.toLowerCase()));
  const filtered = ideaFilter === "all" ? unsaved : ideaFilter === "for-you" ? unsaved.filter(template => forYou.includes(template.area)) : unsaved.filter(template => template.area === ideaFilter);
  // In All, ideas sit two to a row and an odd one waits for the next gap, so no card is left alone.
  const suggestions = ideaFilter === "all" && filtered.length > 1 ? filtered.slice(0, filtered.length - (filtered.length % 2)) : filtered;
  const menuArea = menu ? areaOf(menu.entry.areaId) : undefined;
  // An idea (new, or saved under its own name) keeps its category in the editor.
  const editorIdea = editor?.template ?? (editor?.routine ? ROUTINE_IDEAS.find(idea => idea.name.toLowerCase() === editor.routine!.name.trim().toLowerCase()) : undefined);
  const menuRoutine = menu?.entry.kind === "saved" ? menu.entry.routine : null;
  // A sync conflict asks which version to keep wherever the routines are listed.
  const conflictRows = routines.conflicts.map(conflict => <View key={conflict.operation.operationId} style={s.conflict}><Text style={s.name}>{conflict.operation.draft.name}</Text><Text style={s.caption}>{conflict.reason}</Text><View style={s.heading}><Pressable accessibilityRole="button" onPress={() => void routines.resolveConflict(conflict.operation.operationId, false)} style={s.manage}><Text style={s.link}>Use other device’s version</Text></Pressable>{(!conflict.latest || conflict.latest.deletedAt === null) && <Pressable accessibilityRole="button" onPress={() => void routines.resolveConflict(conflict.operation.operationId, true)} style={s.manage}><Text style={s.link}>Keep my changes</Text></Pressable>}</View></View>);
  // Home's Start row: each routine is one chip that starts it, then Any activity.
  // A phone with no routines yet gets one wide Start button instead.
  const chipDisabled = (entry: RoutineEntry) => entry.kind === "saved" ? blocked : blocked || !entry.task.is_due_today || !onStartLegacy || !routines.online;
  const anyBlocked = !!(timer.hasOpenSession || timer.actionBusy || timer.endingSession || timer.isRestoring || timer.restoreError || (timer.isCompleted && !timer.summaryViewed));
  const startView = layout === "start" ? <View style={s.startCard} testID="saved-routines-card">
    <View style={s.startHead}>
      <Text style={s.startTitle} accessibilityRole="header">Start</Text>
      {!!entries.length && <SeeAll count={entries.length > limit ? entries.length : undefined} accessibilityLabel="See all your routines"
        onPress={() => { feedback(); if (active && routines.ready) { setShowDone(false); setManage(true); } else onSeeAll?.(); }} />}
    </View>
    {visibleEntries.length || lead ? <View style={s.startChips}>
      {lead}
      {visibleEntries.map(entry => {
        const disabled = chipDisabled(entry), area = areaOf(entry.areaId), tint = lifeAreaColor(entry.areaId, area?.color_code);
        return <Pressable key={entry.key} disabled={disabled} onPress={() => ask(entry)} delayLongPress={350}
          onLongPress={entry.kind === "saved" ? () => edit(entry.routine) : undefined}
          accessibilityRole="button" accessibilityState={{ disabled }} accessibilityLabel={`Start routine ${entry.name}, ${routineDuration(entry.seconds)}`}
          accessibilityHint={entry.kind === "saved" ? "Hold to edit" : undefined} style={[s.startChip, disabled && s.startChipOff]}>
          <View style={[s.startPlay, { backgroundColor: areaTint(tint, 0.2) }]}><Ionicons name="play" size={14} color={tint} style={s.nudge} /></View>
          <View style={s.flex}><Text style={s.chipName} numberOfLines={1}>{entry.name}</Text><Text style={s.chipCaption} numberOfLines={1}>{routineDuration(entry.seconds)}</Text></View>
        </Pressable>;
      })}
      {onAnyActivity && <Pressable disabled={anyBlocked} onPress={onAnyActivity} testID="home-just-focus" accessibilityRole="button" accessibilityState={{ disabled: anyBlocked }}
        accessibilityLabel="Any activity. Start focusing, your time" style={[s.startChip, anyBlocked && s.startChipOff]}>
        <View style={[s.startPlay, s.anyPlay]}><Ionicons name="add" size={17} color={colors.text} /></View>
        <View style={s.flex}><Text style={s.chipName} numberOfLines={1}>Any activity</Text><Text style={s.chipCaption} numberOfLines={1}>Your time</Text></View>
      </Pressable>}
    </View> : <>
      {onAnyActivity && <Pressable disabled={anyBlocked} onPress={onAnyActivity} testID="home-just-focus" accessibilityRole="button" accessibilityState={{ disabled: anyBlocked }}
        accessibilityLabel="Start a focus session. Any activity, your time" style={[s.startWide, anyBlocked && s.startChipOff]}>
        <Ionicons name="play" size={18} color={colors.primaryText} /><Text style={s.startWideText}>Start a focus session</Text>
      </Pressable>}
      {routines.ready && onSeeAll && <Pressable disabled={!active} onPress={() => { feedback(); onSeeAll(); }} accessibilityRole="button" accessibilityLabel="Make a routine in Routines" style={s.manage}>
        <Text style={s.startLink}>Save something you return to as a routine</Text></Pressable>}
    </>}
    {!routines.ready && !!routines.error && <Text style={s.caption}>{routines.error}</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" style={s.caption}>{message}</Text>}
  </View> : null;
  const startMenu = () => { if (!menu) return; if (menu.entry.kind === "saved") void start(menu.entry.routine); else void startLegacy(menu.entry.task); };
  return <>
    {startView ?? <View style={s.card} testID="saved-routines-card">
      {/* On Home, See all opens every routine in a sheet, like Upcoming Exams; in Routines the header has +. */}
      {(layout === "grid" && wrapMine ? wrapMine : (node: ReactNode) => node)(<>
      {arranging ? <SectionHeader title="My Routines" subtitle="Tap ✎ to edit or − to remove." right={<DoneButton label="Done editing routines" onPress={finish} />} />
        : onSeeAll ? <SectionHeader title="My Routines" right={<SeeAll count={entries.length > limit ? entries.length : undefined} accessibilityLabel="See all your routines"
          onPress={() => { feedback(); if (active && routines.ready && (entries.length || done.length)) { setShowDone(false); setManage(true); } else onSeeAll(); }} />} />
        : <SectionHeader title="My Routines" right={<CircleButton disabled={!active || !routines.ready || routines.routines.length >= 32} onPress={() => edit(null)} label="New routine" />} />}
      <OneTimeHint id="routine-hold" text="Hold a routine to edit or remove it." show={routines.ready && visibleEntries.some(entry => entry.kind === "saved")} />
      {!routines.ready ? <Text style={s.caption}>{routines.error ?? "Loading your routines…"}</Text> : layout === "grid" ? <View style={s.grid}>
        {visibleEntries.map(tile)}
        {/* Like Add subject: the dashed tile helps you start; from four routines on, the + by the title is enough. */}
        {!arranging && entries.length < 4 && <Pressable disabled={!active || routines.routines.length >= 32} onPress={() => edit(null)} accessibilityRole="button" accessibilityLabel="Create a new routine" testID="routine-new-tile" style={[s.gridCell, s.newTile]}>
          <View style={s.newIcon}><Ionicons name="add" size={20} color={colors.accent} /></View>
          <Text style={s.newText}>Add routine</Text><Text style={s.newHint}>Name it and pick a length</Text>
        </Pressable>}
      </View> : visibleEntries.length ? <View style={s.stack}>
        {/* Each routine is its own small card; in edit mode they wiggle together. */}
        {visibleEntries.map(entry => <Wiggle key={entry.key} active={arranging} seed={entry.key} degrees={0.4} style={s.itemCard}>{row(entry)}</Wiggle>)}
      </View> : <View style={s.itemCard}>
        <Pressable disabled={!active} onPress={() => { if (onSeeAll) { feedback(); onSeeAll(); } else edit(null); }} accessibilityRole="button" accessibilityLabel={onSeeAll ? "Create your first routine in Routines" : "Create your first routine"} style={s.empty}><View style={s.emptyIcon}><Ionicons name="repeat" size={19} color={colors.accent} /></View><View style={{ flex: 1, gap: 3 }}><Text style={s.emptyTitle}>Make room for a little routine</Text><Text style={s.caption}>Save an activity you’d like to return to.</Text></View><Ionicons name="chevron-forward" size={15} color={colors.tertiary} /></Pressable>
      </View>}
      </>)}
      {/* Ready-made starting points stay offered until each one is saved. */}
      {offerSuggestions && routines.ready && !!unsaved.length && <View style={s.suggested}>
        {/* Once areas are picked, changing them is one quiet button by the title. */}
        <SectionHeader title="Ideas to start with" right={active && forYou.length ? <CircleButton icon="options-outline" testID="ideas-for-you-change"
          label={`For you: ${forYou.map(ideaAreaTitle).join(", ")}. Change`} onPress={() => { feedback(); setAreasOpen(true); }} /> : undefined} />
        {/* The chips always sit in the same order; All is always first. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} accessibilityRole="tablist">
          {([...(forYou.length ? ["for-you" as const] : []), "all" as const, ...IDEA_AREAS]).map(kind => {
            const selected = ideaFilter === kind, title = kind === "for-you" ? "For you" : kind === "all" ? "All" : focusAreaTitle(FOCUS_AREAS.find(area => area.kind === kind)?.title);
            return <Pressable key={kind} onPress={() => { feedback(); setIdeaFilter(kind); }} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={`${title} ideas`}
              style={[s.chip, selected && s.chipOn]}><Text style={[s.chipText, selected && s.chipTextOn]} numberOfLines={1}>{title}</Text></Pressable>;
          })}
        </ScrollView>
        {/* Someone who skipped the intro can still set up For you. */}
        {active && !forYou.length && <Pressable onPress={() => { feedback(); setAreasOpen(true); }} accessibilityRole="button" testID="ideas-for-you-change"
          accessibilityLabel="Get ideas for you" style={s.forYou}>
          <Text style={[s.caption, s.flex]} numberOfLines={1}>Tell us what you’d like to make time for</Text>
          <Text style={s.forYouLink}>Choose</Text>
        </Pressable>}
        {!suggestions.length && <Text style={s.caption}>You’ve saved every idea here. Try another area.</Text>}
        <View style={s.ideas}>{suggestions.map(template => {
          const area = suggestedArea(subjects as Subject[], template.area), tint = kindColor(template.area);
          return <Pressable key={template.name} disabled={!active} onPress={() => { feedback(); setEditor({ routine: null, template }); }} accessibilityRole="button"
            accessibilityLabel={`Add ${template.name}, ${template.minutes} minutes, ${focusAreaTitle(area?.title)}`} style={s.idea}>
            <View style={s.ideaTop}><View style={[s.ideaIcon, { backgroundColor: areaTint(tint) }]}><Ionicons name={template.icon} size={17} color={tint} /></View>
              <Ionicons name="add-circle" size={22} color={colors.accent} /></View>
            <Text style={s.ideaText} numberOfLines={2}>{template.name}</Text>
            <Text style={s.caption} numberOfLines={1}>{template.minutes} min · {focusAreaTitle(area?.title)}</Text>
          </Pressable>;
        })}</View>
      </View>}
      {!!done.length && (onSeeAll ? <Text style={s.caption}>{done.length} completed today</Text>
        : <Pressable disabled={!active} onPress={() => { feedback(); setShowDone(true); setManage(true); }} accessibilityRole="button" accessibilityLabel={`Done today, ${done.length}`} style={s.manage}><Text style={s.link}>Done today ({done.length})</Text></Pressable>)}
      {!onSeeAll && routines.ready && conflictRows}
      {!!message && <Text accessibilityLiveRegion="polite" style={s.caption}>{message}</Text>}
      {!!routines.pendingCount && <Text style={s.caption}>Saved on this phone. {routines.online ? routines.busy ? "Syncing routine changes…" : routines.error ? "Couldn't sync yet. We'll retry automatically." : "Waiting to sync routine changes…" : "Syncs when you reconnect."}</Text>}
      {!routines.ready && routines.error && <Pressable accessibilityRole="button" onPress={() => void routines.retry()} style={s.manage}><Text style={s.link}>Retry loading routines</Text></Pressable>}
    </View>}
    <AppSheet key={`manage:${surfaceKey}`} visible={manage && active} onRequestClose={() => setManage(false)} onDismiss={afterSheetDismiss} closeInstantly={leaving} attached compact maxHeightRatio={0.82} label="routines" header={<SheetHeader title={showDone ? "Done today" : "My Routines"} subtitle={showDone ? "Finished today. Tap one to edit it." : "Tap one to edit it, or ▶ to start."} onClose={() => setManage(false)} />}>
      <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.list, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        {showDone ? done.map(task => legacyRow(task, true, true)) : entries.map(entry => row(entry, true))}
        {!!done.length && <Pressable accessibilityRole="button" onPress={() => { feedback(); setShowDone(value => !value); }} style={s.manage}><Text style={s.link}>{showDone ? "Back to your routines" : `Done today (${done.length})`}</Text></Pressable>}
        {onSeeAll ? <View style={s.halves}>
          <Pressable onPress={() => edit(null)} disabled={routines.routines.length >= 32} accessibilityRole="button" accessibilityLabel="Add routine" style={[s.addRow, s.half]}><Ionicons name="add" size={20} color={colors.accent} /><Text style={s.link}>Add routine</Text></Pressable>
          <Pressable onPress={() => { feedback(); afterManageDismiss.current = { surfaceKey, open: onSeeAll }; setManage(false); }} accessibilityRole="button" accessibilityLabel="Open Routines" style={[s.addRow, s.half, s.plain]}><Ionicons name="repeat" size={18} color={colors.text} /><Text style={s.plainText}>Open Routines</Text></Pressable>
        </View> : <Pressable onPress={() => edit(null)} disabled={routines.routines.length >= 32} accessibilityRole="button" style={s.addRow}><Ionicons name="add" size={22} color={colors.accent} /><Text style={s.link}>Add routine</Text></Pressable>}
        {Platform.OS === "android" && !widget && <Text style={s.caption}>Routine widgets need the updated Android app. Saved routines already work here.</Text>}
        {conflictRows}
        {!!routines.error && <Text accessibilityRole="alert" style={s.caption}>{routines.error}</Text>}
        {!!message && <Text accessibilityLiveRegion="polite" style={s.caption}>{message}</Text>}
      </BottomSheetScrollView>
    </AppSheet>
    <AppSheet key={`confirm:${surfaceKey}`} visible={!!menu && active} onRequestClose={() => setMenu(null)} onDismiss={afterSheetDismiss} closeInstantly={leaving} compact
      label={menu?.mode === "remove" ? "remove routine" : "start routine"}
      header={menu ? <View style={s.sheetHeading}><Text style={s.confirmTitle} numberOfLines={2}>{menu.mode === "start" ? `Start “${menu.entry.name}”?` : menu.mode === "remove" ? `Remove “${menu.entry.name}”?` : menu.entry.name}</Text>
        <View style={s.confirmMeta}><View style={[s.areaDot, { backgroundColor: lifeAreaColor(menu.entry.areaId, menuArea?.color_code) }]} /><Text style={s.caption}>{menu.mode === "remove" ? "Your recorded sessions and progress stay saved." : `${routineDuration(menu.entry.seconds)} · ${focusAreaTitle(menuArea?.title)}`}</Text></View></View> : null}>
      <BottomSheetScrollView contentContainerStyle={s.confirmBody}>
        {menu?.mode === "remove" ? <>
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
    {offerSuggestions && <IdeaAreasSheet owner={profile?.id ?? ""} visible={areasOpen && active} onClose={() => setAreasOpen(false)} />}
    <RoutineEditorSheet key={`edit:${surfaceKey}`} visible={!!editor && active} onClose={() => setEditor(null)} routine={editor?.routine} subjects={subjects}
      initialAreaId={editor?.template ? suggestedArea(subjects as Subject[], editor.template.area)?.id ?? initialAreaId : initialAreaId}
      idea={editorIdea ? { name: editorIdea.name, areaId: suggestedArea(subjects as Subject[], editorIdea.area)?.id ?? null } : undefined}
      initialSeconds={editor?.template ? editor.template.minutes * 60 : initialSeconds} initialName={editor?.template?.name}
      onAddWidget={widget && editor?.routine ? () => { const routine = editor.routine; if (routine) void pin(routine); } : undefined}
      widgetOnSave={widget && !!editor && !editor.routine} onSaved={(_, options) => { if (options?.addWidget) void pinNew(); }} />
    {legacyEditor && active && <QuestSheet key={`legacy:${scopeKey}:${legacyEditor.id}`} visible onClose={() => setLegacyEditor(null)} editorOnly initialTask={legacyEditor} expectedOwnerId={profile?.id} routineLanguage />}
  </>;
}


const s = StyleSheet.create({
  card: { gap: 10 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingLeft: 4 },
  suggested: { gap: 10, marginTop: 14 },
  // Two columns of idea cards fill the page instead of a row of small chips.
  ideas: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chips: { gap: 8, paddingRight: 8 },
  forYou: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 4 },
  forYouLink: { color: colors.text, fontSize: 14, fontWeight: "600" }, flex: { flex: 1, minWidth: 0 },
  chip: { ...edge, minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: "center", backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.secondary, fontSize: 14, fontWeight: "600" }, chipTextOn: { color: colors.background },
  idea: { ...edge, flexBasis: "40%", flexGrow: 1, maxWidth: "50%", minHeight: 112, padding: 12, gap: 4, borderRadius: 18, backgroundColor: colors.surface },
  ideaTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  ideaIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  ideaText: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  stack: { gap: 8 },
  itemCard: { ...edge, borderRadius: 18, backgroundColor: colors.surface, overflow: "hidden" },
  halves: { flexDirection: "row", gap: 10 }, half: { flex: 1 }, plain: { backgroundColor: colors.sheetCard }, plainText: { color: colors.text, fontSize: 16, fontWeight: "500" },
  manage: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }, link: { color: colors.accent, fontSize: 16, fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingVertical: 10, paddingLeft: 14, paddingRight: 12, backgroundColor: colors.surface }, detail: { flex: 1, minWidth: 0, gap: 1, minHeight: 44, justifyContent: "center" },
  areaDot: { width: 10, height: 10, borderRadius: 5 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" }, completed: { color: colors.secondary }, caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  empty: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, backgroundColor: colors.surface }, emptyIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft }, emptyTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  sheetHeading: { paddingHorizontal: 20, paddingBottom: 14, gap: 6 }, list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 }, addRow: { ...edge, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 25, backgroundColor: colors.accentSoft }, conflict: { paddingVertical: 12, gap: 6 },
  confirmTitle: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.4 }, confirmMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  confirmBody: { paddingHorizontal: 16, paddingBottom: 12, gap: 4 },
  confirmStart: { minHeight: 60, paddingLeft: 22, paddingRight: 9, borderRadius: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.primary },
  confirmStartText: { color: colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.3 },
  confirmPlay: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryText },
  confirmCancel: { minHeight: 50, alignItems: "center", justifyContent: "center" }, confirmDisabled: { opacity: 0.5 }, cancelText: { color: colors.text, fontSize: 16, fontWeight: "500" },
  removeButton: { minHeight: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.16)" },
  removeText: { color: colors.danger, fontSize: 17, fontWeight: "600" },
  sheetRow: { ...edge, backgroundColor: colors.sheetCard, borderRadius: radius.row },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridCell: { flexBasis: "45%", flexGrow: 1, maxWidth: "50%", position: "relative" },
  gridTile: { ...edge, flex: 1, minHeight: 120, padding: 12, gap: 3, borderRadius: radius.tile, backgroundColor: colors.surface },
  gridTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  gridIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  gridName: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  // The last lines leave room for the ▶ in the corner.
  gridCaption: { color: colors.secondary, fontSize: 13, lineHeight: 18, paddingRight: 36 },
  gridPlay: { position: "absolute", right: 10, bottom: 10 },
  newTile: { minHeight: 120, padding: 12, gap: 3, borderRadius: radius.tile, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, justifyContent: "center" },
  newIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft, marginBottom: 4 },
  newText: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  newHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  startCard: { ...edge, padding: 16, gap: 12, borderRadius: radius.card, backgroundColor: colors.surface },
  startHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 },
  startTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "700", letterSpacing: -0.2 },
  // Two chips to a row, wrapping, so every way to start is visible at once.
  startChips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  startChip: { ...edge, flexBasis: "45%", flexGrow: 1, minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingLeft: 10, paddingRight: 12, borderRadius: radius.row, backgroundColor: colors.surfaceRaised },
  startChipOff: { opacity: 0.45 },
  startPlay: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  anyPlay: { backgroundColor: colors.accentSoft }, nudge: { marginLeft: 2 },
  chipName: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  chipCaption: { color: colors.secondary, fontSize: 13, lineHeight: 17 },
  startWide: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 28, backgroundColor: colors.primary },
  startWideText: { color: colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight: "600" },
  startLink: { color: colors.secondary, fontSize: 14, lineHeight: 20, textAlign: "center" },
});

