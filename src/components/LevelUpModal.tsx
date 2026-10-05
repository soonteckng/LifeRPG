import TouchableOpacity from "./MotionPressable";
import { Text } from "./AppText";
import { useUser } from "../context/UserContext";
import { CompletionHero, CompletionRows } from "./CompletionDetails";
import { colors } from "../constants/theme";
import { useEffect } from "react";
import { StyleSheet, View, Modal, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useReducedMotion } from "../hooks/useReducedMotion";

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
}

export default function LevelUpModal({ visible, xpEarned = 0, goldEarned = 0,
  creditVersion, areaXpEarned, goalReachedNow, minutesSpent = 0, durationSeconds,
  questTitle, areaTitle, areaColor, isLevelUp = false, newLevel = 1, currentXP = 0, requiredXP = 100, onClose,
}: RewardModalProps) {
  const reduced = useReducedMotion();
  const { hapticsEnabled } = useUser();
  useEffect(() => {
    if (visible && hapticsEnabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [visible, hapticsEnabled]);
  return <Modal visible={visible} transparent animationType={reduced ? "none" : "fade"} onRequestClose={onClose}>
    <SafeAreaView style={s.surface} accessibilityViewIsModal>
      <View style={s.page}>
        <Text style={s.title} accessibilityRole="header">{isLevelUp ? "Level up!" : "Session complete"}</Text>
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          <CompletionHero seconds={durationSeconds ?? minutesSpent * 60} title={questTitle} levelUp={isLevelUp} />
          <CompletionRows summary={{durationSeconds:durationSeconds ?? minutesSpent * 60, xpEarned, goldEarned, creditVersion, areaXpEarned, goalReachedNow}} areaTitle={areaTitle} areaColor={areaColor} level={newLevel} xpRemaining={Math.max(0,requiredXP-currentXP)} />
        </ScrollView>
        <TouchableOpacity accessibilityRole="button" style={s.done} onPress={onClose}><Text style={s.doneText}>Done</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  </Modal>;
}
const s = StyleSheet.create({
  surface: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, width: "100%", maxWidth: 580, alignSelf: "center", paddingHorizontal: 20, paddingVertical: 16 },
  title: { color: colors.text, fontSize: 28, fontWeight: "500", letterSpacing: -0.7 },
  body: { flexGrow: 1, justifyContent: "center", paddingVertical: 24, gap: 32 },
  done: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.28)", minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#E5E4FF", marginTop: 12 },
  doneText: { color: colors.background, fontSize: 18, fontWeight: "500" },
});
