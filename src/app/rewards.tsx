import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Header from "../components/Header";
import { useUser } from "../context/UserContext";
import { getTodayProgress } from "../services/dailyProgressService";
import {
  createReward,
  deleteReward,
  getExclusiveRewards,
  getRewards,
  getTodayRewardChest,
  openDailyRewardChest,
  redeemReward,
  type ExclusiveReward,
  type Reward,
  type RewardChest,
} from "../services/rewardService";

const DEFAULT_DAILY_CHEST_GOLD = 50;

export default function RewardsScreen() {
  const {
    profile,
    reloadProfile,
    hapticsEnabled,
  } = useUser();

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [exclusiveRewards, setExclusiveRewards] = useState<
    ExclusiveReward[]
  >([]);
  const [todayChest, setTodayChest] =
    useState<RewardChest | null>(null);

  const [completedMinutes, setCompletedMinutes] =
    useState(0);
  const [goalMinutes, setGoalMinutes] =
    useState(60);
  const [goalCompleted, setGoalCompleted] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingChest, setOpeningChest] = useState(false);

  const [creatingReward, setCreatingReward] =
    useState(false);
  const [saving, setSaving] = useState(false);

  const [rewardTitle, setRewardTitle] = useState("");
  const [rewardCost, setRewardCost] = useState("300");

  const gold = profile?.gold ?? 0;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [
        rewardList,
        exclusiveList,
        chest,
        progress,
      ] = await Promise.all([
        getRewards(),
        getExclusiveRewards(),
        getTodayRewardChest(),
        getTodayProgress(),
      ]);

      setRewards(rewardList);
      setExclusiveRewards(exclusiveList);
      setTodayChest(chest);

      setCompletedMinutes(
        progress?.completed_minutes ?? 0,
      );

      setGoalMinutes(
        progress?.goal_minutes ??
          profile?.daily_goal_minutes ??
          60,
      );

      setGoalCompleted(
        progress?.goal_completed ?? false,
      );

      await reloadProfile();
    } catch (error) {
      console.error(
        "Failed to load rewards:",
        error,
      );

      Alert.alert(
        "Couldn't load rewards",
        "Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    profile?.daily_goal_minutes,
    reloadProfile,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const goalProgress = Math.min(
    1,
    completedMinutes / Math.max(1, goalMinutes),
  );

  const chestOpened =
    todayChest !== null &&
    todayChest.opened_at !== null;

  const chestReady =
    goalCompleted && !chestOpened;

  const chestGold =
    todayChest?.reward_gold ??
    DEFAULT_DAILY_CHEST_GOLD;

  const openChest = async () => {
    if (!chestReady || openingChest) {
      return;
    }

    try {
      setOpeningChest(true);

      if (hapticsEnabled) {
        Haptics.impactAsync(
          Haptics.ImpactFeedbackStyle.Medium,
        );
      }

      const result =
        await openDailyRewardChest();

      if (!result.success) {
        if (
          result.reason ===
          "daily_goal_not_completed"
        ) {
          Alert.alert(
            "Daily Goal not complete",
            "Complete today's goal first.",
          );
        } else if (
          result.reason === "already_opened"
        ) {
          Alert.alert(
            "Chest already opened",
            "Today's reward has already been claimed.",
          );
        } else {
          Alert.alert(
            "Couldn't open chest",
            "Please try again.",
          );
        }

        await loadData();
        return;
      }

      if (hapticsEnabled) {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }

      Alert.alert(
        "Daily Reward Claimed 🎉",
        `You received ${
          result.reward_gold ?? chestGold
        } Gold.`,
      );

      await reloadProfile();
      await loadData();
    } catch (error) {
      console.error(
        "Failed to open reward chest:",
        error,
      );

      Alert.alert(
        "Couldn't open chest",
        "Please try again.",
      );
    } finally {
      setOpeningChest(false);
    }
  };

  const openCreateReward = () => {
    setRewardTitle("");
    setRewardCost("300");
    setCreatingReward(true);
  };

  const closeCreateReward = () => {
    if (saving) {
      return;
    }

    setCreatingReward(false);
    setRewardTitle("");
    setRewardCost("300");
  };

  const handleCreateReward = async () => {
    const title = rewardTitle.trim();
    const cost = Number.parseInt(
      rewardCost,
      10,
    );

    if (!title) {
      Alert.alert(
        "Reward name missing",
        "Give your reward a name first.",
      );
      return;
    }

    if (!Number.isFinite(cost) || cost < 1) {
      Alert.alert(
        "Invalid Gold cost",
        "Enter a Gold cost of at least 1.",
      );
      return;
    }

    try {
      setSaving(true);

      await createReward(title, cost);

      if (hapticsEnabled) {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }

      closeCreateReward();
      await loadData();
    } catch (error) {
      console.error(
        "Failed to create reward:",
        error,
      );

      Alert.alert(
        "Couldn't create reward",
        "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRedeem = (reward: Reward) => {
    if (gold < reward.cost_gold) {
      Alert.alert(
        "Not enough Gold",
        `You need ${
          reward.cost_gold - gold
        } more Gold.`,
      );
      return;
    }

    Alert.alert(
      "Redeem reward?",
      `Spend ${reward.cost_gold} Gold on "${reward.title}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Redeem",
          onPress: async () => {
            try {
              if (hapticsEnabled) {
                Haptics.impactAsync(
                  Haptics.ImpactFeedbackStyle.Medium,
                );
              }

              const result =
                await redeemReward(reward.id);

              if (!result.success) {
                Alert.alert(
                  result.reason ===
                    "insufficient_gold"
                    ? "Not enough Gold"
                    : "Couldn't redeem",
                  result.reason ===
                    "insufficient_gold"
                    ? "You don't have enough Gold."
                    : "This reward could not be redeemed.",
                );

                await loadData();
                return;
              }

              if (hapticsEnabled) {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              }

              Alert.alert(
                "Reward Redeemed 🎉",
                `"${reward.title}" has been redeemed.`,
              );

              await reloadProfile();
              await loadData();
            } catch (error) {
              console.error(
                "Failed to redeem reward:",
                error,
              );

              Alert.alert(
                "Couldn't redeem reward",
                "Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  const handleDelete = (reward: Reward) => {
    Alert.alert(
      "Delete reward?",
      `"${reward.title}" will be permanently removed.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteReward(reward.id);

              if (hapticsEnabled) {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              }

              await loadData();
            } catch (error) {
              console.error(
                "Failed to delete reward:",
                error,
              );

              Alert.alert(
                "Couldn't delete reward",
                "Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  const isExclusiveUnlocked = (
    reward: ExclusiveReward,
  ) => {
    switch (reward.unlock_type) {
      case "streak":
        return (
          (profile?.streak_count ?? 0) >=
          reward.unlock_value
        );

      case "level":
        return (
          (profile?.level ?? 1) >=
          reward.unlock_value
        );

      case "sessions":
      case "minutes":
        return false;

      default:
        return false;
    }
  };

  const getExclusiveProgress = (
    reward: ExclusiveReward,
  ) => {
    switch (reward.unlock_type) {
      case "streak":
        return `${Math.min(
          profile?.streak_count ?? 0,
          reward.unlock_value,
        )} / ${reward.unlock_value} days`;

      case "level":
        return `Level ${
          profile?.level ?? 1
        } / ${reward.unlock_value}`;

      case "sessions":
        return `${reward.unlock_value} sessions`;

      case "minutes":
        return `${reward.unlock_value} minutes`;

      default:
        return "Milestone reward";
    }
  };

  const unlockedExclusiveCount =
    exclusiveRewards.filter(
      isExclusiveUnlocked,
    ).length;

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Rewards"
        subtitle="Earn it. Unlock it. Enjoy it."
        showBack={true}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#818CF8"
          />
        }
      >
        {/* GOLD WALLET */}
        <View style={styles.walletCard}>
          <View>
            <Text style={styles.eyebrow}>
              GOLD WALLET
            </Text>

            <Text style={styles.goldAmount}>
              💰 {gold}
            </Text>

            <Text style={styles.goldCaption}>
              Earned through completed sessions
            </Text>
          </View>

          <View style={styles.walletBadge}>
            <Text style={styles.walletBadgeText}>
              REWARD CURRENCY
            </Text>
          </View>
        </View>

        {/* DAILY CHEST */}
        <View style={styles.featureCard}>
          <View style={styles.featureTop}>
            <View
              style={[
                styles.featureIconBox,
                chestReady &&
                  styles.featureIconBoxReady,
              ]}
            >
              <Text style={styles.featureIcon}>
                {chestOpened
                  ? "📦"
                  : chestReady
                    ? "🎁"
                    : "🔒"}
              </Text>
            </View>

            <View style={styles.featureInfo}>
              <Text style={styles.featureTitle}>
                Daily Reward Chest
              </Text>

              <Text style={styles.featureDescription}>
                {chestOpened
                  ? "Today's reward has already been claimed."
                  : chestReady
                    ? `Your chest is ready. Guaranteed +${chestGold} Gold.`
                    : "Complete today's Daily Goal to unlock it."}
              </Text>
            </View>

            <View
              style={[
                styles.statusPill,
                chestReady &&
                  styles.statusPillReady,
                chestOpened &&
                  styles.statusPillDone,
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  chestReady &&
                    styles.statusPillTextReady,
                  chestOpened &&
                    styles.statusPillTextDone,
                ]}
              >
                {chestOpened
                  ? "CLAIMED"
                  : chestReady
                    ? "READY"
                    : "LOCKED"}
              </Text>
            </View>
          </View>

          <View style={styles.goalRow}>
            <Text style={styles.goalLabel}>
              DAILY GOAL
            </Text>

            <Text style={styles.goalValue}>
              {completedMinutes} /{" "}
              {goalMinutes} min
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${goalProgress * 100}%`,
                },
              ]}
            />
          </View>

          <View style={styles.featureBottom}>
            <Text style={styles.featureBottomText}>
              {chestOpened
                ? "Come back tomorrow."
                : chestReady
                  ? `+${chestGold} Gold guaranteed`
                  : `${Math.max(
                      0,
                      goalMinutes -
                        completedMinutes,
                    )} min remaining`}
            </Text>

            {chestReady && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={openChest}
                disabled={openingChest}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>
                  {openingChest
                    ? "OPENING..."
                    : "OPEN CHEST"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* PERSONAL REWARDS */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleGroup}>
            <Text style={styles.sectionTitle}>
              PERSONAL REWARDS
            </Text>

            <Text style={styles.sectionSubtitle}>
              Real-life treats you choose for yourself
            </Text>
          </View>

          <TouchableOpacity
            style={styles.addButton}
            onPress={openCreateReward}
            activeOpacity={0.8}
          >
            <Text style={styles.addButtonText}>
              +
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.simpleCard}>
            <Text style={styles.mutedText}>
              Loading rewards...
            </Text>
          </View>
        ) : rewards.length === 0 ? (
          <View style={styles.emptyRewardCard}>
            <Text style={styles.emptyRewardIcon}>
              🎯
            </Text>

            <Text style={styles.emptyRewardTitle}>
              No personal rewards yet
            </Text>

            <Text style={styles.emptyRewardText}>
              Create something you genuinely
              want to earn with your Gold.
            </Text>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={openCreateReward}
            >
              <Text
                style={styles.secondaryButtonText}
              >
                CREATE FIRST REWARD
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          rewards.map((reward) => {
            const canRedeem =
              gold >= reward.cost_gold;

            return (
              <View
                key={reward.id}
                style={styles.rewardCard}
              >
                <View style={styles.rewardTop}>
                  <View style={styles.rewardIconBox}>
                    <Text style={styles.rewardIcon}>
                      🎁
                    </Text>
                  </View>

                  <View style={styles.rewardInfo}>
                    <Text
                      style={styles.rewardTitle}
                      numberOfLines={2}
                    >
                      {reward.title}
                    </Text>

                    <Text style={styles.rewardCost}>
                      💰 {reward.cost_gold} Gold
                    </Text>
                  </View>
                </View>

                <View style={styles.rewardActionRow}>
                  <TouchableOpacity
                    style={[
                      styles.rewardRedeemButton,
                      !canRedeem &&
                        styles.rewardRedeemDisabled,
                    ]}
                    onPress={() =>
                      handleRedeem(reward)
                    }
                    disabled={!canRedeem}
                  >
                    <Text
                      style={[
                        styles.rewardRedeemText,
                        !canRedeem &&
                          styles.rewardRedeemTextDisabled,
                      ]}
                    >
                      {canRedeem
                        ? "REDEEM"
                        : `NEED ${
                            reward.cost_gold -
                            gold
                          } MORE`}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() =>
                      handleDelete(reward)
                    }
                  >
                    <Text style={styles.deleteButtonText}>
                      ✕
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* MILESTONE REWARDS */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleGroup}>
            <Text style={styles.sectionTitle}>
              MILESTONE REWARDS
            </Text>

            <Text style={styles.sectionSubtitle}>
              Unlock them through progression
            </Text>
          </View>

          <View style={styles.counterPill}>
            <Text style={styles.counterPillText}>
              {unlockedExclusiveCount} /{" "}
              {exclusiveRewards.length}
            </Text>
          </View>
        </View>

        {exclusiveRewards.length === 0 ? (
          <View style={styles.simpleCard}>
            <Text style={styles.mutedText}>
              No milestone rewards configured yet.
            </Text>
          </View>
        ) : (
          exclusiveRewards.map((reward) => {
            const unlocked =
              isExclusiveUnlocked(reward);

            return (
              <View
                key={reward.id}
                style={[
                  styles.milestoneCard,
                  unlocked &&
                    styles.milestoneCardUnlocked,
                ]}
              >
                <View
                  style={[
                    styles.milestoneIconBox,
                    unlocked &&
                      styles.milestoneIconBoxUnlocked,
                  ]}
                >
                  <Text style={styles.milestoneIcon}>
                    {unlocked
                      ? reward.icon
                      : "🔒"}
                  </Text>
                </View>

                <View style={styles.milestoneInfo}>
                  <View style={styles.milestoneTitleRow}>
                    <Text
                      style={[
                        styles.milestoneTitle,
                        !unlocked &&
                          styles.milestoneTitleLocked,
                      ]}
                    >
                      {reward.title}
                    </Text>

                    <Text
                      style={[
                        styles.milestoneStatus,
                        unlocked &&
                          styles.milestoneStatusUnlocked,
                      ]}
                    >
                      {unlocked
                        ? "UNLOCKED"
                        : "LOCKED"}
                    </Text>
                  </View>

                  <Text style={styles.milestoneDescription}>
                    {reward.description}
                  </Text>

                  <Text style={styles.milestoneProgress}>
                    {getExclusiveProgress(reward)}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        {/* FUTURE SOCIAL SYSTEM */}
        <View style={styles.futureCard}>
          <View style={styles.futureIconBox}>
            <Text style={styles.futureIcon}>
              🏆
            </Text>
          </View>

          <View style={styles.futureInfo}>
            <Text style={styles.futureTitle}>
              Community Rewards
            </Text>

            <Text style={styles.futureText}>
              Leaderboards, seasonal events,
              cosmetics, titles, and other
              multiplayer reward systems can
              come here later.
            </Text>
          </View>

          <View style={styles.futureBadge}>
            <Text style={styles.futureBadgeText}>
              SOON
            </Text>
          </View>
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>

      {/* CREATE PERSONAL REWARD */}
      <Modal
        visible={creatingReward}
        transparent
        animationType="fade"
        onRequestClose={closeCreateReward}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={
              Platform.OS === "ios"
                ? "padding"
                : "padding"
            }
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Create Personal Reward
                  </Text>

                  <Text
                    style={styles.modalSubtitle}
                  >
                    Decide what your Gold is worth.
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={closeCreateReward}
                  disabled={saving}
                >
                  <Text style={styles.closeButton}>
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>
                REWARD NAME
              </Text>

              <TextInput
                value={rewardTitle}
                onChangeText={setRewardTitle}
                placeholder="e.g. 30-Minute Gaming Session"
                placeholderTextColor="#64748B"
                style={styles.input}
                autoFocus
                maxLength={100}
              />

              <Text style={styles.inputLabel}>
                GOLD COST
              </Text>

              <TextInput
                value={rewardCost}
                onChangeText={setRewardCost}
                keyboardType="number-pad"
                placeholder="300"
                placeholderTextColor="#64748B"
                style={styles.input}
                maxLength={5}
              />

              <TouchableOpacity
                style={[
                  styles.createButton,
                  saving &&
                    styles.createButtonDisabled,
                ]}
                onPress={handleCreateReward}
                disabled={saving}
              >
                <Text style={styles.createButtonText}>
                  {saving
                    ? "CREATING..."
                    : "CREATE REWARD"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeCreateReward}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090D16",
  },

  content: {
    paddingHorizontal: 18,
    paddingBottom: 110,
  },

  walletCard: {
    marginTop: 8,
    padding: 20,
    borderRadius: 24,
    backgroundColor: "rgba(245,158,11,0.09)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  eyebrow: {
    color: "#A16207",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  goldAmount: {
    color: "#FBBF24",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 3,
  },

  goldCaption: {
    color: "#92400E",
    fontSize: 9,
    marginTop: 4,
  },

  walletBadge: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: "rgba(245,158,11,0.1)",
  },

  walletBadgeText: {
    color: "#FBBF24",
    fontSize: 7,
    fontWeight: "900",
  },

  featureCard: {
    marginTop: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: "rgba(99,102,241,0.11)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.24)",
  },

  featureTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  featureIconBox: {
    width: 56,
    height: 56,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },

  featureIconBoxReady: {
    backgroundColor: "rgba(99,102,241,0.22)",
  },

  featureIcon: {
    fontSize: 30,
  },

  featureInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    marginRight: 8,
  },

  featureTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "900",
  },

  featureDescription: {
    color: "#94A3B8",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },

  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  statusPillReady: {
    backgroundColor: "rgba(99,102,241,0.18)",
  },

  statusPillDone: {
    backgroundColor: "rgba(16,185,129,0.1)",
  },

  statusPillText: {
    color: "#64748B",
    fontSize: 7,
    fontWeight: "900",
  },

  statusPillTextReady: {
    color: "#A5B4FC",
  },

  statusPillTextDone: {
    color: "#34D399",
  },

  goalRow: {
    marginTop: 17,
    marginBottom: 7,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  goalLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  goalValue: {
    color: "#A5B4FC",
    fontSize: 9,
    fontWeight: "800",
  },

  progressTrack: {
    height: 9,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: "#6366F1",
  },

  featureBottom: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  featureBottomText: {
    flex: 1,
    color: "#64748B",
    fontSize: 9,
  },

  primaryButton: {
    minWidth: 108,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },

  sectionHeader: {
    marginTop: 25,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionTitleGroup: {
    flex: 1,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  sectionSubtitle: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 3,
  },

  addButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(99,102,241,0.15)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },

  addButtonText: {
    color: "#A5B4FC",
    fontSize: 23,
    fontWeight: "300",
  },

  counterPill: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: "rgba(99,102,241,0.1)",
  },

  counterPillText: {
    color: "#A5B4FC",
    fontSize: 8,
    fontWeight: "900",
  },

  simpleCard: {
    padding: 20,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
  },

  mutedText: {
    color: "#64748B",
    fontSize: 10,
  },

  emptyRewardCard: {
    padding: 24,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },

  emptyRewardIcon: {
    fontSize: 31,
  },

  emptyRewardTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 8,
  },

  emptyRewardText: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 6,
  },

  secondaryButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 11,
    backgroundColor: "rgba(99,102,241,0.14)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },

  secondaryButtonText: {
    color: "#A5B4FC",
    fontSize: 9,
    fontWeight: "900",
  },

  rewardCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 9,
  },

  rewardTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  rewardIconBox: {
    width: 47,
    height: 47,
    borderRadius: 14,
    backgroundColor: "rgba(99,102,241,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  rewardIcon: {
    fontSize: 22,
  },

  rewardInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
  },

  rewardTitle: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "800",
  },

  rewardCost: {
    color: "#FBBF24",
    fontSize: 9,
    fontWeight: "900",
    marginTop: 4,
  },

  rewardActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 11,
  },

  rewardRedeemButton: {
    flex: 1,
    height: 39,
    borderRadius: 11,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },

  rewardRedeemDisabled: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  rewardRedeemText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },

  rewardRedeemTextDisabled: {
    color: "#475569",
  },

  deleteButton: {
    width: 39,
    height: 39,
    borderRadius: 11,
    backgroundColor: "rgba(239,68,68,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },

  deleteButtonText: {
    color: "#F87171",
    fontSize: 12,
    fontWeight: "900",
  },

  milestoneCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
  },

  milestoneCardUnlocked: {
    backgroundColor: "rgba(99,102,241,0.07)",
    borderColor: "rgba(129,140,248,0.24)",
  },

  milestoneIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },

  milestoneIconBoxUnlocked: {
    backgroundColor: "rgba(99,102,241,0.14)",
  },

  milestoneIcon: {
    fontSize: 23,
  },

  milestoneInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
  },

  milestoneTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },

  milestoneTitle: {
    flex: 1,
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "900",
  },

  milestoneTitleLocked: {
    color: "#94A3B8",
  },

  milestoneStatus: {
    color: "#64748B",
    fontSize: 7,
    fontWeight: "900",
  },

  milestoneStatusUnlocked: {
    color: "#34D399",
  },

  milestoneDescription: {
    color: "#64748B",
    fontSize: 9,
    lineHeight: 13,
    marginTop: 3,
  },

  milestoneProgress: {
    color: "#818CF8",
    fontSize: 8,
    fontWeight: "800",
    marginTop: 5,
  },

  futureCard: {
    marginTop: 16,
    padding: 15,
    borderRadius: 19,
    backgroundColor: "rgba(245,158,11,0.06)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.12)",
    flexDirection: "row",
    alignItems: "center",
  },

  futureIconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "rgba(245,158,11,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  futureIcon: {
    fontSize: 22,
  },

  futureInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
    marginRight: 8,
  },

  futureTitle: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "900",
  },

  futureText: {
    color: "#64748B",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },

  futureBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: "rgba(245,158,11,0.08)",
  },

  futureBadgeText: {
    color: "#FBBF24",
    fontSize: 7,
    fontWeight: "900",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.76)",
    justifyContent: "flex-end",
  },

  modalKeyboard: {
    width: "100%",
    justifyContent: "flex-end",
  },

  modalCard: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  modalTitle: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "900",
  },

  modalSubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 4,
  },

  closeButton: {
    color: "#64748B",
    fontSize: 19,
    padding: 4,
  },

  inputLabel: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 13,
  },

  input: {
    backgroundColor: "#111C30",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    color: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
  },

  createButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 23,
  },

  createButtonDisabled: {
    opacity: 0.55,
  },

  createButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  cancelButton: {
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelButtonText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
  },

  bottomSpace: {
    height: 25,
  },
});