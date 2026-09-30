import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView, TouchableOpacity as SheetButton } from "@gorhom/bottom-sheet";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, BackHandler, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import SheetConfirmation from "./SheetConfirmation";
import { colors } from "../constants/theme";
import { SESSION_ACTIVITIES, formatSessionActivity } from "../constants/sessionActivities";
import { useQuests } from "../context/QuestContext";
import { useTimer } from "../context/TimerContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { sessionTime, validatedSessionMinutes } from "../utils/sessionSetup";

type Picker = "activity" | "quest" | "area" | null;
const PRESETS = [15, 30, 45, 60];

export default function SessionScreen() {
  const timer = useTimer();
  const { tasks, subjects, loading, error: choicesError, refresh } = useQuests();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  const [picker, setPicker] = useState<Picker>(null);
  const [custom, setCustom] = useState(!PRESETS.includes(timer.duration / 60));
  const [minutesText, setMinutesText] = useState(String(timer.duration / 60));
  const [validation, setValidation] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const closing = useRef(false);
  const [opacity] = useState(() => new Animated.Value(1));
  const task = tasks.find((item) => item.id === timer.linkedTaskId);
  const general = subjects.find((item) => item.title === "General");
  const area = subjects.find((item) => item.id === timer.targetAttributeId);
  const locked = timer.hasOpenSession || timer.isCompleted || timer.actionBusy || timer.isRestoring;
  const isQuest = timer.linkedTaskId !== null;
  const missingQuest = isQuest && !task;
  const minutes = isQuest ? timer.duration / 60 : custom ? validatedSessionMinutes(minutesText) : timer.duration / 60;
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
  const minimise = useCallback(() => {
    if (dismissLayer() || closing.current) return;
    closing.current = true;
    if (router.canDismiss()) router.dismiss();
    else router.replace("/");
  }, [dismissLayer, router]);
  usePreventRemove(!!picker || keyboardVisible || confirmEnd, () => { dismissLayer(); });
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { minimise(); return true; });
    return () => subscription.remove();
  }, [minimise]));

  const selectMinutes = (value: number) => {
    if (locked) return;
    setCustom(false); setMinutesText(String(value)); setValidation(null);
    timer.setDurationInMinutes(value);
  };
  const start = () => {
    if (locked || missingQuest || timer.restoreError) return;
    if (minutes === null) { setValidation("Enter a whole number from 1 to 480 minutes."); return; }
    Keyboard.dismiss(); setValidation(null);
    void timer.startTimer(minutes, task?.title);
  };
  const switchToFree = () => {
    if (locked) return;
    timer.setLinkedTaskId(null); timer.setTargetAttributeId(general?.id ?? null);
    selectMinutes(30);
  };
  const newSession = async () => {
    await timer.resetTimer();
    timer.setLinkedTaskId(null); timer.setTargetAttributeId(general?.id ?? null); timer.setActivityType("other"); timer.setNotes("");
    timer.setDurationInMinutes(30); setCustom(false); setMinutesText("30"); setValidation(null);
  };
  const retry = () => {
    if (timer.restoreError) timer.retryRestore();
    else if (timer.isCompleted) void timer.retryCompletion();
    else if (timer.hasOpenSession) void timer.retryAction();
    else start();
  };
  const title = timer.sessionSummary?.questTitle || (isQuest ? task?.title ?? (loading ? "Loading quest…" : "Quest unavailable") : formatSessionActivity(timer.activityType));
  const status = timer.isRestoring ? "Restoring your session…" : timer.isCompleted ? timer.sessionSummary ? "Session complete" : timer.actionError ? "Completion needs attention" : "Saving your session…" : timer.hasOpenSession ? timer.isRunning ? "In progress" : "Paused" : "Ready when you are";
  const disabled = timer.actionBusy || timer.isRestoring || timer.restoreError || (!timer.hasOpenSession && missingQuest);
  const actionLabel = timer.hasOpenSession ? timer.isRunning ? "Pause" : "Resume" : "Start";

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ gestureEnabled: !picker && !keyboardVisible && !confirmEnd }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={minimise} style={styles.close} accessibilityRole="button" accessibilityLabel={timer.hasOpenSession ? "Minimise session" : "Close session"}>
          <Ionicons name="chevron-down" size={23} color={colors.text} /><Text style={styles.link}>{timer.hasOpenSession ? "Minimise" : "Close"}</Text>
        </TouchableOpacity>
        <Text style={styles.secondary}>Session</Text>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View testID="session-timer-anchor" style={[styles.timerAnchor, height < 700 && styles.compactAnchor]}>
          <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
          <Text testID="session-countdown" style={styles.timer} maxFontSizeMultiplier={1.25} adjustsFontSizeToFit numberOfLines={1}>
            {phase === "setup" && minutes === null ? "—:—" : sessionTime(phase === "setup" ? (minutes ?? 0) * 60 : timer.timeLeft)}
          </Text>
          <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Session progress"
            accessibilityValue={{ min: 0, max: timer.duration, now: phase === "setup" ? 0 : timer.duration - timer.timeLeft }}>
            <View style={[styles.fill, { width: `${phase === "setup" ? 0 : Math.max(0, Math.min(100, (1 - timer.timeLeft / timer.duration) * 100))}%` }]} />
          </View>
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <Text style={styles.secondary}>{area?.title ?? "General"}{isQuest ? ` · ${timer.duration / 60} min · ${formatSessionActivity(timer.activityType)}` : ""}</Text>
          <Animated.View style={{ opacity }}>
            {phase === "setup" && <View style={styles.setup}>
              {(loading || timer.isRestoring) && <ActivityIndicator color={colors.accent} />}
              {(choicesError || missingQuest) && <View>
                <Text style={styles.secondary}>{missingQuest ? "Your quest is still linked. Reload its details before starting, or switch to a free session." : "Couldn’t load your choices."}</Text>
                <Action label="Reload choices" onPress={() => void refresh()} />
              </View>}
              <Choice label="Activity" value={formatSessionActivity(timer.activityType)} disabled={locked} onPress={() => setPicker("activity")} />
              {!isQuest && <>
                <Text style={styles.label}>Duration</Text>
                <View style={styles.presets}>{PRESETS.map((value) => <TouchableOpacity key={value} disabled={locked} style={[styles.preset, !custom && minutes === value && styles.selected]} onPress={() => selectMinutes(value)} accessibilityRole="button" accessibilityLabel={`${value} minutes`} accessibilityState={{ selected: !custom && minutes === value }}><Text style={styles.link}>{value}</Text></TouchableOpacity>)}
                  <TouchableOpacity disabled={locked} style={[styles.preset, custom && styles.selected]} onPress={() => setCustom(true)} accessibilityRole="button"><Text style={styles.link}>Custom</Text></TouchableOpacity>
                </View>
                {custom && <TextInput accessibilityLabel="Custom duration in minutes" editable={!locked} value={minutesText}
                  onChangeText={(text) => { setMinutesText(text); setValidation(null); }} keyboardType="number-pad" maxLength={3} style={styles.input} />}
                <Choice label="Life area" value={area?.title ?? "General"} disabled={locked} onPress={() => setPicker("area")} />
              </>}
              <Text style={styles.helper}>Activity describes what you do. Life area groups the session in your progress.</Text>
              <View style={styles.links}>
                <Action disabled={locked} label={isQuest ? "Change quest" : "Use a quest"} onPress={() => setPicker("quest")} />
                {isQuest && <Action disabled={locked} label="Switch to free session" onPress={switchToFree} />}
              </View>
            </View>}
            {timer.hasOpenSession && !timer.isCompleted && <Text style={styles.activeHint}>{timer.isRunning ? "One thing at a time. Your session keeps going when minimised." : "Take your time. Resume whenever you’re ready."}</Text>}
            {timer.isCompleted && timer.sessionSummary && <View style={styles.summary}>
              <Text style={styles.summaryValue}>{timer.sessionSummary.minutesSpent} minutes completed</Text>
              <Text style={styles.secondary}>+{timer.sessionSummary.xpEarned} XP · +{timer.sessionSummary.goldEarned} gold</Text>
              <Text style={styles.helper}>Your progress has been saved.</Text>
            </View>}
          </Animated.View>
        </ScrollView>
        <View style={styles.actions}>
          {(validation || timer.actionError || timer.restoreError) && <View>
            <Text style={styles.error} accessibilityRole="alert">{validation ?? timer.actionError ?? "Couldn’t restore your session. Retry before starting a new one."}</Text>
            {!validation && <Action label="Retry" disabled={timer.actionBusy || timer.isRestoring} onPress={retry} />}
          </View>}
          {timer.isCompleted ? <>
            <TouchableOpacity style={styles.primary} onPress={minimise} accessibilityRole="button"><Text style={styles.primaryText}>Done</Text></TouchableOpacity>
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
      <AppSheet visible={picker !== null} onRequestClose={() => setPicker(null)} label="session choices"
        header={<Text style={styles.pickerTitle}>{picker === "quest" ? "Choose a quest" : picker === "area" ? "Life area" : "Activity"}</Text>}>
        <BottomSheetScrollView contentContainerStyle={styles.pickerBody}>
          {picker === "activity" && SESSION_ACTIVITIES.map((item) => <SheetChoice key={item.id} label={item.label} onPress={() => { timer.setActivityType(item.id); setPicker(null); }} />)}
          {picker === "area" && <SheetChoice label="General" onPress={() => { timer.setTargetAttributeId(general?.id ?? null); setPicker(null); }} />}
          {picker === "area" && subjects.filter((item) => item.title !== "General").map((item) => <SheetChoice key={item.id} label={item.title} onPress={() => { timer.setTargetAttributeId(item.id); setPicker(null); }} />)}
          {picker === "quest" && tasks.filter((item) => item.is_due_today && !item.is_completed_today).map((item) => <SheetChoice key={item.id} label={item.title} onPress={() => {
            timer.setLinkedTaskId(item.id); timer.setTargetAttributeId(item.subject_id ?? general?.id ?? null);
            timer.setDurationInMinutes(item.target_minutes || 30); setMinutesText(String(item.target_minutes || 30)); setCustom(false); setValidation(null); setPicker(null);
          }} />)}
          {picker === "quest" && !tasks.some((item) => item.is_due_today && !item.is_completed_today) && <Text style={styles.secondary}>{loading ? "Loading quests…" : "No unfinished quests available today."}</Text>}
          {choicesError && <SheetChoice label="Couldn’t load choices. Retry" onPress={() => void refresh()} />}
        </BottomSheetScrollView>
      </AppSheet>
      {confirmEnd && <SheetConfirmation title="End this session?" message="This cancels the current session instead of completing it. Completion rewards will not be awarded." cancelLabel="Keep session" confirmLabel="End session"
        onCancel={() => setConfirmEnd(false)} onConfirm={() => { setConfirmEnd(false); void timer.resetTimer(); }} />}
    </SafeAreaView>
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
function SheetChoice({ label, onPress }: { label: string; onPress: () => void }) {
  return <SheetButton style={styles.pickerRow} onPress={onPress} accessibilityRole="button"><Text style={styles.label}>{label}</Text></SheetButton>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  header: { paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52 },
  close: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 },
  timerAnchor: { paddingHorizontal: 28, paddingTop: 24, paddingBottom: 24, alignItems: "center", flexShrink: 0 },
  compactAnchor: { paddingTop: 8, paddingBottom: 16 },
  status: { color: colors.secondary, fontSize: 13, minHeight: 22 },
  timer: { color: colors.text, fontSize: 76, fontWeight: "300", fontVariant: ["tabular-nums"], letterSpacing: -2, textAlign: "center", width: "100%", marginVertical: 8 },
  track: { height: 3, width: "65%", borderRadius: 2, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.accent },
  body: { paddingHorizontal: 24, paddingBottom: 20 },
  title: { color: colors.text, fontSize: 23, fontWeight: "600", marginBottom: 7 },
  secondary: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  setup: { gap: 12, marginTop: 18 },
  label: { color: colors.text, fontSize: 15, flexShrink: 1 },
  link: { color: colors.accent, fontSize: 14, fontWeight: "500" },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  choiceRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  choiceValue: { color: colors.secondary, flex: 1, textAlign: "right", fontSize: 14 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  input: { color: colors.text, fontSize: 18, padding: 12, minHeight: 48, borderRadius: 12, backgroundColor: colors.surface },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: 18 },
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
