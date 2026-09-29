import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  RefreshControl,
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  useWindowDimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

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
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height - insets.top - insets.bottom < 700;
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
  const [questsVisible, setQuestsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [taskList, subjectList, progress] = await Promise.all([
        getTasks(),
        getSubjects(),
        getTodayProgress(),
      ]);

      setTasks(taskList);
      setSubjects(subjectList);
      setCompletedMinutes(progress?.completed_minutes ?? 0);
      setGoalCompleted(progress?.goal_completed ?? false);

      await reloadProfile();
      setLoadFailed(false);
    } catch (error) {
      setLoadFailed(true);
      console.error("Failed to load Home data:", error);
    } finally {
      setLoading(false);
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
  const remainingMinutes = Math.max(0, dailyGoalMinutes - safeCompletedMinutes);

  const level = profile?.level ?? 1;
  const currentXP = profile?.current_xp ?? 0;
  const requiredXP = Math.floor(100 * Math.pow(level, 1.5));

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.is_due_today && !task.is_completed_today),
    [tasks],
  );

  const todayTasks = tasks.filter((task) => task.is_due_today);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const isGoalComplete = goalCompleted || remainingMinutes === 0;

  const getSubject = (subjectId: number | null) => {
    if (subjectId === null) {
      return subjects.find((subject) => subject.title === "General") ?? null;
    }

    return subjects.find((subject) => subject.id === subjectId) ?? null;
  };

  const openSession = () => {
    setQuestsVisible(false);
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    setQuestsVisible(false);
    if (hasOpenSession) {
      openSession();
      return;
    }

    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setLinkedTaskId(task.id);
    setDurationInMinutes(task.target_minutes || 30);
    setTargetAttributeId(task.subject_id ?? null);

    router.push("/session");
  };

  const manageQuests = () => {
    setQuestsVisible(false);
    router.push("/quests");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Home stays fixed; only the quest sheet's list scrolls. */}
      <View
        style={[
          styles.content,
          { paddingBottom: insets.bottom + 94 },
          compact && styles.compactContent,
        ]}
      >
        <View style={styles.welcome}>
          <View style={styles.welcomeHeading}>
            <View style={styles.welcomeIdentity}>
              <Text style={styles.welcomeSalutation}>{greeting},</Text>
              <Text
                style={[styles.greeting, compact && styles.compactGreeting]}
                numberOfLines={1}
              >
                {profile?.username || "Hero"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => void onRefresh()}
              disabled={refreshing}
              accessibilityRole="button"
              accessibilityLabel="Refresh Home"
              accessibilityState={{ busy: refreshing, disabled: refreshing }}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#A5B4FC" />
              ) : (
                <Ionicons name="refresh-outline" size={19} color="#A1A8B8" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.welcomeSubtitle}>
            Build your day, one session at a time.
          </Text>
        </View>

        <View style={styles.character}>
          <View style={styles.characterRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{profile?.avatar || "🧙‍♂️"}</Text>
            </View>
            <View style={styles.identity}>
              <Text style={styles.classTitle} numberOfLines={1}>
                Level {level} · {profile?.class_title || "Adventurer"}
              </Text>
              <Text style={styles.streak}>
                🔥 {profile?.streak_count ?? 0} day streak
              </Text>
            </View>
            <View style={styles.goldPill}>
              <Text style={styles.goldText}>💰 {profile?.gold ?? 0}</Text>
            </View>
          </View>
          <View style={styles.xpHeader}>
            <Text style={styles.smallLabel}>XP to level {level + 1}</Text>
            <Text style={styles.xpValue}>
              {currentXP} / {requiredXP}
            </Text>
          </View>
          <View style={styles.xpTrack}>
            <View
              style={[
                styles.xpFill,
                {
                  width: `${Math.max(0, Math.min(1, currentXP / Math.max(1, requiredXP))) * 100}%`,
                },
              ]}
            />
          </View>
        </View>

        <View style={[styles.goalCard, compact && styles.compactGoal]}>
          <View style={styles.goalHeader}>
            <Text style={styles.goalTitle}>Today's goal</Text>
            <Text style={styles.goalPercent}>
              {Math.round(goalProgress * 100)}%
            </Text>
          </View>
          <Text style={[styles.goalValue, compact && styles.compactGoalValue]}>
            {isGoalComplete
              ? "Goal complete 🎉"
              : `${safeCompletedMinutes} / ${dailyGoalMinutes} min`}
          </Text>
          <View style={styles.goalTrack}>
            <View
              style={[styles.goalFill, { width: `${goalProgress * 100}%` }]}
            />
          </View>
          <Text style={styles.goalHint}>
            {isGoalComplete
              ? "Nice work. Take a moment to enjoy it."
              : `${remainingMinutes} minutes remaining. One session closer.`}
          </Text>
        </View>

        <View style={styles.focusSection}>
          <Text
            style={[styles.focusTitle, compact && styles.compactFocusTitle]}
          >
            {hasOpenSession
              ? "Let's pick up where you left off."
              : "Ready to focus?"}
          </Text>
          <Text style={styles.focusHint}>
            {hasOpenSession
              ? "Your current session is waiting for you."
              : "Choose what you're doing and make a little progress."}
          </Text>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              compact && styles.compactPrimaryButton,
            ]}
            onPress={startFreeSession}
            activeOpacity={0.88}
            accessibilityRole="button"
          >
            <Ionicons name="play" size={18} color="#171827" />
            <Text style={styles.primaryButtonText}>
              {hasOpenSession ? "Continue session" : "Start session"}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.questsButton}
          onPress={() => {
            setQuestsVisible(true);
            void loadData();
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Today's quests, ${activeTasks.length} pending`}
          accessibilityHint="Opens your quests for today"
        >
          <Ionicons name="list-outline" size={23} color="#A5B4FC" />
          <Text style={styles.questsButtonTitle}>Today's quests</Text>
          {activeTasks.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {activeTasks.length > 99 ? "99+" : activeTasks.length}
              </Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={19} color="#8992A6" />
        </TouchableOpacity>
      </View>

      <Modal
        visible={questsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setQuestsVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setQuestsVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close today's quests"
          />
          <View
            style={[
              styles.sheet,
              {
                height: Math.min(height * 0.8, 680),
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
            accessibilityViewIsModal
          >
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeading}>
                <Text style={styles.sheetTitle}>Today's quests</Text>
                <Text style={styles.sheetSubtitle}>
                  {activeTasks.length > 0
                    ? `${activeTasks.length} pending · one step at a time`
                    : "Make room for what matters today"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setQuestsVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close today's quests"
              >
                <Ionicons name="close" size={24} color="#C7CEE0" />
              </TouchableOpacity>
            </View>
            {hasOpenSession && activeTasks.length > 0 && (
              <Text style={styles.sessionNotice}>
                You have an open session. Continue it before starting another
                quest.
              </Text>
            )}
            <FlatList
              style={styles.questList}
              contentContainerStyle={styles.questListContent}
              data={activeTasks}
              keyExtractor={(task) => String(task.id)}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#A5B4FC"
                />
              }
              renderItem={({ item: task }) => {
                const subject = getSubject(task.subject_id);
                return (
                  <View style={styles.questRow}>
                    <View style={styles.questInfo}>
                      <Text style={styles.questTitle}>{task.title}</Text>
                      <Text style={styles.questMeta}>
                        <Text
                          style={{ color: subject?.color_code ?? "#A5B4FC" }}
                        >
                          {subject?.title || "General"}
                        </Text>
                        {` · ${task.target_minutes || 30} min`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.questStart}
                      onPress={() => startQuest(task)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        hasOpenSession
                          ? "Continue current session"
                          : `Start ${task.title}`
                      }
                    >
                      <Text style={styles.questStartText}>
                        {hasOpenSession ? "Continue" : "Start"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  {loading ? (
                    <ActivityIndicator color="#A5B4FC" />
                  ) : (
                    <>
                      <Text style={styles.emptyIcon}>
                        {loadFailed ? "☁️" : "✨"}
                      </Text>
                      <Text style={styles.emptyTitle}>
                        {loadFailed
                          ? "Couldn't refresh your quests"
                          : todayTasks.length > 0
                            ? "Today's quests are complete"
                            : "A little space in your day"}
                      </Text>
                      <Text style={styles.emptyText}>
                        {loadFailed
                          ? "Try refreshing to see your latest quests."
                          : todayTasks.length > 0
                            ? "Nice work. You can take a break or start a session freely."
                            : "Start a session freely, or add a quest for a little structure."}
                      </Text>
                      {loadFailed && (
                        <TouchableOpacity
                          style={styles.questStart}
                          onPress={() => void onRefresh()}
                          accessibilityRole="button"
                        >
                          <Text style={styles.questStartText}>Try again</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              }
            />
            <TouchableOpacity
              style={styles.manageButton}
              onPress={manageQuests}
              accessibilityRole="button"
            >
              <Ionicons name="add-circle-outline" size={20} color="#C7D2FE" />
              <Text style={styles.manageButtonText}>Manage quests</Text>
              <Ionicons name="chevron-forward" size={17} color="#8992A6" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0D13" },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    justifyContent: "space-evenly",
    gap: 20,
  },
  compactContent: { paddingTop: 4, gap: 12 },
  welcome: { gap: 5 },
  welcomeHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  welcomeIdentity: { flex: 1, minWidth: 0, gap: 3 },
  welcomeSalutation: { color: "#A1A8B8", fontSize: 14 },
  greeting: {
    color: "#F5F7FA",
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  compactGreeting: { fontSize: 22 },
  welcomeSubtitle: { color: "#A1A8B8", fontSize: 13, lineHeight: 19 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  character: { paddingHorizontal: 2 },
  characterRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "rgba(165,180,252,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 26 },
  identity: { flex: 1, minWidth: 0, gap: 4 },
  classTitle: { color: "#E2E6EF", fontSize: 13, fontWeight: "600" },
  streak: { color: "#A1A8B8", fontSize: 12 },
  goldPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(245,158,11,0.08)",
  },
  goldText: { color: "#FBBF24", fontSize: 12, fontWeight: "700" },
  xpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 6,
  },
  smallLabel: { color: "#8992A6", fontSize: 11 },
  xpValue: { color: "#B9C2D7", fontSize: 11 },
  xpTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  xpFill: { height: "100%", borderRadius: 999, backgroundColor: "#8B8CF8" },
  goalCard: {
    padding: 20,
    borderRadius: 23,
    backgroundColor: "#171A28",
    borderWidth: 1,
    borderColor: "rgba(165,180,252,0.10)",
  },
  compactGoal: { padding: 15 },
  goalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  goalTitle: { color: "#C5CCDC", fontSize: 13, fontWeight: "600" },
  goalPercent: { color: "#A5B4FC", fontSize: 13, fontWeight: "700" },
  goalValue: {
    color: "#F5F7FA",
    fontSize: 27,
    fontWeight: "700",
    marginTop: 7,
  },
  compactGoalValue: { fontSize: 23 },
  goalTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
    marginTop: 14,
  },
  goalFill: { height: "100%", borderRadius: 999, backgroundColor: "#9195ED" },
  goalHint: { color: "#A1A8B8", fontSize: 12, lineHeight: 17, marginTop: 9 },
  focusSection: { gap: 7 },
  focusTitle: { color: "#F2F4F8", fontSize: 22, fontWeight: "600" },
  compactFocusTitle: { fontSize: 19 },
  focusHint: { color: "#A1A8B8", fontSize: 13, lineHeight: 19 },
  primaryButton: {
    minHeight: 60,
    borderRadius: 18,
    backgroundColor: "#E8E9FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 9,
    padding: 14,
  },
  compactPrimaryButton: { minHeight: 52, marginTop: 5 },
  primaryButtonText: { color: "#171827", fontSize: 16, fontWeight: "700" },
  questsButton: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 17,
    backgroundColor: "rgba(165,180,252,0.05)",
  },
  questsButtonTitle: {
    flex: 1,
    color: "#E4E8F1",
    fontSize: 14,
    fontWeight: "600",
  },
  countBadge: {
    minWidth: 27,
    height: 27,
    paddingHorizontal: 7,
    borderRadius: 14,
    backgroundColor: "rgba(165,180,252,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: "#C7D2FE", fontSize: 12, fontWeight: "700" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#131722",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 18,
  },
  sheetHeading: { flex: 1, gap: 5 },
  sheetTitle: { color: "#F5F7FA", fontSize: 23, fontWeight: "700" },
  sheetSubtitle: { color: "#A1A8B8", fontSize: 12, lineHeight: 17 },
  sessionNotice: {
    color: "#C7D2FE",
    fontSize: 12,
    lineHeight: 18,
    paddingBottom: 12,
  },
  questList: { flex: 1, minHeight: 0 },
  questListContent: { flexGrow: 1, paddingBottom: 12 },
  questRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  questInfo: { flex: 1, gap: 6, minWidth: 0 },
  questTitle: { color: "#E8EBF1", fontSize: 15, fontWeight: "600" },
  questMeta: { color: "#A1A8B8", fontSize: 12, lineHeight: 17 },
  questStart: {
    minHeight: 44,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(165,180,252,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  questStartText: { color: "#C7D2FE", fontSize: 12, fontWeight: "700" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 28,
  },
  emptyIcon: { fontSize: 30 },
  emptyTitle: {
    color: "#E6E9F0",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyText: {
    color: "#A1A8B8",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 280,
  },
  manageButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingTop: 12,
  },
  manageButtonText: {
    flex: 1,
    color: "#C7D2FE",
    fontSize: 14,
    fontWeight: "600",
  },
});
