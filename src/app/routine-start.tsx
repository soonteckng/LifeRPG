import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../components/AppText";
import ContentReveal from "../components/ContentReveal";
import { PersonalButton, p } from "../components/PersonalUI";
import { useTimer } from "../context/TimerContext";
import { useSavedRoutines } from "../hooks/useSavedRoutines";
import { consumeSavedRoutineWidgetLaunch } from "../services/routineWidgetService";
import { resolveSavedRoutine } from "../services/savedRoutineService";

/** The native widget supplies a one-use launch proof, never a session command. */
export default function RoutineStart() {
  const { widgetNonce } = useLocalSearchParams<{ widgetNonce?: string }>();
  const routines = useSavedRoutines(), timer = useTimer(), router = useRouter();
  const scopeKey = routines.scope ? JSON.stringify(routines.scope) : null;
  const [error, setError] = useState("");
  const consumed = useRef<string | null>(null);
  const view = useRef({ mounted: true, scopeKey, timer });
  useLayoutEffect(() => { view.current.scopeKey = scopeKey; view.current.timer = timer; }, [scopeKey, timer]);
  useEffect(() => { const mountedView = view.current; mountedView.mounted = true; return () => { mountedView.mounted = false; }; }, []);
  useEffect(() => {
    if (!routines.scope || !routines.ready || timer.isRestoring || timer.actionBusy || typeof widgetNonce !== "string" || consumed.current === widgetNonce) return;
    consumed.current = widgetNonce;
    const scope = routines.scope;
    const live = () => view.current.mounted && view.current.scopeKey === scopeKey;
    void (async () => {
      const launch = await consumeSavedRoutineWidgetLaunch(scope, widgetNonce);
      if (!live()) return;
      if (!launch) { setError("This shortcut needs refreshing. Open your routines to choose it again."); return; }
      const current = view.current.timer;
      if (current.hasOpenSession || current.endingSession || current.awaitingStart || current.isCompleted) { router.replace("/session"); return; }
      const routine = await resolveSavedRoutine(scope, launch.routineId);
      if (!live()) return;
      if (!routine || routine.deletedAt !== null) { setError("This routine is no longer available. Choose another in Home."); return; }
      const restored = view.current.timer;
      if (restored.hasOpenSession || restored.endingSession || restored.awaitingStart || restored.isCompleted) { router.replace("/session"); return; }
      if (restored.isRestoring || restored.actionBusy || restored.restoreError) { setError("Your saved session needs attention first. Open Home to continue."); return; }
      const pendingStart = view.current.timer.startFreeTimer(routine.durationSeconds, routine.focusAreaId, routine.name);
      // The controller owns the starting/error state. Open its timer while the
      // server reply waits, just like starting from Home.
      router.replace("/session");
      const started = await pendingStart;
      if (!live()) return;
      if (!started) setError("Your saved session needs attention first. Open Home to continue.");
    })().catch(() => { if (live()) setError("Couldn't open this routine yet. Your saved sessions are safe."); });
  }, [routines.scope, routines.ready, scopeKey, widgetNonce, timer.isRestoring, timer.actionBusy, router]);
  const visibleError = error || routines.error || (typeof widgetNonce !== "string" ? "Open a routine from its widget or from Home." : "");
  return <SafeAreaView style={p.page}>
    <ContentReveal><View style={{ padding: 24, gap: 20 }}>
      <Text style={{ color: "#F5F5F7", fontSize: 28 }}>{visibleError ? "Your routine is here" : "Making room for your routine"}</Text>
      {!visibleError && <ActivityIndicator />}
      {!!visibleError && <Text style={p.error} accessibilityRole="alert">{visibleError}</Text>}
      {!!visibleError && <PersonalButton title="Open Home" onPress={() => router.replace("/")} />}
    </View></ContentReveal>
  </SafeAreaView>;
}
