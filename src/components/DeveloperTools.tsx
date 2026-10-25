import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modal, Pressable, Share, StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import SessionResultSheet from "./SessionResultSheet";
import SessionSavingOverlay from "./SessionSavingOverlay";
import SheetConfirmation from "./SheetConfirmation";
import { useFeatureTour } from "./FeatureTour";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import { restartIntro, useIsDeveloper } from "../services/developerAccess";
import { LEVEL_TIERS, requiredCharacterXP } from "../utils/levelTiers";
import { useRouter } from "expo-router";
import { useRewards } from "../hooks/useRewards";
import { rewardItem } from "../services/rewardCatalog";
import type { DevRewardAction } from "../services/rewardsService";
import { colors, edge } from "../constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import { levelPreview, useShownLevel } from "../services/levelPreview";
import { tapHaptic } from "../utils/tapHaptics";
import { readSessionTrail } from "../services/sessionTrail";

type Preview = "level" | "complete" | "recovered";
const SAVING_PREVIEW_MS = 3000;

/**
 * Previews for the developer account only. The server decides who is a
 * developer. Nothing here saves anything: the cards are shown as previews and
 * never count toward a real celebration.
 */
export default function DeveloperTools() {
  const { profile, reloadProfile } = useUser();
  const auth = useAuth();
  const tour = useFeatureTour();
  const { hasOpenSession } = useTimer({ live: false });
  const restartLock = useRef(false);
  const [restarting, setRestarting] = useState<"ask" | "busy" | null>(null), [message, setMessage] = useState("");
  const developer = useIsDeveloper(profile.id, auth.accessMode === "online");
  // The real rewards functions, the same ones everyone uses.
  const rewards = useRewards({ load: developer });
  const [preview, setPreview] = useState<{ kind: Preview; id: number } | null>(null);
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tiersOpen, setTiersOpen] = useState(false);
  const shownLevel = useShownLevel(profile.id, profile.level);
  const rewardScope = JSON.stringify([profile.id, auth.admissionEpoch]);
  const [feedback, setFeedback] = useState({ scope: rewardScope, note: "", claim: "", claiming: false });
  const rewardNote = feedback.scope === rewardScope ? feedback.note : "";
  const claimNote = feedback.scope === rewardScope ? feedback.claim : "";
  const claiming = feedback.scope === rewardScope && feedback.claiming;
  const feedbackForScope = (next: Partial<Omit<typeof feedback, "scope">>) => setFeedback(previous => ({
    ...(previous.scope === rewardScope ? previous : { note: "", claim: "", claiming: false }), scope: rewardScope, ...next,
  }));
  const claimLock = useRef(false);
  const logShareLock = useRef(false);
  const [logShare, setLogShare] = useState({ scope: rewardScope, busy: false });
  const sharingLog = logShare.scope === rewardScope && logShare.busy;
  const currentRewardScope = useRef(rewardScope);
  useLayoutEffect(() => {
    currentRewardScope.current = rewardScope; claimLock.current = false; logShareLock.current = false;
  }, [rewardScope]);
  useEffect(() => {
    if (!saving) return;
    const timeout = setTimeout(() => setSaving(false), SAVING_PREVIEW_MS);
    return () => clearTimeout(timeout);
  }, [saving]);
  if (!developer) return null;
  const shareLog = async () => {
    if (logShareLock.current) return;
    logShareLock.current = true; setLogShare({ scope: rewardScope, busy: true }); setMessage("");
    try {
      const log = await readSessionTrail();
      if (currentRewardScope.current !== rewardScope) return;
      await Share.share({ message: log || "No session events yet." });
    } catch {
      if (currentRewardScope.current === rewardScope) setMessage("Couldn't open sharing. Please try again.");
    } finally {
      if (currentRewardScope.current === rewardScope) { logShareLock.current = false; setLogShare({ scope: rewardScope, busy: false }); }
    }
  };
  const open = (kind: Preview) => { setPreview({ kind, id: Date.now() }); setShown(true); };
  const restart = async () => {
    if (restartLock.current) return;
    restartLock.current = true; setRestarting("busy"); setMessage("");
    try {
      const ok = await restartIntro(profile.id);
      // Reloading the profile sends the app to the intro by itself.
      const opened = ok && await reloadProfile();
      setRestarting(null);
      if (!opened) setMessage(ok ? "The intro is ready. Close and reopen the app to start it." : "Couldn't restart the intro. Check your connection and try again.");
    } finally { restartLock.current = false; }
  };
  const busySession = hasOpenSession ? "Finish or end your session first." : "";
  const names = (gifts: { item: string; new: boolean; stardust: number }[]) => gifts.map(g => `${rewardItem(g.item)?.name ?? g.item}${g.new ? " (new)" : ` (+${g.stardust} Stardust)`}`).join(", ");
  // Every row says what happened. Finds, packs and milestones also open the
  // same return screen, pack screen and pop-ups everyone sees.
  const note = (text: string, ok = true) => {
    if (currentRewardScope.current !== rewardScope) return;
    feedbackForScope({ claim: "", note: text ? `${ok ? "✓" : "!"} ${text}` : "" });
  };
  // Coming back from a session, on demand. Real sessions waiting to be claimed
  // come first; with none, a developer still sees the return screen, with one
  // real find roll from one stop's walk.
  const claim = async () => {
    if (claimLock.current) return;
    claimLock.current = true; feedbackForScope({ claiming: true, note: "", claim: "Checking…" });
    try {
      const r = await rewards.claimSessions();
      if (currentRewardScope.current !== rewardScope) return;
      if (!r.ok) { feedbackForScope({ claim: `! ${r.message}` }); return; }
      const finds = r.value.sessions.flatMap(x => x.finds), dust = r.value.sessions.reduce((n, x) => n + x.minutesStardust, 0);
      const parts = [finds.length ? `Finds: ${names(finds)}` : "", dust ? `+${dust} Stardust from minutes` : "", r.value.milestones.length ? `Unlocked: ${names(r.value.milestones)}` : ""].filter(Boolean);
      if (parts.length || r.value.sessions.length) { feedbackForScope({ claim: `✓ ${parts.length ? parts.join(". ") + "." : "Back at camp."}` }); return; }
      const roll = await rewards.developer("find", 0, rewards.trail.findSeconds);
      if (currentRewardScope.current !== rewardScope) return;
      feedbackForScope({ claim: roll.ok ? `✓ No sessions waiting, so here's a test walk: ${names(roll.value.gifts) || "nothing this time"}.` : `! ${roll.message}` });
    } catch {
      if (currentRewardScope.current === rewardScope) feedbackForScope({ claim: "! Couldn't check your finds. Please try again." });
    } finally {
      if (currentRewardScope.current === rewardScope) { claimLock.current = false; feedbackForScope({ claiming: false }); }
    }
  };
  // Developers have no daily limit: an opened pack is reopened and opened again.
  const pack = async () => {
    note("Opening…");
    let r = await rewards.openPack();
    if (!r.ok && /already opened/.test(r.message)) {
      const again = await rewards.developer("reopen_pack", 0);
      if (again.ok) r = await rewards.openPack();
    }
    if (r.ok) note(`${["Canvas", "Leather", "Brass", "Crystal"][r.value.tier]} pack (${r.value.daysInARow} days in a row): ${names(r.value.items) || "no item"}, +${r.value.stardust} Stardust.`);
    else note(r.message, false);
  };
  // The next pet, frame and badge, with their pop-ups. With all of them
  // earned, they're taken back first so the pop-ups can show again.
  const milestones = async () => {
    note("One moment…");
    let r = await rewards.developer("next_milestones", 0);
    if (r.ok && !r.value.gifts.length) {
      const back = await rewards.developer("reearn", 0);
      if (back.ok) r = await rewards.developer("next_milestones", 0);
    }
    if (r.ok) note(r.value.gifts.length ? `Earned ${names(r.value.gifts)}.` : "Nothing to earn right now.");
    else note(r.message, false);
  };
  const dev = async (action: DevRewardAction, done: (gifts: { item: string; new: boolean; stardust: number }[]) => string) => {
    note("One moment…");
    const r = await rewards.developer(action, action === "stardust" ? 500 : 0);
    if (r.ok) note(done(r.value.gifts));
    else note(/Unknown developer action/.test(r.message) ? "This needs the Round 58 SQL. Run it in the SQL Editor first." : r.message, false);
  };
  const level = (profile.level ?? 1) + (preview?.kind === "level" ? 1 : 0);
  return <>
    <SettingsGroup title="Developer" footer={message || busySession || "Only your developer account sees this. Previews never save anything."}>
      <SettingsRow first icon="share-outline" title="Share session log" subtitle="Share this phone's recent timer events" testID="dev-share-session-log"
        busy={sharingLog} disabled={sharingLog} onPress={() => void shareLog()} />
      <SettingsRow icon="trophy-outline" tint="#FBBF24" title="Preview level up" onPress={() => open("level")} />
      <SettingsRow icon="checkmark-circle-outline" tint="#2DD4A7" title="Preview session complete" onPress={() => open("complete")} />
      <SettingsRow icon="cloud-done-outline" tint="#64D2FF" title="Preview earlier session saved" onPress={() => open("recovered")} />
      <SettingsRow icon="hourglass-outline" tint="#A3ABC2" title="Preview saving screen" onPress={() => setSaving(true)} />
      <SettingsRow icon="map-outline" tint="#7C3AED" title="Replay the guide" disabled={hasOpenSession || !tour} onPress={() => { setMessage(""); tour?.start(); }} />
      <SettingsRow icon="refresh-outline" tint="#FF9F0A" title="Restart the intro" disabled={hasOpenSession || restarting === "busy"} onPress={() => { setMessage(""); setRestarting("ask"); }} />
    </SettingsGroup>
    <SettingsGroup title="Developer: rewards" footer={`${rewards.stardust} Stardust. These use the real rewards, the same as everyone's; the rows marked “test” are developer-only.`}>
      <SettingsRow first icon="shirt-outline" tint="#2DD4A7" title="Open Outfits" onPress={() => router.navigate("/outfits")} />
      <SettingsRow icon="color-palette-outline" tint={shownLevel.previewing ? LEVEL_TIERS.findLast(t => shownLevel.level >= t.level)?.color : "#C1A8FA"} title="Preview level colours"
        subtitle="Test · see each tier's colours on your picture, Home and Profile" value={shownLevel.previewing ? `Level ${shownLevel.level}` : "Off"} testID="dev-level-preview" onPress={() => setTiersOpen(true)} />
      <SettingsRow icon="compass-outline" tint="#60A5FA" title="Come back from a session" subtitle="Your finds, or a test walk if there are none" status={claimNote} testID="dev-reward-claim" busy={claiming} disabled={rewards.busy || claiming} onPress={() => void claim()} />
      <SettingsRow icon="moon-outline" tint="#A3ABC2" title="Come back with nothing" subtitle="Test · the screen after a short session" disabled={rewards.busy}
        onPress={() => { rewards.showEmptyReturn(60); note("Showing the screen after a 1-minute session."); }} />
      <SettingsRow icon="gift-outline" tint="#FBBF24" title="Open today's pack" subtitle="Any time, as often as you like" disabled={rewards.busy} onPress={() => void pack()} />
      <SettingsRow icon="diamond-outline" tint="#A78BFA" title="Find something now" subtitle="Test · one real find roll" disabled={rewards.busy}
        onPress={() => void dev("find", gifts => gifts.length ? `Found ${names(gifts)}.` : "Nothing came up. Try again.")} />
      <SettingsRow icon="ribbon-outline" tint="#F472B6" title="Earn the next pet, frame and badge" subtitle="Test · shows their pop-ups, again and again" disabled={rewards.busy}
        onPress={() => void milestones()} />
      <SettingsRow icon="arrow-undo-outline" tint="#FF9F0A" title="Take back pets, frames and badges" subtitle="Test · so you can earn them again" disabled={rewards.busy}
        onPress={() => void dev("reearn", () => "Pets, frames and badges taken back. Earn them again from the row above.")} />
      <SettingsRow icon="sparkles-outline" tint="#A78BFA" title="Add 500 test Stardust" subtitle="Test" disabled={rewards.busy}
        onPress={() => void dev("stardust", () => "Added 500 Stardust. It shows on Home beside your picture.")} />
      <SettingsRow icon="lock-closed-outline" tint="#8E8E93" title="Reset my rewards" value="Locked" subtitle="Turned off to keep this account safe" disabled onPress={() => {}} />
    </SettingsGroup>
    {!!rewardNote && <View style={ds.note} accessibilityLiveRegion="polite" testID="dev-reward-note"><Text style={ds.noteText}>{rewardNote}</Text></View>}
    {preview && <SessionResultSheet preview visible={shown} sessionId={`preview-${preview.id}`}
      xpEarned={25} minutesSpent={25} durationSeconds={1500} recovered={preview.kind === "recovered"}
      questTitle="Preview session" areaTitle="Study" isLevelUp={preview.kind === "level"} newLevel={level}
      currentXP={preview.kind === "level" ? 0 : profile.current_xp ?? 0} requiredXP={requiredCharacterXP(level)}
      onClose={() => setShown(false)} onDismiss={() => setPreview(null)} />}
    {restarting && <SheetConfirmation elevated title="Go through the intro again?"
      message="You'll see the intro and the guide like a new player. Your name and goal are filled in, and your level, sessions, routines and squads all stay."
      confirmLabel={restarting === "busy" ? "Restarting…" : "Restart intro"} cancelLabel="Not now"
      onCancel={() => { if (restarting !== "busy") setRestarting(null); }} onConfirm={() => void restart()} />}
    <AppSheet visible={tiersOpen} onRequestClose={() => setTiersOpen(false)} attached compact maxHeightRatio={0.86} label="level colours" motionMode="timed"
      header={<SheetHeader title="Preview level colours" subtitle="Only on this phone, for this account, until you close the app." onClose={() => setTiersOpen(false)} />}>
      <BottomSheetScrollView contentContainerStyle={[ds.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} showsVerticalScrollIndicator={false}>
        {[null, ...LEVEL_TIERS].map((tier, index) => {
          const on = tier ? shownLevel.previewing && LEVEL_TIERS.findLast(t => shownLevel.level >= t.level)?.level === tier.level : !shownLevel.previewing;
          return <Pressable key={tier?.level ?? "mine"} accessibilityRole="radio" accessibilityState={{ checked: on }} testID={`dev-tier-${tier?.level ?? "mine"}`}
            accessibilityLabel={tier ? `${tier.title}, level ${tier.level}` : `My level, ${profile.level ?? 1}`}
            onPress={() => { tapHaptic(); levelPreview.set(profile.id, tier ? tier.level : null); setTiersOpen(false); }}
            style={[ds.tier, index > 0 && ds.tierLine]}>
            <View style={[ds.swatch, { backgroundColor: tier?.color ?? colors.surfaceRaised }]}>{!tier && <Ionicons name="person" size={14} color={colors.text} />}</View>
            <View style={ds.tierCopy}><Text style={ds.tierName}>{tier ? tier.title : "My real level"}</Text>
              <Text style={ds.tierLevel}>{tier ? `Level ${tier.level}` : `Level ${profile.level ?? 1}`}</Text></View>
            {on && <Ionicons name="checkmark-circle" size={20} color={colors.progress} />}
          </Pressable>;
        })}
      </BottomSheetScrollView>
    </AppSheet>
    <Modal visible={saving} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={() => setSaving(false)}>
      <SessionSavingOverlay visible={saving} />
    </Modal>
  </>;
}

const ds = StyleSheet.create({
  note: { ...edge, marginTop: -12, marginHorizontal: 4, padding: 12, borderRadius: 14, backgroundColor: "rgba(45,212,167,0.10)" },
  noteText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  sheet: { paddingHorizontal: 20, paddingTop: 4 },
  tier: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56, paddingVertical: 8 },
  tierLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  swatch: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  tierCopy: { flex: 1, minWidth: 0 },
  tierName: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  tierLevel: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
});
