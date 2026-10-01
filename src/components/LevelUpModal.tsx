import { durationLabel } from "../utils/sessionSetup";
import { colors } from "../constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface RewardModalProps {
  visible: boolean;
  xpEarned?: number;
  goldEarned?: number;
  minutesSpent?: number;
  durationSeconds?: number;
  questTitle?: string;
  isLevelUp?: boolean;
  newLevel?: number;
  currentXP?: number;
  requiredXP?: number;
  onClose: () => void;
}

export default function LevelUpModal({
  visible,
  xpEarned = 0,
  goldEarned = 0,
  minutesSpent = 0,
  durationSeconds,
  questTitle,
  isLevelUp = false,
  newLevel = 1,
  currentXP = 0,
  requiredXP = 100,
  onClose,
}: RewardModalProps) {
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [visible]);

  const xpPercent = Math.min(100, Math.round((currentXP / Math.max(1, requiredXP)) * 100));

  return (
    <Modal visible={visible} transparent animationType={reducedMotion ? "none" : "fade"} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ alignItems: "center" }}>
          <View style={styles.symbol}><Ionicons name={isLevelUp ? "sparkles-outline" : "checkmark"} size={30} color={colors.accent} /></View>
          <Text style={styles.title}>
            {isLevelUp ? 'Level up!' : 'Session complete'}
          </Text>

          <Text style={styles.congratsText}>{questTitle || "Free session"}</Text>
          <Text style={styles.duration}>{durationLabel(durationSeconds ?? minutesSpent * 60)}</Text>
          <Text style={styles.congratsText}>Time well spent.</Text>

          <View style={styles.rewardBox}>
            <View style={styles.rewardRow}>
              <Text style={styles.rewardLabel}>XP earned</Text>
              <Text style={styles.rewardValue}>+{xpEarned} XP</Text>
            </View>
            <View style={styles.rewardRow}>
              <Text style={styles.rewardLabel}>Gold earned</Text>
              <Text style={styles.rewardValue}>+{goldEarned}</Text>
            </View>
            <View style={styles.xpProgressContainer}>
              <View style={styles.xpHeader}>
                <Text style={styles.xpLabel}>Level {newLevel}</Text>
                <Text style={styles.xpPercentText}>
                  {Math.max(0, requiredXP - currentXP)} XP to next level
                </Text>
              </View>
              <View style={styles.xpBarBg}>
                <View style={[styles.xpBarFill, { width: `${xpPercent}%` }]} />
              </View>
            </View>
          </View>

          {(durationSeconds ?? minutesSpent * 60) % 60 !== 0 && <Text style={styles.note}>Exact time is saved. Rewards and today’s goal currently count whole minutes per completed session.</Text>}
          </ScrollView>
          <TouchableOpacity accessibilityRole="button" style={styles.claimBtn} onPress={onClose}>
            <Text style={styles.claimBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.60)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  symbol: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  duration: { fontSize: 30, fontWeight: "500", color: colors.text, textAlign: "center", marginTop: 20 },
  note: { color: colors.secondary, fontSize: 12, lineHeight: 18, textAlign: "center", marginBottom: 16 },
  title: { color: '#F8FAFC', fontSize: 25, fontWeight: '600', letterSpacing: -0.5 },
  congratsText: { color: colors.secondary, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  rewardBox: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
    width: '100%',
    marginVertical: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8,
  },
  rewardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rewardLabel: { color: colors.secondary, fontSize: 12, fontWeight: '700' },
  rewardValue: { color: '#F8FAFC', fontSize: 13, fontWeight: 'bold' },
  xpProgressContainer: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1E293B' },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  xpLabel: { color: colors.accent, fontSize: 11, fontWeight: 'bold' },
  xpPercentText: { color: colors.secondary, fontSize: 11, fontWeight: '700' },
  xpBarBg: { height: 8, backgroundColor: '#1E293B', borderRadius: 4, overflow: 'hidden' },
  xpBarFill: { height: '100%', backgroundColor: colors.accentFill, borderRadius: 4 },
  claimBtn: {
    backgroundColor: colors.accent,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  claimBtnText: { color: colors.background, fontWeight: '600', fontSize: 16 },
});
