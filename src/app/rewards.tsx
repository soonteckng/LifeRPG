import Pressable from "../components/MotionPressable";
import { Text } from "../components/AppText";
import { creditedDailySeconds } from "../utils/progressionAccounting";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
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
import { earnedMilestones, MILESTONE_TRACKS, nextMilestone } from "../utils/characterGrowth";
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
  return <MilestoneCollection key={`${profile.id}:${profile.timezone}`} />;
}

// Account and reporting-zone changes start a fresh collection view. Keying the
// view also prevents old async requests and sheet selections leaking across it.
function MilestoneCollection() {
  const { profile } = useUser();
  const { sessionSummary } = useTimer();
  const growth = useCharacterData();
  const totals = useMemo(() => earnedMilestones(growth.data?.sessions ?? [], profile.timezone), [growth.data, profile.timezone]);
  const earned = totals.milestones.filter((m) => m.unlocked);
  const upcoming = totals.milestones.filter((m) => !m.unlocked);
  const nearest = nextMilestone(totals.milestones);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Milestone | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetLifecycle = useRef(false);
  const [goal, setGoal] = useState<DailyProgress | null>(null);
  const goalIdentity = `${profile.id}:${profile.timezone}`;
  const [goalOwner, setGoalOwner] = useState(goalIdentity);
  const [goalLoaded, setGoalLoaded] = useState(false);
  const [goalError, setGoalError] = useState(false);
  const visibleGoalLoaded = goalLoaded && goalOwner === goalIdentity;
  const visibleGoalError = goalError && goalOwner === goalIdentity;
  const generation = useRef(0);
  const focused = useRef(false);
  const refreshGoal = useCallback(async () => {
    const request = ++generation.current;
    try {
      const next = await getTodayProgress(profile.timezone);
      if (request !== generation.current) return;
      setGoalOwner(`${profile.id}:${profile.timezone}`);
      setGoal(next);
      setGoalLoaded(true);
      setGoalError(false);
    } catch {
      if (request === generation.current) {
        setGoalOwner(`${profile.id}:${profile.timezone}`);
        setGoalError(true);
      }
    }
  }, [profile.id, profile.timezone]);
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
      style={styles.milestoneRow}
    >
      <View style={p.inline}>
        <View
          style={[
            p.icon,
            milestone.unlocked && { backgroundColor: "rgba(112,216,174,0.10)" },
          ]}
        >
          <Ionicons
            name={milestone.icon as PersonalIcon}
            size={23}
            color={milestone.unlocked ? colors.success : colors.accent}
          />
        </View>
        <View style={p.flex}>
          <Text style={p.rowTitle}>{milestone.title}</Text>
          <Text style={p.caption}>{milestone.description}</Text>
        </View>
        <Ionicons
          name={milestone.unlocked ? "checkmark-circle" : "chevron-forward"}
          size={21}
          color={milestone.unlocked ? colors.success : colors.muted}
        />
      </View>
      {!milestone.unlocked && (
        <>
          <Meter value={milestone.progress} />
          <Text style={p.caption}>{progressLabel(milestone)}</Text>
        </>
      )}
      {milestone.unlocked && (
        <Text style={[p.caption, { color: colors.success }]}>
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
      <View style={[p.card, styles.dailyCard]} testID="milestones-daily-goal">
        <Text style={p.label}>TODAY’S GOAL</Text>
        <Text style={p.title}>
          {visibleGoalLoaded && goal?.goal_completed
            ? "You followed through today."
            : "A little time, every day."}
        </Text>
        <Text style={p.body}>
          Each completed block adds to today’s goal and your milestone progress.
        </Text>
        {visibleGoalLoaded && (
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
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={[p.rowTitle, { color: colors.success }]}>
                  Daily goal achieved
                </Text>
              </View>
            )}
          </>
        )}
        {!visibleGoalLoaded && !visibleGoalError && (
          <View style={styles.goalPlaceholder}><Text style={p.caption}>Loading today’s goal…</Text></View>
        )}
        {visibleGoalError && (
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
      <Text style={p.caption}>Your collection · {earned.length} of {totals.milestones.length} earned</Text>
      <Text style={p.body}>A quiet record of the time you’ve made for yourself. Earned automatically, at your own pace.</Text>
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
        <View style={styles.loadingCollection} testID="milestones-loading"><Text style={p.rowTitle}>Getting your collection ready…</Text><Text style={p.caption}>Your saved achievements will appear here.</Text></View>
      ) : (
        <>
          {nearest && <View style={[p.card, styles.nextCard]} testID="milestone-next">
            <Text style={p.label}>WITHIN REACH</Text>
            <View style={p.inline}>
              <Ionicons name={nearest.icon as PersonalIcon} size={28} color={colors.accent} />
              <Text style={[p.title, p.flex]}>{nearest.title}</Text>
            </View>
            <Text style={p.body}>{nearest.description}</Text>
            <Meter value={nearest.progress} />
            <Text style={p.caption}>{progressLabel(nearest)}</Text>
          </View>}
          <View style={styles.section}>
            <Text style={p.sectionLabel}>Earned</Text>
            {earned.length ? <View style={styles.collection}>
              {earned.map(milestone => <Pressable
                key={milestone.id}
                accessibilityRole="button"
                accessibilityLabel={`${milestone.title}, earned. View milestone`}
                onPress={() => open(milestone)}
                style={styles.earnedTile}
              >
                <Ionicons name={milestone.icon as PersonalIcon} size={26} color={colors.success} />
                <Text style={p.rowTitle}>{milestone.title}</Text>
                <Text style={[p.caption, styles.earnedCaption]}>Earned · Yours to keep</Text>
              </Pressable>)}
            </View> : <Text style={p.body}>Your first completed session starts the collection. There’s no rush.</Text>}
          </View>
          {!!upcoming.length && <View style={styles.section}>
            <View style={p.inline}>
              <Text style={[p.sectionLabel, p.flex]}>Your path</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showAll ? "Show next milestones" : "Show all milestones"}
                accessibilityState={{ expanded: showAll }}
                onPress={() => setShowAll(value => !value)}
                style={styles.collectionToggle}
              ><Text style={styles.toggleText}>{showAll ? "Show next" : "Show all"}</Text></Pressable>
            </View>
            <Text style={p.caption}>{showAll ? "The full collection, one track at a time." : "One next step in each track. No deadline."}</Text>
            {MILESTONE_TRACKS.map(track => {
              const remaining = upcoming.filter(milestone => milestone.track === track.id);
              if (!remaining.length) return null;
              return <View key={track.id} style={styles.track}>
                <Text style={p.rowTitle}>{track.title}</Text>
                <Text style={p.caption}>{track.description}</Text>
                {(showAll ? remaining : remaining.slice(0, 1)).map(row)}
              </View>;
            })}
          </View>}
          {!upcoming.length && (
            <View style={p.card}>
              <Text style={p.title}>A collection worth being proud of.</Text>
              <Text style={p.body}>
                You’ve earned every milestone in this collection. Each new
                session still records time for your focus areas and character.
              </Text>
            </View>
          )}
        </>
      )}
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
                color={detail.unlocked ? colors.success : colors.accent}
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

const styles = StyleSheet.create({
  nextCard: { marginTop: 8, backgroundColor: colors.surfaceRaised },
  section: { gap: 12, marginTop: 20 },
  collection: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  earnedTile: { flexBasis: 140, flexGrow: 1, minWidth: 0, padding: 16, gap: 10, backgroundColor: colors.surface, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  earnedCaption: { color: colors.secondary },
  collectionToggle: { minHeight: 44, minWidth: 64, paddingHorizontal: 10, justifyContent: "center", alignItems: "center" },
  toggleText: { color: colors.accent, fontSize: 14, fontWeight: "500" },
  track: { gap: 4, padding: 16, backgroundColor: colors.surface, borderRadius: 20 },
  milestoneRow: { paddingVertical: 10, gap: 8, minHeight: 56 },
  dailyCard: { marginBottom: 8 },
  goalPlaceholder: { minHeight: 44, justifyContent: "center" },
  loadingCollection: { minHeight: 360, padding: 18, gap: 12, backgroundColor: colors.surface, borderRadius: 20 },
});
