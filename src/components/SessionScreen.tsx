import { focusAreaTitle, focusAreaChoices, generalArea } from "../utils/focusAreas";
import { questLists } from "../utils/questLists";
import { readSuggestedFocus } from "../constants/guidedQuests";
import TouchableOpacity from "./MotionPressable";
import { timerLayout } from "../utils/timerLayout";
import { Text } from "./AppText";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView, TouchableOpacity as SheetButton } from "@gorhom/bottom-sheet";
import { Stack, useFocusEffect, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, BackHandler, Keyboard, KeyboardAvoidingView, PanResponder, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import ProgressRing from "./ProgressRing";
import { lifeAreaColor } from "../utils/lifeAreaColor";
import AppHeader from "./AppHeader";
import SheetConfirmation from "./SheetConfirmation";
import { colors } from "../constants/theme";
import SessionCountdown from "./SessionCountdown";
import FocusLengthControl from "./FocusLengthControl";
import FocusDurationSheet from "./FocusDurationSheet";
import { useQuests } from "../context/QuestContext";
import { useTimer } from "../context/TimerContext";
import { useAuth } from "../context/AuthContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { validSessionSeconds, sessionTime } from "../utils/sessionSetup";
import { traceSession } from "../utils/sessionTransition";
import { afterTransition } from "../utils/afterTransition";
import { navigationTiming } from "../utils/navigationMotion";
import { globalSessionLifecycle } from "../services/globalSessionLifecycle";
import { sessionBackendIdentity } from "../utils/sessionBackend";
import { useSavedRoutines } from "../hooks/useSavedRoutines";
import { routinePresentation, type RoutineEntry } from "../utils/routinePresentation";
import { encodeRoutineSession, readRoutineSession } from "../utils/routineSession";
import { routineDuration } from "../utils/savedRoutine";
import SessionProtectionControl from "./SessionProtectionControl";

type Picker = "duration" | "quest" | "area" | null;

export default function SessionScreen() {
  const liveTimer = useTimer();
  const auth = useAuth();
  const onlineSurfaces = auth.accessMode !== "local-only";
  const ownerId = auth.user?.id ?? auth.localOwner?.id;
  const backendId = auth.localOwner?.backendId ?? sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId;
  const presentationScope = JSON.stringify([backendId, ownerId, auth.admissionEpoch]);
  const presentable = liveTimer.hasOpenSession || liveTimer.isCompleted || liveTimer.endingSession || liveTimer.sessionEnded;
  const [heldTimer, setHeldTimer] = useState<{ ownerId: string | undefined; timer: typeof liveTimer } | null>(() => presentable ? { ownerId, timer: liveTimer } : null);
  if (presentable && (!heldTimer || heldTimer.ownerId !== ownerId || heldTimer.timer !== liveTimer)) setHeldTimer({ ownerId, timer: liveTimer });
  const visibleTimer = useMemo(() => !presentable && heldTimer && heldTimer.ownerId === ownerId ? {
    ...heldTimer.timer, isRestoring:liveTimer.isRestoring, restoreError:liveTimer.restoreError,
    actionBusy:liveTimer.actionBusy, actionError:liveTimer.actionError,
  } : liveTimer, [presentable, heldTimer, ownerId, liveTimer]);
  const captureEndSnapshot = (source: typeof liveTimer) => ({sessionId:source.sessionId, duration:source.duration, timeLeft:source.timeLeft,
    isRunning:source.isRunning, linkedTaskId:source.linkedTaskId, targetAttributeId:source.targetAttributeId,
    activityType:source.activityType, notes:source.notes});
  const [endRequested, setEndRequested] = useState(liveTimer.endingSession || liveTimer.sessionEnded);
  const [endSnapshot, setEndSnapshot] = useState<ReturnType<typeof captureEndSnapshot> | null>(() => liveTimer.endingSession || liveTimer.sessionEnded ? captureEndSnapshot(liveTimer) : null);
  if ((liveTimer.endingSession || liveTimer.sessionEnded) && !endRequested) {
    // Recovery may arrive after the route mounts. Adopt its durable stop for
    // presentation instead of leaving an empty setup behind disabled controls.
    setEndRequested(true);
    setEndSnapshot(current => current ?? captureEndSnapshot(liveTimer));
  }
  const cancellationSaved = endRequested && !liveTimer.hasOpenSession && (liveTimer.endingSession || !liveTimer.actionError) && !liveTimer.isCompleted;
  // The stop is durable before confirmation. Keep the outgoing layout behind
  // its notice until both the popup and this screen have finished leaving.
  const endingPresentation = endRequested && (liveTimer.actionBusy || cancellationSaved);
  const timer = useMemo(() => endingPresentation && endSnapshot ? { ...visibleTimer, ...endSnapshot, hasOpenSession: true } : visibleTimer, [endingPresentation, endSnapshot, visibleTimer]);
  const insets = useSafeAreaInsets();
  const { sessionSummary, rewardsVisible } = timer;
  const { tasks, subjects, loading, error: choicesError, refresh } = useQuests();
  const routines = useSavedRoutines();
  const navigation = useNavigation();
  const reducedMotion = useReducedMotion();
  const { width, height, fontScale } = useWindowDimensions();
  const { controlWidth, labelHeight, rowHeight } = timerLayout(width, height, fontScale);
  const ringSize = Math.min(height < 700 ? 240 : 280, width - 64);
  const timerStageHeight = Math.max(300, ringSize + 24, labelHeight + rowHeight * 3 + 44);
  const ringTop = 12 + labelHeight + rowHeight * 1.5 - ringSize / 2;
  const [picker, setPicker] = useState<Picker>(null);
  const [pickerOwner, setPickerOwner] = useState(presentationScope);
  const [selectedRoutineKey, setSelectedRoutineKey] = useState<string | null>(null);
  if (pickerOwner !== presentationScope) {
    setPickerOwner(presentationScope); setPicker(null); setSelectedRoutineKey(null);
  }
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (!onlineSurfaces && (picker !== null || confirmEnd)) { setPicker(null); setConfirmEnd(false); }
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [slowControl, setSlowControl] = useState(false);
  useEffect(() => {
    if (!liveTimer.actionBusy || !liveTimer.hasOpenSession) return;
    // Keep immediate local feedback quiet, but never leave a slow confirmed
    // command looking like a tappable button that silently ignores presses.
    const pending = setTimeout(() => setSlowControl(true), 400);
    return () => { clearTimeout(pending); setSlowControl(false); };
  }, [liveTimer.actionBusy, liveTimer.hasOpenSession]);
  const timerBounds = useRef({ top: 0, bottom: 0 });
  const timerView = useRef<View>(null);
  const detailsOffset = useRef(0);
  const closing = useRef(false);
  const [exitReady, setExitReady] = useState(false);
  const [screenMotion] = useState(() => new Animated.Value(0));
  const [surfaceOpacity] = useState(() => new Animated.Value(1));
  useLayoutEffect(() => {
    if (closing.current) return;
    const animation = Animated.timing(screenMotion, { toValue: 1, ...navigationTiming(reducedMotion ? 0 : 240) });
    animation.start();
    return () => animation.stop();
  }, [screenMotion, reducedMotion]);
  const [opacity] = useState(() => new Animated.Value(1));
  const [timerTranslate] = useState(() => new Animated.Value(0));
  const stageY = useRef<number | null>(null);
  const stageAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const lastPhase = useRef<string | null>(null);
  useEffect(() => () => stageAnimation.current?.stop(), []);
  useEffect(() => {
    if (reducedMotion) {
      stageAnimation.current?.stop();
      timerTranslate.setValue(0);
    }
  }, [reducedMotion, timerTranslate]);
  const settleTimerStage = (nextY: number) => {
    const previousY = stageY.current;
    stageY.current = nextY;
    stageAnimation.current?.stop();
    if (previousY === null || reducedMotion || Math.abs(previousY - nextY) < 1) {
      timerTranslate.setValue(0);
      return;
    }
    // Offset the newly laid-out stage to its old location, then settle to zero.
    // The duration control stays mounted; the countdown geometry stays fixed.
    timerTranslate.setValue(previousY - nextY);
    stageAnimation.current = Animated.timing(timerTranslate, { toValue: 0, duration: 300, useNativeDriver: true });
    stageAnimation.current.start();
  };

  const task = tasks.find((item) => item.id === timer.linkedTaskId);
  const selectableQuests = questLists(tasks).today;
  const savedScopeMatches = routines.scope?.ownerId === ownerId && routines.scope?.backendId === backendId;
  const selectableRoutines = routinePresentation(savedScopeMatches && routines.ready ? routines.routines : [], tasks)
    .entries.filter(entry => entry.kind === "saved" || entry.task.is_due_today);
  const general = generalArea(subjects);
  const selectableAreas = focusAreaChoices(subjects, timer.targetAttributeId);
  const area = subjects.find((item) => item.id === timer.targetAttributeId);
  const locked = timer.hasOpenSession || timer.endingSession || timer.isCompleted || timer.actionBusy || timer.isRestoring;
  const isQuest = timer.linkedTaskId !== null;
  const routineName = !isQuest ? readRoutineSession(timer.notes) : null;
  const isRoutine = isQuest || !!routineName;
  const suggestion = !isQuest ? readSuggestedFocus(timer.notes) : null;
  const missingQuest = isQuest && (!task || !locked && !selectableQuests.some(item => item.id === timer.linkedTaskId));
  const phase = timer.isCompleted ? "completed" : endingPresentation && endSnapshot ? "ended" : timer.awaitingStart ? "running" : timer.hasOpenSession ? timer.isRunning ? "running" : "paused" : "setup";
  const pickerState = useRef({ scope: presentationScope, locked, entries: selectableRoutines, timer, subjects, general });
  useLayoutEffect(() => { pickerState.current = { scope: presentationScope, locked, entries: selectableRoutines, timer, subjects, general }; },
    [presentationScope, locked, selectableRoutines, timer, subjects, general]);

  useEffect(() => afterTransition(() => { void refresh(); }), [refresh]);
  useEffect(() => { if (picker === "quest") void refresh(true); }, [picker, refresh]);
  useEffect(() => { if (sessionSummary && rewardsVisible) Keyboard.dismiss(); }, [sessionSummary, rewardsVisible]);
  useEffect(() => {
    if (!locked && !isQuest && !routineName && timer.targetAttributeId === null && general) timer.setTargetAttributeId(general.id);
    if (task && timer.hasOpenSession) timer.resolveQuestTitle(task.id, task.title);
  }, [locked, isQuest, routineName, general, task, timer]);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useLayoutEffect(() => {
    if (!onlineSurfaces) Keyboard.dismiss();
  }, [onlineSurfaces]);
  useLayoutEffect(() => {
    const controlChange = (lastPhase.current === "running" || lastPhase.current === "paused") && (phase === "running" || phase === "paused");
    const changed = lastPhase.current !== null && lastPhase.current !== phase;
    lastPhase.current = phase;
    opacity.stopAnimation();
    if (reducedMotion || !changed || controlChange || phase === "ended") { opacity.setValue(1); return; }
    // Animate the visible ring, header and controls, not just the empty details.
    opacity.setValue(0);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [phase, reducedMotion, opacity]);

  const dismissLayer = useCallback(() => {
    if (Keyboard.isVisible() || keyboardVisible) { Keyboard.dismiss(); return true; }
    if (picker) { setPicker(null); return true; }
    if (confirmEnd) { setConfirmEnd(false); return true; }
    return false;
  }, [keyboardVisible, picker, confirmEnd]);
  const minimise = useCallback((source = "header") => {
    const layerDismissed = source === "completion" || source === "session-ended" ? false : dismissLayer();
    const state = navigation.getState();
    traceSession("close request", { source, layerDismissed, alreadyClosing: closing.current, navigator: state?.key, activeRoute: state?.routes[state.index]?.key, reducedMotion });
    if (layerDismissed) {
      surfaceOpacity.setValue(1);
      Animated.timing(screenMotion, { toValue: 1, duration: reducedMotion ? 0 : 180, useNativeDriver: true }).start();
      return;
    }
    if (closing.current) return;
    closing.current = true;
    // Target this screen’s native stack directly; never replace/unmount it to close.
    traceSession("native stack close", { canGoBack: navigation.canGoBack(), routeCount: navigation.getState()?.routes.length });
    if (navigation.canGoBack()) {
      traceSession("controlled exit start", { reducedMotion });
      Animated.timing(surfaceOpacity, { toValue: reducedMotion ? 1 : 0, duration: reducedMotion ? 0 : 260, useNativeDriver: true }).start();
      Animated.timing(screenMotion, { toValue: -0.12, duration: reducedMotion ? 0 : 260, useNativeDriver: true }).start(({ finished }) => {
        traceSession("controlled exit end", { finished });
        if (finished) setExitReady(true);
        else { closing.current = false; screenMotion.setValue(1); surfaceOpacity.setValue(1); }
      });
    }
    else { closing.current = false; screenMotion.setValue(1); surfaceOpacity.setValue(1); console.warn("[Session] Missing anchored back history"); }
  }, [dismissLayer, navigation, reducedMotion, screenMotion, surfaceOpacity]);
  // PanResponder registers these callbacks; it never invokes them during render.
  // eslint-disable-next-line react-hooks/refs
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => {
      return !picker && !confirmEnd && !keyboardVisible && !rewardsVisible && !closing.current
 && (gesture.y0 < timerBounds.current.top || detailsOffset.current <= 0)
        && gesture.dy > 12 && gesture.dy > Math.abs(gesture.dx) * 1.5;
    },
    onPanResponderGrant: () => { screenMotion.stopAnimation(); surfaceOpacity.stopAnimation(); },
    onPanResponderMove: (_event, gesture) => {
      if (!closing.current && !reducedMotion) {
        const fraction = Math.min(height, Math.max(0, gesture.dy)) / height;
        screenMotion.setValue(1 - fraction);
        surfaceOpacity.setValue(1 - fraction * 0.18);
      }
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > Math.max(90, height * 0.18) || (gesture.dy > 35 && gesture.vy > 0.6)) minimise("swipe-down");
      else {
        Animated.timing(surfaceOpacity, { toValue: 1, duration: reducedMotion ? 0 : 180, useNativeDriver: true }).start();
        Animated.timing(screenMotion, { toValue: 1, duration: reducedMotion ? 0 : 180, useNativeDriver: true }).start();
      }
    },
    onPanResponderTerminate: () => {
      if (!closing.current) {
        Animated.timing(surfaceOpacity, { toValue: 1, duration: reducedMotion ? 0 : 180, useNativeDriver: true }).start();
        Animated.timing(screenMotion, { toValue: 1, duration: reducedMotion ? 0 : 180, useNativeDriver: true }).start();
      }
    },
  }), [picker, confirmEnd, keyboardVisible, rewardsVisible, reducedMotion, height, screenMotion, surfaceOpacity, minimise]);

  useEffect(() => {
    traceSession("Session React mount");
    return () => traceSession("Session React unmount");
  }, []);
  useEffect(() => {
    const start = navigation.addListener("transitionStart" as never, ((event: { data: { closing: boolean } }) => {
      traceSession("native transitionStart", { closing: event.data.closing });
    }) as never);
    const end = navigation.addListener("transitionEnd" as never, ((event: { data: { closing: boolean } }) => {
      traceSession("native transitionEnd", { closing: event.data.closing });
    }) as never);
    return () => { start(); end(); };
  }, [navigation]);
  usePreventRemove((!!picker || keyboardVisible || confirmEnd) || !exitReady, () => {
    traceSession("removal deferred", { picker, keyboardVisible, confirmEnd, exitReady });
    minimise("navigation-back");
  });
  // Release the removal guard before dispatching the pop; no timeout or native
  // exit runs alongside the controlled animation.
  useEffect(() => { if (exitReady) navigation.goBack(); }, [exitReady, navigation]);
  const heldSessionSurface = useRef(liveTimer.hasOpenSession || liveTimer.isCompleted || liveTimer.endingSession || liveTimer.sessionEnded);
  const endAcknowledgement = useRef({ ownerId, sessionId:liveTimer.sessionId, viewed:liveTimer.summaryViewed });
  const pendingExit = useRef<{ ownerId: typeof ownerId; source: string } | null>(null);
  const resultSessionId = endSnapshot?.sessionId ?? visibleTimer.sessionSummary?.sessionId ?? visibleTimer.sessionId;
  useEffect(() => globalSessionLifecycle.subscribe(result => {
    if (!ownerId || result.ownerId !== ownerId || result.scope !== presentationScope || result.sessionId !== (resultSessionId ?? null)) return;
    minimise(endRequested ? "session-ended" : "completion");
  }), [ownerId, presentationScope, resultSessionId, endRequested, minimise]);
  useEffect(() => {
    const previous = endAcknowledgement.current;
    endAcknowledgement.current = { ownerId, sessionId:liveTimer.sessionId, viewed:liveTimer.summaryViewed };
    const newlyViewed = previous.ownerId === ownerId && previous.sessionId === liveTimer.sessionId
      && !previous.viewed && liveTimer.summaryViewed;
    if (newlyViewed && (liveTimer.endingSession || liveTimer.sessionEnded || endRequested)) {
      pendingExit.current = { ownerId, source:"session-ended" };
    }
    else if (liveTimer.hasOpenSession || liveTimer.isCompleted || liveTimer.endingSession || liveTimer.sessionEnded) heldSessionSurface.current = true;
    else if (heldSessionSurface.current && !liveTimer.isRestoring && !liveTimer.actionBusy && !liveTimer.restoreError
      && (!endRequested || liveTimer.summaryViewed)) {
      pendingExit.current = { ownerId, source:"settled-session" };
    }
    if (pendingExit.current?.ownerId !== ownerId) pendingExit.current = null;
    if (!pendingExit.current) return;
    let cancelled = false;
    const exit = () => {
      const requested = pendingExit.current;
      if (cancelled || !requested || requested.ownerId !== ownerId) return;
      pendingExit.current = null; minimise(requested.source);
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      const frame = globalThis.requestAnimationFrame(exit);
      return () => { cancelled = true; globalThis.cancelAnimationFrame(frame); };
    }
    void Promise.resolve().then(exit);
    return () => { cancelled = true; };
  }, [liveTimer.hasOpenSession, liveTimer.isCompleted, liveTimer.endingSession, liveTimer.sessionEnded,
    liveTimer.isRestoring, liveTimer.actionBusy, liveTimer.restoreError, liveTimer.summaryViewed,
    liveTimer.sessionId, ownerId, endRequested, minimise]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { minimise("android-back"); return true; });
    return () => subscription.remove();
  }, [minimise]));

  const applyDuration = (seconds: number) => {
    if (!validSessionSeconds(seconds)) return;
    if (seconds !== timer.duration) timer.setDurationInSeconds(seconds);
  };
  const selectMinutes = (value: number) => {
    if (locked) return;
    applyDuration(value * 60);
  };
  const start = () => {
    if (locked || missingQuest || timer.restoreError || picker || !validSessionSeconds(timer.duration)) return;
    Keyboard.dismiss();
    void timer.startTimer(timer.duration, task?.title ?? routineName ?? undefined);
  };
  const switchToFree = () => {
    if (locked) return;
    timer.setLinkedTaskId(null); timer.setNotes(""); timer.setTargetAttributeId(general?.id ?? null);
    setSelectedRoutineKey(null);
    selectMinutes(30);
  };
  const selectRoutine = (choice: RoutineEntry) => {
    const current = pickerState.current;
    if (current.scope !== presentationScope || current.locked) return;
    const entry = current.entries.find(item => item.key === choice.key);
    if (!entry || !validSessionSeconds(entry.seconds)) return;
    if (entry.kind === "saved") {
      const notes = encodeRoutineSession(entry.name);
      if (notes === null || entry.areaId !== null && !current.subjects.some(item => item.id === entry.areaId)) return;
      current.timer.setLinkedTaskId(null); current.timer.setTargetAttributeId(entry.areaId);
      current.timer.setNotes(notes); current.timer.setDurationInSeconds(entry.seconds); setSelectedRoutineKey(entry.key);
    } else {
      current.timer.setNotes(""); current.timer.setLinkedTaskId(entry.task.id);
      current.timer.setTargetAttributeId(entry.areaId ?? current.general?.id ?? null);
      current.timer.setDurationInMinutes(entry.seconds / 60); setSelectedRoutineKey(null);
    }
    setPicker(null);
  };
  const retry = () => {
    if (timer.restoreError) timer.retryRestore();
    else if (timer.isCompleted) void timer.retryCompletion();
    else if (timer.hasOpenSession) void timer.retryAction();
    else start();
  };
  const title = (timer.sessionSummary?.questTitle !== "Quest session" ? timer.sessionSummary?.questTitle : undefined) || (isQuest ? task?.title ?? (loading ? "Loading routine…" : "Routine unavailable") : suggestion?.title ?? routineName ?? "Free session");
  const status = phase === "ended" ? "Session ended" : timer.isRestoring ? "Restoring your session…" : timer.awaitingStart ? "Checking your saved start…"
    : timer.endingSession ? "Session ended"
    : timer.isCompleted ? timer.sessionSummary ? "Time recorded" : timer.syncStatus === "rejected" ? "Kept on this phone. Your account did not accept it." : "Saved on this phone. Waiting to sync."
    : timer.hasOpenSession ? timer.isRunning ? "Session in progress" : "Paused" : "Ready when you are";
  const displayedSeconds = phase === "setup" ? timer.duration
    : phase === "completed" && sessionSummary ? sessionSummary.durationSeconds
    : timer.timeLeft;
  const breakActive = timer.breakSecondsLeft > 0;
  const breakSpent = timer.protectedSession && timer.breakUsed && !breakActive;
  const disabled = breakSpent || cancellationSaved || timer.endingSession || timer.actionBusy || timer.isRestoring || timer.restoreError || timer.awaitingStart || (timer.hasOpenSession && timer.syncStatus === "waiting") || (!timer.hasOpenSession && (missingQuest || !validSessionSeconds(timer.duration) || !!picker));
  const immediateControl = timer.hasOpenSession || timer.awaitingStart || endRequested;
  const controlPending = timer.actionBusy && (slowControl || !timer.interactionKind);
  const checkingStart = timer.awaitingStart && !timer.interactionKind;
  const actionLabel = breakActive ? "End break early" : timer.protectedSession && timer.hasOpenSession ? breakSpent ? "Break used" : "5-min break" : phase === "ended" ? "Stopped" : checkingStart ? "Checking start" : timer.awaitingStart ? "Pause" : timer.hasOpenSession ? timer.isRunning ? "Pause" : "Resume" : "Start";
  const needsRecovery = !cancellationSaved && !timer.endingSession && !timer.isCompleted
    && (timer.restoreError || timer.actionError || timer.syncStatus === "waiting" && !timer.interactionKind);
  const recoveryMessage = timer.awaitingStart ? "Checking the session saved on this phone. You can end it while we confirm its start."
    : timer.syncStatus === "waiting" ? timer.isCompleted ? "Your finished session is saved on this phone. We’ll confirm it when you reconnect." : "Waiting to confirm your saved session state."
    : timer.actionError ?? "Couldn’t restore your session. Retry before starting a new one.";

  return (
    <Animated.View testID="session-surface" style={{ flex: 1, backgroundColor: colors.background, opacity: surfaceOpacity,
      transform: [{ translateY: !reducedMotion ? screenMotion.interpolate({ inputRange: [-0.12, 0, 1], outputRange: [height + insets.top + insets.bottom + 32, height, 0] }) : 0 }] }}>
    <SafeAreaView collapsable={false} style={styles.screen} {...panResponder.panHandlers}
      onTouchStart={() => timerView.current?.measureInWindow((_x, y, _width, height) => { timerBounds.current = { top: y, bottom: y + height }; })}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Animated.View testID="session-header-motion" style={{ opacity }}><AppHeader centered title={phase === "ended" ? "Session ended" : phase === "setup" ? isRoutine ? "Routine session" : "New session" : phase === "completed" && sessionSummary ? "Session complete" : area?.title ? focusAreaTitle(area.title) : "Session"} dismiss onBack={() => minimise("header")} backLabel={timer.hasOpenSession ? "Minimise session" : "Close session"} /></Animated.View>
      {!timer.isCompleted && phase !== "ended" && <View style={{ paddingHorizontal: 20 }}><SessionProtectionControl statusOnly activeSurface={onlineSurfaces} /></View>}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View ref={timerView} onLayout={() => timerView.current?.measureInWindow((_x, y, _width, height) => { timerBounds.current = { top: y, bottom: y + height }; })}
          importantForAccessibility={timer.isCompleted ? "no-hide-descendants" : "auto"}
          testID="session-timer-anchor" style={[styles.timerAnchor, (phase !== "setup" || isQuest) && styles.activeTimerAnchor,
            { minHeight: timerStageHeight }, timer.isCompleted && {opacity:0}]}>
          <Animated.View testID="session-timer-stage" onLayout={event => settleTimerStage(event.nativeEvent.layout.y)}
            style={[styles.timerStage, { height:timerStageHeight, transform:[{translateY:timerTranslate}] }]}>
          <Animated.View pointerEvents="none" style={[styles.ringLayer, { opacity, top: ringTop }]}>
            {(phase !== "setup" || isQuest) && <ProgressRing size={ringSize}
              progress={breakActive ? 1 - timer.breakSecondsLeft / 300 : phase === "setup" ? 0 : Math.max(0, Math.min(1, 1 - timer.timeLeft / Math.max(1, timer.duration)))}
              color={breakActive ? "#F5B84B" : phase === "completed" ? colors.accent : phase === "setup" && isQuest ? lifeAreaColor(timer.targetAttributeId, area?.color_code) : colors.success} />}
          </Animated.View>
          <View style={[styles.timerControl, { width: controlWidth }]}>
            <SessionCountdown seconds={breakActive ? timer.breakSecondsLeft : displayedSeconds}
              compact caption={breakActive ? "break left · time is not recorded" : phase === "setup" ? isQuest ? "Planned focus" : undefined : `of ${sessionTime(timer.duration)}`} />
          </View>
          <Text style={[styles.status, (phase === "running" || phase === "paused" || phase === "ended" || (phase === "completed" && !!sessionSummary)) && styles.hiddenStatus]} accessibilityLiveRegion="polite">{phase === "setup" ? "" : phase === "completed" && sessionSummary ? sessionSummary.goalReachedNow ? "Daily goal reached" : "Your progress has been saved." : status}</Text>
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Session progress"
            accessibilityValue={{ min: 0, max: timer.duration, now: phase === "setup" ? 0 : timer.duration - timer.timeLeft }} />
          </Animated.View>
        </View>
        <ScrollView style={phase === "setup" && !isQuest ? styles.flex : [styles.activeDetails, phase === "setup" && { maxHeight: Math.max(100, height - timerStageHeight - 220) }]} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEventThrottle={16} onScroll={(event) => { detailsOffset.current = Math.max(0, event.nativeEvent.contentOffset.y); }}>
          <Animated.View testID="session-details-motion" style={{ opacity, transform:[{ translateY:opacity.interpolate({inputRange:[0,1],outputRange:[8,0]}) }] }}>
          {breakActive && <Text style={styles.activeTitle} accessibilityRole="timer">Break · {sessionTime(timer.breakSecondsLeft)} left. Apps unlock now and protection returns automatically.</Text>}
          {phase !== "setup" && !timer.isCompleted && <Text style={styles.activeTitle} accessibilityRole="header">{phase === "ended" ? `${title} · Ended` : timer.awaitingStart ? `${title} · Checking start` : timer.isRunning ? isRoutine || suggestion ? title : `${focusAreaTitle(area?.title)} · Free session` : `${title} · Paused`}</Text>}
            {suggestion && !timer.isCompleted && <View style={styles.suggestionInstruction}><Text style={[styles.secondary, { textAlign: "center" }]} numberOfLines={3}>{suggestion.instruction}</Text></View>}
            {phase === "setup" && <View style={styles.setup}>
              {(loading || timer.isRestoring) && <ActivityIndicator color={colors.accent} />}
              {(choicesError || missingQuest) && <View>
                <Text style={styles.secondary}>{missingQuest ? task ? "This routine is already done or isn’t scheduled for today. Choose another routine or switch to a free session." : "Your routine is still linked. Reload its details before starting, or switch to a free session." : "Couldn’t load your choices."}</Text>
                <Action label="Reload choices" onPress={() => void refresh()} />
              </View>}
              {!isQuest && <FocusLengthControl seconds={timer.duration} disabled={locked} onChange={applyDuration} onCustom={() => setPicker("duration")} />}
              {!isQuest && <>
                <View style={styles.areaSection}>
                  <Text style={styles.secondary}>Focus area</Text>
                  <View style={styles.areaChips}>
                    {selectableAreas.slice(0, 6).map(item => <TouchableOpacity key={item.id} disabled={locked}
                      onPress={() => timer.setTargetAttributeId(item.id)} accessibilityRole="button"
                      accessibilityLabel={`Select ${focusAreaTitle(item.title)}`} accessibilityState={{ selected: item.id === timer.targetAttributeId }}
                      style={styles.areaChip}>
                      <View pointerEvents="none" style={[styles.chipSurface, item.id === timer.targetAttributeId && { backgroundColor: lifeAreaColor(item.id, item.color_code) + "1A" }]} />
                      <Text style={[styles.chipText, item.id === timer.targetAttributeId && { color: lifeAreaColor(item.id, item.color_code) }]}>{focusAreaTitle(item.title)}</Text>
                    </TouchableOpacity>)}
                    {selectableAreas.length > 6 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose focus area" disabled={locked} onPress={() => setPicker("area")} style={styles.areaChip}><View pointerEvents="none" style={styles.chipSurface} /><Text style={styles.chipText}>See all areas</Text></TouchableOpacity>}
                  </View>
                </View>
              </>}
              {isRoutine ? <>
                <TouchableOpacity disabled={locked} style={styles.selectedQuestCard} onPress={() => setPicker("quest")}
                  accessibilityRole="button" accessibilityLabel="Change routine" accessibilityHint={`Selected routine: ${title}`}>
                  <View style={[styles.selectedQuestIcon, { backgroundColor: lifeAreaColor(timer.targetAttributeId, area?.color_code) + "18" }]}>
                    <Ionicons name="flag-outline" size={23} color={lifeAreaColor(timer.targetAttributeId, area?.color_code)} />
                  </View>
                  <View style={styles.selectedQuestContent}>
                    <Text style={styles.selectedQuestTitle}>{title}</Text>
                    <Text style={[styles.selectedQuestArea, {color: lifeAreaColor(timer.targetAttributeId, area?.color_code)}]}>{focusAreaTitle(area?.title)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
                </TouchableOpacity>
                <Action disabled={locked} label="Switch to free session" onPress={switchToFree} />
              </> : <TouchableOpacity disabled={locked} style={styles.questRow} onPress={() => setPicker("quest")}
                accessibilityRole="button" accessibilityLabel="Choose from routines">
                <Text style={styles.secondary}>Routine<Text style={styles.helper}> · Optional</Text></Text>
                <Text style={styles.choiceValue}>None</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.secondary} />
              </TouchableOpacity>}
            </View>}

          </Animated.View>
        </ScrollView>
        <Animated.View testID="session-actions-motion" style={[styles.actions, {opacity}]}>
          {needsRecovery && <View testID="session-recovery-actions">
            <Text style={timer.syncStatus === "waiting" ? styles.secondary : styles.error} accessibilityRole={timer.syncStatus === "waiting" ? undefined : "alert"}>{recoveryMessage}</Text>
            <Action label="Retry" disabled={ timer.actionBusy || timer.isRestoring} onPress={retry} />
          </View>}
          {!timer.isCompleted && <>
            <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.primary, styles.flex, timer.hasOpenSession && styles.activePrimary, disabled && (!immediateControl || controlPending) && styles.disabled]} disabled={disabled}
              onPress={timer.hasOpenSession ? () => void (breakActive ? timer.resumeTimer() : timer.isRunning ? timer.pauseTimer() : timer.resumeTimer()) : start}
              accessibilityRole="button" accessibilityState={{ busy: timer.actionBusy, disabled }} accessibilityLabel={actionLabel}>
              {timer.actionBusy && !immediateControl ? <ActivityIndicator color={colors.background} /> : <>{controlPending ? <ActivityIndicator color={timer.hasOpenSession ? colors.text : colors.background} /> : <Ionicons name={timer.isRunning ? "pause" : "play"} size={18} color={timer.hasOpenSession ? colors.text : colors.background} />}<Text style={[styles.primaryText, timer.hasOpenSession && { color: colors.text }]}>{timer.hasOpenSession ? actionLabel : "Start session"}</Text></>}
            </TouchableOpacity>
            {timer.hasOpenSession && phase !== "ended" && <TouchableOpacity accessibilityRole="button" accessibilityLabel="End session" disabled={timer.actionBusy || timer.endingSession} onPress={() => setConfirmEnd(true)} style={styles.endControl}><Ionicons name="close" size={23} color={colors.text} /></TouchableOpacity>}
            </View>
            {timer.hasOpenSession && phase !== "ended" && <Text style={styles.cancelHint}>Ending now doesn’t save this session.</Text>}
          </>}
        </Animated.View>
      </KeyboardAvoidingView>
      <AppSheet visible={onlineSurfaces && !sessionSummary && (picker === "quest" || picker === "area")} onRequestClose={() => setPicker(null)} label="session choices" compact maxHeightRatio={0.82}
        header={<Text style={styles.pickerTitle}>{picker === "quest" ? "Choose from routines" : "Focus area"}</Text>}>
        <BottomSheetScrollView contentContainerStyle={[styles.pickerBody, picker === "quest" && styles.questPickerBody, {paddingBottom: Math.max(insets.bottom, 16) + 12}]} showsVerticalScrollIndicator={false}>
          {picker === "area" && <SheetChoice label={focusAreaTitle()} onPress={() => { timer.setTargetAttributeId(general?.id ?? null); setPicker(null); }} />}
          {picker === "area" && selectableAreas.filter((item) => item.id !== general?.id).map((item) => <SheetChoice key={item.id} label={focusAreaTitle(item.title)} onPress={() => { timer.setTargetAttributeId(item.id); setPicker(null); }} />)}
          {picker === "quest" && selectableRoutines.map((item) => {
            const questArea = subjects.find(subject => subject.id === item.areaId);
            const tint = lifeAreaColor(item.areaId, questArea?.color_code);
            const selected = item.kind === "legacy" ? timer.linkedTaskId === item.task.id : selectedRoutineKey === item.key && routineName === item.name;
            return <SheetButton key={item.key} style={[styles.questPickerCard, selected && styles.questPickerSelected]}
              accessibilityRole="button" accessibilityLabel={`Choose ${item.name}`} accessibilityState={{selected}}
              disabled={locked || item.kind === "saved" && item.areaId !== null && !subjects.some(area => area.id === item.areaId)}
              onPress={() => selectRoutine(item)}>
              <View style={[styles.questPickerIcon, {backgroundColor: `${tint}18`}]}><Ionicons name="flag-outline" size={21} color={tint} /></View>
              <View style={styles.selectedQuestContent}>
                <Text style={styles.questPickerTitle}>{item.name}</Text>
                <Text style={styles.questPickerMeta}>{routineDuration(item.seconds)} · {focusAreaTitle(questArea?.title)}</Text>
              </View>
              <Ionicons name={selected ? "checkmark-circle" : "chevron-forward"} size={20} color={selected ? colors.accent : colors.secondary} />
            </SheetButton>;
          })}
          {picker === "quest" && selectableRoutines.length === 0 && <View style={styles.questPickerEmpty}>
            <Ionicons name="flag-outline" size={28} color={colors.accent} />
            <Text style={styles.questPickerTitle}>{loading || !routines.ready ? "Loading routines…" : "No routines yet"}</Text>
            {!loading && <Text style={styles.secondary}>You can still start a free session.</Text>}
          </View>}
          {choicesError && <SheetChoice label="Couldn’t load choices. Retry" onPress={() => void refresh()} />}
        </BottomSheetScrollView>
      </AppSheet>
      <FocusDurationSheet visible={onlineSurfaces && !sessionSummary && picker === "duration"} seconds={timer.duration} disabled={locked} onClose={() => setPicker(null)} onSave={applyDuration} />
      {onlineSurfaces && confirmEnd && !sessionSummary && <SheetConfirmation title="End this session?" message="This cancels the current session instead of completing it. Completion rewards will not be awarded." cancelLabel="Keep session" confirmLabel="End session"
        onCancel={() => setConfirmEnd(false)} onConfirm={() => { setConfirmEnd(false); setEndSnapshot(captureEndSnapshot(timer)); setEndRequested(true); void liveTimer.resetTimer(); }} />}
    </SafeAreaView>
    </Animated.View>
  );
}

