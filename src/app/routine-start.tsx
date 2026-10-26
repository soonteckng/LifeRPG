import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../components/AppText";
import ContentReveal from "../components/ContentReveal";
import { PersonalButton } from "../components/PersonalUI";
import { useTimer } from "../context/TimerContext";
import { useAuth } from "../context/AuthContext";
import { useSavedRoutines } from "../hooks/useSavedRoutines";
import { consumeSavedRoutineWidgetLaunch } from "../services/routineWidgetService";
import { resolveSavedRoutine } from "../services/savedRoutineService";
import { readRoutineSession } from "../utils/routineSession";
import { staleWidgetLauncherReset } from "../utils/widgetSessionNavigation";
import { sessionTrail } from "../services/sessionTrail";
import Pressable from "../components/MotionPressable";
import { Ionicons } from "@expo/vector-icons";
import { colors, edge, radius } from "../constants/theme";
import { durationLabel, validSessionSeconds } from "../utils/sessionSetup";
import { sessionEntry } from "../services/sessionEntry";

/**
 * The native widget supplies a one-use launch proof, never a session command.
 * It always goes to the one session screen: back to it if it's already open
 * (never a second copy on top), or in place of this page if it isn't.
 */
export default function RoutineStart() {
  const { widgetNonce } = useLocalSearchParams<{ widgetNonce?: string }>();
  const routines = useSavedRoutines(), timer = useTimer({ live: false }), router = useRouter();
  const { admissionEpoch } = useAuth();
  const navigation = useNavigation();
  const scopeKey = routines.scope ? JSON.stringify([routines.scope.backendId, routines.scope.ownerId, admissionEpoch]) : null;
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
    sessionEntry.request(view.current.timer.protectionSessionId ?? view.current.timer.sessionId, scopeKey ?? undefined);
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
      if (!validSessionSeconds(routine.durationSeconds)) { setError("Choose at least 1 minute for this routine. Edit it in Routines before starting."); return; }
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
  const currentTitle = readRoutineSession(timer.notes) ?? "Your current focus";
  const currentLength = Number.isInteger(timer.duration) && timer.duration > 0 ? `${durationLabel(timer.duration)} session` : "In progress";
  return <SafeAreaView style={s.page}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <ContentReveal key={showRunningNotice ? "running" : visibleError ? "error" : "loading"}>
        {showRunningNotice ? <View style={s.card} testID="widget-running-notice">
          <View style={s.status}><View style={s.statusDot} /><Text style={s.statusText}>ONE THING AT A TIME</Text></View>
          <View style={s.icon}><Ionicons name="time-outline" size={30} color={colors.protection} /></View>
          <Text style={s.title} accessibilityRole="header">A session is already running</Text>
          <Text style={s.copy} accessibilityRole="alert">Finish or end your current session before starting this routine.</Text>
          <View style={s.current} accessible accessibilityLabel={`${currentTitle}, ${currentLength}`}>
            <Ionicons name="play-circle-outline" size={24} color={colors.secondary} />
            <View style={s.currentCopy}><Text style={s.currentTitle} numberOfLines={2}>{currentTitle}</Text><Text style={s.currentLength}>{currentLength}</Text></View>
          </View>
        </View> : <View style={s.card}>
          <View style={s.icon}><Ionicons name={visibleError ? "information-circle-outline" : "repeat-outline"} size={30} color={colors.protection} /></View>
          <Text style={s.title} accessibilityRole="header">{visibleError ? "Your routine is here" : "Making room for your routine"}</Text>
          {!visibleError && <ActivityIndicator color={colors.primary} />}
          {!!visibleError && <Text style={s.copy} accessibilityRole="alert">{visibleError}</Text>}
          {!!visibleError && <PersonalButton title="Open Home" onPress={() => router.replace("/")} />}
        </View>}
      </ContentReveal>
    </ScrollView>
    {showRunningNotice && <View style={s.footer}>
      <ContentReveal><Pressable testID="widget-return-session" accessibilityRole="button" accessibilityLabel="Return to current session" style={s.returnButton} onPress={openSession}>
        <Ionicons name="chevron-up" size={20} color={colors.primaryText} /><Text style={s.returnText}>Return to session</Text>
      </Pressable></ContentReveal>
      <Text style={s.note}>Your current session stays open.</Text>
    </View>}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: { ...edge, backgroundColor: colors.surface, borderRadius: radius.card, padding: 24, gap: 16 },
  status: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.protection },
  statusText: { color: colors.secondary, fontSize: 11, lineHeight: 16, fontWeight: "700", letterSpacing: 1.2, flexShrink: 1 },
  icon: { width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(45,212,167,0.12)" },
  title: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "700", letterSpacing: -0.4 },
  copy: { color: colors.secondary, fontSize: 15, lineHeight: 22 },
  current: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.row, backgroundColor: colors.surfaceRaised },
  currentCopy: { flex: 1, minWidth: 0, gap: 3 },
  currentTitle: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  currentLength: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  footer: { gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: colors.line },
  returnButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 56, padding: 14, borderRadius: 28, backgroundColor: colors.primary },
  returnText: { color: colors.primaryText, fontSize: 16, lineHeight: 22, fontWeight: "700", flexShrink: 1, textAlign: "center" },
  note: { color: colors.secondary, fontSize: 12, lineHeight: 18, textAlign: "center" },
});
