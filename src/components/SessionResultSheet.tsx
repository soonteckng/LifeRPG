import { requiredCharacterXP } from "../utils/levelTiers";
import TouchableOpacity from "./MotionPressable";
import { Text } from "./AppText";
import { useUser } from "../context/UserContext";
import { CompletionHero, CompletionRows } from "./CompletionDetails";
import { colors } from "../constants/theme";
import { completionSheetHeight } from "../utils/completionSheetLayout";
import { DEFAULT_TIMEZONE } from "../utils/progressAnalytics";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import * as Haptics from "expo-haptics";
import { dailyAchievementQueue } from "../services/dailyAchievementQueue";
import type { DailyEffortEvidence } from "../services/dailyEffortCelebrationService";


export interface SessionResultSheetProps {
  sessionId?: string | null;
  completedAtMs?: number;
  recovered?: boolean;
  visible: boolean;
  xpEarned?: number;
  goldEarned?: number;
  creditVersion?: number;
  areaXpEarned?: number | null;
  characterRemainderSeconds?: number;
  areaRemainderSeconds?: number | null;
  goalReachedNow?: boolean;
  minutesSpent?: number;
  durationSeconds?: number;
  creditedDate?: string;
  dailyCompletedSeconds?: number;
  dailyGoalMinutes?: number;
  questTitle?: string;
  areaTitle?: string;
  areaColor?: string;
  isLevelUp?: boolean;
  newLevel?: number;
  currentXP?: number;
  requiredXP?: number;
  onClose: () => void;
  onDismiss?: () => void;
  pending?: boolean;
  syncError?: string | null;
  syncBusy?: boolean;
  onRetry?: () => void;
  /** Locally durable work is complete even while cloud confirmation is pending. */
  localSaved?: boolean;
  offline?: boolean;
  ending?: boolean;
  rejected?: boolean;
  /** Supplied only by a verified online caller; never reads quests itself. */
  saveAction?: ReactNode;
}

