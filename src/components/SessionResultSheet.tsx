import { requiredCharacterXP } from "../utils/levelTiers";
import TouchableOpacity from "./MotionPressable";
import { Text } from "./AppText";
import { useUser } from "../context/UserContext";
import { CompletionHero, CompletionRows } from "./CompletionDetails";
import { colors } from "../constants/theme";
import { completionSheetHeight } from "../utils/completionSheetLayout";
import { DEFAULT_TIMEZONE } from "../utils/progressAnalytics";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import AppSheet from "./AppSheet";
import { tierColor } from "../utils/adventurerLook";
import CharacterMark from "./CharacterMark";
import ProgressRing from "./ProgressRing";
import * as Haptics from "expo-haptics";
import { dailyAchievementQueue } from "../services/dailyAchievementQueue";
import type { DailyEffortEvidence } from "../services/dailyEffortCelebrationService";


export interface SessionResultSheetProps {
  sessionId?: string | null;
  completedAtMs?: number;
  recovered?: boolean;
  visible: boolean;
  xpEarned?: number;
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
  /** Developer preview: shows the card only, and never claims a daily celebration. */
  preview?: boolean;
  ending?: boolean;
  rejected?: boolean;
  /** Supplied only by a verified online caller; never reads quests itself. */
  saveAction?: ReactNode;
}

