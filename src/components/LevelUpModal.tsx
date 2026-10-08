import SaveSuggestedQuest from "./SaveSuggestedQuest";
import TouchableOpacity from "./MotionPressable";
import { Text } from "./AppText";
import { useUser } from "../context/UserContext";
import { CompletionHero, CompletionRows } from "./CompletionDetails";
import { colors } from "../constants/theme";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import * as Haptics from "expo-haptics";


interface RewardModalProps {
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
}

export default function LevelUpModal({ visible, xpEarned = 0, goldEarned = 0,
  creditVersion, areaXpEarned, goalReachedNow, minutesSpent = 0, durationSeconds,
  questTitle, areaTitle, areaColor, isLevelUp = false, newLevel, currentXP, requiredXP, onClose, onDismiss,
}: RewardModalProps) {
  const { hapticsEnabled, profile } = useUser();
  const level = newLevel ?? profile?.level;
  const xp = currentXP ?? profile?.current_xp;
  const threshold = requiredXP ?? (level != null ? Math.floor(100 * Math.pow(level, 1.5)) : undefined);
  useEffect(() => {
    if (visible && hapticsEnabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [visible, hapticsEnabled]);
  return <AppSheet visible={visible} onRequestClose={onClose} onDismiss={onDismiss}
    label="session completion" compact maxHeightRatio={0.85}
    header={<Text style={s.title} accessibilityRole="header">{isLevelUp ? "Level up!" : "Session complete"}</Text>}
    footer={<TouchableOpacity accessibilityRole="button" style={s.done} onPress={onClose}><Text style={s.doneText}>Done</Text></TouchableOpacity>}>
    <BottomSheetScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <CompletionHero seconds={durationSeconds ?? minutesSpent * 60} title={questTitle} levelUp={isLevelUp} />
      <CompletionRows summary={{durationSeconds:durationSeconds ?? minutesSpent * 60, xpEarned, goldEarned, creditVersion, areaXpEarned, goalReachedNow}} areaTitle={areaTitle} areaColor={areaColor} level={level} xpRemaining={threshold != null && xp != null ? Math.max(0,threshold-xp) : undefined} />
      <SaveSuggestedQuest inSheet />
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 24, fontWeight: "500", letterSpacing: -0.7, paddingHorizontal: 20, paddingBottom: 16 },
  body: { paddingHorizontal: 20, paddingBottom: 16, gap: 20 },
  done: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.28)", minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.primary, marginTop: 8, marginHorizontal: 20, marginBottom: 12 },
  doneText: { color: colors.background, fontSize: 18, fontWeight: "500" },
});
