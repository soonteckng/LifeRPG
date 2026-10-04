import { lifeAreaColor } from "../../utils/lifeAreaColor";
import GoalRing from "../../components/GoalRing";
import CharacterMark from "../../components/CharacterMark";
import ContentReveal from "../../components/ContentReveal";
import { creditedDailySeconds, hasExactDailyCredit } from "../../utils/progressionAccounting";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { homeWelcome } from "../../utils/homeWelcome";
import { singleFlight } from "../../utils/singleFlight";
import { useHomeLifecycle } from "../../hooks/useHomeLifecycle";
import QuestSheet from "../../components/QuestSheet";
import { useQuests } from "../../context/QuestContext";
import { colors } from "../../constants/theme";
import {
  ScrollView,
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
import { getFocusStreak } from "../../services/progressService";
import { DEFAULT_TIMEZONE, durationLabel } from "../../utils/progressAnalytics";
import { getTodayProgress } from "../../services/dailyProgressService";

export default function HomeScreen() {
  const router = useRouter();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { profile, reloadProfile, hapticsEnabled } = useUser();

  const { setLinkedTaskId, setDurationInMinutes, setTargetAttributeId, hasOpenSession, sessionSummary } = useTimer();
  const { tasks, subjects = [], error: questsError, refresh: refreshQuests } = useQuests();

  const [completedSeconds, setCompletedSeconds] = useState(0);
  const [exactCredit, setExactCredit] = useState(false);
  const [focusStreak, setFocusStreak] = useState<number | null>(null);
  const timeZone = profile?.timezone || DEFAULT_TIMEZONE;
  const [goalCompleted, setGoalCompleted] = useState(false);
  const [todayGoal, setTodayGoal] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [questsVisible, setQuestsVisible] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  // Size against the actual Home viewport: the tabs and active-session dock
  // already reserve their own space and must not be counted a second time.
  const availableHeight = viewportHeight || Math.max(280, height - insets.top - insets.bottom - 96);
  const goalSize = Math.round(Math.max(144, Math.min(
    (width - 40) * 0.55, availableHeight * 0.36, fontScale > 1.5 ? 160 : 232,
  )));
  const loadData = useMemo(() => singleFlight(async () => {
    setRefreshing(true);
    try {
      const [progress, profileOK, , streak] = await Promise.all([getTodayProgress(timeZone), reloadProfile(), refreshQuests(), getFocusStreak(timeZone).catch(() => undefined)]);
      if (streak !== undefined) setFocusStreak(streak);
      setTodayGoal(progress?.goal_minutes ?? null);
      setCompletedSeconds(progress ? creditedDailySeconds(progress) : 0);
      setExactCredit(progress ? hasExactDailyCredit(progress) : false);
      setGoalCompleted(progress?.goal_completed ?? false);
      setLoadError(profileOK === false || streak === undefined);
    } catch {
      setLoadError(true);
    } finally { setRefreshing(false); }
  }), [reloadProfile, refreshQuests, timeZone]);
  const hour = useHomeLifecycle(loadData);

  // A successful completion updates the saved session summary before this fires.
  // Refresh goal progress even while Home was covered by Session/rewards.
  useEffect(() => {
    if (sessionSummary) void loadData(true);
  }, [sessionSummary, loadData]);

  const dailyGoalMinutes = todayGoal ?? profile?.daily_goal_minutes ?? 60;
  const safeCompletedSeconds = Math.max(0, completedSeconds);
  const remainingSeconds = Math.max(0, dailyGoalMinutes * 60 - safeCompletedSeconds);

  const level = profile?.level ?? 1;

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.is_due_today && !task.is_completed_today),
    [tasks],
  );

  const greeting = homeWelcome(hour, profile?.username);
  const isGoalComplete = goalCompleted || remainingSeconds === 0;
  const streakDays = Math.max(0, focusStreak ?? 0);

  const openSession = () => {
    setQuestsVisible(false);
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    router.navigate("/session");
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

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView style={styles.viewport} scrollEnabled={contentHeight > viewportHeight + 1}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, nextHeight) => setContentHeight(nextHeight)}
        contentContainerStyle={styles.content}>
        <ContentReveal>
        <View testID="home-layout" style={[styles.layout, { minHeight: Math.max(0, viewportHeight - 28) }]}>
          <View style={styles.identityRow}>
            <CharacterMark size={52} />
            <View style={styles.identity}>
              <Text style={styles.greeting} accessibilityRole="header" numberOfLines={2}>{greeting}</Text>
              <Text style={styles.subtitle}>{profile?.class_title || "Growing through focus"}</Text>
            </View>
          </View>
          {(loadError || questsError) && <TouchableOpacity onPress={() => void loadData()} disabled={refreshing}
            accessibilityRole="button" accessibilityLabel="Retry loading Home" style={styles.retry}>
            <Text style={styles.retryText}>{refreshing ? "Refreshing…" : "Couldn't refresh Home. Tap to retry."}</Text>
          </TouchableOpacity>}
          <View style={styles.goalSection}>
            <GoalRing seconds={safeCompletedSeconds} targetMinutes={dailyGoalMinutes} size={goalSize}
              label={exactCredit ? `${durationLabel(safeCompletedSeconds)} / ${dailyGoalMinutes} min` : `${safeCompletedSeconds / 60} / ${dailyGoalMinutes} min`} />
            <Text style={styles.goalHint}>{isGoalComplete ? "Goal reached. You made time for what matters." : safeCompletedSeconds > 0
              ? `You showed up. ${durationLabel(remainingSeconds)} to today's goal.` : "One small session is a good place to start."}</Text>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={startFreeSession} activeOpacity={0.88} accessibilityRole="button">
            <Ionicons name="play-outline" size={22} color="#171827" />
            <Text style={styles.primaryButtonText}>{hasOpenSession ? "Continue session" : "Start session"}</Text>
          </TouchableOpacity>
          <View style={styles.questHeading}>
            <Text style={styles.sectionTitle}>{"Today's quests"}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Today's quests, ${activeTasks.length} pending`}
              onPress={() => setQuestsVisible(true)} style={styles.allButton}>
              <Text style={styles.link}>{activeTasks.length ? "View all" : "Add a quest"}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accent} />
            </TouchableOpacity>
          </View>
          {activeTasks.slice(0, 3).map((task) => <TouchableOpacity key={task.id} style={styles.questRow}
            accessibilityRole="button" accessibilityLabel={`${task.title}. Open quests to edit or start`}
            onPress={() => setQuestsVisible(true)}>
            <View style={[styles.dot, { backgroundColor: lifeAreaColor(task.subject_id, subjects.find(area => area.id === task.subject_id)?.color_code) }]} />
            <Text style={styles.questTitle} numberOfLines={2}>{task.title}</Text>
            <Text style={styles.questTime}>{task.target_minutes || 30} min</Text>
          </TouchableOpacity>)}
          {activeTasks.length === 0 && <TouchableOpacity style={styles.emptyQuest} onPress={() => setQuestsVisible(true)} accessibilityRole="button">
            <Ionicons name="flag-outline" size={20} color={colors.secondary} />
            <Text style={styles.emptyText}>Focus freely, or give your next session a purpose.</Text>
          </TouchableOpacity>}
          <View style={styles.footer}>
            <View style={styles.chip}><Ionicons name="flame-outline" size={16} color={colors.accent} />
              <Text style={styles.chipText}>{streakDays > 0 ? `${streakDays} days` : "A fresh start"}</Text></View>
            <View style={styles.chip}><Text style={styles.chipText}>Level {level}</Text></View>
          </View>
        </View>
        </ContentReveal>
      </ScrollView>
      <QuestSheet visible={questsVisible} onClose={() => setQuestsVisible(false)} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  viewport: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  layout: { flexGrow: 1 },
  identityRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  identity: { flex: 1, minWidth: 0 },
  greeting: { color: colors.text, fontSize: 18, fontWeight: "600", letterSpacing: -0.4 },
  subtitle: { color: colors.secondary, fontSize: 13, lineHeight: 20, marginTop: 5 },
  goalSection: { flexGrow: 1, flexShrink: 0, justifyContent: "center", alignItems: "center", paddingTop: 24, paddingBottom: 20, gap: 16 },
  goalHint: { textAlign: "center", color: colors.secondary, fontSize: 14, lineHeight: 21, maxWidth: 290 },
  primaryButton: { backgroundColor: "#E5E4FF", minHeight: 54, borderRadius: 18, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", padding: 14 },
  primaryButtonText: { color: "#171827", fontSize: 17, fontWeight: "600" },
  questHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
  sectionTitle: { color: colors.secondary, fontSize: 14, fontWeight: "500" },
  allButton: { flexDirection: "row", gap: 3, alignItems: "center", minHeight: 44 },
  link: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  questRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  questTitle: { color: colors.text, fontSize: 15, fontWeight: "500", flex: 1 },
  questTime: { color: colors.secondary, fontSize: 13 },
  emptyQuest: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 16 },
  emptyText: { flex: 1, color: colors.secondary, fontSize: 13, lineHeight: 20 },
  footer: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 16 },
  chip: { flexDirection: "row", gap: 6, alignItems: "center", borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { color: colors.secondary, fontSize: 12, fontWeight: "500" },
  retry: { marginTop: 12, paddingVertical: 10 },
  retryText: { color: colors.danger, fontSize: 13 },
});
