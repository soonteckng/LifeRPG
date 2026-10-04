import { Text } from "./AppText";
import { useUser } from "../context/UserContext";
import { durationLabel } from "../utils/sessionSetup";
import ProgressRing from "./ProgressRing";
import { colors } from "../constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { StyleSheet, View, Modal, TouchableOpacity, ScrollView } from "react-native";
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
  isLevelUp?: boolean;
  newLevel?: number;
  currentXP?: number;
  requiredXP?: number;
  onClose: () => void;
}

export default function LevelUpModal({ visible, xpEarned = 0, goldEarned = 0,
  creditVersion, areaXpEarned, goalReachedNow, minutesSpent = 0, durationSeconds,
  questTitle, isLevelUp = false, newLevel = 1, currentXP = 0, requiredXP = 100, onClose,
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
          <View style={s.hero}>
            <ProgressRing size={144} progress={1} stroke={8}>
              <Ionicons name={isLevelUp ? "sparkles-outline" : "checkmark"} size={52} color={colors.accent} />
            </ProgressRing>
            <Text style={s.caption}>Time focused</Text>
            <Text style={s.time}>{durationLabel(durationSeconds ?? minutesSpent * 60)}</Text>
            {!!questTitle && <Text style={s.quest}>{questTitle}</Text>}
            {goalReachedNow && <Text style={s.success}>Daily goal reached</Text>}
          </View>
          <View style={s.rows}>
            <View style={s.row}><Text style={s.caption}>Character XP</Text><Text style={s.value}>+{xpEarned}</Text></View>
            {creditVersion === 1 && areaXpEarned != null && <View style={s.row}><Text style={s.caption}>Life area XP</Text><Text style={s.value}>+{areaXpEarned}</Text></View>}
            {creditVersion !== 1 && goldEarned > 0 && <View style={s.row}><Text style={s.caption}>Historical gold</Text><Text style={s.value}>+{goldEarned}</Text></View>}
            <View style={s.row}><Text style={s.caption}>Focus day</Text><Text style={s.success}>Recorded ✓</Text></View>
            <View style={s.row}><Text style={s.caption}>Level {newLevel}</Text><Text style={s.caption}>{Math.max(0, requiredXP - currentXP)} XP to next level</Text></View>
          </View>
        </ScrollView>
        <TouchableOpacity accessibilityRole="button" style={s.done} onPress={onClose}><Text style={s.doneText}>Done</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  </Modal>;
}
const s = StyleSheet.create({
  surface: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, width: "100%", maxWidth: 580, alignSelf: "center", paddingHorizontal: 24, paddingVertical: 16 },
  title: { color: colors.text, fontSize: 28, fontWeight: "600", letterSpacing: -0.7 },
  body: { flexGrow: 1, justifyContent: "center", paddingVertical: 24, gap: 28 },
  hero: { alignItems: "center", gap: 14 },
  time: { color: colors.text, fontSize: 42, fontWeight: "500", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  caption: { color: colors.secondary, fontSize: 16, lineHeight: 23, flexShrink: 1 },
  quest: { color: colors.text, fontSize: 19, textAlign: "center" },
  success: { color: "#38C9B3", fontSize: 16, fontWeight: "500" },
  rows: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14, gap: 16 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, minHeight: 32 },
  value: { color: colors.text, fontSize: 19, fontWeight: "600" },
  done: { minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#E5E4FF", marginTop: 12 },
  doneText: { color: colors.background, fontSize: 18, fontWeight: "600" },
});
