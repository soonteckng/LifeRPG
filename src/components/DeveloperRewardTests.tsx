import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState, Modal, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import { Text } from "./AppText";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { DailyAchievementMoment } from "./PostSessionCelebration";
import SessionResultSheet from "./SessionResultSheet";
import SessionBackdrop from "./session/SessionBackdrop";
import { Moment } from "./RewardMoments";
import { ChosenRewardSheet } from "./rewards/ChosenReward";
import { ExpeditionReveal, PackReveal } from "./rewards/RevealScreens";
import type { Reveal } from "../services/rewardsStore";
import type { DailyAchievementDisplay } from "../services/dailyEffortCelebrationService";
import type { Gift, RewardsState } from "../services/rewardsService";
import { REWARD_ITEMS, rewardItem } from "../services/rewardCatalog";
import { useRewards } from "../hooks/useRewards";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { requiredCharacterXP } from "../utils/levelTiers";
import { RETURN_TO_CAMP_MS } from "../services/sessionReturn";
import { colors } from "../constants/theme";

type TestContent =
  | { kind: "achievement"; achievements: DailyAchievementDisplay }
  | { kind: "walk" | "result"; variant?: "ended" | "offline" | "rejected" | "sync"; afterTrail?: DailyAchievementDisplay;
      /** After Done: the map is prepared underneath (preparing), then the card fades away over it (closing), then only the map is left (dismissed). */
      preparing?: boolean; closing?: boolean; dismissed?: boolean }
  | { kind: "reveal"; reveal: Reveal; afterTrail?: DailyAchievementDisplay }
  | { kind: "moment"; gift: Gift };
