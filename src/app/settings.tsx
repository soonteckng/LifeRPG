import { setTapHapticsEnabled, tapHaptic } from "../utils/tapHaptics";
import { Text } from "../components/AppText";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Share, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import AppSheet from "../components/AppSheet";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { PersonalButton, PersonalPage, p } from "../components/PersonalUI";
import { SettingsGroup, SettingsRow } from "../components/SettingsList";
import CharacterMark from "../components/CharacterMark";
import { colors, edge, radius } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import { useAppPreferences } from "../hooks/useAppPreferences";
import { useFocusDurationPreference } from "../hooks/useFocusDurationPreference";
import { useStatsVisibility } from "../hooks/usePlayer";
import { appPreferences } from "../services/appPreferences";
import { getDailyGoalSettings } from "../services/dailyGoalService";
import { readNotificationPermission, type NotificationPermission } from "../services/notificationPermissionService";
import { durationLabel } from "../utils/sessionSetup";
import { afterTransition } from "../utils/afterTransition";
import { cachedDailyGoal, rememberDailyGoal } from "../utils/dailyGoalCache";
import AppBuildInfo from "../components/AppBuildInfo";
import DeveloperTools from "../components/DeveloperTools";
import DeleteAccount from "../components/DeleteAccount";
import Pressable from "../components/MotionPressable";
import { readSessionTrail } from "../services/sessionTrail";

