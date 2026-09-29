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

import Header from "../../components/Header";
import { useTimer } from "../../context/TimerContext";
import { useUser } from "../../context/UserContext";
import {
  getSubjects,
  getTasks,
  type Subject,
  type Task,
} from "../../services/taskService";
import { getTodayProgress } from "../../services/dailyProgressService";

export default function HomeScreen() {
  const router = useRouter();
  const { profile, reloadProfile, hapticsEnabled } = useUser();

  const {
    setLinkedTaskId,
    setDurationInMinutes,
    setTargetAttributeId,
    hasOpenSession,
  } = useTimer();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [completedMinutes, setCompletedMinutes] = useState(0);
  const [goalCompleted, setGoalCompleted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [taskList, subjectList, progress] =
        await Promise.all([
          getTasks(),
          getSubjects(),
          getTodayProgress(),
        ]);

      setTasks(taskList);
      setSubjects(subjectList);
      setCompletedMinutes(progress?.completed_minutes ?? 0);
      setGoalCompleted(progress?.goal_completed ?? false);

      await reloadProfile();
    } catch (error) {
      console.error("Failed to load Home data:", error);
    }
  }, [reloadProfile]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
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

  const dailyGoalMinutes = profile?.daily_goal_minutes ?? 60;
  const safeCompletedMinutes = Math.max(0, completedMinutes);
  const goalProgress = Math.min(
    1,
    safeCompletedMinutes / Math.max(1, dailyGoalMinutes),
  );
  const remainingMinutes = Math.max(
    0,
    dailyGoalMinutes - safeCompletedMinutes,
  );

  const level = profile?.level ?? 1;
  const currentXP = profile?.current_xp ?? 0;
  const requiredXP = Math.floor(
    100 * Math.pow(level, 1.5),
  );

  const activeTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.is_due_today && !task.is_completed_today,
      ),
    [tasks],
  );

  const previewTasks = activeTasks.slice(0, 3);

  const getSubject = (subjectId: number | null) => {
    if (subjectId === null) {
      return (
        subjects.find(
          (subject) => subject.title === "General",
        ) ?? null
      );
    }

    return (
      subjects.find(
        (subject) => subject.id === subjectId,
      ) ?? null
    );
  };

  const openSession = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Medium,
      );
    }

    router.push("/session");
  };

  const startFreeSession = () => {
    if (hasOpenSession) {
      openSession();
      return;
    }

    setLinkedTaskId(null);
    setTargetAttributeId(null);
    setDurationInMinutes(30);
    openSession();
  };

  const startQuest = (task: Task) => {
    if (hasOpenSession) {
      openSession();
      return;
    }

    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Medium,
      );
    }

    setLinkedTaskId(task.id);
    setDurationInMinutes(task.target_minutes || 30);
    setTargetAttributeId(task.subject_id ?? null);

    router.push("/session");
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Home"
        subtitle="Build your day, one session at a time"
        showBack={false}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#A5B4FC"
          />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile?.avatar || "🧙‍♂️"}
              </Text>
            </View>

            <View style={styles.heroIdentity}>
              <Text style={styles.eyebrow}>
                WELCOME BACK
              </Text>

              <Text style={styles.username} numberOfLines={1}>
                {profile?.username || "Hero"}
              </Text>

              <Text style={styles.classTitle}>
                Lv {level} ·{" "}
                {profile?.class_title || "Adventurer"}
              </Text>
            </View>

            <View style={styles.goldPill}>
              <Text style={styles.goldText}>
                💰 {profile?.gold ?? 0}
              </Text>
            </View>
          </View>

          <View style={styles.xpSection}>
            <View style={styles.xpHeader}>
              <Text style={styles.mutedLabel}>XP</Text>
              <Text style={styles.xpValue}>
                {currentXP} / {requiredXP}
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${
                      Math.min(
                        1,
                        currentXP /
                          Math.max(1, requiredXP),
                      ) * 100
                    }%`,
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>🔥</Text>
              <View>
                <Text style={styles.statValue}>
                  {profile?.streak_count ?? 0}
                </Text>
                <Text style={styles.statLabel}>Day streak</Text>
              </View>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={styles.statIcon}>⏱</Text>
              <View>
                <Text style={styles.statValue}>
                  {safeCompletedMinutes}m
                </Text>
                <Text style={styles.statLabel}>Today</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.goalCard}>
          <View style={styles.sectionTopRow}>
            <View>
              <Text style={styles.sectionEyebrow}>
                TODAY'S GOAL
              </Text>
              <Text style={styles.goalValue}>
                {goalCompleted
                  ? "Complete 🎉"
                  : `${safeCompletedMinutes} / ${
                      dailyGoalMinutes
                    } min`}
              </Text>
            </View>

            <Text style={styles.goalPercent}>
              {Math.round(goalProgress * 100)}%
            </Text>
          </View>

          <View style={styles.goalTrack}>
            <View
              style={[
                styles.goalFill,
                { width: `${goalProgress * 100}%` },
              ]}
            />
          </View>

          <Text style={styles.goalHint}>
            {goalCompleted
              ? "You've done enough for today."
              : `${remainingMinutes} min remaining`}
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={startFreeSession}
            activeOpacity={0.88}
          >
            <Text style={styles.primaryButtonTitle}>
              {hasOpenSession
                ? "CONTINUE SESSION"
                : "START SESSION"}
            </Text>

            <Text style={styles.primaryButtonSubtitle}>
              {hasOpenSession
                ? "Your current session is waiting"
                : "Choose what you're doing and start the clock"}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.questsButton}
          onPress={() => router.push("/quests")}
          activeOpacity={0.88}
        >
          <View style={styles.questsButtonIcon}>
            <Text style={styles.questsButtonIconText}>📜</Text>
          </View>

          <View style={styles.questsButtonText}>
            <Text style={styles.questsButtonTitle}>
              Quests
            </Text>
            <Text style={styles.questsButtonSubtitle}>
              Create and manage things you want to get done
            </Text>
          </View>

          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <View style={styles.sectionBlock}>
          <View style={styles.sectionTopRow}>
            <View>
              <Text style={styles.sectionEyebrow}>
                TODAY
              </Text>
              <Text style={styles.listTitle}>
                Today's quests
              </Text>
            </View>

            <Text style={styles.countPill}>
              {activeTasks.length}
            </Text>
          </View>

          {previewTasks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>✨</Text>
              <Text style={styles.emptyTitle}>
                No quests for today
              </Text>
              <Text style={styles.emptyText}>
                Start a session freely, or create a quest
                when you want more structure.
              </Text>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push("/quests")}
                activeOpacity={0.88}
              >
                <Text style={styles.secondaryButtonText}>
                  ADD A QUEST
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            previewTasks.map((task) => {
              const subject = getSubject(task.subject_id);

              return (
                <View key={task.id} style={styles.questCard}>
                  <View style={styles.questMain}>
                    <View style={styles.questIcon}>
                      <Text>📜</Text>
                    </View>

                    <View style={styles.questInfo}>
                      <Text style={styles.questTitle} numberOfLines={2}>
                        {task.title}
                      </Text>

                      <View style={styles.questMeta}>
                        <Text style={styles.questMetaText}>
                          {task.target_minutes || 30} min
                        </Text>

                        {subject && (
                          <>
                            <Text style={styles.metaDot}>•</Text>
                            <Text
                              style={[
                                styles.questMetaText,
                                {
                                  color:
                                    subject.color_code ??
                                    "#A5B4FC",
                                },
                              ]}
                            >
                              {subject.title}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.questStart}
                    onPress={() => startQuest(task)}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.questStartText}>
                      START
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          {activeTasks.length > 3 && (
            <TouchableOpacity
              onPress={() => router.push("/quests")}
              style={styles.viewAllButton}
              activeOpacity={0.85}
            >
              <Text style={styles.viewAllText}>
                View all quests
              </Text>
              <Text style={styles.viewAllChevron}>›</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0D13",
  },

  content: {
    paddingHorizontal: 18,
    paddingBottom: 128,
    gap: 14,
  },

  heroCard: {
    marginTop: 4,
    padding: 18,
    borderRadius: 26,
    backgroundColor: "#151923",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },

  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarText: {
    fontSize: 27,
  },

  heroIdentity: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },

  eyebrow: {
    color: "#7D869A",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },

  username: {
    color: "#F5F7FA",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 2,
  },

  classTitle: {
    color: "#A1A8B8",
    fontSize: 11,
    marginTop: 2,
  },

  goldPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: "rgba(245,158,11,0.10)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.18)",
  },

  goldText: {
    color: "#FBBF24",
    fontSize: 11,
    fontWeight: "800",
  },

  xpSection: {
    marginTop: 19,
  },

  xpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },

  mutedLabel: {
    color: "#778094",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  xpValue: {
    color: "#C7CEE0",
    fontSize: 10,
    fontWeight: "700",
  },

  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#8B8CF8",
  },

  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 17,
  },

  statItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.07)",
  },

  statIcon: {
    fontSize: 16,
  },

  statValue: {
    color: "#F4F6F9",
    fontSize: 13,
    fontWeight: "800",
  },

  statLabel: {
    color: "#737C90",
    fontSize: 9,
    marginTop: 2,
  },

  goalCard: {
    padding: 18,
    borderRadius: 26,
    backgroundColor: "#131720",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },

  sectionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  sectionEyebrow: {
    color: "#7D869A",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },

  goalValue: {
    color: "#F6F8FB",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 4,
  },

  goalPercent: {
    color: "#A5B4FC",
    fontSize: 22,
    fontWeight: "700",
  },

  goalTrack: {
    marginTop: 15,
    height: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },

  goalFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#6F72D8",
  },

  goalHint: {
    color: "#7F8798",
    fontSize: 10,
    marginTop: 8,
  },

  primaryButton: {
    marginTop: 16,
    minHeight: 68,
    borderRadius: 20,
    backgroundColor: "#E8E9FF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  primaryButtonTitle: {
    color: "#171827",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  primaryButtonSubtitle: {
    color: "#5C607A",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
    textAlign: "center",
  },

  questsButton: {
    minHeight: 66,
    borderRadius: 21,
    backgroundColor: "#151923",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  questsButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(165,180,252,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },

  questsButtonIconText: {
    fontSize: 18,
  },

  questsButtonText: {
    flex: 1,
    marginLeft: 11,
  },

  questsButtonTitle: {
    color: "#E9ECF3",
    fontSize: 13,
    fontWeight: "800",
  },

  questsButtonSubtitle: {
    color: "#737C90",
    fontSize: 9,
    marginTop: 3,
  },

  chevron: {
    color: "#7E879B",
    fontSize: 27,
    marginLeft: 8,
  },

  sectionBlock: {
    marginTop: 2,
  },

  listTitle: {
    color: "#F2F4F7",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 3,
  },

  countPill: {
    minWidth: 30,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    textAlign: "center",
    color: "#C7CEE0",
    backgroundColor: "rgba(255,255,255,0.06)",
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
  },

  emptyCard: {
    marginTop: 11,
    padding: 20,
    borderRadius: 22,
    backgroundColor: "#11151E",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
  },

  emptyIcon: {
    fontSize: 24,
  },

  emptyTitle: {
    color: "#E6E9F0",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
  },

  emptyText: {
    color: "#737C90",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 5,
    maxWidth: 285,
  },

  secondaryButton: {
    marginTop: 13,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(165,180,252,0.10)",
    borderWidth: 1,
    borderColor: "rgba(165,180,252,0.18)",
  },

  secondaryButtonText: {
    color: "#C7D2FE",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  questCard: {
    marginTop: 10,
    minHeight: 72,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: "#151923",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
  },

  questMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },

  questIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: "rgba(139,140,248,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },

  questInfo: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },

  questTitle: {
    color: "#E8EBF1",
    fontSize: 12,
    fontWeight: "800",
  },

  questMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 5,
  },

  questMetaText: {
    color: "#777F92",
    fontSize: 9,
    fontWeight: "700",
  },

  metaDot: {
    color: "#4A5262",
    fontSize: 9,
  },

  questStart: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(232,233,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(232,233,255,0.16)",
  },

  questStartText: {
    color: "#DCDFFF",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  viewAllButton: {
    marginTop: 10,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },

  viewAllText: {
    color: "#A5B4FC",
    fontSize: 10,
    fontWeight: "800",
  },

  viewAllChevron: {
    color: "#A5B4FC",
    fontSize: 17,
  },
});
