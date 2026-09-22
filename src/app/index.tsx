import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, {
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Header from "../components/Header";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import {
  getSubjects,
  getTasks,
  type Subject,
  type Task,
} from "../services/taskService";
import { getTodayProgress } from "../services/dailyProgressService";

export default function HomeScreen() {
  const router = useRouter();

  const {
    profile,
    reloadProfile,
    hapticsEnabled,
  } = useUser();

  const {
    setLinkedTaskId,
    setDurationInMinutes,
    setTargetAttributeId,
  } = useTimer();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [completedMinutes, setCompletedMinutes] =
    useState(0);

  const [goalCompleted, setGoalCompleted] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  const loadData = useCallback(async () => {
    try {
      const [
        taskList,
        subjectList,
        progress,
      ] = await Promise.all([
        getTasks(),
        getSubjects(),
        getTodayProgress(),
      ]);

      setTasks(taskList);
      setSubjects(subjectList);

      setCompletedMinutes(
        progress?.completed_minutes ?? 0,
      );

      setGoalCompleted(
        progress?.goal_completed ?? false,
      );

      reloadProfile();
    } catch (error) {
      console.error(
        "Failed to load Home data:",
        error,
      );
    }
  }, [reloadProfile]);

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

  const dailyGoalMinutes =
    profile?.daily_goal_minutes ?? 60;

  const safeCompletedMinutes = Math.max(
    0,
    completedMinutes,
  );

  const goalProgress = Math.min(
    1,
    safeCompletedMinutes /
      Math.max(1, dailyGoalMinutes),
  );

  const remainingMinutes = Math.max(
    0,
    dailyGoalMinutes -
      safeCompletedMinutes,
  );

  const currentLevel =
    profile?.level ?? 1;

  const currentXP =
    profile?.current_xp ?? 0;

  const requiredXP = Math.floor(
    100 *
      Math.pow(
        currentLevel,
        1.5,
      ),
  );

  const xpProgress = Math.min(
    1,
    currentXP /
      Math.max(1, requiredXP),
  );

  const activeTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.is_due_today &&
          !task.is_completed_today,
      ),
    [tasks],
  );

  const previewTasks =
    activeTasks.slice(0, 3);

  const getSubject = (
    subjectId: number | null,
  ) => {
    if (subjectId === null) {
      return null;
    }

    return (
      subjects.find(
        (subject) =>
          subject.id === subjectId,
      ) ?? null
    );
  };

  const startFreeSession = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Medium,
      );
    }

    setLinkedTaskId(null);
    setTargetAttributeId(null);
    setDurationInMinutes(30);

    router.push("/timer");
  };

  const startQuest = (task: Task) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Medium,
      );
    }

    setLinkedTaskId(task.id);

    setDurationInMinutes(
      task.target_minutes || 30,
    );

    setTargetAttributeId(
      task.subject_id ?? null,
    );

    router.push("/timer");
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Home"
        subtitle="Your daily progress"
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
        {/* HERO */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View
              style={styles.avatarCircle}
            >
              <Text style={styles.avatarText}>
                {profile?.avatar || "🧙‍♂️"}
              </Text>
            </View>

            <View
              style={styles.heroInfo}
            >
              <Text
                style={styles.greeting}
              >
                Welcome back
              </Text>

              <Text
                style={styles.username}
                numberOfLines={1}
              >
                {profile?.username || "Hero"}
              </Text>

              <Text
                style={styles.classTitle}
              >
                Lv {currentLevel}{" "}
                {profile?.class_title ||
                  "Adventurer"}
              </Text>
            </View>

            <View
              style={styles.goldBadge}
            >
              <Text style={styles.goldText}>
                💰 {profile?.gold ?? 0}
              </Text>
            </View>
          </View>

          <View
            style={styles.xpSection}
          >
            <View
              style={styles.xpHeader}
            >
              <Text
                style={styles.xpLabel}
              >
                XP
              </Text>

              <Text
                style={styles.xpValue}
              >
                {currentXP} / {requiredXP}
              </Text>
            </View>

            <View
              style={
                styles.progressBackground
              }
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${
                      xpProgress * 100
                    }%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* DAILY GOAL */}
        <View style={styles.goalCard}>
          <View
            style={styles.sectionHeader}
          >
            <View>
              <Text
                style={styles.sectionLabel}
              >
                TODAY'S GOAL
              </Text>

              <Text
                style={styles.goalTitle}
              >
                {goalCompleted
                  ? "Goal complete 🎉"
                  : `${safeCompletedMinutes} / ${dailyGoalMinutes} min`}
              </Text>
            </View>

            <Text
              style={styles.goalPercentage}
            >
              {Math.round(
                goalProgress * 100,
              )}
              %
            </Text>
          </View>

          <View
            style={
              styles.goalProgressBackground
            }
          >
            <View
              style={[
                styles.goalProgressFill,
                {
                  width: `${goalProgress * 100}%`,
                },
              ]}
            />
          </View>

          <Text
            style={styles.goalSubtext}
          >
            {goalCompleted
              ? "You've completed today's Daily Goal."
              : `${remainingMinutes} min remaining today`}
          </Text>

          <TouchableOpacity
            style={styles.startSessionButton}
            onPress={startFreeSession}
            activeOpacity={0.85}
          >
            <Text
              style={styles.startSessionText}
            >
              START SESSION
            </Text>

            <Text
              style={styles.startSessionSubtext}
            >
              Focus on whatever matters right now
            </Text>
          </TouchableOpacity>
        </View>

        {/* QUESTS */}
        <View style={styles.sectionBlock}>
          <View
            style={styles.sectionTitleRow}
          >
            <Text
              style={styles.sectionTitle}
            >
              TODAY'S QUESTS
            </Text>

            <TouchableOpacity
              onPress={() =>
                router.push("/tasks")
              }
            >
              <Text
                style={styles.viewAllText}
              >
                View all
              </Text>
            </TouchableOpacity>
          </View>

          {previewTasks.length === 0 ? (
            <View
              style={styles.emptyQuestCard}
            >
              <Text
                style={styles.emptyQuestIcon}
              >
                ✨
              </Text>

              <Text
                style={styles.emptyQuestTitle}
              >
                No quests waiting
              </Text>

              <Text
                style={styles.emptyQuestText}
              >
                You can start a free session
                or add a quest when you
                need more structure.
              </Text>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() =>
                  router.push("/tasks")
                }
              >
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  ADD A QUEST
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            previewTasks.map((task) => {
              const subject =
                getSubject(
                  task.subject_id,
                );

              return (
                <View
                  key={task.id}
                  style={
                    styles.questCard
                  }
                >
                  <View
                    style={
                      styles.questMain
                    }
                  >
                    <View
                      style={
                        styles.questIcon
                      }
                    >
                      <Text
                        style={
                          styles.questIconText
                        }
                      >
                        📜
                      </Text>
                    </View>

                    <View
                      style={
                        styles.questInfo
                      }
                    >
                      <Text
                        style={
                          styles.questTitle
                        }
                        numberOfLines={2}
                      >
                        {task.title}
                      </Text>

                      <View
                        style={
                          styles.questMeta
                        }
                      >
                        <Text
                          style={
                            styles.questMetaText
                          }
                        >
                          {task.target_minutes ||
                            30}{" "}
                          min
                        </Text>

                        {subject && (
                          <>
                            <Text
                              style={
                                styles.metaDot
                              }
                            >
                              •
                            </Text>

                            <Text
                              style={[
                                styles.questMetaText,
                                {
                                  color:
                                    subject.color_code ??
                                    "#818CF8",
                                },
                              ]}
                            >
                              {
                                subject.title
                              }
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={
                      styles.questStartButton
                    }
                    onPress={() =>
                      startQuest(task)
                    }
                    activeOpacity={0.85}
                  >
                    <Text
                      style={
                        styles.questStartText
                      }
                    >
                      START
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          {activeTasks.length > 3 && (
            <TouchableOpacity
              style={
                styles.viewMoreButton
              }
              onPress={() =>
                router.push("/tasks")
              }
            >
              <Text
                style={
                  styles.viewMoreText
                }
              >
                View {activeTasks.length - 3}{" "}
                more quest
                {activeTasks.length - 3 ===
                1
                  ? ""
                  : "s"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* STREAK */}
        <View
          style={styles.streakCard}
        >
          <View
            style={styles.streakIcon}
          >
            <Text
              style={
                styles.streakIconText
              }
            >
              🔥
            </Text>
          </View>

          <View
            style={styles.streakInfo}
          >
            <Text
              style={
                styles.streakTitle
              }
            >
              {profile?.streak_count ?? 0} day
              streak
            </Text>

            <Text
              style={
                styles.streakText
              }
            >
              Complete your Daily Goal
              to keep it going.
            </Text>
          </View>
        </View>

        <View
          style={styles.bottomSpace}
        />
      </ScrollView>
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
    paddingBottom: 30,
  },

  heroCard: {
    marginTop: 6,
    padding: 18,
    borderRadius: 22,
    backgroundColor:
      "rgba(99, 102, 241, 0.10)",
    borderWidth: 1,
    borderColor:
      "rgba(129, 140, 248, 0.20)",
  },

  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor:
      "rgba(99, 102, 241, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarText: {
    fontSize: 28,
  },

  heroInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },

  greeting: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
  },

  username: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
  },

  classTitle: {
    color: "#A5B4FC",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
  },

  goldBadge: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor:
      "rgba(245, 158, 11, 0.10)",
  },

  goldText: {
    color: "#FBBF24",
    fontSize: 10,
    fontWeight: "900",
  },

  xpSection: {
    marginTop: 18,
  },

  xpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },

  xpLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  xpValue: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "800",
  },

  progressBackground: {
    height: 7,
    borderRadius: 4,
    backgroundColor:
      "rgba(255, 255, 255, 0.07)",
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#818CF8",
  },

  goalCard: {
    marginTop: 14,
    padding: 18,
    borderRadius: 22,
    backgroundColor:
      "rgba(255, 255, 255, 0.045)",
    borderWidth: 1,
    borderColor:
      "rgba(255, 255, 255, 0.09)",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  sectionLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },

  goalTitle: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 5,
  },

  goalPercentage: {
    color: "#A5B4FC",
    fontSize: 14,
    fontWeight: "900",
  },

  goalProgressBackground: {
    height: 10,
    borderRadius: 5,
    backgroundColor:
      "rgba(255, 255, 255, 0.07)",
    overflow: "hidden",
    marginTop: 14,
  },

  goalProgressFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: "#6366F1",
  },

  goalSubtext: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 8,
  },

  startSessionButton: {
    height: 54,
    borderRadius: 15,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },

  startSessionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  startSessionSubtext: {
    color: "#C7D2FE",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 3,
  },

  sectionBlock: {
    marginTop: 22,
  },

  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  viewAllText: {
    color: "#A5B4FC",
    fontSize: 10,
    fontWeight: "800",
  },

  questCard: {
    padding: 14,
    borderRadius: 17,
    backgroundColor:
      "rgba(255, 255, 255, 0.045)",
    borderWidth: 1,
    borderColor:
      "rgba(255, 255, 255, 0.08)",
    marginBottom: 9,
  },

  questMain: {
    flexDirection: "row",
    alignItems: "center",
  },

  questIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor:
      "rgba(99, 102, 241, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  questIconText: {
    fontSize: 18,
  },

  questInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
  },

  questTitle: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "800",
  },

  questMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
  },

  questMetaText: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "700",
  },

  metaDot: {
    color: "#475569",
    fontSize: 9,
  },

  questStartButton: {
    height: 36,
    borderRadius: 10,
    backgroundColor:
      "rgba(99, 102, 241, 0.16)",
    borderWidth: 1,
    borderColor:
      "rgba(129, 140, 248, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 11,
  },

  questStartText: {
    color: "#A5B4FC",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  emptyQuestCard: {
    padding: 22,
    borderRadius: 17,
    backgroundColor:
      "rgba(255, 255, 255, 0.035)",
    borderWidth: 1,
    borderColor:
      "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
  },

  emptyQuestIcon: {
    fontSize: 26,
  },

  emptyQuestTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 8,
  },

  emptyQuestText: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 5,
  },

  secondaryButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 11,
    backgroundColor:
      "rgba(99, 102, 241, 0.12)",
    borderWidth: 1,
    borderColor:
      "rgba(129, 140, 248, 0.20)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },

  secondaryButtonText: {
    color: "#A5B4FC",
    fontSize: 10,
    fontWeight: "900",
  },

  viewMoreButton: {
    paddingVertical: 11,
    alignItems: "center",
  },

  viewMoreText: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
  },

  streakCard: {
    marginTop: 22,
    padding: 16,
    borderRadius: 18,
    backgroundColor:
      "rgba(245, 158, 11, 0.07)",
    borderWidth: 1,
    borderColor:
      "rgba(245, 158, 11, 0.14)",
    flexDirection: "row",
    alignItems: "center",
  },

  streakIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor:
      "rgba(245, 158, 11, 0.10)",
    alignItems: "center",
    justifyContent: "center",
  },

  streakIconText: {
    fontSize: 21,
  },

  streakInfo: {
    flex: 1,
    marginLeft: 12,
  },

  streakTitle: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "900",
  },

  streakText: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },

  bottomSpace: {
    height: 30,
  },
});