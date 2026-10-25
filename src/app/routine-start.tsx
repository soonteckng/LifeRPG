import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../components/AppText";
import ContentReveal from "../components/ContentReveal";
import { PersonalButton, p } from "../components/PersonalUI";
import { useTimer } from "../context/TimerContext";
import { useSavedRoutines } from "../hooks/useSavedRoutines";
import { consumeSavedRoutineWidgetLaunch } from "../services/routineWidgetService";
import { resolveSavedRoutine } from "../services/savedRoutineService";
import { readRoutineSession } from "../utils/routineSession";
import { staleWidgetLauncherReset } from "../utils/widgetSessionNavigation";
import { sessionTrail } from "../services/sessionTrail";
import Pressable from "../components/MotionPressable";

/**
 * The native widget supplies a one-use launch proof, never a session command.
 * It always goes to the one session screen: back to it if it's already open
 * (never a second copy on top), or in place of this page if it isn't.
 */
export default function RoutineStart() {
  const { widgetNonce } = useLocalSearchParams<{ widgetNonce?: string }>();
  const routines = useSavedRoutines(), timer = useTimer({ live: false }), router = useRouter();
  const navigation = useNavigation();
  const scopeKey = routines.scope ? JSON.stringify(routines.scope) : null;
  const launchKey = JSON.stringify([scopeKey, widgetNonce]);
  const [error, setError] = useState("");
  const [runningNotice, setRunningNotice] = useState<string | null>(null);
  const consumed = useRef<string | null>(null);
  const view = useRef({ mounted: true, scopeKey, launchKey, timer });
  useLayoutEffect(() => { view.current.scopeKey = scopeKey; view.current.launchKey = launchKey; view.current.timer = timer; }, [scopeKey, launchKey, timer]);
  useEffect(() => { const mountedView = view.current; mountedView.mounted = true; return () => { mountedView.mounted = false; }; }, []);
  const openSession = useCallback(() => {
    if (!view.current.mounted || view.current.scopeKey !== scopeKey || view.current.launchKey !== launchKey || navigation.isFocused?.() === false) return;
    const state = navigation.getState();
    const cleanup = state ? staleWidgetLauncherReset(state) : null;
    sessionTrail("widget navigation", { routes: state?.routes.map(route => route.name), active: state?.routes[state.index]?.name,
      reused: state?.routes.some(route => route.name === "session"), cleanedLaunchers: !!cleanup });
    if (cleanup) navigation.dispatch(cleanup);
    else router.dismissTo("/session");
  }, [navigation, router, scopeKey, launchKey]);
  const currentOpenSession = useCallback((routineId: string) => {
    const current = view.current.timer;
    if (!(current.hasOpenSession || current.endingSession || current.awaitingStart || current.isCompleted)) return false;
    const selected = routines.routines.find(item => item.id === routineId);
    const sameRoutine = selected && current.linkedTaskId == null && readRoutineSession(current.notes) === selected.name
      && current.duration === selected.durationSeconds && current.targetAttributeId === selected.focusAreaId;
    if (current.hasOpenSession && !sameRoutine) {
      setRunningNotice(launchKey);
      sessionTrail("widget session already open", { sameRoutine: false });
    } else openSession();
    return true;
  }, [openSession, routines.routines, launchKey]);
  useEffect(() => {
    if (!routines.scope || !routines.ready || timer.isRestoring || timer.actionBusy || typeof widgetNonce !== "string" || consumed.current === widgetNonce) return;
    consumed.current = widgetNonce;
    setError(""); setRunningNotice(null);
    const scope = routines.scope;
    const live = () => view.current.mounted && view.current.scopeKey === scopeKey && view.current.launchKey === launchKey;
    void (async () => {
      const launch = await consumeSavedRoutineWidgetLaunch(scope, widgetNonce);
      if (!live()) return;
      if (!launch) { setError("This shortcut needs refreshing. Open your routines to choose it again."); return; }
      if (currentOpenSession(launch.routineId)) return;
      const routine = await resolveSavedRoutine(scope, launch.routineId);
      if (!live()) return;
      if (!routine || routine.deletedAt !== null) { setError("This routine is no longer available. Choose another in Home."); return; }
      const restored = view.current.timer;
      if (currentOpenSession(launch.routineId)) return;
      if (restored.isRestoring || restored.actionBusy || restored.restoreError) { setError("Your saved session needs attention first. Open Home to continue."); return; }
      const pendingStart = view.current.timer.startFreeTimer(routine.durationSeconds, routine.focusAreaId, routine.name);
      // The controller owns the starting/error state. Open its timer while the
      // server reply waits, just like starting from Home.
      openSession();
      const started = await pendingStart;
      if (!live()) return;
      if (!started) setError("Your saved session needs attention first. Open Home to continue.");
    })().catch(() => { if (live()) setError("Couldn't open this routine yet. Your saved sessions are safe."); });
  }, [routines.scope, routines.ready, scopeKey, widgetNonce, timer.isRestoring, timer.actionBusy, router, currentOpenSession, openSession, launchKey]);
  const visibleError = error || routines.error || (typeof widgetNonce !== "string" ? "Open a routine from its widget or from Home." : "");
  const showRunningNotice = runningNotice !== null && runningNotice === launchKey;
  return <SafeAreaView style={p.page}>
    <ContentReveal><View style={{ padding: 24, gap: 20 }}>
      <Text style={{ color: "#F5F5F7", fontSize: 28 }}>{showRunningNotice ? "A session is already running" : visibleError ? "Your routine is here" : "Making room for your routine"}</Text>
      {!visibleError && !showRunningNotice && <ActivityIndicator />}
      {showRunningNotice && <>
        <Text style={{ color: "#A3ABC2", fontSize: 16 }} accessibilityRole="alert">Finish or end your current session before starting this routine.</Text>
        <Pressable testID="widget-return-session" accessibilityRole="button" accessibilityLabel="Return to current session" style={p.button} onPress={openSession}>
          <Text style={p.buttonText}>Return to session</Text>
        </Pressable>
      </>}
      {!!visibleError && <Text style={p.error} accessibilityRole="alert">{visibleError}</Text>}
      {!!visibleError && <PersonalButton title="Open Home" onPress={() => router.replace("/")} />}
    </View></ContentReveal>
  </SafeAreaView>;
}