function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity style={styles.smallAction} disabled={disabled} onPress={onPress} accessibilityRole="button"><Text style={styles.link}>{label}</Text></TouchableOpacity>;
}
function SheetChoice({ label, detail, onPress }: { label: string; detail?: string; onPress: () => void }) {
  return <SheetButton style={styles.pickerRow} onPress={onPress} accessibilityRole="button"><Text style={styles.label}>{label}</Text>{detail && <Text style={styles.secondary}>{detail}</Text>}</SheetButton>;
}

const styles = StyleSheet.create({
  suggestionInstruction: { paddingHorizontal: 12, paddingVertical: 6, marginTop: 6, marginBottom: 8 },
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  ringLayer: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" },
  activeDetails: { flexGrow: 0, maxHeight: 260 },
  timerStage: { width: "100%", alignItems: "center", paddingTop: 4 },
  activeTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", letterSpacing: -0.3, textAlign: "center", marginTop: 6 },
  areaSection: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 14, gap: 6 },
  areaChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  areaChip: { minHeight: 44, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  chipSurface: { position: "absolute", left: 0, right: 0, top: 4, bottom: 4, borderRadius: 20, backgroundColor: colors.surface },
  presetSurface: { position: "absolute", left: 0, right: 0, top: 2, bottom: 2, borderRadius: 14, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  areaDot: { width: 8, height: 8, borderRadius: 4 },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  actionRow: { flexDirection: "row", gap: 10 },
  activePrimary: { backgroundColor: colors.surface, borderColor: colors.line },
  endControl: { width: 56, minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  cancelHint: { color: colors.secondary, fontSize: 12, textAlign: "center", lineHeight: 18, paddingTop: 8 },
  activeTimerAnchor: { flex: 1 },
  timerAnchor: { paddingHorizontal: 20, paddingBottom: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  compactAnchor: { paddingTop: 0, paddingBottom: 4 },
  timerControl: { width: 286, maxWidth: "100%", paddingTop: 8 },
  status: { color:colors.secondary, fontSize:16, lineHeight:23, textAlign:"center", marginTop:8 },
  hiddenStatus: { position:"absolute", width:1, height:1, overflow:"hidden", color:colors.background },
  body: { paddingHorizontal: 20, paddingBottom: 20 },
  secondary: { color: colors.secondary, fontSize: 16, lineHeight: 23 },
  setup: { gap: 12, marginTop: 0, padding: 16, borderRadius: 22, backgroundColor: colors.focusSurface },
  label: { color: colors.text, fontSize: 17, flexShrink: 1 },
  chipText: { color: colors.neutral, fontSize: 16, fontWeight: "500" },
  link: { color: colors.accent, fontSize: 16, fontWeight: "500" },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  choiceValue: { color: colors.secondary, flex: 1, textAlign: "right", fontSize: 16 },
  presets: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 12, paddingBottom: 6 },
  preset: { flex: 1, maxWidth: 76, minWidth: 52, minHeight: 48, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", borderRadius: 14 },
  presetLarge: { minWidth: 80, maxWidth: 110, minHeight: 58 },
  presetSelected: { backgroundColor: colors.primary, borderColor: colors.border, borderWidth: 1 },
  presetText: { color: colors.neutral, fontSize: 17, lineHeight: 23, fontWeight: "500", fontVariant: ["tabular-nums"] },
  presetTextSelected: { color: colors.primaryText, fontWeight: "600" },
  questPickerBody: { gap: 10 },
  questPickerCard: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 82, padding: 14, borderRadius: 18, backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  questPickerSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  questPickerIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  questPickerTitle: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: "500" },
  questPickerMeta: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  questPickerEmpty: { alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 28 },
  selectedQuestCard: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  selectedQuestIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  selectedQuestContent: { flex: 1, minWidth: 0, gap: 5 },
  selectedQuestTitle: { color: colors.text, fontSize: 19, lineHeight: 25, fontWeight: "500", letterSpacing: -0.3 },
  selectedQuestArea: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  questRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 48, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  smallAction: { minHeight: 44, paddingVertical: 10, justifyContent: "center", alignItems: "center" },
  actions: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 4 },
  primary: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.18)", minHeight: 56, padding: 14, borderRadius: 20, backgroundColor: colors.primary, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 },
  primaryText: { color: colors.background, fontSize: 17, fontWeight: "500" },
  disabled: { opacity: 0.5 }, error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  summary: { gap: 14, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 14 }, summaryValue: { color: colors.text, fontSize: 30, fontWeight: "500", letterSpacing: -0.7 },
  pickerTitle: { color: colors.text, fontSize: 21, fontWeight: "500", paddingHorizontal: 20, paddingBottom: 16 },
  pickerBody: { paddingHorizontal: 20, paddingBottom: 40 },
  pickerRow: { minHeight: 52, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: 4 },
});
