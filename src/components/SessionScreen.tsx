import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView, TouchableOpacity as SheetButton } from "@gorhom/bottom-sheet";
import { Stack, useFocusEffect, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, BackHandler, Keyboard, KeyboardAvoidingView, PanResponder, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import SheetConfirmation from "./SheetConfirmation";
import { colors } from "../constants/theme";
import DurationPicker, { DurationEditor } from "./DurationPicker";
import { useQuests } from "../context/QuestContext";
import { useTimer } from "../context/TimerContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { durationLabel, validSessionSeconds } from "../utils/sessionSetup";
import { traceSession } from "../utils/sessionTransition";

type Picker = "duration" | "quest" | "area" | null;
const PRESETS = [15, 30, 45, 60];

export default function SessionScreen() {
  const timer = useTimer();
  const { sessionSummary, rewardsVisible, acknowledgeSummary } = timer;
  const { tasks, subjects, loading, error: choicesError, refresh } = useQuests();
  const navigation = useNavigation();
  const reducedMotion = useReducedMotion();
  const { height, fontScale } = useWindowDimensions();
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
  const [screenMotion] = useState(() => new Animated.Value(Platform.OS === "android" ? 0 : 1));
  useEffect(() => {
    if (Platform.OS !== "android" || closing.current) return;
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
    if (layerDismissed || closing.current) return;
    closing.current = true;
    // Target this screen’s native stack directly; never replace/unmount it to close.
    traceSession("native stack close", { canGoBack: navigation.canGoBack(), routeCount: navigation.getState()?.routes.length });
    if (navigation.canGoBack()) {
      if (Platform.OS === "android") {
        traceSession("controlled exit start", { reducedMotion });
        Animated.timing(screenMotion, { toValue: 0, duration: reducedMotion ? 0 : 260, useNativeDriver: true }).start(({ finished }) => {
          traceSession("controlled exit end", { finished });
          if (finished) setExitReady(true);
          else { closing.current = false; screenMotion.setValue(1); }
        });
      } else navigation.goBack();
    }
    else { closing.current = false; console.warn("[Session] Missing anchored back history"); }
  }, [dismissLayer, navigation, reducedMotion, screenMotion]);
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => {
      const inWheel = gesture.y0 >= wheelBounds.current.top && gesture.y0 <= wheelBounds.current.bottom;
      return !picker && !confirmEnd && !keyboardVisible && !rewardsVisible && !closing.current
        && !wheelBusyRef.current && detailsOffset.current <= 0 && !inWheel
        && gesture.dy > 28 && gesture.dy > Math.abs(gesture.dx) * 1.5;
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 90 || (gesture.dy > 35 && gesture.vy > 0.6)) minimise("swipe-down");
    },
  });

  useEffect(() => {
    traceSession("Session React mount");
    return () => traceSession("Session React unmount");
  }, []);
  useEffect(() => {
    const start = navigation.addListener("transitionStart" as never, ((event: { data: { closing: boolean } }) => {
      traceSession("native transitionStart", { closing: event.data.closing });
    }) as never);
    const end = navigation.addListener("transitionEnd" as never, ((event: { data: { closing: boolean } }) => {
      if (Platform.OS !== "android") closing.current = false;
      traceSession("native transitionEnd", { closing: event.data.closing });
    }) as never);
    return () => { start(); end(); };
  }, [navigation]);
  usePreventRemove(!!picker || keyboardVisible || confirmEnd || (Platform.OS === "android" && !exitReady), () => {
    traceSession("removal deferred", { picker, keyboardVisible, confirmEnd, exitReady });
    minimise("navigation-back");
  });
  // Release the removal guard before dispatching the pop; no timeout or native
  // exit runs alongside the Android animation.
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
    <Animated.View testID="session-surface" style={{ flex: 1, backgroundColor: colors.background, opacity: 1,
      transform: [{ translateY: Platform.OS === "android" && !reducedMotion ? screenMotion.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) : 0 }] }}>
    <SafeAreaView collapsable={false} style={styles.screen} {...panResponder.panHandlers}
      onTouchStart={() => wheelView.current?.measureInWindow((_x, y, _width, height) => { wheelBounds.current = { top: y, bottom: y + height }; })}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => minimise("header")} style={styles.close} accessibilityRole="button" accessibilityLabel={timer.hasOpenSession ? "Minimise session" : "Close session"}>
          <Ionicons name="chevron-down" size={23} color={colors.text} /><Text style={styles.link}>{timer.hasOpenSession ? "Minimise" : "Close"}</Text>
        </TouchableOpacity>
        <Text style={styles.secondary}>Session</Text>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View ref={wheelView} onLayout={() => wheelView.current?.measureInWindow((_x, y, _width, height) => { wheelBounds.current = { top: y, bottom: y + height }; })} testID="session-timer-anchor" style={[styles.timerAnchor, height < 700 && styles.compactAnchor]}>
          <Text style={[styles.status, { height: Math.ceil(22 * fontScale) }]} numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">{status}</Text>
          <View style={[styles.timerControl, { marginTop: 16 }]}>
            <DurationPicker seconds={displayedSeconds} interactive={phase === "setup" && !isQuest && !locked}
              revision={durationRevision}
              onCommit={(seconds) => { if (durationEpoch.current === durationRevision && !locked) timer.setDurationInSeconds(seconds); }}
              onBusy={(busy) => { if (durationEpoch.current === durationRevision) { wheelBusyRef.current = busy; setWheelBusy(busy); } }}
              onValidity={(valid) => { if (durationEpoch.current === durationRevision) { durationValidRef.current = valid; setDurationValid(valid); } }}
              onEdit={() => { if (!wheelBusyRef.current) setPicker("duration"); }} />
          </View>
          <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Session progress"
            accessibilityValue={{ min: 0, max: timer.duration, now: phase === "setup" ? 0 : timer.duration - timer.timeLeft }}>
            <View style={[styles.fill, { width: `${phase === "setup" ? 0 : Math.max(0, Math.min(100, (1 - timer.timeLeft / timer.duration) * 100))}%` }]} />
          </View>
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEventThrottle={16} onScroll={(event) => { detailsOffset.current = Math.max(0, event.nativeEvent.contentOffset.y); }}>
          {phase !== "setup" && <>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            <Text style={styles.secondary}>{area?.title ?? "General"} · {durationLabel(timer.duration)}</Text>
          </>}
          <Animated.View style={{ opacity }}>
            {phase === "setup" && <View style={styles.setup}>
              {(loading || timer.isRestoring) && <ActivityIndicator color={colors.accent} />}
              {(choicesError || missingQuest) && <View>
                <Text style={styles.secondary}>{missingQuest ? "Your quest is still linked. Reload its details before starting, or switch to a free session." : "Couldn’t load your choices."}</Text>
                <Action label="Reload choices" onPress={() => void refresh()} />
              </View>}
              <TouchableOpacity disabled={locked} style={styles.questRow} onPress={() => setPicker("quest")}
                accessibilityRole="button" accessibilityLabel={isQuest ? "Change quest" : "Choose a quest"}>
                <Ionicons name="flag-outline" size={22} color={colors.accent} />
                <View style={styles.flex}><Text style={styles.helper}>Quest</Text><Text style={styles.label}>{isQuest ? title : "Choose a quest"}</Text>
                  <Text style={styles.secondary}>{isQuest ? `${durationLabel(timer.duration)} · ${area?.title ?? "General"}` : "Optional"}</Text>
                </View><Ionicons name="chevron-forward" size={18} color={colors.secondary} />
              </TouchableOpacity>
              {isQuest ? <Action disabled={locked} label="Switch to free session" onPress={switchToFree} /> : <>
                <View style={styles.durationSection}>
                  <Text style={styles.helper}>Quick duration</Text>
                  <View style={styles.presets}>{PRESETS.map((value) => <TouchableOpacity key={value} disabled={locked} style={[styles.preset, minutes === value && styles.selected]} onPress={() => selectMinutes(value)} accessibilityRole="button" accessibilityLabel={`${value} minutes`} accessibilityState={{ selected: minutes === value }}><Text style={styles.link}>{value} min</Text></TouchableOpacity>)}
                  </View>
                </View>
                <Choice label="Life area" value={area?.title ?? "General"} disabled={locked} onPress={() => setPicker("area")} />
              </>}
            </View>}
            {timer.hasOpenSession && !timer.isCompleted && <Text style={styles.activeHint}>{timer.isRunning ? "One thing at a time. Your session keeps going when minimised." : "Take your time. Resume whenever you’re ready."}</Text>}
            {timer.isCompleted && timer.sessionSummary && <View style={styles.summary}>
              <Text style={styles.summaryValue}>{durationLabel(timer.sessionSummary.durationSeconds)} completed</Text>
              <Text style={styles.secondary}>+{timer.sessionSummary.xpEarned} XP · +{timer.sessionSummary.goldEarned} gold</Text>
              <Text style={styles.helper}>Your progress has been saved.</Text>
            </View>}
          </Animated.View>
        </ScrollView>
        <View style={styles.actions}>
          {(timer.actionError || timer.restoreError) && <View>
            <Text style={styles.error} accessibilityRole="alert">{timer.actionError ?? "Couldn’t restore your session. Retry before starting a new one."}</Text>
            <Action label="Retry" disabled={timer.actionBusy || timer.isRestoring} onPress={retry} />
          </View>}
          {timer.isCompleted ? <>
            <TouchableOpacity style={styles.primary} onPress={() => minimise("header")} accessibilityRole="button"><Text style={styles.primaryText}>Done</Text></TouchableOpacity>
            {timer.sessionSummary && <Action label="New session" onPress={() => void newSession()} />}
          </> : <>
            <TouchableOpacity style={[styles.primary, disabled && styles.disabled]} disabled={disabled}
              onPress={timer.hasOpenSession ? () => void (timer.isRunning ? timer.pauseTimer() : timer.resumeTimer()) : start}
              accessibilityRole="button" accessibilityState={{ busy: timer.actionBusy, disabled }} accessibilityLabel={actionLabel}>
              {timer.actionBusy ? <ActivityIndicator color={colors.background} /> : <><Ionicons name={timer.isRunning ? "pause" : "play"} size={18} color={colors.background} /><Text style={styles.primaryText}>{actionLabel}</Text></>}
            </TouchableOpacity>
            {timer.hasOpenSession && <Action label="End session" disabled={timer.actionBusy} onPress={() => setConfirmEnd(true)} />}
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
function Choice({ label, value, onPress, disabled }: { label: string; value: string; onPress: () => void; disabled: boolean }) {
  return <TouchableOpacity style={styles.choiceRow} disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Choose ${label.toLowerCase()}`}>
    <Text style={styles.label}>{label}</Text><Text style={styles.choiceValue}>{value}</Text><Ionicons name="chevron-forward" size={16} color={colors.muted} />
  </TouchableOpacity>;
}
function SheetChoice({ label, detail, onPress }: { label: string; detail?: string; onPress: () => void }) {
  return <SheetButton style={styles.pickerRow} onPress={onPress} accessibilityRole="button"><Text style={styles.label}>{label}</Text>{detail && <Text style={styles.secondary}>{detail}</Text>}</SheetButton>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  header: { paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52 },
  close: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 },
  timerAnchor: { paddingHorizontal: 28, paddingTop: 8, paddingBottom: 12, alignItems: "center", flexShrink: 0 },
  compactAnchor: { paddingTop: 0, paddingBottom: 8 },
  timerControl: { width: "100%" },
  status: { color: colors.accent, fontWeight: "600", fontSize: 14, minHeight: 22 },
  track: { height: 3, width: "65%", borderRadius: 2, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.accent },
  body: { paddingHorizontal: 24, paddingBottom: 20 },
  title: { color: colors.text, fontSize: 23, fontWeight: "600", marginBottom: 7 },
  secondary: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  setup: { gap: 14, marginTop: 8 },
  label: { color: colors.text, fontSize: 15, flexShrink: 1 },
  link: { color: colors.accent, fontSize: 14, fontWeight: "500" },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  choiceRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  choiceValue: { color: colors.secondary, flex: 1, textAlign: "right", fontSize: 14 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  questRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  durationSection: { gap: 10 },
  smallAction: { minHeight: 44, paddingVertical: 10, justifyContent: "center", alignItems: "center" },
  activeHint: { color: colors.secondary, fontSize: 15, lineHeight: 24, marginTop: 24 },
  actions: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 12, gap: 4 },
  primary: { minHeight: 54, padding: 14, borderRadius: 16, backgroundColor: colors.accent, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 },
  primaryText: { color: colors.background, fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.5 }, error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  summary: { gap: 12, marginTop: 24 }, summaryValue: { color: colors.text, fontSize: 21, fontWeight: "500" },
  pickerTitle: { color: colors.text, fontSize: 21, fontWeight: "600", paddingHorizontal: 24, paddingBottom: 16 },
  pickerBody: { paddingHorizontal: 24, paddingBottom: 40 },
  pickerRow: { minHeight: 52, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: 4 },
});
