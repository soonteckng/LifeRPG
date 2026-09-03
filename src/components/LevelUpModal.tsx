import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';

interface RewardModalProps {
  visible: boolean;
  xpEarned?: number;
  minutesSpent?: number;
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
  minutesSpent = 0,
  questTitle,
  isLevelUp = false,
  newLevel = 1,
  currentXP = 0,
  requiredXP = 100,
  onClose,
}: RewardModalProps) {
  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [visible]);

  if (!visible) return null;

  const xpPercent = Math.min(100, Math.round((currentXP / Math.max(1, requiredXP)) * 100));

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>{isLevelUp ? '🏆' : '⚔️'}</Text>
          <Text style={styles.title}>
            {isLevelUp ? 'LEVEL UP!' : 'QUEST COMPLETED!'}
          </Text>

          <Text style={styles.congratsText}>
            🎉 Congrats! You completed {minutesSpent} mins of{' '}
            <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>
              {questTitle || 'Focus Session'}
            </Text>!
          </Text>

          <View style={styles.rewardBox}>
            <View style={styles.rewardRow}>
              <Text style={styles.rewardLabel}>📜 Quest Title:</Text>
              <Text style={styles.rewardValue}>{questTitle || 'Free Focus'}</Text>
            </View>
            <View style={styles.rewardRow}>
              <Text style={styles.rewardLabel}>⏱️ Duration:</Text>
              <Text style={styles.rewardValue}>{minutesSpent} Minutes</Text>
            </View>
            <View style={styles.rewardRow}>
              <Text style={styles.rewardLabel}>⚡ XP Earned:</Text>
              <Text style={[styles.rewardValue, { color: '#10B981' }]}>+{xpEarned} XP</Text>
            </View>

            <View style={styles.xpProgressContainer}>
              <View style={styles.xpHeader}>
                <Text style={styles.xpLabel}>Character Level {newLevel}</Text>
                <Text style={styles.xpPercentText}>{xpPercent}%</Text>
              </View>
              <View style={styles.xpBarBg}>
                <View style={[styles.xpBarFill, { width: `${xpPercent}%` }]} />
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.claimBtn} onPress={onClose}>
            <Text style={styles.claimBtnText}>CLAIM REWARDS & CONTINUE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  icon: { fontSize: 48, marginBottom: 6 },
  title: { color: '#F8FAFC', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  congratsText: { color: '#94A3B8', fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  rewardBox: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  rewardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rewardLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  rewardValue: { color: '#F8FAFC', fontSize: 13, fontWeight: 'bold' },
  xpProgressContainer: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1E293B' },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  xpLabel: { color: '#6366F1', fontSize: 11, fontWeight: 'bold' },
  xpPercentText: { color: '#94A3B8', fontSize: 11, fontWeight: '700' },
  xpBarBg: { height: 8, backgroundColor: '#1E293B', borderRadius: 4, overflow: 'hidden' },
  xpBarFill: { height: '100%', backgroundColor: '#10B981', borderRadius: 4 },
  claimBtn: {
    backgroundColor: '#6366F1',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  claimBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 },
});