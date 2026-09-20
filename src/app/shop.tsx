import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  addReward,
  claimReward,
  deleteReward,
  getRewards,
  Reward,
} from '../../db/database';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '../context/UserContext';
import Header from '../components/Header';

export default function ShopScreen() {
  const { profile, reloadProfile } = useUser();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [title, setTitle] = useState('');
  const [costGold, setCostGold] = useState('');
  const [feedback, setFeedback] = useState<{ title: string; message: string; icon: string } | null>(null);
  const [claimPrompt, setClaimPrompt] = useState<Reward | null>(null);

  const refreshShopData = useCallback(() => {
    reloadProfile();
    const activeRewards = getRewards();
    setRewards(activeRewards);
  }, [reloadProfile]);

  useFocusEffect(
    useCallback(() => {
      refreshShopData();
    }, [refreshShopData])
  );

  const handleCreateReward = () => {
    if (!title.trim()) {
      setFeedback({
        title: 'REWARD NAME REQUIRED',
        message: 'Enter a title for your reward before adding it to the vault.',
        icon: '🎁',
      });
      return;
    }

    const parsedCost = parseInt(costGold, 10);
    if (isNaN(parsedCost) || parsedCost <= 0) {
      setFeedback({
        title: 'Gold Required',
        message: 'Add a Gold amount greater than 0 to place this reward in your vault.',
        icon: '💰',
      });
      return;
    }

    addReward(title.trim(), parsedCost);
    setTitle('');
    setCostGold('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refreshShopData();
    setFeedback({
      title: 'REWARD CREATED!',
      message: 'Your new reward has been added to the vault.',
      icon: '🎁',
    });
  };

  const handleClaimReward = (reward: Reward) => {
    if (!profile || profile.gold < reward.cost_gold) {
      setFeedback({
        title: 'INSUFFICIENT GOLD',
        message: `You need ${reward.cost_gold} Gold to purchase this reward.`,
        icon: '💰',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setClaimPrompt(reward);
  };

  const confirmClaimReward = () => {
    if (!claimPrompt) return;

    const success = claimReward(claimPrompt.id);
    setClaimPrompt(null);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshShopData();
    } else {
      setFeedback({
        title: 'REDEEM FAILED',
        message: 'This reward could not be redeemed. Please try again.',
        icon: '⚠️',
      });
    }
  };

  const handleDeleteReward = (rewardId: number) => {
    deleteReward(rewardId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    refreshShopData();
  };

  const renderRewardItem = ({ item }: { item: Reward }) => {
    const canAfford = (profile?.gold || 0) >= item.cost_gold;

    return (
      <View style={[styles.rewardCard, canAfford ? styles.affordableCard : styles.lockedCard]}>
        <View style={styles.cardHeader}>
          <View style={styles.iconBadge}>
            <Ionicons name="gift" size={20} color={canAfford ? '#F59E0B' : '#64748B'} />
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={styles.rewardTitle}>{item.title}</Text>
            <View style={styles.costBadge}>
              <Text style={styles.rewardCost}>💰 {item.cost_gold} Gold</Text>
            </View>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.claimButton, !canAfford && styles.disabledButton]}
            onPress={() => handleClaimReward(item)}
            disabled={!canAfford}
            activeOpacity={0.8}
          >
            <Text style={styles.claimButtonText}>{canAfford ? 'Redeem' : 'Locked'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteReward(item.id)}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <>
      <SafeAreaView style={styles.container}>
      <Header title="Item Shop" subtitle="Craft and redeem rewards with earned gold" showBack={false} />
      <View style={styles.goldBalance}>
        <Text style={styles.goldText}>💰 {profile?.gold || 0}</Text>
        <Text style={styles.goldLabel}>GOLD</Text>
      </View>

      {/* Reward Creator */}
      <View style={styles.createBox}>
        <Text style={styles.createTitle}>+ Craft New Reward</Text>
        <TextInput
          style={styles.input}
          placeholder="Reward Name (e.g., 1 Hr Netflix)"
          placeholderTextColor="#64748B"
          value={title}
          onChangeText={setTitle}
        />

        {/* Quick Cost Preset Buttons */}
        <Text style={styles.presetLabel}>Quick Tier Cost Presets:</Text>
        <View style={styles.presetRow}>
          <TouchableOpacity style={styles.presetChip} onPress={() => setCostGold('150')}>
            <Text style={styles.presetChipText}>15m (150G)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.presetChip} onPress={() => setCostGold('300')}>
            <Text style={styles.presetChipText}>30m (300G)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.presetChip} onPress={() => setCostGold('600')}>
            <Text style={styles.presetChipText}>1h (600G)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.presetChip} onPress={() => setCostGold('1200')}>
            <Text style={styles.presetChipText}>Night (1200G)</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Gold Cost (e.g., 300)"
          placeholderTextColor="#64748B"
          keyboardType="numeric"
          value={costGold}
          onChangeText={setCostGold}
        />
        <TouchableOpacity style={styles.createButton} onPress={handleCreateReward} activeOpacity={0.85}>
          <Ionicons name="add-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.createButtonText}>Add to Vault</Text>
        </TouchableOpacity>
      </View>

      {/* Rewards List */}
      <Text style={styles.sectionTitle}>Available Rewards</Text>
      <FlatList
        data={rewards}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderRewardItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="basket-outline" size={48} color="#334155" />
            <Text style={styles.emptyText}>Vault is empty. Craft your first real-world reward above!</Text>
          </View>
        }
      />
      </SafeAreaView>

      <Modal visible={!!feedback} transparent animationType="fade" onRequestClose={() => setFeedback(null)}>
        <View style={styles.feedbackOverlay}>
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackIcon}>{feedback?.icon}</Text>
            <Text style={styles.feedbackTitle}>{feedback?.title}</Text>
            <Text style={styles.feedbackMessage}>{feedback?.message}</Text>
            <TouchableOpacity style={styles.feedbackButton} onPress={() => setFeedback(null)}>
              <Text style={styles.feedbackButtonText}>CONTINUE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!claimPrompt} transparent animationType="fade" onRequestClose={() => setClaimPrompt(null)}>
        <View style={styles.feedbackOverlay}>
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackIcon}>🎁</Text>
            <Text style={styles.feedbackTitle}>CLAIM REWARD?</Text>
            <Text style={styles.feedbackMessage}>
              Spend 💰 {claimPrompt?.cost_gold} Gold on "{claimPrompt?.title}"?
            </Text>
            <View style={styles.claimPromptActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setClaimPrompt(null)}>
                <Text style={styles.cancelButtonText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.feedbackButton, styles.claimPromptButton]} onPress={confirmClaimReward}>
                <Text style={styles.feedbackButtonText}>REDEEM</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  feedbackOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  feedbackCard: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  feedbackIcon: { fontSize: 44, marginBottom: 8 },
  feedbackTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  feedbackMessage: { color: '#94A3B8', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  feedbackButton: {
    backgroundColor: '#6366F1',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  feedbackButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 },
  claimPromptActions: { flexDirection: 'row', width: '100%', gap: 10, marginTop: 20 },
  claimPromptButton: { flex: 1, width: undefined, marginTop: 0 },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  cancelButtonText: { color: '#CBD5E1', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 },
  goldBalance: {
    alignItems: 'flex-end',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  goldText: {
    color: '#F59E0B',
    fontSize: 22,
    fontWeight: '900',
  },
  goldLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  createBox: {
    backgroundColor: '#131C2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginHorizontal: 16,
    marginBottom: 20,
  },
  createTitle: {
    color: '#93C5FD',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  presetLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  presetChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetChipText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 10,
  },
  createButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  rewardCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    flexDirection: 'column',
    gap: 12,
  },
  affordableCard: {
    borderColor: '#F59E0B44',
  },
  lockedCard: {
    borderColor: '#334155',
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextContainer: {
    flex: 1,
  },
  rewardTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  costBadge: {
    marginTop: 4,
  },
  rewardCost: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  claimButton: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#334155',
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  deleteButton: {
    backgroundColor: '#EF444415',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    color: '#64748B',
    textAlign: 'center',
    fontSize: 14,
    maxWidth: 240,
  },
});