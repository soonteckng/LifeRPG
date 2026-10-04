import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView, TouchableOpacity as SheetButton } from "@gorhom/bottom-sheet";
import { Stack, useFocusEffect, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, BackHandler, Keyboard, KeyboardAvoidingView, PanResponder, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import ProgressRing from "./ProgressRing";
import { lifeAreaColor } from "../utils/lifeAreaColor";
import AppHeader from "./AppHeader";
import SheetConfirmation from "./SheetConfirmation";
import { colors } from "../constants/theme";
import DurationPicker, { DurationEditor } from "./DurationPicker";
import { useQuests } from "../context/QuestContext";
import { useTimer } from "../context/TimerContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { durationLabel, validSessionSeconds, sessionTime } from "../utils/sessionSetup";
import { traceSession } from "../utils/sessionTransition";

type Picker = "duration" | "quest" | "area" | null;
const PRESETS = [15, 25, 45, 60];

export default function SessionScreen() {
  const timer = useTimer();
  const { sessionSummary, rewardsVisible, acknowledgeSummary } = timer;
  const { tasks, subjects, loading, error: choicesError, refresh } = useQuests();
  const navigation = useNavigation();
  const reducedMotion = useReducedMotion();
  const { width, height, fontScale } = useWindowDimensions();
  const timerFontSize = Math.min(56 * Math.min(fontScale, 1.25), (Math.min(252, width - 48) - 22) / 1.86);
  const ringTop = 12 + Math.ceil(20 * fontScale) + Math.ceil(timerFontSize * 1.25) * 1.5 - 126;
  const [picker, setPicker] = useState<Picker>(null);
  const [durationRevision, setDurationRevision] = useState(0);
  const durationEpoch = useRef(0);
  const wheelBusyRef = useRef(false);
  const durationValidRef = useRef(true);
  const [wheelBusy, setWheelBusy] = useState(false);
  const [durationValid, setDurationValid] = useState(true);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const wheelBounds = useRef({ top: 0, bottom: 0 });
  const wheelView = useRef<View>(null);
  const detailsOffset = useRef(0);
  const closing = useRef(false);
  const [exitReady, setExitReady] = useState(false);
  const [screenMotion] = useState(() => new Animated.Value(0));
  const [surfaceOpacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (closing.current) return;
    const animation = Animated.timing(screenMotion, { toValue: 1, duration: reducedMotion ? 0 : 280, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [screenMotion, reducedMotion]);
  useFocusEffect(useCallback(() => {
    if (sessionSummary && !rewardsVisible) acknowledgeSummary();
  }, [sessionSummary, rewardsVisible, acknowledgeSummary]));
  const [opacity] = useState(() => new Animated.Value(1));

  const task = tasks.find((item) => item.id === timer.linkedTaskId);
  const general = subjects.find((item) => item.title === "General");
  const area = subjects.find((item) => item.id === timer.targetAttributeId);
  const locked = timer.hasOpenSession || timer.isCompleted || timer.actionBusy || timer.isRestoring;
  const isQuest = timer.linkedTaskId !== null;
  const missingQuest = isQuest && !task;
  const minutes = timer.duration / 60;
  const phase = timer.isCompleted ? "completed" : timer.hasOpenSession ? timer.isRunning ? "running" : "paused" : "setup";

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!locked && !isQuest && timer.targetAttributeId === null && general) timer.setTargetAttributeId(general.id);
    if (task && timer.hasOpenSession) timer.resolveQuestTitle(task.id, task.title);
  }, [locked, isQuest, general, task, timer]);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => {
    // Surrounding controls fade; the timer stays mounted outside this animation.
    opacity.setValue(reducedMotion ? 1 : 0);
    const animation = Animated.timing(opacity, { toValue: 1, duration: reducedMotion ? 0 : 180, useNativeDriver: true });
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
    const layerDismissed = dismissLayer();
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
      Animated.timing(surfaceOpacity, { toValue: reducedMotion ? 1 : 0.82, duration: reducedMotion ? 0 : 260, useNativeDriver: true }).start();
      Animated.timing(screenMotion, { toValue: 0, duration: reducedMotion ? 0 : 260, useNativeDriver: true }).start(({ finished }) => {
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
  usePreventRemove(!!picker || keyboardVisible || confirmEnd || !exitReady, () => {
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
  const title = timer.sessionSummary?.questTitle || (isQuest ? task?.title ?? (loading ? "Loading quest…" : "Quest unavailable") : "Free session");
  const status = timer.isRestoring ? "Restoring your session…" : timer.isCompleted ? timer.sessionSummary ? "Time focused" : timer.actionError ? "Completion needs attention" : "Saving your session…" : timer.hasOpenSession ? timer.isRunning ? "● Session running" : "Paused" : "Ready when you are";
  const displayedSeconds = phase === "setup" ? timer.duration
    : phase === "completed" && sessionSummary ? sessionSummary.durationSeconds
    : timer.timeLeft;
  const disabled = timer.actionBusy || timer.isRestoring || timer.restoreError || (!timer.hasOpenSession && (missingQuest || wheelBusy || !durationValid || !!picker));
  const actionLabel = timer.hasOpenSession ? timer.isRunning ? "Pause" : "Resume" : "Start";

  return (
    <Animated.View testID="session-surface" style={{ flex: 1, backgroundColor: colors.background, opacity: surfaceOpacity,
      transform: [{ translateY: !reducedMotion ? screenMotion.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) : 0 }] }}>
    <SafeAreaView collapsable={false} style={styles.screen} {...panResponder.panHandlers}
      onTouchStart={() => wheelView.current?.measureInWindow((_x, y, _width, height) => { wheelBounds.current = { top: y, bottom: y + height }; })}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <AppHeader title={phase === "setup" ? "New session" : area?.title ?? "Session"} dismiss onBack={() => minimise("header")} backLabel={timer.hasOpenSession ? "Minimise session" : "Close session"} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View ref={wheelView} onLayout={() => wheelView.current?.measureInWindow((_x, y, _width, height) => { wheelBounds.current = { top: y, bottom: y + height }; })} testID="session-timer-anchor" style={[styles.timerAnchor, height < 700 && styles.compactAnchor]}>
          <View pointerEvents="none" style={[styles.ringLayer, { top: phase === "completed" && sessionSummary ? 12 : ringTop }]}>
            {phase !== "setup" && <ProgressRing size={phase === "completed" && sessionSummary ? 120 : 252}
              progress={phase === "completed" && sessionSummary ? 1 : Math.max(0, Math.min(1, 1 - timer.timeLeft / Math.max(1, timer.duration)))}
              color={phase === "completed" ? colors.accent : "#25C9B8"}>
              {phase === "completed" && sessionSummary && <Ionicons name="checkmark" size={42} color={colors.accent} />}
            </ProgressRing>}
          </View>
          <View style={[styles.timerControl, phase === "completed" && !!sessionSummary && { opacity: 0 }]} importantForAccessibility={phase === "completed" && sessionSummary ? "no-hide-descendants" : "auto"}>
            <DurationPicker seconds={displayedSeconds} interactive={phase === "setup" && !isQuest && !locked}
              compact caption={phase === "setup" ? undefined : `of ${sessionTime(timer.duration)}`}
              revision={durationRevision}
              onCommit={(seconds) => { if (durationEpoch.current === durationRevision && !locked) timer.setDurationInSeconds(seconds); }}
              onBusy={(busy) => { if (durationEpoch.current === durationRevision) { wheelBusyRef.current = busy; setWheelBusy(busy); } }}
              onValidity={(valid) => { if (durationEpoch.current === durationRevision) { durationValidRef.current = valid; setDurationValid(valid); } }}
              onEdit={() => { if (!wheelBusyRef.current) setPicker("duration"); }} />
          </View>
          {phase === "completed" && sessionSummary && <View style={styles.completedTime}>
            <Text style={styles.secondary}>Time focused</Text><Text style={styles.summaryValue}>{durationLabel(sessionSummary.durationSeconds)}</Text>
          </View>}
          <Text style={[styles.status, { minHeight: Math.ceil(18 * fontScale) }]} accessibilityLiveRegion="polite">{phase === "setup" ? "" : phase === "completed" && sessionSummary ? sessionSummary.goalReachedNow ? "Goal reached for today" : "Your progress has been saved." : status}</Text>
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Session progress"
            accessibilityValue={{ min: 0, max: timer.duration, now: phase === "setup" ? 0 : timer.duration - timer.timeLeft }} />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEventThrottle={16} onScroll={(event) => { detailsOffset.current = Math.max(0, event.nativeEvent.contentOffset.y); }}>
          {phase !== "setup" && !timer.isCompleted && <Text style={styles.activeTitle} accessibilityRole="header">{title}</Text>}
          <Animated.View style={{ opacity }}>
            {phase === "setup" && <View style={styles.setup}>
              {(loading || timer.isRestoring) && <ActivityIndicator color={colors.accent} />}
              {(choicesError || missingQuest) && <View>
                <Text style={styles.secondary}>{missingQuest ? "Your quest is still linked. Reload its details before starting, or switch to a free session." : "Couldn’t load your choices."}</Text>
                <Action label="Reload choices" onPress={() => void refresh()} />
              </View>}
              {!isQuest && <>
                <View style={styles.presets}>{PRESETS.map((value) => <TouchableOpacity key={value} disabled={locked}
                  style={[styles.preset, minutes === value && styles.selected]} onPress={() => selectMinutes(value)}
                  accessibilityRole="button" accessibilityLabel={`${value} minutes`} accessibilityState={{ selected: minutes === value }}>
                  <Text style={[styles.link, minutes === value && { color: "#25C9B8" }]}>{value}</Text>
                </TouchableOpacity>)}</View>
                <View style={styles.areaSection}>
                  <Text style={styles.secondary}>Life area</Text>
                  <View style={styles.areaChips}>
                    {subjects.slice(0, 6).map(item => <TouchableOpacity key={item.id} disabled={locked}
                      onPress={() => timer.setTargetAttributeId(item.id)} accessibilityRole="button"
                      accessibilityLabel={`Select ${item.title}`} accessibilityState={{ selected: item.id === timer.targetAttributeId }}
                      style={[styles.areaChip, item.id === timer.targetAttributeId && styles.selected]}>
                      <Text style={[styles.link, item.id === timer.targetAttributeId && { color: "#25C9B8" }]}>{item.title}</Text>
                    </TouchableOpacity>)}
                    {subjects.length > 6 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose life area" disabled={locked} onPress={() => setPicker("area")} style={styles.areaChip}><Text style={styles.link}>See all areas</Text></TouchableOpacity>}
                  </View>
                </View>
              </>}
              <TouchableOpacity disabled={locked} style={styles.questRow} onPress={() => setPicker("quest")}
                accessibilityRole="button" accessibilityLabel={isQuest ? "Change quest" : "Choose a quest"}>
                <Text style={styles.secondary}>Quest{!isQuest && <Text style={styles.helper}> · Optional</Text>}</Text>
                <Text style={[styles.choiceValue, { color: isQuest ? colors.text : colors.secondary }]} numberOfLines={2}>{isQuest ? title : "None"}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.secondary} />
              </TouchableOpacity>
              {isQuest && <><Text style={styles.secondary}>{area?.title ?? "General"} · {durationLabel(timer.duration)}</Text><Action disabled={locked} label="Switch to free session" onPress={switchToFree} /></>}
            </View>}

            {timer.isCompleted && timer.sessionSummary && <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <View style={[styles.areaDot, { backgroundColor: lifeAreaColor(timer.targetAttributeId, area?.color_code) }]} />
                <Text style={[styles.label, styles.flex]}>{area?.title ?? "General"}</Text>
                <Text style={styles.label}>+{timer.sessionSummary.creditVersion === 1 ? timer.sessionSummary.areaXpEarned ?? 0 : timer.sessionSummary.xpEarned} XP</Text>
              </View>
              <View style={styles.summaryRow}><Text style={styles.secondary}>Character XP</Text><Text style={styles.label}>+{timer.sessionSummary.xpEarned}</Text></View>
              {timer.sessionSummary.creditVersion === 1 && <Text style={styles.helper}>
                {timer.sessionSummary.characterRemainderSeconds ?? 0}s carried toward your next character XP.
                {timer.sessionSummary.areaRemainderSeconds != null ? ` ${timer.sessionSummary.areaRemainderSeconds}s carried toward your next Life area XP.` : ""}
              </Text>}
              {timer.sessionSummary.creditVersion !== 1 && timer.sessionSummary.goldEarned > 0 && <Text style={styles.helper}>+{timer.sessionSummary.goldEarned} gold · Historical reward</Text>}
              <Text style={styles.helper}>Counted toward the day this session finished.</Text>
            </View>}
          </Animated.View>
        </ScrollView>
        <View style={styles.actions}>
          {(timer.actionError || timer.restoreError) && <View>
            <Text style={styles.error} accessibilityRole="alert">{timer.actionError ?? "Couldn’t restore your session. Retry before starting a new one."}</Text>
            <Action label="Retry" disabled={timer.actionBusy || timer.isRestoring} onPress={retry} />
          </View>}
          {timer.isCompleted ? <>
            <TouchableOpacity style={[styles.primary, { backgroundColor: "#E5E4FF" }]} onPress={() => minimise("header")} accessibilityRole="button"><Text style={styles.primaryText}>Done</Text></TouchableOpacity>
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
        </View>
      </KeyboardAvoidingView>
      <AppSheet visible={picker === "quest" || picker === "area"} onRequestClose={() => setPicker(null)} label="session choices"
        header={<Text style={styles.pickerTitle}>{picker === "quest" ? "Choose a quest" : "Life area"}</Text>}>
        <BottomSheetScrollView contentContainerStyle={styles.pickerBody}>
          {picker === "area" && <SheetChoice label="General" onPress={() => { timer.setTargetAttributeId(general?.id ?? null); setPicker(null); }} />}
          {picker === "area" && subjects.filter((item) => item.title !== "General").map((item) => <SheetChoice key={item.id} label={item.title} onPress={() => { timer.setTargetAttributeId(item.id); setPicker(null); }} />)}
          {picker === "quest" && tasks.filter((item) => item.is_due_today && !item.is_completed_today).map((item) => <SheetChoice key={item.id} label={item.title} detail={`${item.target_minutes || 30} min · ${subjects.find((subject) => subject.id === item.subject_id)?.title ?? "General"}`} onPress={() => {
            timer.setLinkedTaskId(item.id); timer.setTargetAttributeId(item.subject_id ?? general?.id ?? null);
            timer.setDurationInMinutes(item.target_minutes || 30); setPicker(null);
          }} />)}
          {picker === "quest" && !tasks.some((item) => item.is_due_today && !item.is_completed_today) && <Text style={styles.secondary}>{loading ? "Loading quests…" : "No unfinished quests available today."}</Text>}
          {choicesError && <SheetChoice label="Couldn’t load choices. Retry" onPress={() => void refresh()} />}
        </BottomSheetScrollView>
      </AppSheet>
      <DurationEditor visible={picker === "duration"} seconds={timer.duration} onCancel={() => setPicker(null)} onConfirm={(seconds) => { applyDuration(seconds); setPicker(null); }} />
      {confirmEnd && <SheetConfirmation title="End this session?" message="This cancels the current session instead of completing it. Completion rewards will not be awarded." cancelLabel="Keep session" confirmLabel="End session"
        onCancel={() => setConfirmEnd(false)} onConfirm={() => { setConfirmEnd(false); void timer.resetTimer(); }} />}
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
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  ringLayer: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" },
  completedTime: { position: "absolute", top: 156, left: 0, right: 0, alignItems: "center", gap: 6 },
  activeTitle: { color: colors.text, fontSize: 16, fontWeight: "500", textAlign: "center", marginTop: 18 },
  areaSection: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14, gap: 6 },
  areaChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  areaChip: { minHeight: 44, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: colors.surface },
  areaDot: { width: 8, height: 8, borderRadius: 4 },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  actionRow: { flexDirection: "row", gap: 10 },
  activePrimary: { backgroundColor: colors.surface },
  endControl: { width: 54, minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.surface },
  cancelHint: { color: colors.secondary, fontSize: 12, textAlign: "center", lineHeight: 18, paddingTop: 8 },
  timerAnchor: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 4, alignItems: "center", flexShrink: 0 },
  compactAnchor: { paddingTop: 0, paddingBottom: 4 },
  timerControl: { width: 252, maxWidth: "100%", paddingTop: 8 },
  status: { color: colors.secondary, fontSize: 12, textAlign: "center", lineHeight: 18 },
  body: { paddingHorizontal: 24, paddingBottom: 20 },
  secondary: { color: colors.secondary, fontSize: 16, lineHeight: 23 },
  setup: { gap: 12, marginTop: 0 },
  label: { color: colors.text, fontSize: 17, flexShrink: 1 },
  link: { color: colors.accent, fontSize: 16, fontWeight: "500" },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  choiceValue: { color: colors.secondary, flex: 1, textAlign: "right", fontSize: 16 },
  presets: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 12, paddingBottom: 6 },
  preset: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", borderRadius: 22, backgroundColor: colors.surface },
  selected: { backgroundColor: "rgba(37,201,184,0.13)" },
  questRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 48, borderTopWidth: 1, borderTopColor: colors.line },
  smallAction: { minHeight: 44, paddingVertical: 10, justifyContent: "center", alignItems: "center" },
  actions: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 12, gap: 4 },
  primary: { minHeight: 54, padding: 14, borderRadius: 16, backgroundColor: "#25C9B8", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 },
  primaryText: { color: colors.background, fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.5 }, error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  summary: { gap: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 }, summaryValue: { color: colors.text, fontSize: 30, fontWeight: "600", letterSpacing: -0.7 },
  pickerTitle: { color: colors.text, fontSize: 21, fontWeight: "600", paddingHorizontal: 24, paddingBottom: 16 },
  pickerBody: { paddingHorizontal: 24, paddingBottom: 40 },
  pickerRow: { minHeight: 52, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: 4 },
});

