import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useState,
} from "react";
import {
  Alert,
  KeyboardAvoidingView,
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
import { getTodayProgress } from "../services/dailyProgressService";

export default function RewardsScreen() {
  const {
    profile,
    reloadProfile,
    hapticsEnabled,
  } = useUser();

  const [rewards, setRewards] = useState<
    Reward[]
  >([]);

  const [
    exclusiveRewards,
    setExclusiveRewards,
  ] = useState<ExclusiveReward[]>([]);

  const [todayChest, setTodayChest] =
    useState<RewardChest | null>(null);

  const [completedMinutes, setCompletedMinutes] =
    useState(0);

  const [goalMinutes, setGoalMinutes] =
    useState(60);

  const [goalCompleted, setGoalCompleted] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [openingChest, setOpeningChest] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [creatingReward, setCreatingReward] =
    useState(false);

  const [rewardTitle, setRewardTitle] =
    useState("");

  const [rewardCost, setRewardCost] =
    useState("300");

  const loadData = useCallback(
    async () => {
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
        setExclusiveRewards(
          exclusiveList,
        );
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
    },
    [
      profile?.daily_goal_minutes,
      reloadProfile,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = useCallback(
    async () => {
      setRefreshing(true);

      try {
        await loadData();
      } finally {
        setRefreshing(false);
      }
    },
    [loadData],
  );

  const gold = profile?.gold ?? 0;

  const goalProgress = Math.min(
    1,
    completedMinutes /
      Math.max(1, goalMinutes),
  );

  const chestOpened =
    todayChest?.opened_at !== null &&
    todayChest !== null;

  const chestReady =
    goalCompleted && !chestOpened;

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
          result.reason ===
          "already_opened"
        ) {
          Alert.alert(
            "Already opened",
            "Today's chest has already been opened.",
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
        "Chest opened 🎉",
        `You received ${result.reward_gold ?? 0} Gold!`,
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

  const handleCreateReward =
    async () => {
      const title =
        rewardTitle.trim();

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

      if (
        !Number.isFinite(cost) ||
        cost < 1
      ) {
        Alert.alert(
          "Invalid Gold cost",
          "Enter a Gold cost of at least 1.",
        );
        return;
      }

      try {
        setSaving(true);

        await createReward(
          title,
          cost,
        );

        if (hapticsEnabled) {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        }

        setCreatingReward(false);
        setRewardTitle("");
        setRewardCost("300");

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

  const handleRedeem = async (
    reward: Reward,
  ) => {
    if (gold < reward.cost_gold) {
      Alert.alert(
        "Not enough Gold",
        `You need ${
          reward.cost_gold - gold
        } more Gold to redeem this reward.`,
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
                await redeemReward(
                  reward.id,
                );

              if (!result.success) {
                Alert.alert(
                  result.reason ===
                    "insufficient_gold"
                    ? "Not enough Gold"
                    : "Couldn't redeem",
                  result.reason ===
                    "insufficient_gold"
                    ? "You don't have enough Gold for this reward."
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
                "Reward redeemed 🎉",
                `"${reward.title}" is yours.`,
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

  const handleDelete = (
    reward: Reward,
  ) => {
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
              await deleteReward(
                reward.id,
              );

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
    switch (
      reward.unlock_type
    ) {
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
        /*
         * Lifetime session/minute tracking
         * will be connected when the
         * progression system exposes it.
         */
        return false;

      default:
        return false;
    }
  };

  const getExclusiveProgressText = (
    reward: ExclusiveReward,
  ) => {
    switch (
      reward.unlock_type
    ) {
      case "streak":
        return `${Math.min(
          profile?.streak_count ?? 0,
          reward.unlock_value,
        )} / ${
          reward.unlock_value
        } day streak`;

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

  return (
    <SafeAreaView
      style={styles.container}
    >
      <Header
        title="Rewards"
        subtitle="Turn progress into something meaningful"
        showBack={false}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#818CF8"
          />
        }
      >
        {/* GOLD */}
        <View
          style={styles.goldCard}
        >
          <View>
            <Text
              style={styles.goldLabel}
            >
              YOUR GOLD
            </Text>

            <Text
              style={styles.goldAmount}
            >
              💰 {gold}
            </Text>
          </View>

          <View
            style={styles.goldInfo}
          >
            <Text
              style={styles.goldInfoText}
            >
              Earn Gold from completed
              sessions.
            </Text>

            <Text
              style={styles.goldInfoText}
            >
              Spend it on rewards you choose.
            </Text>
          </View>
        </View>

        {/* DAILY REWARD CHEST */}
        <View
          style={styles.chestCard}
        >
          <View
            style={styles.chestTopRow}
          >
            <View
              style={styles.chestIconBox}
            >
              <Text
                style={styles.chestIcon}
              >
                {chestOpened
                  ? "📦"
                  : "🎁"}
              </Text>
            </View>

            <View
              style={styles.chestInfo}
            >
              <Text
                style={styles.chestTitle}
              >
                Daily Reward Chest
              </Text>

              <Text
                style={styles.chestDescription}
              >
                {chestOpened
                  ? "Today's chest has already been opened."
                  : "Complete your Daily Goal to earn today's chest."}
              </Text>
            </View>
          </View>

          <View
            style={
              styles.chestProgressHeader
            }
          >
            <Text
              style={
                styles.chestProgressText
              }
            >
              {completedMinutes} /{" "}
              {goalMinutes} min
            </Text>

            <Text
              style={
                styles.chestProgressText
              }
            >
              {Math.round(
                goalProgress * 100,
              )}
              %
            </Text>
          </View>

          <View
            style={
              styles.chestProgressTrack
            }
          >
            <View
              style={[
                styles.chestProgressFill,
                {
                  width: `${goalProgress * 100}%`,
                },
              ]}
            />
          </View>

          <View
            style={
              styles.chestBottomRow
            }
          >
            <Text
              style={styles.chestStatus}
            >
              {chestOpened
                ? "Come back tomorrow for another chest."
                : chestReady
                  ? "Chest ready to open."
                  : `${Math.max(
                      0,
                      goalMinutes -
                        completedMinutes,
                    )} min remaining.`}
            </Text>

            {chestReady && (
              <TouchableOpacity
                style={
                  styles.openChestButton
                }
                onPress={openChest}
                disabled={
                  openingChest
                }
                activeOpacity={0.85}
              >
                <Text
                  style={
                    styles.openChestText
                  }
                >
                  {openingChest
                    ? "OPENING..."
                    : "OPEN CHEST"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* PERSONAL REWARDS */}
        <View
          style={styles.sectionHeader}
        >
          <View>
            <Text
              style={styles.sectionTitle}
            >
              PERSONAL REWARDS
            </Text>

            <Text
              style={styles.sectionSubtitle}
            >
              Rewards you choose for yourself.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.addRewardButton}
            onPress={
              openCreateReward
            }
          >
            <Text
              style={
                styles.addRewardButtonText
              }
            >
              +
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View
            style={styles.loadingCard}
          >
            <Text
              style={styles.loadingText}
            >
              Loading rewards...
            </Text>
          </View>
        ) : rewards.length === 0 ? (
          <View
            style={styles.emptyCard}
          >
            <Text
              style={styles.emptyIcon}
            >
              🎁
            </Text>

            <Text
              style={styles.emptyTitle}
            >
              No personal rewards yet
            </Text>

            <Text
              style={styles.emptyText}
            >
              Create something you genuinely
              want to earn with your Gold.
            </Text>

            <TouchableOpacity
              style={
                styles.emptyAction
              }
              onPress={
                openCreateReward
              }
            >
              <Text
                style={
                  styles.emptyActionText
                }
              >
                CREATE REWARD
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          rewards.map((reward) => {
            const canRedeem =
              gold >=
              reward.cost_gold;

            return (
              <View
                key={reward.id}
                style={styles.rewardCard}
              >
                <View
                  style={
                    styles.rewardMain
                  }
                >
                  <View
                    style={
                      styles.rewardIconBox
                    }
                  >
                    <Text
                      style={
                        styles.rewardIcon
                      }
                    >
                      🎁
                    </Text>
                  </View>

                  <View
                    style={
                      styles.rewardInfo
                    }
                  >
                    <Text
                      style={
                        styles.rewardTitle
                      }
                      numberOfLines={2}
                    >
                      {reward.title}
                    </Text>

                    <Text
                      style={
                        styles.rewardCost
                      }
                    >
                      💰{" "}
                      {
                        reward.cost_gold
                      }
                    </Text>
                  </View>
                </View>

                <View
                  style={
                    styles.rewardActions
                  }
                >
                  <TouchableOpacity
                    style={[
                      styles.redeemButton,
                      !canRedeem &&
                        styles.redeemButtonDisabled,
                    ]}
                    onPress={() =>
                      handleRedeem(
                        reward,
                      )
                    }
                    disabled={
                      !canRedeem
                    }
                  >
                    <Text
                      style={[
                        styles.redeemButtonText,
                        !canRedeem &&
                          styles.redeemButtonTextDisabled,
                      ]}
                    >
                      REDEEM
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={
                      styles.deleteRewardButton
                    }
                    onPress={() =>
                      handleDelete(
                        reward,
                      )
                    }
                  >
                    <Text
                      style={
                        styles.deleteRewardText
                      }
                    >
                      ✕
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* EXCLUSIVE REWARDS */}
        <View
          style={styles.sectionHeader}
        >
          <View>
            <Text
              style={styles.sectionTitle}
            >
              EXCLUSIVE REWARDS
            </Text>

            <Text
              style={styles.sectionSubtitle}
            >
              Milestone rewards that you unlock,
              not buy.
            </Text>
          </View>
        </View>

        {exclusiveRewards.length === 0 ? (
          <View
            style={styles.emptyCard}
          >
            <Text
              style={styles.emptyText}
            >
              No exclusive rewards are
              configured yet.
            </Text>
          </View>
        ) : (
          exclusiveRewards.map(
            (reward) => {
              const unlocked =
                isExclusiveUnlocked(
                  reward,
                );

              return (
                <View
                  key={reward.id}
                  style={[
                    styles.exclusiveCard,
                    unlocked &&
                      styles.exclusiveCardUnlocked,
                  ]}
                >
                  <View
                    style={
                      styles.exclusiveMain
                    }
                  >
                    <View
                      style={[
                        styles.exclusiveIconBox,
                        unlocked &&
                          styles.exclusiveIconBoxUnlocked,
                      ]}
                    >
                      <Text
                        style={
                          styles.exclusiveIcon
                        }
                      >
                        {unlocked
                          ? reward.icon
                          : "🔒"}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.exclusiveInfo
                      }
                    >
                      <Text
                        style={[
                          styles.exclusiveTitle,
                          !unlocked &&
                            styles.exclusiveTitleLocked,
                        ]}
                      >
                        {reward.title}
                      </Text>

                      <Text
                        style={
                          styles.exclusiveDescription
                        }
                      >
                        {
                          reward.description
                        }
                      </Text>

                      <Text
                        style={
                          styles.exclusiveProgress
                        }
                      >
                        {getExclusiveProgressText(
                          reward,
                        )}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.unlockBadge,
                        unlocked &&
                          styles.unlockBadgeUnlocked,
                      ]}
                    >
                      <Text
                        style={[
                          styles.unlockBadgeText,
                          unlocked &&
                            styles.unlockBadgeTextUnlocked,
                        ]}
                      >
                        {unlocked
                          ? "UNLOCKED"
                          : "LOCKED"}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            },
          )
        )}

        {/* LEADERBOARD */}
        <View
          style={styles.leaderboardCard}
        >
          <View
            style={
              styles.leaderboardIconBox
            }
          >
            <Text
              style={
                styles.leaderboardIcon
              }
            >
              🏆
            </Text>
          </View>

          <View
            style={
              styles.leaderboardInfo
            }
          >
            <Text
              style={
                styles.leaderboardTitle
              }
            >
              Weekly Leaderboard
            </Text>

            <Text
              style={
                styles.leaderboardText
              }
            >
              Compare progress with friends
              and other heroes.
            </Text>
          </View>

          <View
            style={
              styles.soonBadge
            }
          >
            <Text
              style={
                styles.soonBadgeText
              }
            >
              SOON
            </Text>
          </View>
        </View>

        <View
          style={styles.bottomSpace}
        />
      </ScrollView>

      {/* CREATE PERSONAL REWARD */}
      {creatingReward && (
        <View
          style={styles.modalOverlay}
        >
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={
              Platform.OS === "ios"
                ? "padding"
                : "padding"
            }
          >
            <View
              style={styles.modalCard}
            >
              <View
                style={
                  styles.modalHeader
                }
              >
                <View>
                  <Text
                    style={
                      styles.modalTitle
                    }
                  >
                    Create Reward
                  </Text>

                  <Text
                    style={
                      styles.modalSubtitle
                    }
                  >
                    Decide what your Gold can
                    buy.
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={
                    closeCreateReward
                  }
                  disabled={saving}
                >
                  <Text
                    style={
                      styles.closeButton
                    }
                  >
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>

              <Text
                style={styles.inputLabel}
              >
                REWARD NAME
              </Text>

              <TextInput
                value={
                  rewardTitle
                }
                onChangeText={
                  setRewardTitle
                }
                placeholder="e.g. 30-Minute Gaming Session"
                placeholderTextColor="#64748B"
                style={
                  styles.titleInput
                }
                autoFocus
                maxLength={100}
              />

              <Text
                style={styles.inputLabel}
              >
                GOLD COST
              </Text>

              <TextInput
                value={
                  rewardCost
                }
                onChangeText={
                  setRewardCost
                }
                keyboardType="number-pad"
                placeholder="300"
                placeholderTextColor="#64748B"
                style={
                  styles.titleInput
                }
                maxLength={5}
              />

              <TouchableOpacity
                style={[
                  styles.createButton,
                  saving &&
                    styles.createButtonDisabled,
                ]}
                onPress={
                  handleCreateReward
                }
                disabled={
                  saving
                }
              >
                <Text
                  style={
                    styles.createButtonText
                  }
                >
                  {saving
                    ? "CREATING..."
                    : "CREATE REWARD"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={
                  styles.cancelButton
                }
                onPress={
                  closeCreateReward
                }
                disabled={saving}
              >
                <Text
                  style={
                    styles.cancelButtonText
                  }
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090D16",
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },

  goldCard: {
    marginTop: 6,
    padding: 18,
    borderRadius: 22,
    backgroundColor:
      "rgba(245,158,11,0.08)",
    borderWidth: 1,
    borderColor:
      "rgba(245,158,11,0.16)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  goldLabel: {
    color: "#A16207",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },

  goldAmount: {
    color: "#FBBF24",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 4,
  },

  goldInfo: {
    maxWidth: 155,
  },

  goldInfoText: {
    color: "#92400E",
    fontSize: 9,
    lineHeight: 14,
    fontWeight: "700",
    textAlign: "right",
  },

  chestCard: {
    marginTop: 14,
    padding: 18,
    borderRadius: 22,
    backgroundColor:
      "rgba(99,102,241,0.10)",
    borderWidth: 1,
    borderColor:
      "rgba(129,140,248,0.22)",
  },

  chestTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  chestIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor:
      "rgba(99,102,241,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  chestIcon: {
    fontSize: 28,
  },

  chestInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },

  chestTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "900",
  },

  chestDescription: {
    color: "#94A3B8",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },

  chestProgressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 6,
  },

  chestProgressText: {
    color: "#A5B4FC",
    fontSize: 9,
    fontWeight: "800",
  },

  chestProgressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor:
      "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },

  chestProgressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#6366F1",
  },

  chestBottomRow: {
    marginTop: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  chestStatus: {
    flex: 1,
    color: "#64748B",
    fontSize: 9,
    lineHeight: 14,
  },

  openChestButton: {
    minWidth: 104,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  openChestText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },

  sectionHeader: {
    marginTop: 24,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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

  addRewardButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor:
      "rgba(99,102,241,0.16)",
    borderWidth: 1,
    borderColor:
      "rgba(129,140,248,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },

  addRewardButtonText: {
    color: "#A5B4FC",
    fontSize: 23,
    fontWeight: "300",
  },

  loadingCard: {
    padding: 22,
    borderRadius: 18,
    backgroundColor:
      "rgba(255,255,255,0.04)",
    alignItems: "center",
  },

  loadingText: {
    color: "#64748B",
    fontSize: 10,
  },

  emptyCard: {
    padding: 24,
    borderRadius: 20,
    backgroundColor:
      "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.08)",
    alignItems: "center",
  },

  emptyIcon: {
    fontSize: 30,
  },

  emptyTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 8,
  },

  emptyText: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 6,
  },

  emptyAction: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 11,
    backgroundColor:
      "rgba(99,102,241,0.14)",
    borderWidth: 1,
    borderColor:
      "rgba(129,140,248,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },

  emptyActionText: {
    color: "#A5B4FC",
    fontSize: 9,
    fontWeight: "900",
  },

  rewardCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor:
      "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.08)",
    marginBottom: 9,
  },

  rewardMain: {
    flexDirection: "row",
    alignItems: "center",
  },

  rewardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor:
      "rgba(99,102,241,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  rewardIcon: {
    fontSize: 21,
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
    fontSize: 10,
    fontWeight: "900",
    marginTop: 4,
  },

  rewardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 11,
  },

  redeemButton: {
    flex: 1,
    height: 39,
    borderRadius: 11,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },

  redeemButtonDisabled: {
    backgroundColor:
      "rgba(255,255,255,0.05)",
  },

  redeemButtonText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },

  redeemButtonTextDisabled: {
    color: "#475569",
  },

  deleteRewardButton: {
    width: 39,
    height: 39,
    borderRadius: 11,
    backgroundColor:
      "rgba(239,68,68,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },

  deleteRewardText: {
    color: "#F87171",
    fontSize: 12,
    fontWeight: "900",
  },

  exclusiveCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor:
      "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.07)",
    marginBottom: 9,
  },

  exclusiveCardUnlocked: {
    backgroundColor:
      "rgba(99,102,241,0.07)",
    borderColor:
      "rgba(129,140,248,0.24)",
  },

  exclusiveMain: {
    flexDirection: "row",
    alignItems: "center",
  },

  exclusiveIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor:
      "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },

  exclusiveIconBoxUnlocked: {
    backgroundColor:
      "rgba(99,102,241,0.14)",
  },

  exclusiveIcon: {
    fontSize: 22,
  },

  exclusiveInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
  },

  exclusiveTitle: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "900",
  },

  exclusiveTitleLocked: {
    color: "#94A3B8",
  },

  exclusiveDescription: {
    color: "#64748B",
    fontSize: 9,
    lineHeight: 13,
    marginTop: 3,
  },

  exclusiveProgress: {
    color: "#818CF8",
    fontSize: 8,
    fontWeight: "800",
    marginTop: 5,
  },

  unlockBadge: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor:
      "rgba(255,255,255,0.05)",
  },

  unlockBadgeUnlocked: {
    backgroundColor:
      "rgba(16,185,129,0.10)",
  },

  unlockBadgeText: {
    color: "#64748B",
    fontSize: 7,
    fontWeight: "900",
  },

  unlockBadgeTextUnlocked: {
    color: "#34D399",
  },

  leaderboardCard: {
    marginTop: 14,
    padding: 15,
    borderRadius: 19,
    backgroundColor:
      "rgba(245,158,11,0.06)",
    borderWidth: 1,
    borderColor:
      "rgba(245,158,11,0.12)",
    flexDirection: "row",
    alignItems: "center",
  },

  leaderboardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor:
      "rgba(245,158,11,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },

  leaderboardIcon: {
    fontSize: 22,
  },

  leaderboardInfo: {
    flex: 1,
    marginLeft: 11,
  },

  leaderboardTitle: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "900",
  },

  leaderboardText: {
    color: "#64748B",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },

  soonBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor:
      "rgba(245,158,11,0.08)",
  },

  soonBadgeText: {
    color: "#FBBF24",
    fontSize: 7,
    fontWeight: "900",
  },

  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor:
      "rgba(0,0,0,0.76)",
    justifyContent: "flex-end",
    zIndex: 1000,
    elevation: 1000,
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
    borderColor:
      "rgba(255,255,255,0.08)",
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 22,
  },

  modalTitle: {
    color: "#F8FAFC",
    fontSize: 21,
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

  titleInput: {
    backgroundColor: "#111C30",
    borderRadius: 13,
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.09)",
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