export default function SessionResultSheet({ visible, xpEarned = 0,
  creditVersion, areaXpEarned, goalReachedNow, minutesSpent = 0, durationSeconds,
  questTitle, areaTitle, areaColor, isLevelUp = false, newLevel, currentXP, requiredXP, onClose, onDismiss,
  pending = false, syncError, syncBusy = false, onRetry,
  sessionId, completedAtMs, recovered = false, creditedDate, dailyCompletedSeconds, dailyGoalMinutes,
  localSaved = false, offline = false, ending = false, rejected = false, saveAction, preview = false,
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
    celebration.current = visible && !preview && !pending && !ending && !rejected ? {visible:true, pending:false, recovered, sessionId,
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
  // Online and still confirming: the card already looks finished, with the
  // numbers filling in. The longer messages are only for offline or trouble.
  const confirming = pending && !rejected && !ending && !offline && !syncError && !needsRetry;
  const screen = useWindowDimensions();
  const windowHeight = screen.height || 844;
  const fontScale = screen.fontScale || 1;
  // Each part reports its size whenever it changes, so its latest size is
  // always right. Guessed sizes are only for the first frame: dropping real
  // sizes when the result arrived left the card too tall, a gap above Done.
  const [measured, setMeasurements] = useState<{header?: number; body?: number; actions?: number}>({});
  const measure = useCallback((part: "header" | "body" | "actions", height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    const rounded = Math.ceil(height);
    setMeasurements(previous => previous[part] === rounded ? previous : {...previous, [part]: rounded});
  }, []);
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
  // A finished session glows softly in its category's colour behind the card,
  // instead of sitting on plain black. A stopped session stays calm.
  const glowTint = ending || rejected ? null : areaColor ?? colors.primary;
  // Memoised so the sheet's dim layer keeps its identity across re-renders.
  const glow = useMemo(() => glowTint ? <Svg testID="session-result-glow" pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
    <Defs><RadialGradient id="sessionResultGlow" cx="50%" cy="30%" rx="85%" ry="55%">
      <Stop offset="0" stopColor={glowTint} stopOpacity={0.6} /><Stop offset="0.55" stopColor={glowTint} stopOpacity={0.18} /><Stop offset="1" stopColor={glowTint} stopOpacity={0} />
    </RadialGradient></Defs>
    <Rect width="100%" height="100%" fill="url(#sessionResultGlow)" />
  </Svg> : null, [glowTint]);
  return <AppSheet visible={visible} onRequestClose={onClose} onDismiss={dismissed} backdropGlow={glow} closeMotion="fade" closeFadeDuration={400} dismissible={false}
    label={ending ? "session ended" : "session completion"} expanded heightRatio={resultHeight / windowHeight} maxHeightRatio={0.85} motionMode="timed"
    header={<View onLayout={event => measure("header", event.nativeEvent.layout.height)} testID="session-result-header"><Text style={s.title} accessibilityRole="header">{ending ? "Session ended" : rejected ? "Session kept on this phone" : pending ? confirming ? "Session complete" : "Session finished" : recovered ? "Earlier session saved" : isLevelUp ? "Level up!" : "Session complete"}</Text></View>}
    footer={<View onLayout={event => measure("actions", event.nativeEvent.layout.height)} style={s.actions} testID="session-result-actions">
      {!pending && !ending && !rejected && saveAction}
      <TouchableOpacity testID="session-result-done" accessibilityRole="button" accessibilityLabel="Done" style={s.done} onPress={done}><Text style={s.doneText}>Done</Text></TouchableOpacity>
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
      {/* A level up is its own moment: the companion and the new level lead. */}
      {isLevelUp && !pending && !rejected && level != null && <View style={s.levelHero} testID="session-level-up" accessible accessibilityLabel={`You reached Level ${level}`}>
        {/* The new level in its tier's colour, as on your picture and the level road. */}
        <ProgressRing size={112} stroke={4} progress={1} color={tierColor(level)} track={`${tierColor(level)}29`}>
          <View style={s.levelDisc}><CharacterMark size={70} showLevel={false} /></View>
        </ProgressRing>
        <View style={[s.levelBadge, { backgroundColor: tierColor(level) }]}><Ionicons name="sparkles" size={13} color="#131826" /><Text style={s.levelBadgeText}>Level {level}</Text></View>
        <Text style={s.levelLine}>You reached Level {level}</Text>
      </View>}
      <CompletionHero seconds={durationSeconds ?? minutesSpent * 60} title={questTitle} levelUp={isLevelUp} compact />
      {confirming ? <CompletionRows summary={{durationSeconds:durationSeconds ?? minutesSpent * 60, xpEarned, creditVersion, areaXpEarned, goalReachedNow}} areaTitle={areaTitle} areaColor={areaColor} level={level} compact loading />
      : rejected ? <View style={s.pending}><Text style={s.pendingText} accessibilityLiveRegion="polite">Your session record stays on this phone. Your account did not accept this result, so it has not earned progress or completed a quest.</Text></View> : pending ? <View style={s.pending}>
        <Text style={s.pendingText} accessibilityLiveRegion="polite">{localSaved ? offline ? "Saved on this phone. Your progress will sync when you’re online." : "Saved on this phone. We’re confirming your progress." : syncError ? "Your finished session is saved on this phone. Reconnect to confirm your progress." : "Saving your progress…"}</Text>
        {(localSaved || !!syncError) && onRetry && <TouchableOpacity accessibilityRole="button" disabled={syncBusy} onPress={onRetry} style={s.retry}><Text style={s.retryText}>Retry connection</Text></TouchableOpacity>}
      </View> : <>
      <CompletionRows summary={{durationSeconds:durationSeconds ?? minutesSpent * 60, xpEarned, creditVersion, areaXpEarned, goalReachedNow}} areaTitle={areaTitle} areaColor={areaColor} level={level} xpRemaining={threshold != null && xp != null ? Math.max(0,threshold-xp) : undefined} compact />
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
  levelHero: { alignItems: "center", gap: 10, paddingTop: 4, paddingBottom: 4 },
  levelDisc: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  levelBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: -26, paddingHorizontal: 12, minHeight: 28, borderRadius: 14, backgroundColor: colors.level },
  levelBadgeText: { color: "#131826", fontSize: 14, lineHeight: 18, fontWeight: "800" },
  levelLine: { color: colors.success, fontSize: 17, lineHeight: 22, fontWeight: "600" },
  done: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 27, backgroundColor: colors.primary },
  doneText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
});
