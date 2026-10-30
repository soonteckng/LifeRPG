import TouchableOpacity from "./MotionPressable";
import { Text } from "./AppText";
import { useUser } from "../context/UserContext";
import { CompletionCard, CompletionTiles } from "./CompletionDetails";
import { focusAreaTitle } from "../utils/focusAreas";
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
import * as Haptics from "expo-haptics";
import { durationLabel } from "../utils/sessionSetup";

export interface SessionSyncSummary {
  sessionCount: number;
  durations: { seconds: number; count: number }[];
  areas: { title: string; color: string }[];
  pendingCount?: number;
}

export interface SessionResultSheetProps {
  sessionId?: string | null;
  completedAtMs?: number;
  recovered?: boolean;
  visible: boolean;
  goalReachedNow?: boolean;
  minutesSpent?: number;
  durationSeconds?: number;
  creditedDate?: string;
  dailyCompletedSeconds?: number;
  dailyGoalMinutes?: number;
  questTitle?: string;
  areaTitle?: string;
  areaColor?: string;
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
  /** Confirmed offline receipts combined for presentation, never inferred daily totals. */
  syncSummary?: SessionSyncSummary;
  /** Read after the result is confirmed; each tile waits for its number. */
  streakDays?: number;
  weekSeconds?: number;
  weekLabel?: string;
  /** Closes the card, then opens Your rhythm. */
  onOpenRhythm?: () => void;
  /** Lets a host exclude this sheet from its own overlap guard. */
  activityId?: symbol;
}

