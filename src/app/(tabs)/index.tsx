import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { getTodayProgress } from "../../services/dailyProgressService";

export default function HomeScreen() {
  const router = useRouter();
  const { height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height - insets.top - insets.bottom < 700 || fontScale > 1.15;
  const tight = height - insets.top - insets.bottom < 610 || fontScale > 1.5;
  const { profile, reloadProfile, hapticsEnabled } = useUser();

  const { setLinkedTaskId, setDurationInMinutes, setTargetAttributeId, hasOpenSession } = useTimer();
  const { tasks, error: questsError, refresh: refreshQuests } = useQuests();

  const [completedMinutes, setCompletedMinutes] = useState(0);
  const [goalCompleted, setGoalCompleted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [questsVisible, setQuestsVisible] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const loadData = useMemo(() => singleFlight(async () => {
    setRefreshing(true);
    try {
      const [progress, profileOK] = await Promise.all([getTodayProgress(), reloadProfile(), refreshQuests()]);
      setCompletedMinutes(progress?.completed_minutes ?? 0);
      setGoalCompleted(progress?.goal_completed ?? false);
      setLoadError(profileOK === false);
    } catch {
      setLoadError(true);
    } finally { setRefreshing(false); }
  }), [reloadProfile, refreshQuests]);
  const hour = useHomeLifecycle(loadData);

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

  const greeting = homeWelcome(hour, profile?.username);
  const isGoalComplete = goalCompleted || remainingMinutes === 0;

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
      {/* Keep Home fixed when it fits, with scrolling only for overflow. */}
      <ScrollView style={styles.viewport} scrollEnabled={contentHeight > viewportHeight + 1}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, nextHeight) => setContentHeight(nextHeight)}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 16 },
          compact && styles.compactContent,
          tight && styles.tightContent,
        ]}
      >
        <View style={[styles.homeHeader, tight && styles.tightHeader]}>
          <Text style={[styles.greeting, compact && styles.compactGreeting, tight && styles.tightGreeting]}>
            {greeting}
          </Text>
          <Text style={styles.welcomeSubtitle} maxFontSizeMultiplier={1.4}>Make a little room for progress today.</Text>
          {(loadError || questsError) && <TouchableOpacity onPress={() => void loadData()} disabled={refreshing}
            accessibilityRole="button" accessibilityLabel="Retry loading Home" style={styles.retry}>
            <Text style={styles.retryText}>{refreshing ? "Refreshing…" : "Couldn't refresh Home. Tap to retry."}</Text>
          </TouchableOpacity>}
          <View style={[styles.character, tight && styles.tightCharacter]}>
            <View style={styles.characterRow}>
              <View style={[styles.avatar, tight && styles.tightAvatar]}><Text style={styles.avatarText} maxFontSizeMultiplier={1.2}>{profile?.avatar || "🧙‍♂️"}</Text></View>
              <View style={styles.identity}>
                <Text style={styles.level} maxFontSizeMultiplier={1.4}>Level {level}</Text>
                <Text style={styles.classTitle} numberOfLines={1} maxFontSizeMultiplier={1.4}>{profile?.class_title || "Adventurer"}</Text>
              </View>
              <View style={styles.quietStats}>
                <Text style={styles.goldText} maxFontSizeMultiplier={1.3}>{(profile?.gold ?? 0).toLocaleString()} <Text style={styles.statLabel}>gold</Text></Text>
                <Text style={styles.streak} maxFontSizeMultiplier={1.3}>{profile?.streak_count ?? 0} day streak</Text>
              </View>
            </View>
            <View style={[styles.xpHeader, tight && styles.tightXPHeader]}>
              <Text style={styles.smallLabel} maxFontSizeMultiplier={1.3}>{Math.max(0, requiredXP - currentXP).toLocaleString()} XP to level {level + 1}</Text>
            </View>
            <View style={styles.xpTrack} accessible accessibilityRole="progressbar" accessibilityLabel={"Level " + level + " progress"}
              accessibilityValue={{ min: 0, max: requiredXP, now: currentXP, text: currentXP + " of " + requiredXP + " XP" }}>
              <View style={[styles.xpFill, { width: (Math.max(0, Math.min(1, currentXP / Math.max(1, requiredXP))) * 100) + "%" as `${number}%` }]} />
            </View>
          </View>
        </View>

        <View style={[styles.goalCard, compact && styles.compactGoal, tight && styles.tightGoal]}>
          <View style={styles.goalHeader}>
            <Text style={styles.goalTitle}>{"Today's goal"}</Text>
            <Text style={styles.goalPercent}>
              {Math.round(goalProgress * 100)}%
            </Text>
          </View>
          <Text maxFontSizeMultiplier={1.3} style={[styles.goalValue, compact && styles.compactGoalValue]}>
            {isGoalComplete
              ? "Goal complete 🎉"
              : `${safeCompletedMinutes} / ${dailyGoalMinutes} min`}
          </Text>
          <View style={[styles.goalTrack, tight && styles.tightGoalTrack]}>
            <View
              style={[styles.goalFill, { width: `${goalProgress * 100}%` }]}
            />
          </View>
          <Text style={[styles.goalHint, tight && styles.tightGoalHint]} maxFontSizeMultiplier={1.3}>
            {isGoalComplete
              ? "Nice work. Take a moment to enjoy it."
              : tight ? `${remainingMinutes} minutes to your goal.` : `${remainingMinutes} minutes remaining. One session closer.`}
          </Text>
        </View>

        <View style={[styles.focusSection, tight && styles.tightFocus]}>
          <Text
            maxFontSizeMultiplier={1.4} style={[styles.focusTitle, compact && styles.compactFocusTitle]}
          >
            {hasOpenSession
              ? tight ? "Pick up where you left off." : "Let's pick up where you left off."
              : "Ready to focus?"}
          </Text>
          <Text style={styles.focusHint} maxFontSizeMultiplier={1.3}>
            {hasOpenSession
              ? "Your current session is waiting for you."
              : tight ? "One session closer to your goals." : "Choose what you're doing and make a little progress."}
          </Text>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              compact && styles.compactPrimaryButton,
              tight && styles.tightPrimaryButton,
            ]}
            onPress={startFreeSession}
            activeOpacity={0.88}
            accessibilityRole="button"
          >
            <Ionicons name="play" size={18} color="#171827" />
            <Text style={styles.primaryButtonText} maxFontSizeMultiplier={1.4}>
              {hasOpenSession ? "Continue session" : "Start session"}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.questsButton, tight && styles.tightQuestsButton]}
          onPress={() => {
            setQuestsVisible(true);
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Today's quests, ${activeTasks.length} pending`}
          accessibilityHint="Opens your quests for today"
        >
          <Ionicons name="checkbox-outline" size={22} color="#A5B4FC" />
          <Text style={styles.questsButtonTitle} maxFontSizeMultiplier={1.5}>{"Today's quests"}</Text>
          {activeTasks.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {activeTasks.length > 99 ? "99+" : activeTasks.length}
              </Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={19} color="#8992A6" />
        </TouchableOpacity>
      </ScrollView>

      <QuestSheet visible={questsVisible} onClose={() => setQuestsVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0D13" },
  viewport: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    justifyContent: "space-between",
    gap: 24,
  },
  compactContent: { paddingTop: 4, gap: 12 },
  tightContent: { gap: 8, paddingTop: 2 },
  retry: { minHeight: 44, justifyContent: "center" },
  retryText: { color: colors.accent, fontSize: 12 },
  homeHeader: { gap: 7 },
  tightHeader: { gap: 4 },
  welcomeHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  welcomeIdentity: { flex: 1, minWidth: 0, gap: 3 },
  welcomeSalutation: { color: colors.secondary, fontSize: 14 },
  greeting: { color: colors.text, fontSize: 27, fontWeight: "600", letterSpacing: -0.6 },
  compactGreeting: { fontSize: 24 },
  tightGreeting: { fontSize: 22 },
  welcomeSubtitle: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  character: { marginTop: 12, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  tightCharacter: { marginTop: 4, paddingTop: 8 },
  characterRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  tightAvatar: { height: 36, width: 36 },
  avatarText: { fontSize: 29 },
  identity: { flex: 1, minWidth: 0, gap: 4 },
  classTitle: { color: colors.secondary, fontSize: 12, fontWeight: "400" },
  level: { color: colors.text, fontSize: 18, fontWeight: "600" },
  quietStats: { alignItems: "flex-end", gap: 5, flexShrink: 1 },
  goldText: { color: "#D7C69C", fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  statLabel: { color: colors.secondary, fontWeight: "400", fontSize: 11 },
  streak: { color: colors.secondary, fontSize: 11 },
  xpHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 4, marginTop: 13, marginBottom: 7 },
  tightXPHeader: { marginTop: 8, marginBottom: 5 },
  smallLabel: { color: colors.muted, fontSize: 11 },
  xpValue: { color: colors.secondary, fontSize: 11, fontVariant: ["tabular-nums"] },
  xpTrack: { height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: "hidden" },
  xpFill: { height: "100%", borderRadius: 2, backgroundColor: colors.accentFill },
  goalCard: {
    padding: 20,
    borderRadius: 23,
    backgroundColor: "#171A28",
    borderWidth: 1,
    borderColor: "rgba(165,180,252,0.10)",
  },
  compactGoal: { padding: 15 },
  tightGoal: { padding: 12 },
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
  tightGoalTrack: { marginTop: 10 },
  goalHint: { color: "#A1A8B8", fontSize: 12, lineHeight: 17, marginTop: 9 },
  tightGoalHint: { marginTop: 6 },
  focusSection: { gap: 7 },
  tightFocus: { gap: 5 },
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
  tightPrimaryButton: { minHeight: 48, marginTop: 4, padding: 12 },
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
  tightQuestsButton: { minHeight: 52, paddingVertical: 10 },
  countBadge: {
    minWidth: 27,
    height: 27,
    paddingHorizontal: 7,
    borderRadius: 14,
    backgroundColor: colors.accentFill,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: "#0B0D13", fontSize: 12, fontWeight: "700" },
});
