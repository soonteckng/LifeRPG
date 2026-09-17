import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { useUser } from '../context/UserContext';

export default function ShopScreen() {
  const { profile, reloadProfile } = useUser();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [title, setTitle] = useState('');
  const [costGold, setCostGold] = useState('');

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
      Alert.alert('Missing Title', 'Please enter a reward title.');
      return;
    }

    const parsedCost = parseInt(costGold, 10);
    if (isNaN(parsedCost) || parsedCost <= 0) {
      Alert.alert('Invalid Cost', 'Please enter a valid Gold amount greater than 0.');
      return;
    }

    addReward(title.trim(), parsedCost);
    setTitle('');
    setCostGold('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refreshShopData();
  };

  const handleClaimReward = (reward: Reward) => {
    if (!profile || profile.gold < reward.cost_gold) {
      Alert.alert('Insufficient Gold', `You need ${reward.cost_gold} Gold to purchase this reward.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Alert.alert(
      'Claim Reward',
      `Spend 💰 ${reward.cost_gold} Gold on "${reward.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          style: 'default',
          onPress: () => {
            const success = claimReward(reward.id);
            if (success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refreshShopData();
            } else {
              Alert.alert('Error', 'Failed to redeem reward.');
            }
          },
        },
      ]
    );
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
    <View style={styles.container}>
      {/* Header Banner */}
      <View style={styles.vaultHeader}>
        <View style={styles.vaultTitleRow}>
          <Ionicons name="storefront" size={24} color="#F59E0B" />
          <Text style={styles.vaultTitle}>Item Shop</Text>
        </View>
        <View style={styles.goldDisplay}>
          <Text style={styles.goldText}>💰 {profile?.gold || 0}</Text>
          <Text style={styles.goldLabel}>GOLD</Text>
        </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
    paddingHorizontal: 16,
    paddingTop: 48,
  },
  vaultHeader: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  vaultTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  vaultTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  goldDisplay: {
    alignItems: 'flex-end',
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
    marginBottom: 12,
  },
  listContainer: {
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