export default function SessionResultSheet({ visible, xpEarned = 0, goldEarned = 0,
  creditVersion, areaXpEarned, goalReachedNow, minutesSpent = 0, durationSeconds,
  questTitle, areaTitle, areaColor, isLevelUp = false, newLevel, currentXP, requiredXP, onClose, onDismiss,
  pending = false, syncError, syncBusy = false, onRetry,
  sessionId, completedAtMs, recovered = false, creditedDate, dailyCompletedSeconds, dailyGoalMinutes,
  localSaved = false, offline = false, ending = false, rejected = false, saveAction,
}: SessionResultSheetProps) {
  const { hapticsEnabled, profile } = useUser();
  const celebration = useRef<DailyEffortEvidence | null>(null);
  const doneRequested = useRef(false);
  const dismissedOnce = useRef(false);
  const currentOwner = useRef(profile?.id);
  useLayoutEffect(() => { currentOwner.current = profile?.id; }, [profile?.id]);
  useLayoutEffect(() => { if (visible) { doneRequested.current = false; dismissedOnce.current = false; celebration.current = null; } }, [visible, sessionId]);
  const done = () => {
    if (doneRequested.current) return;
    doneRequested.current = true;
    celebration.current = visible && !pending && !ending && !rejected ? {visible:true, pending:false, recovered, sessionId,
      ownerId:profile?.id, timeZone:profile?.timezone || DEFAULT_TIMEZONE, creditedDate, dailyCompletedSeconds,
      dailyGoalMinutes, goalReachedNow, durationSeconds:durationSeconds ?? minutesSpent * 60, creditVersion} : null;
    onClose();
  };
  const dismissed = () => {
    if (dismissedOnce.current) return;
    dismissedOnce.current = true;
    const evidence = celebration.current;
    celebration.current = null;
    if (!visible && evidence?.ownerId === currentOwner.current && evidence) dailyAchievementQueue.enqueue(evidence);
    onDismiss?.();
  };
  const insets = useSafeAreaInsets();
  const pendingIdentity = `${profile?.id}:${sessionId ?? "result"}:${ending}`;
  const pendingKey = visible && pending && !offline ? pendingIdentity : null;
  const [waiting, setWaiting] = useState({key: pendingKey, ready: false});
  if (waiting.key !== pendingKey) setWaiting({key: pendingKey, ready: false});
  useEffect(() => {
    if (!pendingKey) return;
    // Pending is also the normal first step of a successful End. Give the
    // request time to finish before offering recovery, while keeping Done.
    const timeout = setTimeout(() => setWaiting(current => current.key === pendingKey ? {key: pendingKey, ready: true} : current), 3000);
    return () => clearTimeout(timeout);
  }, [pendingKey]);
  const needsRetry = pending && (offline || !!syncError && !syncBusy || waiting.key === pendingKey && waiting.ready);
  const screen = useWindowDimensions();
  const windowHeight = screen.height || 844;
  const fontScale = screen.fontScale || 1;
  const measurementKey = `${sessionId ?? "result"}:${screen.width}:${fontScale}:${ending}:${rejected}`;
  const [measurements, setMeasurements] = useState<{key: string; header?: number; body?: number; actions?: number}>({key: measurementKey});
  const measure = useCallback((part: "header" | "body" | "actions", height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    const rounded = Math.ceil(height);
    setMeasurements(current => {
      const previous = current.key === measurementKey ? current : {key: measurementKey};
      return previous[part] === rounded ? previous : {...previous, [part]: rounded};
    });
  }, [measurementKey]);
  const measured: typeof measurements = measurements.key === measurementKey ? measurements : {key: measurementKey};
  // The card floats above the bottom edge, so its tallest size leaves that gap too.
  const resultHeight = completionSheetHeight({windowHeight, topInset: insets.top + Math.max(insets.bottom, 8) + 8,
    headerHeight: measured.header ?? 48 * fontScale,
    bodyHeight: measured.body ?? 300 * fontScale,
    actionsHeight: measured.actions ?? 126 * fontScale + 16,
  });
  const level = newLevel ?? profile?.level;
  const xp = currentXP ?? profile?.current_xp;
  const threshold = requiredXP ?? (level != null ? requiredCharacterXP(level) : undefined);
  const scroll = useRef<React.ComponentRef<typeof BottomSheetScrollView>>(null);
  const resetPending = useRef(false);
  useLayoutEffect(() => { resetPending.current = visible; }, [visible, sessionId]);
  const resetScroll = useCallback(() => {
    if (!resetPending.current || !scroll.current) return;
    scroll.current.scrollTo({ y: 0, animated: false });
    resetPending.current = false;
  }, []);
  useEffect(resetScroll, [visible, sessionId, resetScroll]);
  let finishedLabel: string | null = null;
  if (completedAtMs !== undefined && Number.isFinite(completedAtMs)) {
    try { finishedLabel = new Intl.DateTimeFormat("en-GB", { dateStyle:"medium", timeStyle:"short", timeZone:profile?.timezone || DEFAULT_TIMEZONE }).format(new Date(completedAtMs)); }
    catch { /* Missing/invalid legacy metadata must not invent a finish time. */ }
  }
  useEffect(() => {
    if (visible && !pending && !ending && !rejected && hapticsEnabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [visible, pending, ending, rejected, hapticsEnabled]);
  return <AppSheet visible={visible} onRequestClose={onClose} onDismiss={dismissed}
    label={ending ? "session ended" : "session completion"} floating expanded heightRatio={resultHeight / windowHeight} maxHeightRatio={0.85} motionMode="timed"
    header={<View onLayout={event => measure("header", event.nativeEvent.layout.height)} testID="session-result-header"><Text style={s.title} accessibilityRole="header">{ending ? "Session ended" : rejected ? "Session kept on this phone" : pending ? "Session finished" : recovered ? "Earlier session saved" : isLevelUp ? "Level up!" : "Session complete"}</Text></View>}
    footer={<View onLayout={event => measure("actions", event.nativeEvent.layout.height)} style={s.actions} testID="session-result-actions">
      {!pending && !ending && !rejected && saveAction}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Done" style={s.done} onPress={done}><Text style={s.doneText}>Done</Text></TouchableOpacity>
    </View>}>
    <BottomSheetScrollView ref={scroll} onLayout={resetScroll} style={s.scroll} enableFooterMarginAdjustment showsVerticalScrollIndicator={false}>
      {/* Measure the natural body separately: the scroll container includes
          native footer padding, which must never be counted a second time. */}
      <View style={s.body} testID="session-result-body" onLayout={event => measure("body", event.nativeEvent.layout.height)}>
      {recovered && !pending && !ending && !rejected && <Text style={s.pendingText}>This is the session recovered from your phone. Its progress is now saved to your account.</Text>}
      {!!finishedLabel && <Text style={s.finished}>Finished {finishedLabel}</Text>}
      {ending ? <View style={s.pending}>
        <View style={s.endedIcon}><Ionicons name="stop-circle-outline" size={28} color={colors.accent} /></View>
        {!!questTitle && <Text style={s.sessionTitle}>{questTitle}</Text>}
        <Text style={s.pendingText}>Your session has stopped. Ending early does not earn recorded time or XP.</Text>
        {needsRetry && <Text style={s.pendingText}>{offline ? "Your stop is saved on this phone. We’ll confirm it when you reconnect." : "Your stop is saved on this phone. We’re waiting for confirmation."}</Text>}
        {needsRetry && onRetry && <TouchableOpacity accessibilityRole="button" disabled={syncBusy} onPress={onRetry} style={s.retry}><Text style={s.retryText}>Retry connection</Text></TouchableOpacity>}
      </View> : <>
      <CompletionHero seconds={durationSeconds ?? minutesSpent * 60} title={questTitle} levelUp={isLevelUp} compact />
      {rejected ? <View style={s.pending}><Text style={s.pendingText} accessibilityLiveRegion="polite">Your session record stays on this phone. Your account did not accept this result, so it has not earned progress or completed a quest.</Text></View> : pending ? <View style={s.pending}>
        <Text style={s.pendingText} accessibilityLiveRegion="polite">{localSaved ? offline ? "Saved on this phone. Your progress will sync when you’re online." : "Saved on this phone. We’re confirming your progress." : syncError ? "Your finished session is saved on this phone. Reconnect to confirm your progress." : "Saving your progress…"}</Text>
        {(localSaved || !!syncError) && onRetry && <TouchableOpacity accessibilityRole="button" disabled={syncBusy} onPress={onRetry} style={s.retry}><Text style={s.retryText}>Retry connection</Text></TouchableOpacity>}
      </View> : <>
      <CompletionRows summary={{durationSeconds:durationSeconds ?? minutesSpent * 60, xpEarned, goldEarned, creditVersion, areaXpEarned, goalReachedNow}} areaTitle={areaTitle} areaColor={areaColor} level={level} xpRemaining={threshold != null && xp != null ? Math.max(0,threshold-xp) : undefined} compact />
      </>}
      </>}
      </View>
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.4, paddingHorizontal: 20, paddingBottom: 8 },
  scroll: {flex:1},
  body: { paddingHorizontal: 16, paddingTop:4, paddingBottom: 16, gap: 16 },
  actions: {flexShrink:0, paddingHorizontal:16, paddingTop:4, paddingBottom:16, gap:10, backgroundColor:colors.surfaceRaised},
  finished: {color:colors.secondary, fontSize: 13, lineHeight: 18},
  pending: {gap:12, paddingVertical:12},
  pendingText: {color:colors.secondary, fontSize: 16, lineHeight: 22, textAlign:"center"},
  sessionTitle: {color:colors.text, fontSize: 17, lineHeight: 22, textAlign:"center"},
  endedIcon: {width:48, height:48, borderRadius:16, backgroundColor:colors.accentSoft, alignItems:"center", justifyContent:"center", alignSelf:"center"},
  retry: {minHeight:48, justifyContent:"center", alignItems:"center"},
  retryText: {color:colors.accent, fontSize:17},
  done: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 27, backgroundColor: colors.primary },
  doneText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
});
