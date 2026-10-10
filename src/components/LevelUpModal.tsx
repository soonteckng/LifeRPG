import { requiredCharacterXP } from "../utils/levelTiers";
import SaveSuggestedQuest from "./SaveSuggestedQuest";
import TouchableOpacity from "./MotionPressable";
import { Text } from "./AppText";
import { useUser } from "../context/UserContext";
import { CompletionHero, CompletionRows } from "./CompletionDetails";
import { colors } from "../constants/theme";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import * as Haptics from "expo-haptics";


interface RewardModalProps {
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
}

export default function LevelUpModal({ visible, xpEarned = 0, goldEarned = 0,
  creditVersion, areaXpEarned, goalReachedNow, minutesSpent = 0, durationSeconds,
  questTitle, areaTitle, areaColor, isLevelUp = false, newLevel, currentXP, requiredXP, onClose, onDismiss,
  pending = false, syncError, syncBusy = false, onRetry,
  sessionId, completedAtMs, recovered = false,
}: RewardModalProps) {
  const { hapticsEnabled, profile } = useUser();
  const insets = useSafeAreaInsets();
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
    try { finishedLabel = new Intl.DateTimeFormat("en-GB", { dateStyle:"medium", timeStyle:"short", timeZone:profile?.timezone ?? "Asia/Kuala_Lumpur" }).format(new Date(completedAtMs)); }
    catch { /* Missing/invalid legacy metadata must not invent a finish time. */ }
  }
  useEffect(() => {
    if (visible && !pending && hapticsEnabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [visible, pending, hapticsEnabled]);
  return <AppSheet visible={visible} onRequestClose={onClose} onDismiss={onDismiss}
    label="session completion" expanded heightRatio={0.85} maxHeightRatio={0.85} motionMode="timed"
    header={<Text style={s.title} accessibilityRole="header">{pending ? "Session finished" : recovered ? "Earlier session saved" : isLevelUp ? "Level up!" : "Session complete"}</Text>}>
    <BottomSheetScrollView ref={scroll} onLayout={resetScroll} contentContainerStyle={[s.body, {paddingBottom:Math.max(insets.bottom, 16) + 12}]} showsVerticalScrollIndicator={false}>
      {recovered && !pending && <Text style={s.pendingText}>This is the session recovered from your phone. Its progress is now saved to your account.</Text>}
      {!!finishedLabel && <Text style={s.finished}>Finished {finishedLabel}</Text>}
      <CompletionHero seconds={durationSeconds ?? minutesSpent * 60} title={questTitle} levelUp={isLevelUp} />
      {pending ? <View style={s.pending}>
        <Text style={s.pendingText} accessibilityLiveRegion="polite">{syncError ? "Your finished session is saved on this phone. Reconnect to confirm your progress." : "Saving your progress…"}</Text>
        {!!syncError && onRetry && <TouchableOpacity accessibilityRole="button" disabled={syncBusy} onPress={onRetry} style={s.retry}><Text style={s.retryText}>Retry saving</Text></TouchableOpacity>}
      </View> : <>
      <CompletionRows summary={{durationSeconds:durationSeconds ?? minutesSpent * 60, xpEarned, goldEarned, creditVersion, areaXpEarned, goalReachedNow}} areaTitle={areaTitle} areaColor={areaColor} level={level} xpRemaining={threshold != null && xp != null ? Math.max(0,threshold-xp) : undefined} />
      <SaveSuggestedQuest inSheet />
      </>}
      <TouchableOpacity accessibilityRole="button" style={s.done} onPress={onClose}><Text style={s.doneText}>Done</Text></TouchableOpacity>
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 24, fontWeight: "500", letterSpacing: -0.7, paddingHorizontal: 20, paddingBottom: 16 },
  body: { paddingHorizontal: 20, paddingBottom: 16, gap: 20 },
  finished: {color:colors.secondary, fontSize:14, lineHeight:21, textAlign:"center"},
  pending: {gap:12, paddingVertical:12},
  pendingText: {color:colors.secondary, fontSize:16, lineHeight:23, textAlign:"center"},
  retry: {minHeight:48, justifyContent:"center", alignItems:"center"},
  retryText: {color:colors.accent, fontSize:17},
  done: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.28)", minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.primary },
  doneText: { color: colors.background, fontSize: 18, fontWeight: "500" },
});