export default function SessionResultSheet({ visible, goalReachedNow, minutesSpent = 0, durationSeconds,
  questTitle, areaTitle, areaColor, onClose, onDismiss,
  pending = false, syncError, syncBusy = false, onRetry,
  sessionId, completedAtMs, recovered = false,
  localSaved = false, offline = false, ending = false, rejected = false, saveAction, syncSummary, activityId,
  dailyCompletedSeconds, dailyGoalMinutes, streakDays, weekSeconds, weekLabel = "focused, past 7 days", onOpenRhythm,
}: SessionResultSheetProps) {
  const { hapticsEnabled, profile } = useUser();
  const doneRequested = useRef(false);
  const dismissedOnce = useRef(false);
  useLayoutEffect(() => { if (visible) { doneRequested.current = false; dismissedOnce.current = false; } }, [visible, sessionId]);
  const done = () => {
    if (doneRequested.current) return;
    doneRequested.current = true;
    onClose();
  };
  const openRhythm = () => {
    if (doneRequested.current || !onOpenRhythm) return;
    doneRequested.current = true;
    onOpenRhythm();
  };
  const dismissed = () => {
    if (dismissedOnce.current) return;
    dismissedOnce.current = true;
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
  let finishedClock: string | null = null;
  if (completedAtMs !== undefined && Number.isFinite(completedAtMs)) {
    try {
      const zone = profile?.timezone || DEFAULT_TIMEZONE;
      finishedLabel = new Intl.DateTimeFormat("en-GB", { dateStyle:"medium", timeStyle:"short", timeZone:zone }).format(new Date(completedAtMs));
      finishedClock = new Intl.DateTimeFormat("en-US", { hour:"numeric", minute:"2-digit", timeZone:zone }).format(new Date(completedAtMs)).toUpperCase();
    }
    catch { /* Missing/invalid legacy metadata must not invent a finish time. */ }
  }
  // Mockup 07: a finished session reads "You made room." under a small label.
  const title = syncSummary ? "Sessions synced" : ending ? "Session ended" : rejected ? "Session kept on this phone"
    : pending ? confirming ? "You made room." : "Session finished" : recovered ? "Earlier session saved" : "You made room.";
  const kicker = syncSummary ? "WELCOME BACK" : ending ? "STOPPED EARLY" : rejected ? "SAVED ON THIS PHONE" : `SESSION COMPLETE${finishedClock && !recovered ? ` · ${finishedClock}` : ""}`;
  const seconds = durationSeconds ?? minutesSpent * 60;
  const cardLabel = areaTitle ? focusAreaTitle(areaTitle) : "Focus";
  const showTiles = !syncSummary && !ending && !rejected && !pending;
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
  return <AppSheet visible={visible} onRequestClose={onClose} onDismiss={dismissed} backdropGlow={glow} closeMotion="fade" closeFadeDuration={400} dismissible={false} activityId={activityId}
    label={syncSummary ? "synced sessions" : ending ? "session ended" : "session completion"} expanded heightRatio={resultHeight / windowHeight} maxHeightRatio={0.85} motionMode="timed"
    header={<View onLayout={event => measure("header", event.nativeEvent.layout.height)} testID="session-result-header" style={s.header}>
      <Text style={s.kicker}>{kicker}</Text>
      <Text style={s.title} accessibilityRole="header">{title}</Text>
    </View>}
    footer={<View onLayout={event => measure("actions", event.nativeEvent.layout.height)} style={s.actions} testID="session-result-actions">
      {!syncSummary && !pending && !ending && !rejected && saveAction}
      <TouchableOpacity testID="session-result-done" accessibilityRole="button" accessibilityLabel="Back to today"
        style={s.done} onPress={done}><Text style={s.doneText}>Back to today</Text></TouchableOpacity>
      {showTiles && !!onOpenRhythm && <TouchableOpacity testID="session-result-rhythm" accessibilityRole="button" accessibilityLabel="See your rhythm"
        style={s.rhythm} onPress={openRhythm}><Text style={s.rhythmText}>See your rhythm</Text><Ionicons name="arrow-up-outline" size={17} color={colors.text} style={s.northEast} /></TouchableOpacity>}
    </View>}>
    <BottomSheetScrollView ref={scroll} onLayout={resetScroll} style={s.scroll} enableFooterMarginAdjustment showsVerticalScrollIndicator={false}>
      {/* Measure the natural body separately: the scroll container includes
          native footer padding, which must never be counted a second time. */}
      <View style={s.body} testID="session-result-body" onLayout={event => measure("body", event.nativeEvent.layout.height)}>
      {!syncSummary && recovered && !pending && !ending && !rejected && <Text style={s.pendingText}>This is the session recovered from your phone. Its progress is now saved to your account.</Text>}
      {!syncSummary && recovered && !!finishedLabel && <Text style={s.finished}>Finished {finishedLabel}</Text>}
      {ending ? <View style={s.pending}>
        <View style={s.endedIcon}><Ionicons name="stop-circle-outline" size={28} color={colors.accent} /></View>
        {!!questTitle && <Text style={s.sessionTitle}>{questTitle}</Text>}
        <Text style={s.pendingText}>Your session has stopped. Ending early does not record its time.</Text>
        {needsRetry && <Text style={s.pendingText}>{offline ? "Your stop is saved on this phone. We’ll confirm it when you reconnect." : "Your stop is saved on this phone. We’re waiting for confirmation."}</Text>}
        {needsRetry && onRetry && <TouchableOpacity accessibilityRole="button" disabled={syncBusy} onPress={onRetry} style={s.retry}><Text style={s.retryText}>Retry connection</Text></TouchableOpacity>}
      </View> : <>
      {syncSummary ? <>
        <CompletionCard seconds={seconds} label={`${syncSummary.sessionCount} offline ${syncSummary.sessionCount === 1 ? "session" : "sessions"}`} sync />
        <View style={s.syncDurations} testID="session-sync-durations">
          {syncSummary.durations.map(group => <Text key={group.seconds} style={s.pendingText} accessible
            accessibilityLabel={`${group.count} ${group.count === 1 ? "session" : "sessions"} of ${durationLabel(group.seconds)} each`}>{`${group.count} × ${durationLabel(group.seconds)}`}</Text>)}
        </View>
        {syncSummary.areas.length > 0 && <View style={s.syncRows} testID="session-sync-areas">
          {syncSummary.areas.map((item, index) => <View key={`${item.title}:${index}`} style={s.syncRow} accessible accessibilityLabel={`${item.title}, time recorded`}>
            <Text style={[s.syncLabel, { color: item.color }]}>{item.title}</Text><Text style={s.syncValue}>Recorded ✓</Text>
          </View>)}
        </View>}
        <Text style={s.pendingText}>Your progress is saved to your account.</Text>
        {!!syncSummary.pendingCount && <Text style={s.pendingText} accessibilityLiveRegion="polite">{syncSummary.pendingCount === 1 ? "1 more session is saved on this phone, waiting to sync." : `${syncSummary.pendingCount} more sessions are saved on this phone, waiting to sync.`}</Text>}
      </> : confirming ? <CompletionCard seconds={seconds} label={cardLabel} line={questTitle} loading />
      : rejected ? <View style={s.pending}><CompletionCard seconds={seconds} label={cardLabel} line={questTitle} held /><Text style={s.pendingText} accessibilityLiveRegion="polite">Your session record stays on this phone. Your account did not accept this result, so it has not earned progress or completed a quest.</Text></View> : pending ? <View style={s.pending}>
        <CompletionCard seconds={seconds} label={cardLabel} line={questTitle} held />
        <Text style={s.pendingText} accessibilityLiveRegion="polite">{localSaved ? offline ? "Saved on this phone. Your progress will sync when you’re online." : "Saved on this phone. We’re confirming your progress." : syncError ? "Your finished session is saved on this phone. Reconnect to confirm your progress." : "Saving your progress…"}</Text>
        {(localSaved || !!syncError) && onRetry && <TouchableOpacity accessibilityRole="button" disabled={syncBusy} onPress={onRetry} style={s.retry}><Text style={s.retryText}>Retry connection</Text></TouchableOpacity>}
      </View> : <>
      <CompletionCard seconds={seconds} label={cardLabel} line={questTitle}
        todaySeconds={dailyCompletedSeconds} goalMinutes={dailyGoalMinutes} goalReachedNow={goalReachedNow} />
      <CompletionTiles streakDays={streakDays} weekSeconds={weekSeconds} weekLabel={weekLabel} />
      </>}
      </>}
      </View>
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10, gap: 6 },
  kicker: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 40, lineHeight: 46, fontFamily: "display", fontWeight: "400", letterSpacing: -0.8 },
  scroll: {flex:1},
  body: { paddingHorizontal: 16, paddingTop:4, paddingBottom: 16, gap: 16 },
  actions: {flexShrink:0, paddingHorizontal:16, paddingTop:4, paddingBottom:16, gap:10, backgroundColor:colors.surfaceRaised},
  finished: {color:colors.secondary, fontSize: 13, lineHeight: 18},
  pending: {gap:12, paddingVertical:12},
  pendingText: {color:colors.secondary, fontSize: 16, lineHeight: 22, textAlign:"center"},
  sessionTitle: {color:colors.text, fontSize: 17, lineHeight: 22, textAlign:"center"},
  syncDurations: {gap:4},
  syncRows: {paddingHorizontal:16, paddingVertical:6, borderRadius:20, backgroundColor:colors.sheetCard},
  syncRow: {minHeight:40, paddingVertical:8, flexDirection:"row", flexWrap:"wrap", alignItems:"center", justifyContent:"space-between", gap:8},
  syncLabel: {color:colors.secondary, fontSize:14, lineHeight:20, flexShrink:1},
  syncValue: {color:colors.text, fontSize:16, lineHeight:22, fontWeight:"500"},
  endedIcon: {width:48, height:48, borderRadius:16, backgroundColor:colors.accentSoft, alignItems:"center", justifyContent:"center", alignSelf:"center"},
  retry: {minHeight:48, justifyContent:"center", alignItems:"center"},
  retryText: {color:colors.accent, fontSize:17},
  done: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 27, backgroundColor: colors.primary },
  doneText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
  rhythm: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  rhythmText: { color: colors.text, fontSize: 17, fontWeight: "600" },
  northEast: { transform: [{ rotate: "45deg" }] },
});