type TestScreen = { id: number; scope: string } & TestContent;
/** If Android never reports the scenery window as shown, open the card anyway. */
const SCENERY_FALLBACK_MS = 400;
/** Same shipped screens and backend rules, without inventing focus time or consuming real rewards. */
export default function DeveloperRewardTests() {
  const { profile } = useUser();
  const rewards = useRewards({ developerLab: true });
  const { hasOpenSession } = useTimer({ live: false });
  const reduced = useReducedMotion();
  const router = useRouter();
  const scope = JSON.stringify([rewards.owner, rewards.admissionEpoch]);
  const current = useRef(scope), sequence = useRef(0);
  useLayoutEffect(() => { current.current = scope; }, [scope]);
  const [activityId] = useState(() => Symbol("developer-achievement"));
  const [screen, setScreen] = useState<TestScreen | null>(null);
  const [picker, setPicker] = useState<"give" | "duplicate" | "balance" | null>(null);
  const [feedback, setFeedback] = useState({ scope, text: "" });
  // Chosen rewards on test days and test items: the server runs the real rules
  // and rolls everything back, so this phone keeps the test state.
  const [chosenTest, setChosenTest] = useState<{ scope: string; state: RewardsState | null; open: boolean; busy: boolean; message: string }>({ scope, state: null, open: false, busy: false, message: "" });
  const chosenLive = chosenTest.scope === scope ? chosenTest : null;
  // Plain values (no non-null assertions in closures): the production compiler
  // reads a closure's property paths eagerly as dependencies.
  const chosenState = chosenLive?.state?.chosen ?? null, chosenTarget = chosenState?.target ?? null;
  const viewScope = JSON.stringify([scope, hasOpenSession]);
  const [lastViewScope, setLastViewScope] = useState(viewScope);
  if (lastViewScope !== viewScope) { setLastViewScope(viewScope); setScreen(null); setPicker(null); setFeedback({ scope, text: "" }); setChosenTest({ scope, state: null, open: false, busy: false, message: "" }); }
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") { setScreen(null); setPicker(null); } });
    return () => subscription.remove();
  }, []);
  const visible = screen?.scope === scope && !hasOpenSession ? screen : null;
  // Android opens a Modal's window as soon as it is created, children first.
  // The card (its own Modal) waits until the scenery's window is open, so it
  // opens above it, never underneath. A short fallback covers a missed onShow.
  const [sceneryShown, setSceneryShown] = useState<number | null>(null);
  const sceneryId = visible && (visible.kind === "walk" || visible.kind === "result") ? visible.id : null;
  useEffect(() => {
    if (sceneryId === null || sceneryShown === sceneryId) return;
    const fallback = setTimeout(() => setSceneryShown(sceneryId), SCENERY_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [sceneryId, sceneryShown]);
  const walkId = visible?.kind === "walk" ? visible.id : null;
  useEffect(() => {
    if (walkId === null) return;
    const fallback = setTimeout(() => setScreen(previous => previous?.scope === scope && previous.kind === "walk" && previous.id === walkId
      ? { ...previous, kind: "result" } : previous), RETURN_TO_CAMP_MS + 350);
    return () => clearTimeout(fallback);
  }, [walkId, scope]);
  const note = (text: string) => setFeedback(previous => previous.scope === scope ? { scope, text } : previous);
  const show = (next: TestContent) => setScreen({ ...next, id: ++sequence.current, scope });
  const close = () => setScreen(null);
  const closeReturn = () => {
    if (visible?.kind === "reveal" && visible.afterTrail) show({ kind: "achievement", achievements: visible.afterTrail });
    else close();
  };
  const blocked = hasOpenSession || rewards.busy || !rewards.online || !rewards.state;
  const player = { look: rewards.look, equipped: rewards.equipped, level: profile.level, background: rewards.background,
    frame: rewards.frame, today: rewards.today, nextFindSeconds: rewards.nextFindSeconds, trail: rewards.trail };
  const achievements = (firstSession: boolean, dailyGoal: boolean) => show({ kind: "achievement", achievements: { firstSession, dailyGoal } });
  const trailContent = (seconds: number, fromSeconds: number): TestContent => {
    const length = rewards.trail.findSeconds * rewards.trail.stops;
    const finds = Math.min(rewards.trail.stops, Math.floor(seconds / rewards.trail.findSeconds));
    const nextFindSeconds = seconds >= length ? 0 : rewards.trail.findSeconds * (finds + 1) - seconds;
    return { kind: "reveal", reveal: { id: `dev-trail:${seconds}:${fromSeconds}`, kind: "expedition", seconds: seconds - fromSeconds,
      finds: [], stardust: 0, trail: { ...rewards.trail, complete: seconds >= length, fromSeconds, seconds, finds, nextFindSeconds,
        ...(rewards.today.date ? { date: rewards.today.date } : {}) } } };
  };
  const trail = (seconds: number, fromSeconds: number) => show(trailContent(seconds, fromSeconds));
  // The map a result preview goes on to (like a real finished session), if any.
  const resultTrail = visible?.kind === "result" && (visible.variant === "sync" || !visible.variant)
    ? trailContent(visible.variant === "sync" ? 180 : 60, 0) as Extract<TestContent, { kind: "reveal" }> : null;
  const startLab = async () => {
    note("Opening test inventory…");
    const result = await rewards.lab.start();
    note(result.ok ? "Test inventory is ready. Open Outfits to buy items. Your real collection is safe." : result.message);
  };
  const pack = async (tier: number) => {
    const result = await rewards.lab.run("pack", null, tier);
    if (current.current !== scope) return;
    if (!result.ok) { note(result.message); return; }
    const value = result.value.pack;
    if (value) show({ kind: "reveal", reveal: { id: `dev-pack:${++sequence.current}`, kind: "pack", tier: value.tier,
      daysInARow: value.daysInARow, items: value.items, stardust: value.stardust + value.items.reduce((sum, gift) => sum + gift.stardust, 0) } });
  };
  const give = async (item: string, duplicate: boolean) => {
    setPicker(null);
    const result = await rewards.lab.run(duplicate ? "duplicate" : "give", item);
    if (current.current !== scope) return;
    if (!result.ok) { note(result.message); return; }
    const gift = result.value.gifts[0];
    if (!gift) return;
    note(`${rewardItem(item)?.name}: ${gift.new ? "added to test inventory" : `duplicate, +${gift.stardust} test Stardust`}.`);
    const milestone = ["pet", "frame", "title"].includes(rewardItem(item)?.kind ?? "");
    if (gift.new && milestone) show({ kind: "moment", gift });
    else show({ kind: "reveal", reveal: { id: `dev-duplicate:${++sequence.current}`, kind: "expedition", seconds: rewards.trail.findSeconds,
      finds: [gift], stardust: gift.stardust } });
  };
  const find = async () => {
    const result = await rewards.lab.run("find");
    if (current.current !== scope) return;
    if (!result.ok) { note(result.message); return; }
    show({ kind: "reveal", reveal: { id: `dev-find:${++sequence.current}`, kind: "expedition", seconds: rewards.trail.findSeconds,
      finds: result.value.gifts, stardust: result.value.gifts.reduce((sum, gift) => sum + gift.stardust, 0) } });
  };
  const balance = async (amount: number) => {
    setPicker(null);
    const result = await rewards.lab.run("stardust", null, amount);
    note(result.ok ? `Test balance: ${amount} Stardust.` : result.message);
  };
  const chosenRun = async (action: "load" | "day" | "select", item: string | null = null, earnedExtra: string[] = [], fresh = false) => {
    const previous = fresh ? null : chosenLive?.state ?? null;
    setChosenTest(current => ({ ...current, scope, busy: true, message: "" }));
    const chosen = previous?.chosen;
    const result = await rewards.chosenLab(action, { earned: [...(previous?.earned ?? []), ...earnedExtra],
      ...(chosen ? { chosen: { balance: chosen.balance, revision: chosen.revision, target: chosen.target, offers: chosen.offers } } : {}) }, item);
    if (current.current !== scope) return;
    if (!result.ok) { setChosenTest(currentTest => ({ ...currentTest, busy: false, message: result.message })); return; }
    const grant = result.value.chosen?.grants[0];
    setChosenTest(currentTest => ({ ...currentTest, state: result.value, busy: false, open: grant ? false : currentTest.open,
      message: action === "day" ? "Added a test goal day." : action === "load" && earnedExtra.length ? "Got your choice another way: saved days kept." : "" }));
    // The real reward screen for the earned choice, from the same component.
    if (grant) show({ kind: "reveal", reveal: { id: `dev-chosen:${grant.id}`, kind: "expedition", seconds: null, finds: [{ item: grant.item, rarity: grant.rarity, new: true, stardust: 0 }],
      stardust: 0, skipTrail: true, chosen: { grantId: grant.id, days: result.value.chosen?.requiredDays ?? 5 } } });
  };
  const openChosen = async () => {
    setChosenTest(currentTest => ({ ...currentTest, scope, open: true }));
    if (!chosenLive?.state) await chosenRun("load", null, [], true);
  };
  const outfits = (item?: string) => { close(); router.navigate(item ? { pathname: "/outfits", params: { show: item } } : "/outfits"); };
  return <>
    <SettingsGroup title="Developer: no waiting" footer="These are the real presentation components. Previews do not add minutes, XP, streak days or squad credit. Finish your running session first.">
      <SettingsRow wrap first testID="dev-first-session" icon="sunny-outline" title="First session today" disabled={hasOpenSession} onPress={() => achievements(true, false)} />
      <SettingsRow wrap testID="dev-daily-goal" icon="flag-outline" title="Daily goal reached" disabled={hasOpenSession} onPress={() => achievements(false, true)} />
      <SettingsRow wrap testID="dev-first-and-goal" icon="checkmark-done-outline" title="First session and daily goal" disabled={hasOpenSession} onPress={() => achievements(true, true)} />
      <SettingsRow wrap testID="dev-walk-result" icon="walk-outline" title="Walk back, result and trail" subtitle="The finished-session sequence, without a timer" disabled={hasOpenSession || !rewards.state}
        onPress={() => show({ kind: reduced ? "result" : "walk" })} />
      <SettingsRow wrap testID="dev-ended-result" icon="stop-circle-outline" title="Session ended early" disabled={hasOpenSession} onPress={() => show({ kind: "result", variant: "ended" })} />
      <SettingsRow wrap testID="dev-offline-result" icon="cloud-offline-outline" title="Saved offline result" disabled={hasOpenSession} onPress={() => show({ kind: "result", variant: "offline" })} />
      <SettingsRow wrap testID="dev-sync-summary" icon="cloud-done-outline" title="Offline sync summary" subtitle="Three 1-minute sessions, one summary and trail"
        disabled={hasOpenSession || !rewards.state} onPress={() => show({ kind: "result", variant: "sync" })} />
      <SettingsRow wrap testID="dev-sync-achievements" icon="checkmark-done-outline" title="Offline sync and celebrations" subtitle="Summary, trail, then first-session and goal messages"
        disabled={hasOpenSession || !rewards.state} onPress={() => show({ kind: "result", variant: "sync", afterTrail: { firstSession: true, dailyGoal: true } })} />
      <SettingsRow wrap testID="dev-rejected-result" icon="information-circle-outline" title="Session could not be credited" disabled={hasOpenSession} onPress={() => show({ kind: "result", variant: "rejected" })} />
      <SettingsRow wrap testID="dev-trail-complete" icon="map-outline" title="Trail complete" subtitle="120 minutes, all four stops collected" disabled={hasOpenSession || !rewards.state}
        onPress={() => trail(rewards.trail.findSeconds * rewards.trail.stops, rewards.trail.findSeconds * rewards.trail.stops - 60)} />
      <SettingsRow wrap testID="dev-trail-after-end" icon="flag" title="After the trail is finished" subtitle="A later session on an already completed trail" disabled={hasOpenSession || !rewards.state}
        onPress={() => trail(rewards.trail.findSeconds * rewards.trail.stops + 60, rewards.trail.findSeconds * rewards.trail.stops)} />
    </SettingsGroup>
    <SettingsGroup title="Developer: chosen rewards" footer={chosenLive?.message || "Test goal days and test items. The real choice screen and rules, nothing real changes. Requires the Round 82 SQL."}>
      <SettingsRow wrap first testID="dev-chosen-open" icon="gift-outline" title="Choose a reward (test)" subtitle={chosenState
        ? `${chosenState.balance} test goal days saved${chosenTarget ? ` · working toward ${rewardItem(chosenTarget)?.name ?? "a reward"}` : ""}` : "Starts with no items and no saved days"}
        disabled={blocked || !!chosenLive?.busy} onPress={() => void openChosen()} />
      <SettingsRow wrap testID="dev-chosen-day" icon="calendar-outline" title="Add a test goal day" disabled={blocked || !chosenLive?.state || !!chosenLive?.busy} onPress={() => void chosenRun("day")} />
      <SettingsRow wrap testID="dev-chosen-early" icon="sparkles-outline" title="Get my choice another way" subtitle="Like a find or a purchase first: saved days stay"
        disabled={blocked || !chosenTarget || !!chosenLive?.busy} onPress={() => { if (chosenTarget) void chosenRun("load", null, [chosenTarget]); }} />
      <SettingsRow wrap testID="dev-chosen-reset" icon="refresh-outline" title="Start chosen rewards over" disabled={blocked || !!chosenLive?.busy} onPress={() => void chosenRun("load", null, [], true)} />
    </SettingsGroup>
    <SettingsGroup title="Developer: purchase testing" footer={feedback.scope === scope && feedback.text || "Test inventory lives on this phone until you close the app. Your real items, balance, look and history stay safe. Requires the approved Round 75 SQL."}>
      <SettingsRow wrap first testID="dev-test-inventory" icon="bag-outline" title={rewards.lab.active ? "Open test Outfits" : "Start with locked items"}
        subtitle={rewards.lab.active ? `${rewards.stardust} test Stardust` : "An empty test collection and 500 test Stardust"} disabled={blocked}
        onPress={() => { if (rewards.lab.active) outfits(); else void startLab(); }} />
      <SettingsRow wrap testID="dev-test-own-all" icon="lock-open-outline" title="Unlock all items" value={rewards.lab.allOwned ? "On" : "Off"}
        subtitle="Turn off to see locks and test buying" disabled={blocked || !rewards.lab.active} onPress={() => rewards.lab.ownAll(!rewards.lab.allOwned)} />
      <SettingsRow wrap testID="dev-test-balance" icon="sparkles-outline" title="Set test Stardust" subtitle="Try zero, exact price or plenty" disabled={blocked || !rewards.lab.active} onPress={() => setPicker("balance")} />
      <SettingsRow wrap testID="dev-test-grant" icon="ribbon-outline" title="Get any item or milestone" subtitle="Pets, every streak frame, badges and decorations" disabled={blocked || !rewards.lab.active} onPress={() => setPicker("give")} />
      <SettingsRow wrap testID="dev-test-duplicate" icon="copy-outline" title="Get a duplicate" subtitle="The real duplicate-to-Stardust result" disabled={blocked || !rewards.lab.active} onPress={() => setPicker("duplicate")} />
      <SettingsRow wrap testID="dev-test-find" icon="diamond-outline" title="Roll a test find" subtitle="The real reward roll and return screen" disabled={blocked || !rewards.lab.active} onPress={() => void find()} />
      {["Canvas", "Leather", "Brass", "Crystal"].map((name, tier) => <SettingsRow wrap key={name} testID={`dev-test-pack-${tier}`} icon="gift-outline" title={`Open ${name} pack`}
        disabled={blocked || !rewards.lab.active} onPress={() => void pack(tier)} />)}
      <SettingsRow wrap testID="dev-test-lock-again" icon="refresh-outline" title="Start test collection over" subtitle="Locks test items again. Keeps your real items." disabled={blocked || !rewards.lab.active}
        onPress={() => { rewards.lab.reset(); note("Test items locked again, with 500 test Stardust."); }} />
      <SettingsRow wrap testID="dev-test-restore" icon="arrow-undo-outline" title="Return to my real collection" disabled={!rewards.lab.active}
        onPress={() => { rewards.lab.end(); note("Your real collection and balance are shown again."); }} />
    </SettingsGroup>
    <ChosenRewardSheet visible={!!chosenLive?.open && !hasOpenSession && !visible} chosen={chosenState ?? undefined} busy={!!chosenLive?.busy} message={chosenLive?.message}
      onChoose={item => void chosenRun("select", item)} onClose={() => setChosenTest(currentTest => ({ ...currentTest, open: false }))}
      extra={<SettingsRow wrap testID="dev-chosen-sheet-day" icon="calendar-outline" title="Add a test goal day" disabled={!chosenLive?.state || !!chosenLive?.busy} onPress={() => void chosenRun("day")} />} />
    <AppSheet visible={picker !== null && !hasOpenSession} onRequestClose={() => setPicker(null)} attached compact maxHeightRatio={0.86} label="developer reward test"
      header={<SheetHeader title={picker === "balance" ? "Test Stardust" : picker === "duplicate" ? "Choose a duplicate" : "Choose a reward"} subtitle="Test inventory only"
        closeLabel="Close developer reward test" closeTestID="dev-test-picker-close" onClose={() => setPicker(null)} />}>
      <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {picker === "balance" ? [0, 60, 120, 240, 500, 5000].map(amount => <SettingsRow wrap key={amount} testID={`dev-test-balance-${amount}`} icon="sparkles-outline" title={`${amount} Stardust`}
          onPress={() => void balance(amount)} />)
          : REWARD_ITEMS.filter(item => !item.free).map(item => <SettingsRow wrap key={item.id} testID={`dev-test-item-${item.id}`} icon="gift-outline" title={item.name} subtitle={item.hint}
            onPress={() => void give(item.id, picker === "duplicate")} />)}
      </BottomSheetScrollView>
    </AppSheet>
    {visible?.kind === "achievement" && <DailyAchievementMoment visible achievements={visible.achievements} presentationId={visible.id} activityId={activityId} onClose={close} />}
    {visible && (visible.kind === "walk" || visible.kind === "result") && <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={close}
      onShow={() => setSceneryShown(visible.id)}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SessionBackdrop phase="completed" progress={1} secondsLeft={0} walking={false} intro={false} skipToken={0} onIntroEnd={() => {}}
          returning={visible.kind === "walk"} onReturnEnd={() => { if (current.current === scope) setScreen(previous => previous?.scope === scope && previous.id === visible.id && previous.kind === "walk" ? { ...previous, kind: "result" } : previous); }} />
        {resultTrail && (visible.preparing || visible.closing || visible.dismissed) && <View style={StyleSheet.absoluteFill}>
          {/* Like a real finished session: the map is ready underneath before the card fades straight into it. */}
          <ExpeditionReveal key={visible.id} reveal={resultTrail.reveal as Extract<Reveal, { kind: "expedition" }>} player={player} onOutfits={item => outfits(item ?? undefined)}
            walkDelay={visible.dismissed ? 650 : 60_000} onReady={() => setScreen(previous => previous?.id === visible.id && previous.kind === "result" && previous.preparing
              ? { ...previous, preparing: false, closing: true } : previous)}
            onClose={() => { if (visible.afterTrail) show({ kind: "achievement", achievements: visible.afterTrail }); else close(); }} />
        </View>}
        <SessionResultSheet preview visible={visible.kind === "result" && !visible.closing && !visible.dismissed && sceneryShown === visible.id} sessionId={`dev-result:${visible.id}`} activityId={activityId}
          xpEarned={visible.variant === "sync" ? 3 : 1} minutesSpent={visible.variant === "sync" ? 3 : 1} durationSeconds={visible.variant === "sync" ? 180 : 60} questTitle="Test session" areaTitle="Everyday focus"
          syncSummary={visible.variant === "sync" ? { sessionCount: 3, durations: [{ seconds: 60, count: 3 }], areas: [{ title: "Everyday focus", color: colors.accent, xp: 3 }], preparing: !!visible.preparing } : undefined}
          ending={visible.variant === "ended"} pending={visible.variant === "offline"} offline={visible.variant === "offline"}
          localSaved={visible.variant === "offline"} rejected={visible.variant === "rejected"}
          currentXP={profile.current_xp} requiredXP={requiredCharacterXP(profile.level)}
          onClose={() => setScreen(previous => previous?.kind === "result" && !previous.preparing && !previous.closing
            ? resultTrail ? { ...previous, preparing: true } : { ...previous, closing: true } : previous)}
          onDismiss={() => { if (current.current === scope) setScreen(previous => previous?.scope === scope && previous.id === visible.id && previous.kind === "result" && previous.closing
            ? resultTrail ? { ...previous, closing: false, dismissed: true } : null : previous); }} />
      </View>
    </Modal>}
    {visible && (visible.kind === "reveal" || visible.kind === "moment") && <Modal visible transparent animationType={reduced ? "none" : "fade"} statusBarTranslucent onRequestClose={closeReturn}>
      {visible.kind === "moment" ? <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Moment item={rewardItem(visible.gift.item)!} left={1}
        level={profile.level} look={rewards.look} equipped={rewards.equipped} background={rewards.background} streak={profile.streak_count ?? 0}
        onClose={close} onOutfits={() => outfits(visible.gift.item)} /></ScrollView>
        : visible.reveal.kind === "pack" ? <PackReveal key={visible.id} reveal={visible.reveal} player={player} onClose={close} onOutfits={item => outfits(item ?? undefined)} />
          : <ExpeditionReveal key={visible.id} reveal={visible.reveal} player={player} onClose={closeReturn} onOutfits={item => outfits(item ?? undefined)} />}
    </Modal>}
    {/* A visible label makes it clear why the same real screens show test data. */}
    {rewards.lab.active && <Text accessibilityLiveRegion="polite" testID="dev-lab-active" style={{ color: colors.secondary, fontSize: 13 }}>Test inventory active in Outfits. Home, sessions and statistics still use your real account.</Text>}
  </>;
}
