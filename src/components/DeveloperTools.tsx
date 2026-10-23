import { useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
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
import { requiredCharacterXP } from "../utils/levelTiers";
import { useRouter } from "expo-router";
import { useRewards } from "../hooks/useRewards";
import { rewardItem } from "../services/rewardCatalog";
import type { DevRewardAction } from "../services/rewardsService";
import { colors, edge } from "../constants/theme";

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
  const [rewardNote, setRewardNote] = useState("");
  useEffect(() => {
    if (!saving) return;
    const timeout = setTimeout(() => setSaving(false), SAVING_PREVIEW_MS);
    return () => clearTimeout(timeout);
  }, [saving]);
  if (!developer) return null;
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
  const note = (text: string, ok = true) => setRewardNote(text ? `${ok ? "✓" : "!"} ${text}` : "");
  const claim = async () => {
    note("Checking…");
    const r = await rewards.claimSessions();
    if (!r.ok) return note(r.message, false);
    const finds = r.value.sessions.flatMap(x => x.finds), dust = r.value.sessions.reduce((n, x) => n + x.minutesStardust, 0);
    const parts = [finds.length ? `Finds: ${names(finds)}` : "", dust ? `+${dust} Stardust from minutes` : "", r.value.milestones.length ? `Unlocked: ${names(r.value.milestones)}` : ""].filter(Boolean);
    note(parts.length ? parts.join(". ") + "." : `Nothing new since your last check. Next find in ${Math.ceil(r.value.state.nextFindSeconds / 60)} min of focus.`);
  };
  const pack = async () => {
    note("Opening…");
    const r = await rewards.openPack();
    if (r.ok) note(`${["Canvas", "Leather", "Brass", "Crystal"][r.value.tier]} pack (${r.value.daysInARow} days in a row): ${names(r.value.items) || "no item"}, +${r.value.stardust} Stardust.`);
    else note(/already opened/.test(r.message) ? "Today's pack is already open. Use “Let me open today's pack again” first." : r.message, false);
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
      <SettingsRow first icon="trophy-outline" tint="#FBBF24" title="Preview level up" onPress={() => open("level")} />
      <SettingsRow icon="checkmark-circle-outline" tint="#2DD4A7" title="Preview session complete" onPress={() => open("complete")} />
      <SettingsRow icon="cloud-done-outline" tint="#64D2FF" title="Preview earlier session saved" onPress={() => open("recovered")} />
      <SettingsRow icon="hourglass-outline" tint="#A3ABC2" title="Preview saving screen" onPress={() => setSaving(true)} />
      <SettingsRow icon="map-outline" tint="#7C3AED" title="Replay the guide" disabled={hasOpenSession || !tour} onPress={() => { setMessage(""); tour?.start(); }} />
      <SettingsRow icon="refresh-outline" tint="#FF9F0A" title="Restart the intro" disabled={hasOpenSession || restarting === "busy"} onPress={() => { setMessage(""); setRestarting("ask"); }} />
    </SettingsGroup>
    <SettingsGroup title="Developer: rewards" footer={`${rewards.stardust} Stardust. These use the real rewards, the same as everyone's; the rows marked “test” are developer-only.`}>
      <SettingsRow first icon="shirt-outline" tint="#2DD4A7" title="Open Outfits" onPress={() => router.navigate("/outfits")} />
      <SettingsRow icon="compass-outline" tint="#60A5FA" title="Check for new finds" disabled={rewards.busy} onPress={() => void claim()} />
      <SettingsRow icon="gift-outline" tint="#FBBF24" title="Open today's pack" subtitle="Developers don't need the daily goal" disabled={rewards.busy} onPress={() => void pack()} />
      <SettingsRow icon="repeat-outline" tint="#64D2FF" title="Let me open today's pack again" subtitle="Test" disabled={rewards.busy}
        onPress={() => void dev("reopen_pack", () => "Today's pack can be opened again. Your days in a row carry on.")} />
      <SettingsRow icon="diamond-outline" tint="#A78BFA" title="Find something now" subtitle="Test · one real find roll" disabled={rewards.busy}
        onPress={() => void dev("find", gifts => gifts.length ? `Found ${names(gifts)}.` : "Nothing came up. Try again.")} />
      <SettingsRow icon="ribbon-outline" tint="#F472B6" title="Earn the next pet, frame and badge" subtitle="Test · shows their pop-ups" disabled={rewards.busy}
        onPress={() => void dev("next_milestones", gifts => gifts.length ? `Earned ${names(gifts)}.` : "You've earned every pet, frame and badge.")} />
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
    <Modal visible={saving} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={() => setSaving(false)}>
      <SessionSavingOverlay visible={saving} />
    </Modal>
  </>;
}

const ds = StyleSheet.create({
  note: { ...edge, marginTop: -12, marginHorizontal: 4, padding: 12, borderRadius: 14, backgroundColor: "rgba(45,212,167,0.10)" },
  noteText: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
