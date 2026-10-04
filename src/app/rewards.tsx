import { Text } from "../components/AppText";
import { creditedDailySeconds } from "../utils/progressionAccounting";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import AppSheet from "../components/AppSheet";
import {
  Meter,
  PersonalButton,
  PersonalPage,
  p,
  type PersonalIcon,
} from "../components/PersonalUI";
import { colors } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { useCharacterData } from "../hooks/useCharacterData";
import { earnedMilestones } from "../utils/characterGrowth";
import { durationLabel } from "../utils/progressAnalytics";
import {
  getTodayProgress,
  type DailyProgress,
} from "../services/dailyProgressService";

type Milestone = ReturnType<typeof earnedMilestones>["milestones"][number];
function progressLabel(milestone: Milestone) {
  return milestone.unit === "seconds"
    ? `${durationLabel(milestone.value)} / ${durationLabel(milestone.target)}`
    : `${milestone.value} / ${milestone.target} ${milestone.unit}`;
}

// Keep the existing /rewards URL, but recognise effort automatically instead of
// asking the user to invent a reward and price their own behaviour in Gold.
export default function RewardsScreen() {
  const { profile } = useUser();
  const { sessionSummary } = useTimer();
  const growth = useCharacterData();
  const totals = earnedMilestones(
    growth.data?.sessions ?? [],
    profile.timezone,
  );
  const earned = totals.milestones.filter((m) => m.unlocked);
  const upcoming = totals.milestones.filter((m) => !m.unlocked);
  const [selected, setSelected] = useState<Milestone | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetLifecycle = useRef(false);
  const [goal, setGoal] = useState<DailyProgress | null>(null);
  const [goalLoaded, setGoalLoaded] = useState(false);
  const [goalError, setGoalError] = useState(false);
  const generation = useRef(0);
  const focused = useRef(false);
  const refreshGoal = useCallback(async () => {
    const request = ++generation.current;
    try {
      const next = await getTodayProgress(profile.timezone);
      if (request !== generation.current) return;
      setGoal(next);
      setGoalLoaded(true);
      setGoalError(false);
    } catch {
      if (request === generation.current) setGoalError(true);
    }
  }, [profile.timezone]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void refreshGoal();
      return () => {
        focused.current = false;
        generation.current++;
      };
    }, [refreshGoal]),
  );
  useEffect(() => {
    if (sessionSummary && focused.current) void refreshGoal();
  }, [sessionSummary, refreshGoal]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && focused.current) void refreshGoal();
    });
    return () => subscription.remove();
  }, [refreshGoal]);

  // Snapshot details remain visible during sheet exit and refresh failures.
  // While open, use refreshed progress for the same milestone when available.
  const detail =
    selected && growth.data
      ? (totals.milestones.find((m) => m.id === selected.id) ?? selected)
      : selected;
  const open = (milestone: Milestone) => {
    if (sheetLifecycle.current) return;
    sheetLifecycle.current = true;
    setSelected(milestone);
    setSheetOpen(true);
  };
  const row = (milestone: Milestone) => (
    <Pressable
      key={milestone.id}
      accessibilityRole="button"
      accessibilityLabel={`${milestone.title}, ${milestone.unlocked ? "earned" : "in progress"}. View milestone`}
      onPress={() => open(milestone)}
      style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 6 }}
    >
      <View style={p.inline}>
        <View
          style={[
            p.icon,
            milestone.unlocked && { backgroundColor: "rgba(156,220,193,0.12)" },
          ]}
        >
          <Ionicons
            name={milestone.icon as PersonalIcon}
            size={23}
            color={milestone.unlocked ? "#9CDCC1" : colors.accent}
          />
        </View>
        <View style={p.flex}>
          <Text style={p.rowTitle}>{milestone.title}</Text>
          <Text style={p.caption}>{milestone.description}</Text>
        </View>
        <Ionicons
          name={milestone.unlocked ? "checkmark-circle" : "chevron-forward"}
          size={21}
          color={milestone.unlocked ? "#9CDCC1" : colors.muted}
        />
      </View>
      {!milestone.unlocked && (
        <>
          <Meter value={milestone.progress} />
          <Text style={p.caption}>{progressLabel(milestone)}</Text>
        </>
      )}
      {milestone.unlocked && (
        <Text style={[p.caption, { color: "#9CDCC1" }]}>
          Earned · Yours to keep
        </Text>
      )}
    </Pressable>
  );

  return (
    <PersonalPage
      title="Milestones"
      subtitle=""
      compact
      back
      animateTransition
    >
      <Text style={p.caption}>Your collection · {earned.length} of {totals.milestones.length} earned</Text>
      {growth.error && (
        <View style={p.card}>
          <Text style={p.error}>
            Couldn’t refresh milestones.{" "}
            {growth.data
              ? "Your previously loaded achievements are still here."
              : "Please try again."}
          </Text>
          <PersonalButton
            title="Retry milestones"
            secondary
            onPress={() => void growth.refresh()}
          />
        </View>
      )}
      {!growth.data ? (
        <Text style={p.body}>
          {growth.loading
            ? "Loading your milestones…"
            : "Your collection will appear after loading your saved sessions."}
        </Text>
      ) : (
        <>
          {[
            { title: "Starting", ids: ["first", "ten"] },
            { title: "Consistency", ids: ["return", "week"] },
            { title: "Time invested", ids: ["hour", "tenhours"] },
          ].map(group => <View key={group.title} style={{ gap: 4, paddingTop: 4 }}>
            <Text style={p.body}>{group.title}</Text>
            {totals.milestones.filter(m => group.ids.includes(m.id)).map(row)}
          </View>)}
          {!upcoming.length && (
            <View style={p.card}>
              <Text style={p.title}>A collection worth being proud of.</Text>
              <Text style={p.body}>
                You’ve earned every milestone in this collection. Each new
                session still develops your Life areas and character.
              </Text>
            </View>
          )}
        </>
      )}
      <View style={p.card}>
        <Text style={p.label}>TODAY’S GOAL</Text>
        <Text style={p.title}>
          {goalLoaded && goal?.goal_completed
            ? "You followed through today."
            : "A separate step for your day."}
        </Text>
        <Text style={p.body}>
          Any completed session counts as showing up. Reaching your daily goal
          recognises a further commitment.
        </Text>
        {goalLoaded && (
          <>
            <Meter
              value={
                (goal ? creditedDailySeconds(goal) : 0) /
                Math.max(1, (goal?.goal_minutes ?? profile.daily_goal_minutes) * 60)
              }
            />
            <Text style={p.caption}>
              {durationLabel(goal ? creditedDailySeconds(goal) : 0)} /{" "}
              {goal?.goal_minutes ?? profile.daily_goal_minutes} min
            </Text>
            {!!goal?.goal_completed && (
              <View style={p.inline}>
                <Ionicons name="checkmark-circle" size={20} color="#9CDCC1" />
                <Text style={[p.rowTitle, { color: "#9CDCC1" }]}>
                  Daily goal achieved
                </Text>
              </View>
            )}
          </>
        )}
        {!goalLoaded && !goalError && (
          <Text style={p.caption}>Loading today’s goal…</Text>
        )}
        {goalError && (
          <>
            <Text style={p.error}>Couldn’t refresh today’s goal.</Text>
            <PersonalButton
              title="Retry today’s goal"
              secondary
              onPress={() => void refreshGoal()}
            />
          </>
        )}
      </View>
      <AppSheet
        visible={sheetOpen}
        compact
        label="Milestone details"
        onRequestClose={() => setSheetOpen(false)}
        onDismiss={() => {
          sheetLifecycle.current = false;
          setSelected(null);
        }}
        header={
          <View style={p.sheetHeader}>
            <Text style={p.title}>{detail?.title}</Text>
          </View>
        }
      >
        <BottomSheetScrollView contentContainerStyle={p.sheetBody}>
          {detail && (
            <>
              <Ionicons
                name={detail.icon as PersonalIcon}
                size={44}
                color={detail.unlocked ? "#9CDCC1" : colors.accent}
              />
              <Text style={p.body}>{detail.description}</Text>
              <Text style={p.title}>
                {detail.unlocked
                  ? "Earned automatically. Yours to keep."
                  : "You’re making progress."}
              </Text>
              <Meter value={detail.progress} />
              <Text style={p.body}>{progressLabel(detail)}</Text>
              <Text style={p.caption}>
                Milestones reflect saved completed sessions. Consistency uses
                your longest recorded run, so a missed day doesn’t remove an
                achievement you’ve earned.
              </Text>
            </>
          )}
        </BottomSheetScrollView>
      </AppSheet>
    </PersonalPage>
  );
}
