import { focusAreaTitle, focusAreaChoices, focusAreaHint, focusAreaIcon, generalArea, suggestedArea } from "../utils/focusAreas";
import { questLists } from "../utils/questLists";
import { readSuggestedFocus } from "../constants/guidedQuests";
import TouchableOpacity from "./MotionPressable";
import { timerLayout } from "../utils/timerLayout";
import { Text } from "./AppText";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import SheetButton from "./SheetTouchable";
import { Stack, useFocusEffect, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Animated, BackHandler, Keyboard, KeyboardAvoidingView, PanResponder, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import ProgressRing from "./ProgressRing";
import { areaTint, lifeAreaColor } from "../utils/lifeAreaColor";
import AppHeader from "./AppHeader";
import SheetConfirmation from "./SheetConfirmation";
import { colors, radius, edge } from "../constants/theme";
import SessionCountdown from "./SessionCountdown";
import FocusLengthControl from "./FocusLengthControl";
import FocusAreaPicker from "./FocusAreaPicker";
import SheetHeader from "./SheetHeader";
import FocusDurationSheet from "./FocusDurationSheet";
import { useQuests } from "../context/QuestContext";
import { useTimer } from "../context/TimerContext";
import { useAuth } from "../context/AuthContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { validSessionSeconds, sessionTime } from "../utils/sessionSetup";
import { traceSession } from "../utils/sessionTransition";
import { afterTransition } from "../utils/afterTransition";
import { offlineAppAvailable } from "../utils/offlineApp";
import OfflineStatus from "./OfflineStatus";
import { navigationTiming } from "../utils/navigationMotion";
import { globalSessionLifecycle } from "../services/globalSessionLifecycle";
import { sessionBackendIdentity } from "../utils/sessionBackend";
import { readRoutineSession } from "../utils/routineSession";
import SessionProtectionControl from "./SessionProtectionControl";
import SubjectSetupRow from "./SubjectSetupRow";
import { useSetupMode } from "../hooks/useSetupMode";
import { setupMode, type SetupMode } from "../services/setupMode";
import { studySelection } from "../services/studySelection";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { countdownLabel, daysUntil, studyTime, upcomingExams, weekSeconds } from "../utils/studyPlan";
import SessionBackdrop, { SessionIntroWords } from "./session/SessionBackdrop";
import { rewardsStore } from "../hooks/useRewards";
import SessionReveal from "./session/SessionReveal";
import { sessionTrail } from "../services/sessionTrail";
import { sessionReturn, sessionReturnKey, sessionRevealHost } from "../services/sessionReturn";
import { sessionEntry } from "../services/sessionEntry";

type Picker = "duration" | "area" | null;
/** At most this long the night scene waits for a started session to show. */
const LAUNCH_WAIT_MS = 4000;
/** How long a requested pop may take before the screen shows itself again. */
const LOST_EXIT_MS = 900;
// useTimer merges its live clock into a new object on each render. Comparing
// that wrapper's identity would schedule another render forever; compare the
// actual fields so only a real timer change updates the outgoing snapshot.
function sameTimerSnapshot(previous: ReturnType<typeof useTimer>, next: ReturnType<typeof useTimer>) {
  const keys = Object.keys(next) as (keyof typeof next)[];
  return Object.keys(previous).length === keys.length && keys.every(key => Object.is(previous[key], next[key]));
}

export default function SessionScreen() {
  const liveTimer = useTimer();
  const auth = useAuth();
  // This screen is on show online, and offline too unless saved work needs
  // the separate recovery screen; sheets and pickers close when it is hidden.
  const online = auth.accessMode !== "local-only";
  const onlineSurfaces = online || offlineAppAvailable(liveTimer);
  const ownerId = auth.user?.id ?? auth.localOwner?.id;
  const backendId = auth.localOwner?.backendId ?? sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId;
  const presentationScope = JSON.stringify([backendId, ownerId, auth.admissionEpoch]);
  const currentPresentationScope = useRef(presentationScope);
  useLayoutEffect(() => { currentPresentationScope.current = presentationScope; }, [presentationScope]);
  const presentable = liveTimer.hasOpenSession || liveTimer.isCompleted || liveTimer.endingSession || liveTimer.sessionEnded;
  const [heldTimer, setHeldTimer] = useState<{ scope: string; timer: typeof liveTimer } | null>(() => presentable ? { scope: presentationScope, timer: liveTimer } : null);
  if (presentable && (!heldTimer || heldTimer.scope !== presentationScope || !sameTimerSnapshot(heldTimer.timer, liveTimer))) setHeldTimer({ scope: presentationScope, timer: liveTimer });
  const visibleTimer = useMemo(() => !presentable && heldTimer && heldTimer.scope === presentationScope ? {
    ...heldTimer.timer, isRestoring:liveTimer.isRestoring, restoreError:liveTimer.restoreError,
    actionBusy:liveTimer.actionBusy, actionError:liveTimer.actionError,
  } : liveTimer, [presentable, heldTimer, presentationScope, liveTimer]);
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
  const returningKey = useSyncExternalStore(sessionReturn.subscribe, sessionReturn.snapshot, sessionReturn.snapshot);
  const ownReturnKey = sessionReturnKey(presentationScope, timer.sessionId);
  const returning = !!ownReturnKey && returningKey === ownReturnKey;
  const finishReturn = useCallback(() => { if (ownReturnKey) sessionReturn.finish(ownReturnKey); }, [ownReturnKey]);
  const { tasks, subjects, loading, error: choicesError, refresh } = useQuests();
  const study = useStudyPlan();
  const navigation = useNavigation();
  const reducedMotion = useReducedMotion();
  const { width, height, fontScale } = useWindowDimensions();
  const { controlWidth, labelHeight, rowHeight } = timerLayout(width, height, fontScale);
  const ringSize = Math.min(height < 700 ? 240 : 280, width - 64);
  const timerStageHeight = Math.max(300, ringSize + 24, labelHeight + rowHeight * 3 + 44);
  const ringTop = 12 + labelHeight + rowHeight * 1.5 - ringSize / 2;
  const [picker, setPicker] = useState<Picker>(null);
  const [pickerOwner, setPickerOwner] = useState(presentationScope);
  if (pickerOwner !== presentationScope) {
    setPickerOwner(presentationScope); setPicker(null);
  }
  const [confirmEnd, setConfirmEnd] = useState(false);
  // A protected session's one break is easy to tap by mistake, so it asks first.
  const [confirmBreak, setConfirmBreak] = useState(false);
  // End can be asked for while the start (or a break) is still being
  // confirmed. It then waits for that answer and ends right after it, so the
  // ✕ always responds and a session is never left half-ended.
  const [endQueued, setEndQueued] = useState(false);
  if (!onlineSurfaces && (picker !== null || confirmEnd)) { setPicker(null); setConfirmEnd(false); }
  // The last seconds are already earned; never offer to discard them.
  if (liveTimer.finishing && confirmEnd) setConfirmEnd(false);
  // A session that reaches its end (or closes) while End waits keeps its time.
  if (endQueued && (liveTimer.finishing || !liveTimer.hasOpenSession || liveTimer.endingSession)) setEndQueued(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [slowControl, setSlowControl] = useState(false);
  useEffect(() => {
    if (!liveTimer.actionBusy || !liveTimer.hasOpenSession) return;
    // Keep immediate local feedback quiet, but never leave a slow confirmed
    // command looking like a tappable button that silently ignores presses.
    const pending = setTimeout(() => setSlowControl(true), 400);
    return () => { clearTimeout(pending); setSlowControl(false); };
  }, [liveTimer.actionBusy, liveTimer.hasOpenSession]);
  const endNow = () => { setEndSnapshot(captureEndSnapshot(liveTimer)); setEndRequested(true); void liveTimer.resetTimer(); };
  useEffect(() => {
    if (!endQueued || liveTimer.actionBusy) return;
    // The queued End runs just after the confirmation lands, never twice.
    let live = true;
    void Promise.resolve().then(() => { if (live) { setEndQueued(false); endNow(); } });
    return () => { live = false; };
    // endNow reads the latest timer; it only runs once the queued End is due.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endQueued, liveTimer.actionBusy]);
  const timerBounds = useRef({ top: 0, bottom: 0 });
  const timerView = useRef<View>(null);
  const detailsOffset = useRef(0);
  const closing = useRef(false);
  const [exitReady, setExitReady] = useState(false);
  const exitReadyRef = useRef(exitReady);
  useEffect(() => { exitReadyRef.current = exitReady; }, [exitReady]);
  const [screenMotion] = useState(() => new Animated.Value(0));
  const [surfaceOpacity] = useState(() => new Animated.Value(1));
  const entryRequest = useSyncExternalStore(sessionEntry.subscribe, sessionEntry.snapshot, sessionEntry.snapshot);
  const entrySessionId = liveTimer.protectionSessionId ?? liveTimer.sessionId;
  const entered = useRef(false);
  const motionGeneration = useRef(0);
  const entranceAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const enterScreen = useCallback(() => {
    // Widget navigation keeps the one Session route mounted. An explicit
    // widget/dock entry replays its slide; returning from Outfits does not.
    if (navigation.isFocused?.() === false) return false;
    const requested = sessionEntry.take(entryRequest, entrySessionId, presentationScope);
    if (entered.current && !requested) return false;
    entered.current = true;
    motionGeneration.current++;
    closing.current = false; exitReadyRef.current = false; setExitReady(false);
    entranceAnimation.current?.stop(); screenMotion.stopAnimation(); surfaceOpacity.stopAnimation();
    surfaceOpacity.setValue(1); screenMotion.setValue(reducedMotion ? 1 : 0);
    if (!reducedMotion) {
      const animation = Animated.timing(screenMotion, { toValue: 1, ...navigationTiming(240) });
      entranceAnimation.current = animation;
      animation.start();
    }
    return true;
  }, [navigation, entryRequest, entrySessionId, presentationScope, screenMotion, surfaceOpacity, reducedMotion]);
  useLayoutEffect(() => {
    return () => {
      // This counter fences callbacks, not a native view ref. Invalidate the
      // latest generation on unmount, including entries since this effect ran.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      motionGeneration.current++;
      entered.current = false; entranceAnimation.current?.stop();
    };
  }, []);
  useLayoutEffect(() => {
    if (enterScreen()) return;
    if (reducedMotion && !closing.current) {
      entranceAnimation.current?.stop(); screenMotion.setValue(1); surfaceOpacity.setValue(1);
    }
  }, [enterScreen, reducedMotion, screenMotion, surfaceOpacity]);
  const [opacity] = useState(() => new Animated.Value(1));
  const [timerTranslate] = useState(() => new Animated.Value(0));
  const stageY = useRef<number | null>(null);
  const stagePhase = useRef<string | null>(null);
  const stageAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const [activeLayout, setActiveLayout] = useState<{ details?: number; actions?: number }>({});
  const lastPhase = useRef<string | null>(null);
  useEffect(() => () => stageAnimation.current?.stop(), []);
  useEffect(() => {
    if (reducedMotion) {
      stageAnimation.current?.stop();
      timerTranslate.setValue(0);
    }
  }, [reducedMotion, timerTranslate]);
  const settleTimerStage = (nextY: number) => {
    const previousY = stageY.current, phaseChanged = stagePhase.current !== null && stagePhase.current !== phase;
    stageY.current = nextY; stagePhase.current = phase;
    // Only a start, pause or finish glides the timer. Layout settling while the
    // screen opens (centring, choices loading) snaps, so nothing bounces in.
    if (!phaseChanged && stageAnimation.current) return;
    stageAnimation.current?.stop(); stageAnimation.current = null;
    if (previousY === null || reducedMotion || !phaseChanged || phase === "ended" || phase === "completed" || Math.abs(previousY - nextY) < 1) {
      timerTranslate.setValue(0);
      return;
    }
    // Offset the newly laid-out stage to its old location, then settle to zero.
    // The duration control stays mounted; the countdown geometry stays fixed.
    timerTranslate.setValue(previousY - nextY);
    const animation = Animated.timing(timerTranslate, { toValue: 0, duration: 300, useNativeDriver: true });
    stageAnimation.current = animation;
    animation.start(() => { if (stageAnimation.current === animation) stageAnimation.current = null; });
  };

  const task = tasks.find((item) => item.id === timer.linkedTaskId);
  const selectableQuests = questLists(tasks).today;
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
  // Setting off: Start first walks you out of camp at dusk and into the night,
  // and only then starts the session, so the walk never takes time from it.
  // Skipping ends the walk early and starts it then. Reopening a session that
  // is already running goes straight to it.
  const [departing, setDeparting] = useState<{ scope: string; seconds: number; title: string | undefined } | null>(null);
  const [skipToken, setSkipToken] = useState(0);
  // Between the walk ending and the session showing as started, the night
  // scene stays (never a flash of setup); a failed start shows setup again.
  const [launching, setLaunching] = useState(false);
  if (launching && (phase !== "setup" || timer.actionError || timer.restoreError)) setLaunching(false);
  useEffect(() => {
    if (!launching) return;
    const fallback = setTimeout(() => setLaunching(false), LAUNCH_WAIT_MS);
    return () => clearTimeout(fallback);
  }, [launching]);
  const intro = departing !== null;
  const settingOff = intro || launching;
  const startNow = useRef(timer.startTimer);
  useEffect(() => { startNow.current = timer.startTimer; });
  const departingRef = useRef(departing), scopeRef = useRef(presentationScope), openRef = useRef(timer.hasOpenSession);
  useEffect(() => { departingRef.current = departing; scopeRef.current = presentationScope; openRef.current = timer.hasOpenSession; });
  const finishIntro = useCallback(() => {
    const leaving = departingRef.current;
    departingRef.current = null;
    setDeparting(null);
    // Never start for another account, or over a session that began meanwhile.
    if (!leaving || leaving.scope !== scopeRef.current || openRef.current) return;
    setLaunching(true);
    void startNow.current(leaving.seconds, leaving.title);
  }, []);
  const cancelDeparture = useCallback(() => { departingRef.current = null; setDeparting(null); }, []);
  if (departing && (departing.scope !== presentationScope || timer.hasOpenSession || timer.isCompleted || timer.isRestoring)) setDeparting(null);
  const [introFade] = useState(() => new Animated.Value(1));
  useLayoutEffect(() => {
    // Setup fades away as you set off; the timer fades in once you're on your way.
    const fade = Animated.timing(introFade, { toValue: settingOff ? 0 : 1, duration: reducedMotion ? 0 : settingOff ? 220 : 450, useNativeDriver: true });
    fade.start();
    return () => fade.stop();
  }, [settingOff, introFade, reducedMotion]);
  if (confirmBreak && (!onlineSurfaces || !liveTimer.hasOpenSession || liveTimer.breakSecondsLeft > 0)) setConfirmBreak(false);
  const compactSetup = phase === "setup" && !isQuest;
  // Setup sits in the middle of the free space instead of leaving a gap above Start.
  const [setupFit, setSetupFit] = useState({ view: 0, content: 0 });
  const [{ top: setupTop, settled }, setSetupPlace] = useState({ top: 0, settled: false });
  const fitTop = compactSetup ? Math.max(0, Math.min(200, Math.round((setupFit.view + setupTop - setupFit.content) / 2) - 12)) : 0;
  // Centre once, as the screen opens. Choices that load or change later only
  // ever make room (move up), so the setup never bounces up and down.
  if (!compactSetup) { if (setupTop !== 0 || settled) setSetupPlace({ top: 0, settled: false }); }
  else if (setupFit.view > 0 && setupFit.content > 0 && (!settled ? true : fitTop < setupTop - 2) && (Math.abs(fitTop - setupTop) > 2 || !settled))
    setSetupPlace({ top: fitTop, settled: true });
  const areaColor = lifeAreaColor(timer.targetAttributeId, area?.color_code);
  const learning = suggestedArea(subjects, "learning");
  const storedMode = useSetupMode();
  const sessionMode: SetupMode = isRoutine ? "routine" : storedMode;
  const chosenCourseId = useSyncExternalStore(studySelection.subscribe, studySelection.get, studySelection.get);
  const chosenCourse = study.courses.find(item => item.id === chosenCourseId) ?? null;
  const [subjectPicker, setSubjectPicker] = useState(false);
  if (!onlineSurfaces && subjectPicker) setSubjectPicker(false);

  // The shared provider already owns loaded routine/category data. Returning
  // to a live timer must not start another choices request during its slide.
  useEffect(() => {
    if (phase !== "setup") return;
    return afterTransition(() => { void refresh(); });
  }, [phase, refresh]);
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
  const minimise = useCallback((source = "header", onHidden?: () => void) => {
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
    const generation = ++motionGeneration.current;
    // Target this screen’s native stack directly; never replace/unmount it to close.
    traceSession("native stack close", { canGoBack: navigation.canGoBack(), routeCount: navigation.getState()?.routes.length });
    if (navigation.canGoBack()) {
      traceSession("controlled exit start", { reducedMotion });
      let exitSettled = false;
      const finishedExit = ({ finished }: { finished: boolean }) => {
        // A widget/dock entry may reopen this retained route before a native
        // close callback reaches JS. It no longer owns the screen's motion.
        if (generation !== motionGeneration.current || exitSettled) return;
        exitSettled = true;
        traceSession("controlled exit end", { finished });
        if (finished && currentPresentationScope.current === presentationScope && navigation.isFocused?.() !== false) {
          onHidden?.();
          setExitReady(true);
        } else { closing.current = false; screenMotion.setValue(1); surfaceOpacity.setValue(1); }
      };
      if (source === "completion") {
        // A finished walk dissolves into the app beneath it. Keep its map
        // mounted until the native fade finishes; only then acknowledge it.
        screenMotion.stopAnimation(); screenMotion.setValue(1);
        Animated.timing(surfaceOpacity, { toValue: 0, duration: reducedMotion ? 0 : 480, useNativeDriver: true }).start(finishedExit);
      } else {
        Animated.timing(surfaceOpacity, { toValue: reducedMotion ? 1 : 0, duration: reducedMotion ? 0 : 260, useNativeDriver: true }).start();
        Animated.timing(screenMotion, { toValue: -0.12, duration: reducedMotion ? 0 : 260, useNativeDriver: true }).start(finishedExit);
      }
    }
    else { closing.current = false; screenMotion.setValue(1); surfaceOpacity.setValue(1); console.warn("[Session] Missing anchored back history"); }
  }, [dismissLayer, navigation, reducedMotion, screenMotion, surfaceOpacity, presentationScope]);
  const recoverFromLostExit = useCallback((reason: string) => {
    traceSession("exit recovered", { reason });
    motionGeneration.current++;
    closing.current = false; exitReadyRef.current = false; setExitReady(false);
    screenMotion.stopAnimation(); surfaceOpacity.stopAnimation();
    screenMotion.setValue(1); surfaceOpacity.setValue(1);
  }, [screenMotion, surfaceOpacity]);
  // The return screen after a session (below) owns swipes and Back while it shows.
  const revealShownRef = useRef(false);
  const closeRevealRef = useRef(() => {});
  // PanResponder registers these callbacks; it never invokes them during render.
  // eslint-disable-next-line react-hooks/refs
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => {
      return !picker && !confirmEnd && !keyboardVisible && !rewardsVisible && !closing.current && !revealShownRef.current
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
  useEffect(() => {
    if (!exitReady) return;
    navigation.goBack();
    // A pop can be lost (another screen arriving at that moment, like a widget
    // launch). Never stay behind invisible and locked: if this screen is still
    // the one in front shortly after, show it again, ready to use.
    const check = setTimeout(() => { if (navigation.isFocused?.()) recoverFromLostExit("exit-not-applied"); }, LOST_EXIT_MS);
    return () => clearTimeout(check);
  }, [exitReady, navigation, recoverFromLostExit]);
  const heldSessionSurface = useRef(liveTimer.hasOpenSession || liveTimer.isCompleted || liveTimer.endingSession || liveTimer.sessionEnded);
  const endAcknowledgement = useRef({ ownerId, sessionId:liveTimer.sessionId, viewed:liveTimer.summaryViewed });
  const pendingExit = useRef<{ ownerId: typeof ownerId; source: string } | null>(null);
  const resultSessionId = endSnapshot?.sessionId ?? visibleTimer.sessionSummary?.sessionId ?? visibleTimer.sessionId;
  // A finished session shows what the walk brought (back at camp, finds, the
  // trail) before you leave: Done waits here until those screens are closed.
  const rewardsOwner = ownerId ?? null;
  const rewardsNow = useSyncExternalStore(useCallback(listener => rewardsStore.subscribe(rewardsOwner, listener), [rewardsOwner]),
    () => rewardsStore.snapshot(rewardsOwner), () => rewardsStore.snapshot(rewardsOwner));
  // This session's return screen (finds, then today's trail). It shows here,
  // on the session screen, after the result card: never as a separate pop-up.
  const sessionReveal = rewardsNow.reveals.find((r): r is Extract<typeof r, { kind: "expedition" }> => r.kind === "expedition");
  const rewardsPending = !!sessionReveal || rewardsNow.busy;
  const [holdForRewards, setHoldForRewards] = useState(false);
  const revealShown = holdForRewards && !!sessionReveal;
  useEffect(() => { revealShownRef.current = revealShown; }, [revealShown]);
  const closeReveal = useCallback(() => {
    if (!sessionReveal || closing.current) return;
    minimise("completion", () => {
      sessionTrail("reveal closed", { finds: sessionReveal.finds.length });
      rewardsStore.dismissReveal(rewardsOwner, sessionReveal.id);
    });
  }, [sessionReveal, rewardsOwner, minimise]);
  useEffect(() => { closeRevealRef.current = closeReveal; }, [closeReveal]);
  const hostedReveal = revealShown ? sessionReveal?.id ?? null : null;
  useLayoutEffect(() => hostedReveal ? sessionRevealHost.hold(hostedReveal) : undefined, [hostedReveal]);
  useEffect(() => { if (revealShown) sessionTrail("reveal shown", { finds: sessionReveal?.finds.length ?? 0 }); }, [revealShown, sessionReveal]);
  const rewardsPendingRef = useRef(rewardsPending);
  useEffect(() => { rewardsPendingRef.current = rewardsPending; }, [rewardsPending]);
  useEffect(() => globalSessionLifecycle.subscribe(result => {
    if (!ownerId || result.ownerId !== ownerId || result.scope !== presentationScope || result.sessionId !== (resultSessionId ?? null)) return;
    sessionTrail("result closed", { reveal: !!sessionReveal, claiming: rewardsNow.busy });
    if (!endRequested && rewardsPending) { setHoldForRewards(true); return; }
    minimise(endRequested ? "session-ended" : "completion");
  }), [ownerId, presentationScope, resultSessionId, endRequested, minimise, rewardsPending, sessionReveal, rewardsNow.busy]);
  useEffect(() => {
    // While the return screen shows, it's yours: it closes when you're done.
    if (!holdForRewards || sessionReveal) return;
    // Still checking what the walk found: wait a while for it, never forever.
    // Once it's closed (or nothing came), leave.
    const limit = setTimeout(() => { setHoldForRewards(false); minimise("completion"); }, rewardsNow.busy ? 15000 : 0);
    return () => clearTimeout(limit);
  }, [holdForRewards, sessionReveal, rewardsNow.busy, minimise]);
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
      pendingExit.current = null;
      // A finished session waits for its rewards screens before leaving.
      if (requested.source === "settled-session" && rewardsPendingRef.current) { setHoldForRewards(true); return; }
      minimise(requested.source);
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
  const focusActions = useRef({ enterScreen, recoverFromLostExit, cancelDeparture, minimise });
  useLayoutEffect(() => { focusActions.current = { enterScreen, recoverFromLostExit, cancelDeparture, minimise }; },
    [enterScreen, recoverFromLostExit, cancelDeparture, minimise]);
  useFocusEffect(useCallback(() => {
    // Coming back to this screen after an exit that never finished: it must
    // be visible and usable again, never a see-through screen that eats taps.
    // Read the latest actions without treating a timer-id or picker change as
    // another focus event while the outgoing screen is already closing.
    const actions = focusActions.current;
    if (!actions.enterScreen() && (closing.current || exitReadyRef.current)) actions.recoverFromLostExit("refocused");
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      // Back while setting off stays here, ready, without starting.
      if (departingRef.current) { focusActions.current.cancelDeparture(); return true; }
      // Back on the return screen closes it, like its Continue.
      if (revealShownRef.current) { closeRevealRef.current(); return true; }
      focusActions.current.minimise("android-back"); return true;
    });
    return () => subscription.remove();
  }, []));

  const applyDuration = (seconds: number) => {
    if (!validSessionSeconds(seconds)) return;
    if (seconds !== timer.duration) timer.setDurationInSeconds(seconds);
  };
  const selectMinutes = (value: number) => {
    if (locked) return;
    applyDuration(value * 60);
  };
  const start = (again = false) => {
    if (locked || missingQuest || timer.restoreError || picker || !validSessionSeconds(timer.duration)) return;
    // Study needs a subject first; Start opens the subject picker instead.
    if (sessionMode === "study" && !chosenCourse) { setSubjectPicker(true); return; }
    if (departing) return;
    Keyboard.dismiss();
    const title = task?.title ?? routineName ?? undefined;
    // A retry after a failed start doesn't walk out again.
    if (reducedMotion || again) { void timer.startTimer(timer.duration, title); return; }
    setDeparting({ scope: presentationScope, seconds: timer.duration, title });
  };
  // Back to any activity: the category stays, the routine's link and name go.
  const clearRoutine = () => {
    if (locked) return;
    timer.setLinkedTaskId(null); timer.setNotes("");
    setupMode.chooseRoutine(null);
    if (isQuest) selectMinutes(30);
  };
  const retry = () => {
    if (timer.restoreError) timer.retryRestore();
    else if (timer.isCompleted) void timer.retryCompletion();
    else if (timer.hasOpenSession) void timer.retryAction();
    else start(true);
  };
  const title = (timer.sessionSummary?.questTitle !== "Quest session" ? timer.sessionSummary?.questTitle : undefined) || (isQuest ? task?.title ?? (loading ? "Loading routine…" : "Routine unavailable") : suggestion?.title ?? routineName ?? "Free session");
  const contextExam = chosenCourse ? upcomingExams(study.exams).find(exam => exam.courseId === chosenCourse.id) : undefined;
  const contextTitle = sessionMode === "study" ? chosenCourse?.name ?? "Choose a subject" : isRoutine ? title : focusAreaTitle(area?.title);
  const contextDetail = sessionMode === "study"
    ? chosenCourse ? [contextExam ? `${contextExam.title} ${countdownLabel(daysUntil(contextExam.examDate)).toLowerCase()}` : null, `${studyTime(weekSeconds(study.recent, chosenCourse.id))} this week`,
      contextExam ? "Counts as Revision" : "Counts as Learning"].filter(Boolean).join(" · ") : "Revision when an exam is near, otherwise Learning."
    : isRoutine ? focusAreaTitle(area?.title) : focusAreaHint(area?.title ?? "") || "Any activity you choose.";
  const status = phase === "ended" ? "Session ended" : timer.isRestoring ? "Restoring your session…" : timer.startCheckVisible ? "Checking your saved start…"
    : timer.endingSession ? "Session ended"
    : timer.isCompleted ? timer.sessionSummary ? "Time recorded" : timer.syncStatus === "rejected" ? "Kept on this phone. Your account did not accept it." : "Saved on this phone. Waiting to sync."
    : timer.hasOpenSession ? timer.isRunning ? "Session in progress" : "Paused" : "Ready when you are";
  const displayedSeconds = phase === "setup" ? timer.duration
    : phase === "completed" && sessionSummary ? sessionSummary.durationSeconds
    : timer.finishing ? 0 : timer.timeLeft;
  const breakActive = timer.breakSecondsLeft > 0;
  // Foreground can discover the deadline before its durable journal write
  // settles. Keep the scene's geometry without flashing an expired 00:00.
  // This is presentation only: the existing saved result still owns completion.
  const hideCountdown = timer.isCompleted || !endingPresentation && timer.hasOpenSession && !timer.awaitingStart && !breakActive && timer.timeLeft <= 0;
  const breakSpent = timer.protectedSession && timer.breakUsed && !breakActive;
  const disabled = breakSpent || cancellationSaved || timer.endingSession || timer.actionBusy || timer.isRestoring || timer.restoreError || timer.awaitingStart || (timer.hasOpenSession && timer.syncStatus === "waiting") || (!timer.hasOpenSession && (missingQuest || !validSessionSeconds(timer.duration) || !!picker));
  const immediateControl = timer.hasOpenSession || timer.awaitingStart || endRequested;
  // A start being confirmed keeps its normal label, never a spinner (it is quick and expected).
  const starting = timer.hasOpenSession && timer.interactionKind === "start";
  const controlPending = timer.actionBusy && !starting && (slowControl || !timer.interactionKind);
  const checkingStart = timer.awaitingStart && !timer.interactionKind;
  const actionLabel = breakActive ? "End break early" : timer.protectedSession && timer.hasOpenSession ? breakSpent ? "Break used" : "5-min break" : phase === "ended" ? "Stopped" : checkingStart ? "Checking start" : timer.awaitingStart ? "Pause" : timer.hasOpenSession ? timer.isRunning ? "Pause" : "Resume" : "Start";
  const needsRecovery = !cancellationSaved && !timer.endingSession && !timer.isCompleted
    && (timer.restoreError || timer.actionError || timer.syncStatus === "waiting" && !timer.interactionKind);
  const recoveryMessage = timer.awaitingStart ? "Checking the session saved on this phone. You can end it while we confirm its start."
    : timer.syncStatus === "waiting" ? timer.isCompleted ? "Your finished session is saved on this phone. We’ll confirm it when you reconnect." : "Waiting to confirm your saved session state."
    : timer.actionError ?? "Couldn’t restore your session. Retry before starting a new one.";

  // While you focus, you walk the trail behind the timer (see SessionBackdrop),
  // and a finished or ended session keeps its scene behind its card.
  const scenePhase = settingOff ? "running" : phase;
  const onTrail = scenePhase === "running" || scenePhase === "paused" || scenePhase === "completed" || scenePhase === "ended";
  return (
    <Animated.View testID="session-surface" style={{ flex: 1, backgroundColor: colors.background, opacity: surfaceOpacity,
      transform: [{ translateY: !reducedMotion ? screenMotion.interpolate({ inputRange: [-0.12, 0, 1], outputRange: [height + insets.top + insets.bottom + 32, height, 0] }) : 0 }] }}>
    <SessionBackdrop phase={scenePhase} secondsLeft={timer.timeLeft} progress={timer.finishing ? 1 : Math.max(0, Math.min(1, 1 - timer.timeLeft / Math.max(1, timer.duration)))}
      walking={settingOff || phase === "running" && !breakActive && !timer.awaitingStart && !hideCountdown} intro={intro} skipToken={skipToken} onIntroEnd={finishIntro}
      returning={returning} onReturnEnd={finishReturn} active={!revealShown} />
    <Animated.View style={[styles.flex, { opacity: introFade }]}>
    <SafeAreaView collapsable={false} style={[styles.screen, onTrail && styles.onTrail]} {...panResponder.panHandlers}
      onTouchStart={() => timerView.current?.measureInWindow((_x, y, _width, height) => { timerBounds.current = { top: y, bottom: y + height }; })}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Animated.View testID="session-header-motion" style={{ opacity }}><AppHeader centered title={phase === "ended" ? "Session ended" : phase === "setup" ? sessionMode === "study" ? "Study session" : isRoutine ? "Routine session" : "Quick focus" : phase === "completed" && sessionSummary ? "Session complete" : area?.title ? focusAreaTitle(area.title) : "Session"} dismiss onBack={() => minimise("header")} backLabel={timer.hasOpenSession ? "Minimise session" : "Close session"} /></Animated.View>
      {!online && <View style={styles.offline}><OfflineStatus /></View>}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View ref={timerView} onLayout={() => timerView.current?.measureInWindow((_x, y, _width, height) => { timerBounds.current = { top: y, bottom: y + height }; })}
          importantForAccessibility={hideCountdown ? "no-hide-descendants" : "auto"}
          testID="session-timer-anchor" style={[styles.timerAnchor, (phase !== "setup" || isQuest) && styles.activeTimerAnchor,
            compactSetup ? { height: rowHeight + 24 + setupTop, paddingTop: setupTop, justifyContent: "flex-start" } : { minHeight: timerStageHeight }, hideCountdown && {opacity:0}]}>
          {/* While setting up, only the digits row shows; the full stage sits above
            it unseen, so starting glides the same digits into the ring. */}
          <Animated.View testID="session-timer-stage" pointerEvents={compactSetup ? "none" : "auto"} onLayout={event => settleTimerStage(event.nativeEvent.layout.y)}
            style={[styles.timerStage, { height:timerStageHeight, transform:[{translateY:timerTranslate}] }, compactSetup && { marginTop: -(labelHeight + rowHeight) }]}>
          <Animated.View pointerEvents="none" style={[styles.ringLayer, { opacity, top: ringTop }]}>
            {/* Keep the timer's geometry, but don't composite a hidden SVG over
              the scene while the completed result is being saved. */}
            {!hideCountdown && (phase !== "setup" || isQuest) && <ProgressRing size={ringSize}
              progress={breakActive ? 1 - timer.breakSecondsLeft / 300 : phase === "setup" ? 0 : timer.finishing ? 1 : Math.max(0, Math.min(1, 1 - timer.timeLeft / Math.max(1, timer.duration)))}
              color={breakActive ? colors.streak : phase === "completed" ? colors.progress : phase === "setup" && isQuest ? lifeAreaColor(timer.targetAttributeId, area?.color_code) : phase === "setup" ? colors.accent : colors.progress} />}
          </Animated.View>
          <View style={[styles.timerControl, { width: controlWidth }]}>
            <SessionCountdown seconds={breakActive ? timer.breakSecondsLeft : displayedSeconds}
              compact caption={breakActive ? "break left · time is not recorded" : phase === "setup" ? isQuest ? "Planned focus" : undefined : timer.finishing ? "Finishing up…" : `of ${sessionTime(timer.duration)}`} />
          </View>
          <Text style={[styles.status, (phase === "running" || phase === "paused" || phase === "ended" || (phase === "completed" && !!sessionSummary)) && styles.hiddenStatus]} accessibilityLiveRegion="polite">{phase === "setup" ? "" : phase === "completed" && sessionSummary ? sessionSummary.goalReachedNow ? "Daily goal reached" : "Your progress has been saved." : status}</Text>
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Session progress"
            accessibilityValue={{ min: 0, max: timer.duration, now: phase === "setup" ? 0 : timer.duration - timer.timeLeft }} />
          </Animated.View>
        </View>
        <ScrollView style={phase === "setup" && !isQuest ? styles.flex : [styles.activeDetails, phase === "setup" && { maxHeight: Math.max(100, height - timerStageHeight - 220) }, phase === "ended" && activeLayout.details !== undefined && { height: activeLayout.details }]} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled"
          onLayout={event => { const view = Math.round(event.nativeEvent.layout.height); if (phase === "running" || phase === "paused") setActiveLayout(layout => layout.details === view ? layout : { ...layout, details: view }); setSetupFit(fit => fit.view === view ? fit : { ...fit, view }); }}
          onContentSizeChange={(_width, contentHeight) => { const content = Math.round(contentHeight); setSetupFit(fit => fit.content === content ? fit : { ...fit, content }); }} keyboardDismissMode="on-drag" scrollEventThrottle={16} onScroll={(event) => { detailsOffset.current = Math.max(0, event.nativeEvent.contentOffset.y); }}>
          <Animated.View testID="session-details-motion" style={{ opacity, transform:[{ translateY:opacity.interpolate({inputRange:[0,1],outputRange:[8,0]}) }] }}>
          {phase !== "setup" && !timer.isCompleted && <Text style={styles.activeTitle} accessibilityRole="header">{phase === "ended" ? `${title} · Ended` : timer.startCheckVisible ? `${title} · Checking start` : timer.isRunning ? isRoutine || suggestion ? title : `${focusAreaTitle(area?.title)} · Free session` : `${title} · Paused`}</Text>}
            {suggestion && !timer.isCompleted && <View style={styles.suggestionInstruction}><Text style={[styles.secondary, { textAlign: "center" }]} numberOfLines={3}>{suggestion.instruction}</Text></View>}
            {phase === "setup" && <View style={styles.setupStack}>
              {/* Floats, so a background refresh never pushes the setup around. */}
              {(loading || timer.isRestoring) && <ActivityIndicator size="small" style={styles.setupSpinner} color={colors.accent} />}
              {(choicesError || missingQuest) && <View>
                <Text style={styles.secondary}>{missingQuest ? task ? "This routine is already done or isn’t scheduled for today. Choose another routine, or Any activity." : "Your routine is still linked. Reload its details before starting, or choose Any activity." : "Couldn’t load your choices."}</Text>
                <Action label="Reload choices" onPress={() => void refresh()} />
              </View>}
              {/* What this session is for, so the screen reads as a plan rather than an empty form. */}
              <View style={styles.context} testID="session-context">
                <Text style={styles.contextTitle} numberOfLines={2}>{contextTitle}</Text>
                {!!contextDetail && <Text style={styles.contextDetail} numberOfLines={2}>{contextDetail}</Text>}
              </View>
              {/* A routine session stays a routine and a study session stays study; each tab sets which. */}
              <View style={styles.setup}>
                {sessionMode === "routine" && !isRoutine && <TouchableOpacity disabled={locked} onPress={() => setPicker("area")} accessibilityRole="button" accessibilityLabel="Choose category" accessibilityValue={{ text: focusAreaTitle(area?.title) }} style={styles.setupRow}>
                  <View style={[styles.rowIcon, { backgroundColor: areaTint(areaColor) }]}><Ionicons name={focusAreaIcon(area?.title ?? "")} size={16} color={areaColor} /></View>
                  <Text style={styles.rowLabel}>Category</Text><Text style={styles.rowValue} numberOfLines={1}>{focusAreaTitle(area?.title)}</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
                </TouchableOpacity>}
                {sessionMode === "study" && <SubjectSetupRow areas={subjects} areaId={timer.targetAttributeId} generalId={general?.id} learningId={learning?.id} disabled={locked || !onlineSurfaces}
                  onArea={id => timer.setTargetAttributeId(id)} open={onlineSurfaces && subjectPicker} onOpenChange={setSubjectPicker} />}
                {/* A routine brings its own category, so it stays fixed here; Just focus picks a category instead. */}
                {isRoutine && <View style={styles.setupRow} testID="session-routine" accessible accessibilityLabel={`Routine, ${title}, ${focusAreaTitle(area?.title)}`}>
                  <View style={[styles.rowIcon, { backgroundColor: areaTint(areaColor) }]}><Ionicons name="repeat" size={16} color={areaColor} /></View>
                  <Text style={styles.rowLabel}>Routine</Text><Text style={[styles.rowValue, styles.rowValueChosen]} numberOfLines={1}>{title}</Text>
                </View>}
                {!isQuest && <FocusLengthControl compact showLabel={false} seconds={timer.duration} disabled={locked} onChange={applyDuration} onCustom={() => setPicker("duration")} />}
                <SessionProtectionControl activeSurface={onlineSurfaces} />
              </View>
            </View>}

          </Animated.View>
        </ScrollView>
        <Animated.View testID="session-actions-motion" style={[styles.actions, {opacity}, phase === "ended" && activeLayout.actions !== undefined && { height: activeLayout.actions }]}
          onLayout={event => { if (phase === "running" || phase === "paused") { const height = Math.round(event.nativeEvent.layout.height); setActiveLayout(layout => layout.actions === height ? layout : { ...layout, actions: height }); } }}>
          {needsRecovery && <View testID="session-recovery-actions">
            <Text style={timer.syncStatus === "waiting" ? styles.secondary : styles.error} accessibilityRole={timer.syncStatus === "waiting" ? undefined : "alert"}>{recoveryMessage}</Text>
            <Action label="Retry" disabled={ timer.actionBusy || timer.isRestoring} onPress={retry} />
          </View>}
          {!timer.isCompleted && <>
            <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.primary, styles.flex, timer.hasOpenSession && styles.activePrimary, disabled && (!immediateControl || controlPending) && styles.disabled]} disabled={disabled}
              onPress={timer.hasOpenSession ? () => { if (breakActive) void timer.resumeTimer(); else if (timer.isRunning && timer.protectedSession) setConfirmBreak(true); else void (timer.isRunning ? timer.pauseTimer() : timer.resumeTimer()); } : () => start()}
              accessibilityRole="button" accessibilityState={{ busy: timer.actionBusy, disabled }} accessibilityLabel={actionLabel}>
              {timer.actionBusy && !immediateControl ? <ActivityIndicator color={colors.primaryText} /> : <>{controlPending ? <ActivityIndicator color={timer.hasOpenSession ? colors.text : colors.primaryText} /> : breakSpent ? null : <Ionicons name={breakActive ? "play" : timer.isRunning ? "pause" : "play"} size={18} color={timer.hasOpenSession ? colors.text : colors.primaryText} />}<Text style={[styles.primaryText, timer.hasOpenSession && { color: colors.text }]}>{timer.hasOpenSession ? actionLabel : "Start session"}</Text></>}
            </TouchableOpacity>
            {timer.hasOpenSession && (phase === "ended" ? <View style={[styles.endControl, styles.endedControl]} importantForAccessibility="no-hide-descendants" /> : <TouchableOpacity accessibilityRole="button" accessibilityLabel="End session" disabled={timer.endingSession || !!timer.finishing || endQueued} onPress={() => setConfirmEnd(true)} style={[styles.endControl, endQueued && styles.disabled]}>{endQueued ? <ActivityIndicator color={colors.text} /> : <Ionicons name="close" size={23} color={colors.text} />}</TouchableOpacity>)}
            </View>
            {timer.hasOpenSession && <Text style={[styles.cancelHint, phase === "ended" && styles.endedControl]} accessibilityElementsHidden={phase === "ended"} importantForAccessibility={phase === "ended" ? "no-hide-descendants" : "auto"}>{timer.finishing ? "Saving your full session in a moment." : endQueued ? "Ending as soon as your session is confirmed…" : "Ending now doesn’t save this session."}</Text>}
          </>}
        </Animated.View>
      </KeyboardAvoidingView>
      <AppSheet visible={onlineSurfaces && !sessionSummary && picker === "area"} onRequestClose={() => setPicker(null)} label="session choices" compact maxHeightRatio={0.82}
        header={<SheetHeader title="Category" subtitle="Where should this block count?" onClose={() => setPicker(null)} />}>
        <BottomSheetScrollView contentContainerStyle={styles.pickerBody} showsVerticalScrollIndicator={false}>
          {picker === "area" && <FocusAreaPicker selectedId={timer.targetAttributeId} disabled={locked} areas={[{ id: general?.id ?? null, title: "Everyday focus", color_code: general?.color_code }, ...selectableAreas.filter(item => item.id !== general?.id)]}
            onSelect={id => { if (isRoutine) clearRoutine(); timer.setTargetAttributeId(id); setPicker(null); }} />}
          {choicesError && <SheetChoice label="Couldn’t load choices. Retry" onPress={() => void refresh()} />}
        </BottomSheetScrollView>
      </AppSheet>
      <FocusDurationSheet visible={onlineSurfaces && !sessionSummary && picker === "duration"} seconds={timer.duration} disabled={locked} onClose={() => setPicker(null)} onSave={applyDuration} />
      {onlineSurfaces && confirmEnd && !sessionSummary && <SheetConfirmation elevated title="End this session?" message="This cancels the current session instead of completing it. Completion rewards will not be awarded." cancelLabel="Keep session" confirmLabel="End session"
        onCancel={() => setConfirmEnd(false)} onConfirm={() => { setConfirmEnd(false); if (liveTimer.actionBusy) setEndQueued(true); else endNow(); }} />}
      {onlineSurfaces && confirmBreak && <SheetConfirmation elevated title="Take your 5-minute break?" message="You get one break each session. Your apps unlock and the timer waits for up to 5 minutes; break time isn’t recorded."
        cancelLabel="Keep focusing" confirmLabel="Start break" onCancel={() => setConfirmBreak(false)} onConfirm={() => { setConfirmBreak(false); void timer.pauseTimer(); }} />}
    </SafeAreaView>
    </Animated.View>
    {revealShown && sessionReveal && <SessionReveal key={sessionReveal.id} reveal={sessionReveal} onClose={closeReveal} />}
    {intro && <SessionIntroWords minutes={Math.round(timer.duration / 60)} onSkip={() => setSkipToken(n => n + 1)}
      area={sessionMode === "study" ? chosenCourse?.name ?? "Study" : isRoutine ? title : focusAreaTitle(area?.title)} />}
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
  onTrail: { backgroundColor: "transparent" },
  ringLayer: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" },
  activeDetails: { flexGrow: 0, maxHeight: 260 },
  timerStage: { width: "100%", alignItems: "center", paddingTop: 4 },
  activeTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "600", letterSpacing: -0.3, textAlign: "center", marginTop: 6 },
  actionRow: { flexDirection: "row", gap: 10 },
  activePrimary: { backgroundColor: colors.surface },
  endControl: { width: 56, minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: colors.surface },
  endedControl: { opacity: 0 },
  cancelHint: { color: colors.secondary, fontSize: 12, textAlign: "center", lineHeight: 18, paddingTop: 8 },
  activeTimerAnchor: { flex: 1 },
  timerAnchor: { paddingHorizontal: 20, paddingBottom: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  timerControl: { width: 286, maxWidth: "100%", paddingTop: 8 },
  status: { color:colors.secondary, fontSize: 16, lineHeight: 22, textAlign:"center", marginTop:8 },
  hiddenStatus: { position:"absolute", width:1, height:1, overflow:"hidden", color:colors.background },
  body: { paddingHorizontal: 20, paddingBottom: 20 },
  secondary: { color: colors.secondary, fontSize: 16, lineHeight: 22 },
  offline: { paddingBottom: 6 }, setupStack: { gap: 8 }, setupSpinner: { position: "absolute", top: 4, right: 4 },
  context: { alignItems: "center", gap: 4, paddingHorizontal: 12, paddingBottom: 12 },
  contextTitle: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: "700", letterSpacing: -0.3, textAlign: "center" },
  contextDetail: { color: colors.secondary, fontSize: 14, lineHeight: 19, textAlign: "center" },
  setup: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
  setupRow: { minHeight: 52, paddingVertical: 11, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  lastRow: { borderBottomWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  rowLabel: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  rowValue: { flex: 1, textAlign: "right", color: colors.secondary, fontSize: 16, lineHeight: 22 },
  rowValueChosen: { color: colors.text },
  protectionStatus: { marginTop: 10, alignItems: "center" },
  label: { color: colors.text, fontSize: 17, flexShrink: 1 },
  link: { color: colors.accent, fontSize: 16, fontWeight: "500" },
  smallAction: { minHeight: 44, paddingVertical: 10, justifyContent: "center", alignItems: "center" },
  actions: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 4 },
  primary: { minHeight: 56, padding: 14, borderRadius: 28, backgroundColor: colors.primary, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.5 }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  pickerBody: { paddingHorizontal: 16, paddingBottom: 16 },
  pickerRow: { minHeight: 52, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: 4 },
});
