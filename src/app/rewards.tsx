import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetScrollView,
  BottomSheetTextInput,
  TouchableOpacity as SheetButton,
} from "@gorhom/bottom-sheet";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Keyboard, Pressable, Text, View } from "react-native";
import AppSheet from "../components/AppSheet";
import SheetConfirmation from "../components/SheetConfirmation";
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
import { earnedMilestones, rewardDraft } from "../utils/characterGrowth";
import { durationLabel } from "../utils/progressAnalytics";
import {
  getTodayProgress,
  type DailyProgress,
} from "../services/dailyProgressService";
import {
  createReward,
  deleteReward,
  getRewards,
  getTodayRewardChest,
  openDailyRewardChest,
  redeemReward,
  type Reward,
  type RewardChest,
} from "../services/rewardService";

type Sheet =
  | { kind: "create" }
  | { kind: "reward"; reward: Reward }
  | { kind: "milestone"; id: string }
  | null;
export default function RewardsScreen() {
  const { profile, reloadProfile } = useUser();
  const { sessionSummary } = useTimer();
  const growth = useCharacterData();
  const [data, setData] = useState<{
    rewards: Reward[];
    chest: RewardChest | null;
    progress: DailyProgress | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const generation = useRef(0),
    focused = useRef(false),
    lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [title, setTitle] = useState(""),
    [cost, setCost] = useState("300");
  const [draftError, setDraftError] = useState("");
  const [confirm, setConfirm] = useState<
    "discard" | "delete" | "redeem" | null
  >(null);
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const [rewards, chest, progress] = await Promise.all([
        getRewards(),
        getTodayRewardChest(profile.timezone),
        getTodayProgress(profile.timezone),
      ]);
      if (request === generation.current) {
        setData({ rewards, chest, progress });
        setError("");
      }
    } catch {
      if (request === generation.current)
        setError(
          "Couldn’t refresh rewards. Check your connection and try again.",
        );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [profile.timezone]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void refresh();
      return () => {
        focused.current = false;
        generation.current++;
      };
    }, [refresh]),
  );
  useEffect(() => {
    if (sessionSummary && focused.current) void refresh();
  }, [sessionSummary, refresh]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && focused.current) void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  const totals = earnedMilestones(
    growth.data?.sessions ?? [],
    profile.timezone,
  );
  const milestone =
    sheet?.kind === "milestone"
      ? totals.milestones.find((m) => m.id === sheet.id)
      : null;
  const opened = !!data?.chest?.opened_at;
  const ready = !!data?.progress?.goal_completed && !opened;
  const close = () => {
    if (lock.current) return;
    if (confirm) {
      setConfirm(null);
      return;
    }
    if (sheet?.kind === "create" && (title.trim() || cost !== "300"))
      setConfirm("discard");
    else {
      Keyboard.dismiss();
      setSheet(null);
    }
  };
  const perform = async (
    operation: () => Promise<void>,
    location: "screen" | "sheet",
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setDraftError("");
    generation.current++; // Old refreshes cannot overwrite a successful mutation.
    try {
      await operation();
      await reloadProfile();
      await refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn’t save this change. Please try again.";
      if (location === "sheet") setDraftError(message);
      else setError(message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const claim = () => {
    if (!ready) return;
    void perform(async () => {
      const result = await openDailyRewardChest();
      if (!result.success) {
        if (result.reason === "already_opened") {
          setNotice("Today’s bonus has already been claimed.");
          return;
        }
        throw new Error(
          "The daily bonus isn’t available yet. Refresh and try again.",
        );
      }
      setNotice(`Daily goal recognised · +${result.reward_gold ?? 0} Gold.`);
    }, "screen");
  };
  const create = () => {
    const draft = rewardDraft(title, cost);
    if (draft.error) {
      setDraftError(draft.error);
      return;
    }
    void perform(async () => {
      await createReward(draft.title!, draft.cost!);
      Keyboard.dismiss();
      setSheet(null);
      setNotice("Personal reward saved.");
    }, "sheet");
  };
  const mutateReward = (kind: "delete" | "redeem") => {
    if (sheet?.kind !== "reward") return;
    const reward = sheet.reward;
    setConfirm(null);
    void perform(async () => {
      if (kind === "delete") {
        await deleteReward(reward.id);
        setNotice("Personal reward removed.");
      } else {
        const result = await redeemReward(reward.id);
        if (!result.success)
          throw new Error(
            result.reason === "insufficient_gold"
              ? "Not enough Gold yet. Your balance hasn’t changed."
              : "Couldn’t redeem this reward. Please try again.",
          );
        setNotice(`Redeemed · ${result.reward_title ?? reward.title}`);
      }
      setSheet(null);
    }, "sheet");
  };
  return (
    <PersonalPage
      title="Rewards"
      subtitle="Recognise the effort you’ve earned."
      back
    >
      <View style={p.card}>
        <Text style={p.label}>YOUR MILESTONES</Text>
        <Text style={[p.title, { fontSize: 25 }]}>
          Every step leaves a mark.
        </Text>
        <Text style={p.body}>
          Sessions build your character. Returning builds consistency. Reaching
          your goal earns a separate daily bonus.
        </Text>
        {growth.data && (
          <Text style={p.caption}>
            {totals.milestones.filter((m) => m.unlocked).length} of{" "}
            {totals.milestones.length} milestones earned
          </Text>
        )}
      </View>
      {growth.error && (
        <View style={p.card}>
          <Text style={p.error}>
            Couldn’t refresh milestones.{" "}
            {growth.data
              ? "Previously loaded achievements are still shown."
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
            ? "Loading milestones…"
            : "Your milestones will appear after loading your saved sessions."}
        </Text>
      ) : (
        <View style={{ gap: 10 }}>
          {totals.milestones.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={`${m.title}, ${m.unlocked ? "earned" : "in progress"}. View milestone`}
              onPress={() => setSheet({ kind: "milestone", id: m.id })}
              style={[p.card, { padding: 16 }]}
            >
              <View style={p.inline}>
                <View
                  style={[
                    p.icon,
                    {
                      backgroundColor: m.unlocked
                        ? "rgba(156,220,193,0.1)"
                        : colors.accentSoft,
                    },
                  ]}
                >
                  <Ionicons
                    name={m.icon as PersonalIcon}
                    size={22}
                    color={m.unlocked ? "#9CDCC1" : colors.accent}
                  />
                </View>
                <View style={p.flex}>
                  <Text style={p.rowTitle}>{m.title}</Text>
                  <Text style={p.caption}>{m.description}</Text>
                </View>
                <Ionicons
                  name={m.unlocked ? "checkmark-circle" : "chevron-forward"}
                  size={21}
                  color={m.unlocked ? "#9CDCC1" : colors.muted}
                />
              </View>
              {!m.unlocked && <Meter value={m.progress} />}
            </Pressable>
          ))}
        </View>
      )}
      {!!notice && (
        <View style={p.card}>
          <Text style={p.body} accessibilityRole="alert">
            {notice}
          </Text>
        </View>
      )}
      {!!error && (
        <View style={p.card}>
          <Text style={p.error}>{error}</Text>
          <PersonalButton
            title="Retry rewards"
            secondary
            onPress={() => void refresh()}
          />
        </View>
      )}
      <View style={p.card}>
        <Text style={p.label}>DAILY GOAL BONUS</Text>
        <Text style={p.title}>
          {opened
            ? "Today’s bonus is yours."
            : ready
              ? "You reached your goal."
              : "An extra reason to follow through."}
        </Text>
        <Text style={p.body}>
          A completed session counts as showing up. Your daily goal celebrates a
          further commitment.
        </Text>
        {data ? (
          <>
            <Meter
              value={
                (data.progress?.completed_minutes ?? 0) /
                Math.max(
                  1,
                  data.progress?.goal_minutes ?? profile.daily_goal_minutes,
                )
              }
            />
            <Text style={p.caption}>
              {data.progress?.completed_minutes ?? 0} /{" "}
              {data.progress?.goal_minutes ?? profile.daily_goal_minutes} goal
              minutes
            </Text>
            <PersonalButton
              title={
                busy
                  ? "Please wait…"
                  : opened
                    ? "Bonus claimed"
                    : ready
                      ? "Claim daily bonus"
                      : "Reach today’s goal to unlock"
              }
              disabled={busy || !ready || !!error}
              onPress={claim}
            />
          </>
        ) : (
          <Text style={p.caption}>
            {loading
              ? "Loading daily bonus…"
              : "Daily bonus unavailable until rewards load."}
          </Text>
        )}
      </View>
      <View style={p.card}>
        <View style={p.inline}>
          <View style={p.flex}>
            <Text style={p.title}>Personal rewards</Text>
            <Text style={p.caption}>
              Optional treats you choose for yourself.
            </Text>
          </View>
          <View style={p.pill}>
            <Text style={p.rowTitle}>{profile.gold} Gold</Text>
          </View>
        </View>
        <Text style={p.body}>
          Use your earned Gold for a coffee break, a movie or something
          meaningful to you.
        </Text>
        {data?.rewards.map((reward) => (
          <Pressable
            key={reward.id}
            accessibilityRole="button"
            accessibilityLabel={`${reward.title}, ${reward.cost_gold} Gold. View reward`}
            style={[p.inline, { paddingVertical: 12 }]}
            onPress={() => {
              setDraftError("");
              setSheet({ kind: "reward", reward });
            }}
          >
            <Ionicons name="gift-outline" size={22} color={colors.accent} />
            <View style={p.flex}>
              <Text style={p.rowTitle}>{reward.title}</Text>
              <Text style={p.caption}>
                {reward.cost_gold} Gold ·{" "}
                {profile.gold >= reward.cost_gold
                  ? "Available"
                  : `${reward.cost_gold - profile.gold} more to go`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.muted} />
          </Pressable>
        ))}
        {data?.rewards.length === 0 && (
          <Text style={p.caption}>
            No personal rewards yet. Add one when you have something to look
            forward to.
          </Text>
        )}
        <PersonalButton
          title="Add a personal reward"
          secondary
          disabled={busy}
          onPress={() => {
            setTitle("");
            setCost("300");
            setDraftError("");
            setSheet({ kind: "create" });
          }}
        />
      </View>
      <AppSheet
        visible={sheet !== null}
        onRequestClose={close}
        guardDismiss={sheet?.kind !== "milestone"}
        label="Reward details"
        header={
          <View style={p.sheetHeader}>
            <Text style={p.title}>
              {sheet?.kind === "create"
                ? "Something to look forward to"
                : sheet?.kind === "reward"
                  ? sheet.reward.title
                  : milestone?.title}
            </Text>
          </View>
        }
        overlay={
          confirm ? (
            <SheetConfirmation
              destructive={confirm !== "redeem"}
              title={
                confirm === "discard"
                  ? "Discard this reward?"
                  : confirm === "delete"
                    ? "Remove this reward?"
                    : "Redeem this reward?"
              }
              message={
                confirm === "discard"
                  ? "Your draft hasn’t been saved."
                  : sheet?.kind === "reward"
                    ? confirm === "delete"
                      ? "This removes the personal reward. Your Gold stays unchanged."
                      : `Spend ${sheet.reward.cost_gold} Gold on ${sheet.reward.title}?`
                    : ""
              }
              confirmLabel={
                confirm === "discard"
                  ? "Discard draft"
                  : confirm === "delete"
                    ? "Remove reward"
                    : "Redeem reward"
              }
              cancelLabel={confirm === "discard" ? "Keep editing" : "Cancel"}
              onCancel={() => setConfirm(null)}
              onConfirm={() => {
                if (confirm === "discard") {
                  setConfirm(null);
                  Keyboard.dismiss();
                  setSheet(null);
                } else mutateReward(confirm);
              }}
            />
          ) : undefined
        }
      >
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={p.sheetBody}
        >
          {sheet?.kind === "create" && (
            <>
              <Text style={p.body}>
                Choose a treat and the amount of earned Gold you want to
                exchange for it.
              </Text>
              <Text style={p.rowTitle}>Reward name</Text>
              <BottomSheetTextInput
                accessibilityLabel="Reward name"
                editable={!busy}
                maxLength={80}
                style={p.input}
                value={title}
                onChangeText={setTitle}
                placeholder="A coffee and a good book"
                placeholderTextColor={colors.muted}
              />
              <Text style={p.rowTitle}>Gold cost</Text>
              <BottomSheetTextInput
                accessibilityLabel="Gold cost"
                editable={!busy}
                keyboardType="number-pad"
                style={p.input}
                value={cost}
                onChangeText={setCost}
              />
              <PersonalButton
                title={busy ? "Saving…" : "Save personal reward"}
                disabled={busy}
                onPress={create}
              />
            </>
          )}
          {sheet?.kind === "reward" && (
            <>
              <Text style={p.body}>An intentional reward for your effort.</Text>
              <Text style={p.value}>{sheet.reward.cost_gold} Gold</Text>
              <Text style={p.caption}>Your balance · {profile.gold} Gold</Text>
              <PersonalButton
                title={busy ? "Please wait…" : "Redeem reward"}
                disabled={busy || profile.gold < sheet.reward.cost_gold}
                onPress={() => setConfirm("redeem")}
              />
              <SheetButton
                disabled={busy}
                accessibilityRole="button"
                style={p.button}
                onPress={() => setConfirm("delete")}
              >
                <Text style={p.buttonText}>Remove personal reward</Text>
              </SheetButton>
            </>
          )}
          {milestone && (
            <>
              <Ionicons
                name={milestone.icon as PersonalIcon}
                size={40}
                color={milestone.unlocked ? "#9CDCC1" : colors.accent}
              />
              <Text style={p.body}>{milestone.description}</Text>
              <Text style={p.title}>
                {milestone.unlocked
                  ? "Earned. Yours to keep."
                  : "Your progress so far"}
              </Text>
              <Meter value={milestone.progress} />
              <Text style={p.body}>
                {milestone.unit === "seconds"
                  ? `${durationLabel(milestone.value)} / ${durationLabel(milestone.target)}`
                  : `${milestone.value} / ${milestone.target} ${milestone.unit}`}
              </Text>
              <Text style={p.caption}>
                Milestones are based on saved completed sessions. Consistency
                uses your longest recorded run, so a missed day doesn’t remove
                an earned milestone.
              </Text>
            </>
          )}
          {!!draftError && (
            <Text style={p.error} accessibilityRole="alert">
              {draftError}
            </Text>
          )}
        </BottomSheetScrollView>
      </AppSheet>
    </PersonalPage>
  );
}
