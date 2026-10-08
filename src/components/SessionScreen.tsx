import { focusAreaTitle } from "../utils/focusAreas";
import { readSuggestedFocus } from "../constants/guidedQuests";
import SaveSuggestedQuest from "./SaveSuggestedQuest";
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
import LevelUpModal from "./LevelUpModal";
import ProgressRing from "./ProgressRing";
import { CompletionHero, CompletionRows } from "./CompletionDetails";
import { lifeAreaColor } from "../utils/lifeAreaColor";
import AppHeader from "./AppHeader";
import SheetConfirmation from "./SheetConfirmation";
import { colors } from "../constants/theme";
import DurationPicker, { DurationEditor } from "./DurationPicker";
import { useQuests } from "../context/QuestContext";
import { useTimer } from "../context/TimerContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { validSessionSeconds, sessionTime } from "../utils/sessionSetup";
import { traceSession } from "../utils/sessionTransition";
import { afterTransition } from "../utils/afterTransition";
import { navigationTiming } from "../utils/navigationMotion";

type Picker = "duration" | "quest" | "area" | null;
const PRESETS = [15, 30, 45, 60];

export default function SessionScreen() {
  const liveTimer = useTimer();
  const [endRequested, setEndRequested] = useState(false);
  const [endedClosing, setEndedClosing] = useState(false);
  const [endSnapshot, setEndSnapshot] = useState<Pick<typeof liveTimer, "duration" | "timeLeft" | "isRunning" | "linkedTaskId" | "targetAttributeId" | "activityType"> | null>(null);
  const cancellationSaved = endRequested && !liveTimer.actionBusy && !liveTimer.hasOpenSession && !liveTimer.actionError && !liveTimer.isCompleted;
  // Backend cancellation is final, but keep the outgoing active layout behind
  // its notice until both the popup and this screen have finished leaving.
  const timer = useMemo(() => cancellationSaved && endSnapshot ? { ...liveTimer, ...endSnapshot, hasOpenSession: true } : liveTimer, [cancellationSaved, endSnapshot, liveTimer]);
  const insets = useSafeAreaInsets();
  const { sessionSummary, rewardsVisible, acknowledgeSummary } = timer;
  const { tasks, subjects, loading, error: choicesError, refresh } = useQuests();
  const navigation = useNavigation();
  const reducedMotion = useReducedMotion();
  const { width, height, fontScale } = useWindowDimensions();
  const { controlWidth, labelHeight, rowHeight } = timerLayout(width, height, fontScale);
  const ringSize = Math.min(height < 700 ? 252 : 300, width - 48);
  const timerStageHeight = Math.max(300, ringSize + 24, labelHeight + rowHeight * 3 + 44);
  const ringTop = 12 + labelHeight + rowHeight * 1.5 - ringSize / 2;
  const completionDismissRequested = useRef(false);
  const endedDismissRequested = useRef(false);
  const [completionClosing, setCompletionClosing] = useState(false);
  const hideCompletedSummary = !!sessionSummary && (rewardsVisible || completionClosing);
  const [picker, setPicker] = useState<Picker>(null);
  const [durationRevision, setDurationRevision] = useState(0);
  const durationEpoch = useRef(0);
  const wheelBusyRef = useRef(false);
  const durationValidRef = useRef(true);
  const [wheelBusy, setWheelBusy] = useState(false);
  const [durationValid, setDurationValid] = useState(true);
  const endedVisible = cancellationSaved && !endedClosing;
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const wheelBounds = useRef({ top: 0, bottom: 0 });
  const wheelView = useRef<View>(null);
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
  useFocusEffect(useCallback(() => {
    if (sessionSummary && !rewardsVisible) acknowledgeSummary();
  }, [sessionSummary, rewardsVisible, acknowledgeSummary]));
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
    // The duration control stays mounted; this never animates wheel geometry.
    timerTranslate.setValue(previousY - nextY);
    stageAnimation.current = Animated.timing(timerTranslate, { toValue: 0, duration: 300, useNativeDriver: true });
    stageAnimation.current.start();
  };

  const task = tasks.find((item) => item.id === timer.linkedTaskId);
  const general = subjects.find((item) => item.title === "General");
  const area = subjects.find((item) => item.id === timer.targetAttributeId);
  const locked = timer.hasOpenSession || timer.isCompleted || timer.actionBusy || timer.isRestoring;
  const isQuest = timer.linkedTaskId !== null;
  const suggestion = !isQuest ? readSuggestedFocus(timer.notes) : null;
  const missingQuest = isQuest && !task;
  const minutes = timer.duration / 60;
  const phase = timer.isCompleted ? "completed" : timer.hasOpenSession ? timer.isRunning ? "running" : "paused" : "setup";

  useEffect(() => afterTransition(() => { void refresh(); }), [refresh]);
  useEffect(() => { if (sessionSummary && rewardsVisible) Keyboard.dismiss(); }, [sessionSummary, rewardsVisible]);
  useEffect(() => {
    if (!locked && !isQuest && timer.targetAttributeId === null && general) timer.setTargetAttributeId(general.id);
    if (task && timer.hasOpenSession) timer.resolveQuestTitle(task.id, task.title);
  }, [locked, isQuest, general, task, timer]);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useLayoutEffect(() => {
    const changed = lastPhase.current !== null && lastPhase.current !== phase;
    lastPhase.current = phase;
    opacity.stopAnimation();
    if (reducedMotion || !changed) { opacity.setValue(1); return; }
    // Animate the visible ring, header and controls, not just the empty details.
    opacity.setValue(0);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [phase, reducedMotion, opacity]);

  const dismissLayer = useCallback(() => {
    if (completionClosing || endedClosing) return false;
    if (Keyboard.isVisible() || keyboardVisible) { Keyboard.dismiss(); return true; }
    if (picker) { setPicker(null); return true; }
    if (confirmEnd) { setConfirmEnd(false); return true; }
    return false;
  }, [keyboardVisible, picker, confirmEnd, completionClosing, endedClosing]);
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
      const inWheel = phase === "setup" && !isQuest && gesture.y0 >= wheelBounds.current.top && gesture.y0 <= wheelBounds.current.bottom;
      return !picker && !confirmEnd && !keyboardVisible && !rewardsVisible && !closing.current
        && !wheelBusyRef.current && (gesture.y0 < wheelBounds.current.top || detailsOffset.current <= 0) && !inWheel
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
  }), [phase, isQuest, picker, confirmEnd, keyboardVisible, rewardsVisible, reducedMotion, height, screenMotion, surfaceOpacity, minimise]);

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
  usePreventRemove((!completionClosing && !endedClosing && (!!picker || keyboardVisible || confirmEnd)) || !exitReady, () => {
    traceSession("removal deferred", { picker, keyboardVisible, confirmEnd, exitReady });
    minimise("navigation-back");
  });
  // Release the removal guard before dispatching the pop; no timeout or native
  // exit runs alongside the controlled animation.
  useEffect(() => { if (exitReady) navigation.goBack(); }, [exitReady, navigation]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { minimise("android-back"); return true; });
    return () => subscription.remove();
  }, [minimise]));

  const applyDuration = (seconds: number) => {
    if (!validSessionSeconds(seconds)) return;
    durationEpoch.current += 1;
    setDurationRevision(durationEpoch.current);
    wheelBusyRef.current = false; durationValidRef.current = true;
    setWheelBusy(false); setDurationValid(true);
    if (seconds !== timer.duration) timer.setDurationInSeconds(seconds);
  };
  const selectMinutes = (value: number) => {
    if (locked) return;
    applyDuration(value * 60);
  };
  const start = () => {
    if (locked || missingQuest || timer.restoreError || picker || wheelBusyRef.current || !durationValidRef.current) return;
    Keyboard.dismiss();
    void timer.startTimer(timer.duration, task?.title);
  };
  const switchToFree = () => {
    if (locked) return;
    timer.setLinkedTaskId(null); timer.setTargetAttributeId(general?.id ?? null);
    selectMinutes(30);
  };
  const newSession = async () => {
    await timer.resetTimer();
    timer.setLinkedTaskId(null); timer.setTargetAttributeId(general?.id ?? null); timer.setActivityType("other"); timer.setNotes("");
    applyDuration(1800);
  };
  const retry = () => {
    if (timer.restoreError) timer.retryRestore();
    else if (timer.isCompleted) void timer.retryCompletion();
    else if (timer.hasOpenSession) void timer.retryAction();
    else start();
  };
  const title = (timer.sessionSummary?.questTitle !== "Quest session" ? timer.sessionSummary?.questTitle : undefined) || (isQuest ? task?.title ?? (loading ? "Loading quest…" : "Quest unavailable") : suggestion?.title ?? "Free session");
  const status = timer.isRestoring ? "Restoring your session…" : timer.isCompleted ? timer.sessionSummary ? "Time focused" : timer.actionError ? "Completion needs attention" : "Saving your session…" : timer.hasOpenSession ? timer.isRunning ? "Session in progress" : "Paused" : "Ready when you are";
  const displayedSeconds = phase === "setup" ? timer.duration
    : phase === "completed" && sessionSummary ? sessionSummary.durationSeconds
    : timer.timeLeft;
  const disabled = cancellationSaved || timer.actionBusy || timer.isRestoring || timer.restoreError || (!timer.hasOpenSession && (missingQuest || wheelBusy || !durationValid || !!picker));
  const actionLabel = timer.hasOpenSession ? timer.isRunning ? "Pause" : "Resume" : "Start";

  return (
    <Animated.View testID="session-surface" style={{ flex: 1, backgroundColor: colors.background, opacity: surfaceOpacity,
      transform: [{ translateY: !reducedMotion ? screenMotion.interpolate({ inputRange: [-0.12, 0, 1], outputRange: [height + insets.top + insets.bottom + 32, height, 0] }) : 0 }] }}>
    <SafeAreaView collapsable={false} style={styles.screen} {...panResponder.panHandlers}
      onTouchStart={() => wheelView.current?.measureInWindow((_x, y, _width, height) => { wheelBounds.current = { top: y, bottom: y + height }; })}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Animated.View testID="session-header-motion" style={{ opacity }}><AppHeader title={phase === "setup" ? isQuest ? "Quest session" : "New session" : phase === "completed" && sessionSummary ? "Session complete" : area?.title ? focusAreaTitle(area.title) : "Session"} dismiss onBack={() => minimise("header")} backLabel={timer.hasOpenSession ? "Minimise session" : "Close session"} /></Animated.View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View ref={wheelView} onLayout={() => wheelView.current?.measureInWindow((_x, y, _width, height) => { wheelBounds.current = { top: y, bottom: y + height }; })} testID="session-timer-anchor" style={[styles.timerAnchor, (phase !== "setup" || isQuest) && styles.activeTimerAnchor, { minHeight: timerStageHeight }]}>
          <Animated.View testID="session-timer-stage" onLayout={event => settleTimerStage(event.nativeEvent.layout.y)}
            style={[styles.timerStage, { height:timerStageHeight, transform:[{translateY:timerTranslate}] }]}>
          <Animated.View pointerEvents="none" style={[styles.ringLayer, { opacity, top: phase === "completed" && sessionSummary ? 30 : ringTop }]}>
            {(phase !== "setup" || isQuest) && !(phase === "completed" && sessionSummary && !hideCompletedSummary) && <ProgressRing size={ringSize}
              progress={phase === "setup" ? 0 : Math.max(0, Math.min(1, 1 - timer.timeLeft / Math.max(1, timer.duration)))}
              color={phase === "completed" ? colors.accent : phase === "setup" && isQuest ? lifeAreaColor(timer.targetAttributeId, area?.color_code) : colors.success} />}
          </Animated.View>
          <View style={[styles.timerControl, { width: controlWidth }, phase === "completed" && !!sessionSummary && !hideCompletedSummary && { opacity: 0 }]} importantForAccessibility={phase === "completed" && sessionSummary && !hideCompletedSummary ? "no-hide-descendants" : "auto"}>
            <DurationPicker seconds={displayedSeconds} interactive={phase === "setup" && !isQuest && !locked}
              compact caption={phase === "setup" ? isQuest ? "Planned focus" : undefined : `of ${sessionTime(timer.duration)}`}
              revision={durationRevision}
              onCommit={(seconds) => { if (durationEpoch.current === durationRevision && !locked) timer.setDurationInSeconds(seconds); }}
              onBusy={(busy) => { if (durationEpoch.current === durationRevision) { wheelBusyRef.current = busy; setWheelBusy(busy); } }}
              onValidity={(valid) => { if (durationEpoch.current === durationRevision) { durationValidRef.current = valid; setDurationValid(valid); } }}
              onEdit={() => { if (!wheelBusyRef.current) setPicker("duration"); }} />
          </View>
          {phase === "completed" && sessionSummary && !hideCompletedSummary && <View style={styles.completedHero}>
            <CompletionHero seconds={sessionSummary.durationSeconds} title={title} levelUp={!!timer.completedLevelUp?.leveledUp} />
          </View>}
          <Text style={[styles.status, (phase === "running" || phase === "paused" || (phase === "completed" && !!sessionSummary)) && styles.hiddenStatus]} accessibilityLiveRegion="polite">{phase === "setup" ? "" : phase === "completed" && sessionSummary ? sessionSummary.goalReachedNow ? "Daily goal reached" : "Your progress has been saved." : status}</Text>
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Session progress"
            accessibilityValue={{ min: 0, max: timer.duration, now: phase === "setup" ? 0 : timer.duration - timer.timeLeft }} />
          </Animated.View>
        </View>
        <ScrollView style={phase === "setup" && !isQuest ? styles.flex : [styles.activeDetails, phase === "setup" && { maxHeight: Math.max(100, height - timerStageHeight - 220) }]} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEventThrottle={16} onScroll={(event) => { detailsOffset.current = Math.max(0, event.nativeEvent.contentOffset.y); }}>
          <Animated.View testID="session-details-motion" style={{ opacity, transform:[{ translateY:opacity.interpolate({inputRange:[0,1],outputRange:[8,0]}) }] }}>
          {phase !== "setup" && !timer.isCompleted && <Text style={styles.activeTitle} accessibilityRole="header">{timer.isRunning ? isQuest || suggestion ? title : `${focusAreaTitle(area?.title)} · Free session` : `${title} · Paused`}</Text>}
            {suggestion && !timer.isCompleted && <View style={styles.suggestionInstruction}><Text style={styles.secondary}>{suggestion.instruction}</Text></View>}
            {phase === "setup" && <View style={styles.setup}>
              {(loading || timer.isRestoring) && <ActivityIndicator color={colors.accent} />}
              {(choicesError || missingQuest) && <View>
                <Text style={styles.secondary}>{missingQuest ? "Your quest is still linked. Reload its details before starting, or switch to a free session." : "Couldn’t load your choices."}</Text>
                <Action label="Reload choices" onPress={() => void refresh()} />
              </View>}
              {!isQuest && <>
                <View style={styles.presets}>{PRESETS.map((value) => <TouchableOpacity key={value} disabled={locked}
                  style={[styles.preset, fontScale > 1.3 && styles.presetLarge]} onPress={() => selectMinutes(value)}
                  accessibilityRole="button" accessibilityLabel={`${value} minutes`} accessibilityState={{ selected: minutes === value }}>
                  <View pointerEvents="none" style={[styles.presetSurface, minutes === value && styles.presetSelected]} />
                  <Text style={[styles.presetText, minutes === value && styles.presetTextSelected]}>{value}</Text>
                </TouchableOpacity>)}</View>
                <View style={styles.areaSection}>
                  <Text style={styles.secondary}>Focus area</Text>
                  <View style={styles.areaChips}>
                    {subjects.slice(0, 6).map(item => <TouchableOpacity key={item.id} disabled={locked}
                      onPress={() => timer.setTargetAttributeId(item.id)} accessibilityRole="button"
                      accessibilityLabel={`Select ${focusAreaTitle(item.title)}`} accessibilityState={{ selected: item.id === timer.targetAttributeId }}
                      style={styles.areaChip}>
                      <View pointerEvents="none" style={[styles.chipSurface, item.id === timer.targetAttributeId && { backgroundColor: lifeAreaColor(item.id, item.color_code) + "1A" }]} />
                      <Text style={[styles.chipText, item.id === timer.targetAttributeId && { color: lifeAreaColor(item.id, item.color_code) }]}>{focusAreaTitle(item.title)}</Text>
                    </TouchableOpacity>)}
                    {subjects.length > 6 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose focus area" disabled={locked} onPress={() => setPicker("area")} style={styles.areaChip}><View pointerEvents="none" style={styles.chipSurface} /><Text style={styles.chipText}>See all areas</Text></TouchableOpacity>}
                  </View>
                </View>
              </>}
              {isQuest ? <>
                <TouchableOpacity disabled={locked} style={styles.selectedQuestCard} onPress={() => setPicker("quest")}
                  accessibilityRole="button" accessibilityLabel="Change quest" accessibilityHint={`Selected quest: ${title}`}>
                  <View style={[styles.selectedQuestIcon, { backgroundColor: lifeAreaColor(timer.targetAttributeId, area?.color_code) + "18" }]}>
                    <Ionicons name="flag-outline" size={23} color={lifeAreaColor(timer.targetAttributeId, area?.color_code)} />
                  </View>
                  <View style={styles.selectedQuestContent}>
                    <Text style={styles.selectedQuestTitle}>{title}</Text>
                    <Text style={[styles.selectedQuestArea, {color: lifeAreaColor(timer.targetAttributeId, area?.color_code)}]}>{area?.title ?? "General"}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
                </TouchableOpacity>
                <Action disabled={locked} label="Switch to free session" onPress={switchToFree} />
              </> : <TouchableOpacity disabled={locked} style={styles.questRow} onPress={() => setPicker("quest")}
                accessibilityRole="button" accessibilityLabel="Choose a quest">
                <Text style={styles.secondary}>Quest<Text style={styles.helper}> · Optional</Text></Text>
                <Text style={styles.choiceValue}>None</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.secondary} />
              </TouchableOpacity>}
            </View>}

            {timer.isCompleted && timer.sessionSummary && !hideCompletedSummary && <><CompletionRows summary={timer.sessionSummary} areaTitle={area?.title} areaColor={lifeAreaColor(timer.targetAttributeId,area?.color_code)} />
              <SaveSuggestedQuest />
              {timer.completedLevelUp?.leveledUp && <Text style={styles.levelUp} accessibilityLiveRegion="polite">Level up · Level {timer.completedLevelUp.newLevel}</Text>}
            </>}
          </Animated.View>
        </ScrollView>
        <Animated.View testID="session-actions-motion" style={[styles.actions, {opacity}]}>
          {(timer.actionError || timer.restoreError) && <View>
            <Text style={styles.error} accessibilityRole="alert">{timer.actionError ?? "Couldn’t restore your session. Retry before starting a new one."}</Text>
            <Action label="Retry" disabled={timer.actionBusy || timer.isRestoring} onPress={retry} />
          </View>}
          {timer.isCompleted ? !hideCompletedSummary && <>
            <TouchableOpacity style={[styles.primary, { backgroundColor: colors.primary }]} onPress={() => minimise("header")} accessibilityRole="button"><Text style={styles.primaryText}>Done</Text></TouchableOpacity>
            {timer.sessionSummary && <Action label="New session" onPress={() => void newSession()} />}
          </> : <>
            <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.primary, styles.flex, timer.hasOpenSession && styles.activePrimary, disabled && styles.disabled]} disabled={disabled}
              onPress={timer.hasOpenSession ? () => void (timer.isRunning ? timer.pauseTimer() : timer.resumeTimer()) : start}
              accessibilityRole="button" accessibilityState={{ busy: timer.actionBusy, disabled }} accessibilityLabel={actionLabel}>
              {timer.actionBusy ? <ActivityIndicator color={colors.background} /> : <><Ionicons name={timer.isRunning ? "pause" : "play"} size={18} color={timer.hasOpenSession ? colors.text : colors.background} /><Text style={[styles.primaryText, timer.hasOpenSession && { color: colors.text }]}>{timer.hasOpenSession ? actionLabel : "Start session"}</Text></>}
            </TouchableOpacity>
            {timer.hasOpenSession && <TouchableOpacity accessibilityRole="button" accessibilityLabel="End session" disabled={timer.actionBusy} onPress={() => setConfirmEnd(true)} style={styles.endControl}><Ionicons name="close" size={23} color={colors.text} /></TouchableOpacity>}
            </View>
            {timer.hasOpenSession && <Text style={styles.cancelHint}>Ending now doesn’t save this session.</Text>}
          </>}
        </Animated.View>
      </KeyboardAvoidingView>
      <AppSheet visible={!sessionSummary && (picker === "quest" || picker === "area")} onRequestClose={() => setPicker(null)} label="session choices" compact maxHeightRatio={0.82}
        header={<Text style={styles.pickerTitle}>{picker === "quest" ? "Choose a quest" : "Focus area"}</Text>}>
        <BottomSheetScrollView contentContainerStyle={[styles.pickerBody, picker === "quest" && styles.questPickerBody, {paddingBottom: Math.max(insets.bottom, 16) + 12}]} showsVerticalScrollIndicator={false}>
          {picker === "area" && <SheetChoice label={focusAreaTitle()} onPress={() => { timer.setTargetAttributeId(general?.id ?? null); setPicker(null); }} />}
          {picker === "area" && subjects.filter((item) => item.title !== "General").map((item) => <SheetChoice key={item.id} label={focusAreaTitle(item.title)} onPress={() => { timer.setTargetAttributeId(item.id); setPicker(null); }} />)}
          {picker === "quest" && tasks.filter((item) => item.is_due_today && !item.is_completed_today).map((item) => {
            const questArea = subjects.find(subject => subject.id === item.subject_id);
            const tint = lifeAreaColor(item.subject_id, questArea?.color_code);
            const selected = timer.linkedTaskId === item.id;
            return <SheetButton key={item.id} style={[styles.questPickerCard, selected && styles.questPickerSelected]}
              accessibilityRole="button" accessibilityLabel={`Choose ${item.title}`} accessibilityState={{selected}}
              onPress={() => {
                timer.setLinkedTaskId(item.id); timer.setTargetAttributeId(item.subject_id ?? general?.id ?? null);
                timer.setDurationInMinutes(item.target_minutes || 30); setPicker(null);
              }}>
              <View style={[styles.questPickerIcon, {backgroundColor: `${tint}18`}]}><Ionicons name="flag-outline" size={21} color={tint} /></View>
              <View style={styles.selectedQuestContent}>
                <Text style={styles.questPickerTitle}>{item.title}</Text>
                <Text style={styles.questPickerMeta}>{item.target_minutes || 30} min · {focusAreaTitle(questArea?.title)}</Text>
              </View>
              <Ionicons name={selected ? "checkmark-circle" : "chevron-forward"} size={20} color={selected ? colors.accent : colors.secondary} />
            </SheetButton>;
          })}
          {picker === "quest" && !tasks.some((item) => item.is_due_today && !item.is_completed_today) && <View style={styles.questPickerEmpty}>
            <Ionicons name="flag-outline" size={28} color={colors.accent} />
            <Text style={styles.questPickerTitle}>{loading ? "Loading quests…" : "No quests for today"}</Text>
            {!loading && <Text style={styles.secondary}>You can still start a free session.</Text>}
          </View>}
          {choicesError && <SheetChoice label="Couldn’t load choices. Retry" onPress={() => void refresh()} />}
        </BottomSheetScrollView>
      </AppSheet>
      <AppSheet visible={endedVisible} label="session ended" compact maxHeightRatio={0.6}
        header={<Text style={styles.endedTitle}>Session ended</Text>}
        onRequestClose={() => { endedDismissRequested.current = true; setEndedClosing(true); }}
        onDismiss={() => { if (endedDismissRequested.current) minimise("session-ended"); }}>
        <BottomSheetScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.endedBody, {paddingBottom: Math.max(insets.bottom, 16) + 12}]}>
          <View style={styles.endedIcon}><Ionicons name="stop-circle-outline" size={28} color={colors.accent} /></View>
          <Text style={styles.secondary}>This session was cancelled. No focus time or XP were recorded.</Text>
          <SheetButton style={styles.primary} accessibilityRole="button" accessibilityLabel="Done ending session"
            onPress={() => { endedDismissRequested.current = true; setEndedClosing(true); }}><Text style={styles.primaryText}>Done</Text></SheetButton>
        </BottomSheetScrollView>
      </AppSheet>
      <LevelUpModal visible={!!sessionSummary && rewardsVisible}
        durationSeconds={sessionSummary?.durationSeconds} xpEarned={sessionSummary?.xpEarned}
        goldEarned={sessionSummary?.goldEarned} creditVersion={sessionSummary?.creditVersion}
        areaXpEarned={sessionSummary?.areaXpEarned} goalReachedNow={sessionSummary?.goalReachedNow}
        questTitle={title} areaTitle={area?.title} areaColor={lifeAreaColor(timer.targetAttributeId, area?.color_code)}
        isLevelUp={!!timer.completedLevelUp?.leveledUp} newLevel={timer.completedLevelUp?.newLevel}
        onClose={() => { completionDismissRequested.current = true; setCompletionClosing(true); timer.clearCompletionModal(); acknowledgeSummary(); }}
        onDismiss={() => { if (completionDismissRequested.current) minimise("completion"); }} />
      <DurationEditor visible={!sessionSummary && picker === "duration"} seconds={timer.duration} onCancel={() => setPicker(null)} onConfirm={(seconds) => { applyDuration(seconds); setPicker(null); }} />
      {confirmEnd && !sessionSummary && <SheetConfirmation title="End this session?" message="This cancels the current session instead of completing it. Completion rewards will not be awarded." cancelLabel="Keep session" confirmLabel="End session"
        onCancel={() => setConfirmEnd(false)} onConfirm={() => { setConfirmEnd(false); setEndSnapshot({duration:timer.duration, timeLeft:timer.timeLeft, isRunning:timer.isRunning, linkedTaskId:timer.linkedTaskId, targetAttributeId:timer.targetAttributeId, activityType:timer.activityType}); setEndRequested(true); void liveTimer.resetTimer(); }} />}
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
  suggestionInstruction: { padding: 14, borderRadius: 16, backgroundColor: colors.surface, marginTop: 8, marginBottom: 12 },
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  ringLayer: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" },
  activeDetails: { flexGrow: 0, maxHeight: 260 },
  completedHero: { position: "absolute", top: 24, left: 0, right: 0 },
  timerStage: { width: "100%", alignItems: "center", paddingTop: 4 },
  completedTime: { position: "absolute", top: 196, left: 0, right: 0, alignItems: "center", gap: 6 },
  levelUp: { color: colors.accent, fontSize: 17, lineHeight: 24, textAlign: "center", paddingVertical: 12 },
  activeTitle: { color: colors.secondary, fontSize: 16, fontWeight: "500", textAlign: "center", marginTop: 6 },
  areaSection: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 14, gap: 6 },
  areaChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  areaChip: { minHeight: 44, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  chipSurface: { position: "absolute", left: 0, right: 0, top: 4, bottom: 4, borderRadius: 20, backgroundColor: colors.surface },
  presetSurface: { position: "absolute", left: 0, right: 0, top: 2, bottom: 2, borderRadius: 14, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  areaDot: { width: 8, height: 8, borderRadius: 4 },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  actionRow: { flexDirection: "row", gap: 10 },
  activePrimary: { backgroundColor: colors.surface },
  endControl: { width: 54, minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.surface },
  cancelHint: { color: colors.secondary, fontSize: 12, textAlign: "center", lineHeight: 18, paddingTop: 8 },
  activeTimerAnchor: { flex: 1 },
  timerAnchor: { paddingHorizontal: 20, paddingBottom: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  compactAnchor: { paddingTop: 0, paddingBottom: 4 },
  timerControl: { width: 286, maxWidth: "100%", paddingTop: 8 },
  status: { color:colors.secondary, fontSize:16, lineHeight:23, textAlign:"center", marginTop:8 },
  hiddenStatus: { position:"absolute", width:1, height:1, overflow:"hidden", color:colors.background },
  body: { paddingHorizontal: 20, paddingBottom: 20 },
  secondary: { color: colors.secondary, fontSize: 16, lineHeight: 23 },
  setup: { gap: 12, marginTop: 0 },
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
  primary: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.18)", minHeight: 54, padding: 14, borderRadius: 16, backgroundColor: colors.primary, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 },
  primaryText: { color: colors.background, fontSize: 17, fontWeight: "500" },
  disabled: { opacity: 0.5 }, error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  summary: { gap: 14, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 14 }, summaryValue: { color: colors.text, fontSize: 30, fontWeight: "500", letterSpacing: -0.7 },
  endedTitle: {color:colors.text, fontSize:24, lineHeight:30, fontWeight:"500", paddingHorizontal:20, paddingBottom:12},
  endedBody: {paddingHorizontal:20, gap:16},
  endedIcon: {width:48, height:48, borderRadius:16, backgroundColor:colors.accentSoft, alignItems:"center", justifyContent:"center"},
  pickerTitle: { color: colors.text, fontSize: 21, fontWeight: "500", paddingHorizontal: 20, paddingBottom: 16 },
  pickerBody: { paddingHorizontal: 20, paddingBottom: 40 },
  pickerRow: { minHeight: 52, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: 4 },
});