/** Settings, grouped like the phone's own. Each row opens its own page, sliding in from the right. */
export default function SettingsScreen() {
  const router = useRouter();
  const { profile, hapticsEnabled, setHapticsEnabled, preferenceError } = useUser();
  const { user, signOut } = useAuth();
  const { hasOpenSession, isRestoring, restoreError, actionBusy, unsyncedSessionCount } = useTimer({ live: false });
  const preferences = useAppPreferences();
  const duration = useFocusDurationPreference(profile.id);
  const stats = useStatsVisibility();
  const [goal, setGoal] = useState<{ owner: string; today: number; next: number | null } | null>(() => {
    const known = cachedDailyGoal(profile.id);
    return known ? { owner: profile.id, today: known.today_goal_minutes, next: known.pending ? known.next_goal_minutes : null } : null;
  });
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [signingOut, setSigningOut] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), generation = useRef(0);
  // Values only; each page loads and edits its own details.
  const load = useCallback(async () => {
    const request = ++generation.current, owner = profile.id;
    const [settings, notifications] = await Promise.all([getDailyGoalSettings(owner).catch(() => null), readNotificationPermission().catch(() => null)]);
    if (request !== generation.current) return;
    // Shared with Daily goal, so that page opens already filled in.
    if (settings) rememberDailyGoal(settings);
    if (settings) setGoal({ owner, today: settings.today_goal_minutes, next: settings.pending ? settings.next_goal_minutes : null });
    setPermission(notifications);
  }, [profile.id]);
  useEffect(() => {
    let mounted = true;
    const cancel = afterTransition(() => { if (mounted) void load(); });
    const listener = AppState.addEventListener("change", state => { if (state === "active") void load(); });
    const requests = generation;
    return () => { mounted = false; cancel(); listener.remove(); requests.current++; };
  }, [load]);
  const sessionBlocksLogout = hasOpenSession || isRestoring || restoreError || actionBusy;
  const logout = async () => {
    if (lock.current || sessionBlocksLogout) return;
    lock.current = true; setBusy(true); setError("");
    try { const result = await signOut(); if (result.error) throw result.error; }
    catch { setError("Could not sign out. Check your connection and try again."); lock.current = false; setBusy(false); }
  };
  const goalValue = goal && goal.owner === profile.id ? `${goal.today} min${goal.next ? ` → ${goal.next}` : ""}` : `${profile.daily_goal_minutes} min`;
  return (
    <PersonalPage title="Settings" subtitle="" back animateTransition expandFromIcon fallback="/">
      <View style={s.account} accessible accessibilityLabel={`${profile.username}, ${user?.email ?? "signed in"}`}>
        <View style={s.avatar}><CharacterMark size={34} avatar={profile.avatar ?? "🌱"} /></View>
        <View style={p.flex}><Text style={s.name} numberOfLines={1}>{profile.username}</Text><Text style={p.caption} numberOfLines={1}>{user?.email ?? "Signed in"}</Text></View>
      </View>

      <SettingsGroup title="Focus">
        <SettingsRow first icon="flag-outline" title="Daily goal" value={goalValue} onPress={() => router.navigate("/settings-goal")} />
        <SettingsRow icon="time-outline" tint="#64D2FF" title="Sessions" value={duration.ready ? durationLabel(duration.selectedSeconds) : ""} onPress={() => router.navigate("/settings-sessions")} />
        {Platform.OS === "android" && <SettingsRow icon="shield-checkmark-outline" tint="#30D158" title="Session protection" onPress={() => router.navigate("/protection")} />}
      </SettingsGroup>

      <SettingsGroup title="Feel" footer={preferenceError ?? undefined}>
        <SettingsRow first icon="phone-portrait-outline" tint="#FF9F0A" title="Haptic feedback"
          toggle={{ value: hapticsEnabled, onChange: value => { setHapticsEnabled(value); setTapHapticsEnabled(value); if (value) tapHaptic(); } }} />
      </SettingsGroup>

      <SettingsGroup title="Squads" footer={stats.error || (!stats.online ? "Connect to the internet to change this." : stats.value === "private"
        ? "Squad mates see your picture, name, level and this week. Your all-time stats stay with you."
        : "Squad mates can see your all-time focus, sessions and finds on your player card.")}>
        <SettingsRow first icon="people-outline" tint="#2DD4A7" title="Share my stats with my squads" disabled={!stats.online || stats.busy || stats.value === null}
          toggle={{ value: stats.value !== "private", onChange: value => void stats.set(value ? "squads" : "private") }} />
      </SettingsGroup>

      <SettingsGroup title="Notifications">
        <SettingsRow first icon="notifications-outline" tint="#FF6961" title="Notifications" value={permission ? !permission.supported ? "Unavailable" : permission.granted ? "On" : "Off" : ""} onPress={() => router.navigate("/settings-notifications")} />
        <SettingsRow icon="calendar-outline" tint="#FF6961" title="Exam reminders" toggle={{ value: preferences.examReminders, onChange: value => void appPreferences.update({ examReminders: value }) }} />
      </SettingsGroup>

      <SettingsGroup title="Help">
        <SettingsRow first icon="information-circle-outline" tint="#64D2FF" title="How LifeRPG works" onPress={() => router.navigate("/guide")} />
      </SettingsGroup>

      <DeveloperTools />

      <SettingsGroup footer={sessionBlocksLogout ? "Finish or end your session before signing out." : "Your saved progress stays with your account."}>
        <SettingsRow first danger icon="log-out-outline" title="Sign out" onPress={() => { setError(""); setSigningOut(true); }} />
      </SettingsGroup>
      <DeleteAccount />
      {/* Support only: holding the version shares the on-phone session log. */}
      <Pressable onLongPress={() => { void readSessionTrail().then(log => Share.share({ message: log || "No session events yet." })).catch(() => {}); }} delayLongPress={800}
        accessible={false} haptic={false}><AppBuildInfo /></Pressable>

      <AppSheet label="Sign out" motionMode="timed" compact visible={signingOut} guardDismiss={busy} onRequestClose={() => { if (!busy) setSigningOut(false); }}
        header={<View style={p.sheetHeader}><Text style={p.title}>Sign out of LifeRPG?</Text></View>}>
        <BottomSheetScrollView contentContainerStyle={p.sheetBody}>
          <Text style={p.body}>{sessionBlocksLogout
            ? "Finish or end your current session before signing out. If restoration failed, return to Session and retry first."
            : "Your character, routines and saved sessions remain with your account. Sign in again to continue."}</Text>
          {unsyncedSessionCount > 0 && <Text style={p.body} accessibilityRole="alert">
            {unsyncedSessionCount === 1 ? "1 session is not confirmed yet." : `${unsyncedSessionCount} sessions are not confirmed yet.`} Unconfirmed sessions stay on this phone for this account. To confirm them, reconnect while signed in to this same account. If you sign out, sign back into this account first.
          </Text>}
          <PersonalButton title={busy ? "Signing out..." : "Sign out"} disabled={busy || sessionBlocksLogout} onPress={() => void logout()} />
          <PersonalButton secondary title="Keep me signed in" disabled={busy} onPress={() => setSigningOut(false)} />
          {!!error && <Text style={p.error} accessibilityRole="alert">{error}</Text>}
        </BottomSheetScrollView>
      </AppSheet>
    </PersonalPage>
  );
}
const s = StyleSheet.create({
  account: { ...edge, flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: radius.card - 4, backgroundColor: colors.surface },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  name: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "700" },
});
