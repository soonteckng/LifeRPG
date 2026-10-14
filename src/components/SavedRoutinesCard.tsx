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
import { routineDuration } from "../utils/savedRoutine";
import type { SavedRoutine } from "../types/savedRoutine";
import type { Subject } from "../services/taskService";
import { colors } from "../constants/theme";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import AppSheet from "./AppSheet";
import RoutineEditorSheet from "./RoutineEditorSheet";

export default function SavedRoutinesCard({ subjects, initialSeconds = 1800, initialAreaId = null, active = true, onStarted }: { subjects: Pick<Subject, "id" | "title" | "color_code">[]; initialSeconds?: number; initialAreaId?: number | null; active?: boolean; onStarted?: () => void }) {
  const routines = useSavedRoutines(), timer = useTimer(), { hapticsEnabled } = useUser(), router = useRouter();
  const [manage, setManage] = useState(false), [editor, setEditor] = useState<{ routine: SavedRoutine | null } | null>(null), [widget, setWidget] = useState(false), [message, setMessage] = useState("");
  const scopeKey = `${routines.scope?.backendId ?? ""}:${routines.scope?.ownerId ?? ""}`;
  const nextEditor = useRef<SavedRoutine | null | undefined>(undefined), locked = useRef(false), currentScope = useRef(scopeKey);
  const afterManageDismiss = useRef<{ scopeKey: string; open: () => void } | null>(null);
  const [previousSurface, setPreviousSurface] = useState({ active, scopeKey });
  if (previousSurface.active !== active || previousSurface.scopeKey !== scopeKey) {
    setPreviousSurface({ active, scopeKey });
    if (!active || previousSurface.scopeKey !== scopeKey) { setManage(false); setEditor(null); setMessage(""); }
  }
  useLayoutEffect(() => { currentScope.current = active ? scopeKey : ""; nextEditor.current = undefined; afterManageDismiss.current = null; return () => { currentScope.current = ""; }; }, [active, scopeKey]);
  useEffect(() => { let live = true; if (Platform.OS === "android") void routineWidgetsSupported().then(value => { if (live) setWidget(value); }); return () => { live = false; }; }, []);
  const feedback = () => { if (hapticsEnabled) void Haptics.selectionAsync().catch(() => {}); };
  const blocked = !active || !routines.ready || !!(timer.hasOpenSession || timer.actionBusy || timer.endingSession || timer.isRestoring || timer.restoreError || (timer.isCompleted && !timer.summaryViewed));
  const start = async (routine: SavedRoutine) => {
    if (blocked || locked.current || !routines.scope) return;
    const scope = routines.scope; locked.current = true; setMessage(""); feedback();
    try {
      const latest = await resolveSavedRoutine(scope, routine.id);
      if (!latest || currentScope.current !== `${scope.backendId}:${scope.ownerId}`) return;
      if (latest.focusAreaId !== null && !subjects.some(item => item.id === latest.focusAreaId)) { setMessage("Choose an available focus area in Edit routine before starting."); return; }
      const request = timer.startFreeTimer(latest.durationSeconds, latest.focusAreaId, latest.name);
      // Present the controller's starting state immediately, just like Home's
      // quick start. A server reply must not delay opening the timer.
      const open = () => { if (onStarted) onStarted(); else if (routines.online) router.push("/session"); };
      if (manage) {
        if (onStarted || routines.online) afterManageDismiss.current = { scopeKey: `${scope.backendId}:${scope.ownerId}`, open };
        setManage(false);
      } else open();
      const started = await request;
      if (currentScope.current !== `${scope.backendId}:${scope.ownerId}`) return;
      if (!started) setMessage(timer.actionError ?? "Couldn't start this routine. Your saved settings are still here.");
    } catch {
      if (currentScope.current === `${scope.backendId}:${scope.ownerId}`) setMessage("Couldn't start this routine. Your saved settings are still here.");
    } finally { locked.current = false; }
  };
  const edit = (routine: SavedRoutine | null) => { feedback(); if (manage) { nextEditor.current = routine; setManage(false); } else setEditor({ routine }); };
  const pin = async (routine: SavedRoutine) => {
    if (!routines.scope || locked.current || !active) return;
    const scope = routines.scope; locked.current = true; feedback();
    try { const result = await pinSavedRoutine(scope, routine.id); if (currentScope.current === `${scope.backendId}:${scope.ownerId}`) setMessage(result ? "Choose where to place your routine widget." : "Your phone couldn't add the widget. You can also add LifeRPG from your launcher’s widget list."); }
    finally { locked.current = false; }
  };
  const row = (routine: SavedRoutine) => <View key={routine.id} style={s.row}>
    <Pressable disabled={blocked} onPress={() => void start(routine)} accessibilityRole="button" accessibilityLabel={`Start ${routine.name}, ${routineDuration(routine.durationSeconds)}`} style={s.detail}>
      <Text style={s.name} numberOfLines={2}>{routine.name}</Text><Text style={s.caption}>{routineDuration(routine.durationSeconds)} · {focusAreaTitle(subjects.find(area => area.id === routine.focusAreaId)?.title)}{routine.reminder.enabled ? ` · ${String(routine.reminder.hour).padStart(2,"0")}:${String(routine.reminder.minute).padStart(2,"0")}` : ""}</Text>
    </Pressable>
    {manage ? <><Pressable onPress={() => edit(routine)} accessibilityRole="button" accessibilityLabel={`Edit ${routine.name}`} style={s.icon}><Ionicons name="create-outline" size={21} color={colors.accent} /></Pressable>{widget && <Pressable onPress={() => void pin(routine)} accessibilityRole="button" accessibilityLabel={`Add ${routine.name} widget`} style={s.icon}><Ionicons name="grid-outline" size={20} color={colors.accent} /></Pressable>}</> : <Pressable disabled={blocked} onPress={() => void start(routine)} accessibilityRole="button" accessibilityLabel={`Start routine ${routine.name}`} style={s.icon}><Ionicons name="play-outline" size={22} color={blocked ? colors.secondary : colors.accent} /></Pressable>}
  </View>;
  return <>
    <View style={s.card} testID="saved-routines-card"><View style={s.heading}><Text accessibilityRole="header" style={s.title}>Your routines</Text><Pressable disabled={!active || !routines.ready} onPress={() => { if (routines.routines.length) { feedback(); setManage(true); } else edit(null); }} accessibilityRole="button" accessibilityLabel="Manage your routines" style={s.manage}><Text style={s.link}>{routines.routines.length ? "Manage" : "Add routine"}</Text></Pressable></View>
      {!routines.ready ? <Text style={s.caption}>{routines.error ?? "Loading your saved starting points…"}</Text> : routines.routines.length ? routines.routines.slice(0, 2).map(row) : <Pressable disabled={!active} onPress={() => edit(null)} accessibilityRole="button" style={s.empty}><Ionicons name="repeat-outline" size={24} color={colors.accent} /><Text style={[s.caption, { flex: 1 }]}>Keep a starting point you want to return to. One tap starts it again.</Text></Pressable>}
      {!!message && <Text accessibilityLiveRegion="polite" style={s.caption}>{message}</Text>}
      {!!routines.pendingCount && <Text style={s.caption}>Saved on this phone. {routines.online ? "Syncing routine changes…" : "Syncs when you reconnect."}</Text>}
      {!routines.ready && routines.error && <Pressable accessibilityRole="button" onPress={() => void routines.retry()} style={s.manage}><Text style={s.link}>Retry loading routines</Text></Pressable>}
    </View>
    <AppSheet visible={manage && active} onRequestClose={() => setManage(false)} onDismiss={() => {
      const pending = afterManageDismiss.current;
      afterManageDismiss.current = null;
      if (pending && active && currentScope.current === pending.scopeKey) { pending.open(); return; }
      if (nextEditor.current !== undefined && active) { setEditor({ routine: nextEditor.current }); nextEditor.current = undefined; }
    }} compact maxHeightRatio={0.82} label="routines" header={<View style={s.sheetHeading}><Text style={s.title}>Your routines</Text><Text style={s.caption}>Start here again without setting everything up.</Text></View>}>
      <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.list}>
        {routines.routines.map(row)}
        <Pressable onPress={() => edit(null)} disabled={routines.routines.length >= 32} accessibilityRole="button" style={s.add}><Ionicons name="add" size={22} color={colors.accent} /><Text style={s.link}>Add routine</Text></Pressable>
        {Platform.OS === "android" && !widget && <Text style={s.caption}>Routine widgets need the updated Android app. Saved routines already work here.</Text>}
        {routines.conflicts.map(conflict => <View key={conflict.operation.operationId} style={s.conflict}><Text style={s.name}>{conflict.operation.draft.name}</Text><Text style={s.caption}>{conflict.reason}</Text><View style={s.heading}><Pressable accessibilityRole="button" onPress={() => void routines.resolveConflict(conflict.operation.operationId, false)} style={s.manage}><Text style={s.link}>Use other device’s version</Text></Pressable>{(!conflict.latest || conflict.latest.deletedAt === null) && <Pressable accessibilityRole="button" onPress={() => void routines.resolveConflict(conflict.operation.operationId, true)} style={s.manage}><Text style={s.link}>Keep my changes</Text></Pressable>}</View></View>)}
        {!!routines.error && <Text accessibilityRole="alert" style={s.caption}>{routines.error}</Text>}
        {!!message && <Text accessibilityLiveRegion="polite" style={s.caption}>{message}</Text>}
      </BottomSheetScrollView>
    </AppSheet>
    <RoutineEditorSheet visible={!!editor && active} onClose={() => setEditor(null)} routine={editor?.routine} subjects={subjects} initialAreaId={initialAreaId} initialSeconds={initialSeconds} />
  </>;
}
const s = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surfaceRaised, gap: 6 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }, title: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "500" },
  manage: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }, link: { color: colors.accent, fontSize: 14, fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, detail: { flex: 1, minWidth: 0, gap: 3, minHeight: 44, justifyContent: "center" },
  name: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" }, caption: { color: colors.secondary, fontSize: 13, lineHeight: 20 }, icon: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }, empty: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 8 },
  sheetHeading: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 }, list: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 }, add: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, backgroundColor: colors.accentSoft }, conflict: { paddingVertical: 12, gap: 6 },
});
