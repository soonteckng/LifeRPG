import { Text } from "../components/AppText";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState, Platform, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import AppSheet from "../components/AppSheet";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { PersonalButton, PersonalPage, PersonalRow, p } from "../components/PersonalUI";
import { colors } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import { getDailyGoalSettings, missingGoalAPI, scheduleDailyGoal, type DailyGoalSettings } from "../services/dailyGoalService";
import { enableNotifications, readNotificationPermission, readExactAlarmAccess, type NotificationPermission } from "../services/notificationPermissionService";
import { parseDailyGoal, validateDailyGoal } from "../utils/dailyGoal";
import { dateKey } from "../utils/progressAnalytics";
import { getTodayProgress } from "../services/dailyProgressService";
import { openAlarmSettings, openNotificationSettings } from "../services/notificationPermissionService";
import { afterTransition } from "../utils/afterTransition";
import AppBuildInfo from "../components/AppBuildInfo";

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, hapticsEnabled, setHapticsEnabled, preferenceError } = useUser();
  const { user, signOut } = useAuth();
  const { hasOpenSession, isRestoring, restoreError, actionBusy, unsyncedSessionCount } = useTimer();
  const [sheet, setSheet] = useState<"signout" | "notifications" | "goal" | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [alarmAccess, setAlarmAccess] = useState<"allowed" | "not_allowed" | null>(null);
  const [loadedGoalData, setGoalData] = useState<DailyGoalSettings | null>(null);
  const goalData = loadedGoalData?.user_id === profile.id ? loadedGoalData : null;
  const [goalError, setGoalError] = useState("");
  const [savedTodayGoal, setSavedTodayGoal] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [savedGoal, setSavedGoal] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  const goalGeneration = useRef(0), permissionGeneration = useRef(0);
  const goalOwner = useRef(profile.id);
  useLayoutEffect(() => { goalOwner.current = profile.id; goalGeneration.current++; }, [profile.id]);
  const loadGoal = useCallback(async () => {
    const request = ++goalGeneration.current;
    setGoalData(null); setGoalError("Checking your latest goal schedule...");
    try {
      const data = await getDailyGoalSettings(profile.id);
      if (request === goalGeneration.current) { setGoalData(data); setGoalError(""); }
    } catch (failure) {
      // Stored daily targets remain authoritative even without the editing API.
      const today = await getTodayProgress(profile.timezone).catch(() => null);
      if (request === goalGeneration.current) {
        setSavedTodayGoal(today?.goal_minutes ?? null);
        setGoalData(null);
        setGoalError(missingGoalAPI(failure)
          ? "Goal settings are temporarily unavailable. Please try again later."
          : "Could not check your goal. Reconnect and try again.");
      }
    }
  }, [profile.id, profile.timezone]);
  const refreshPermission = useCallback(async () => {
    const request = ++permissionGeneration.current;
    const [result, alarm] = await Promise.all([readNotificationPermission(), readExactAlarmAccess?.() ?? Promise.resolve(null)]);
    if (request === permissionGeneration.current) { setPermission(result); setAlarmAccess(alarm); }
  }, []);
  useEffect(() => {
    let mounted = true;
    const cancelEntranceWork = afterTransition(() => { if (mounted) { void loadGoal(); void refreshPermission(); } });
    let localDay = dateKey(new Date(), profile.timezone);
    const tick = setInterval(() => {
      const next = dateKey(new Date(), profile.timezone);
      if (next !== localDay) { localDay = next; void loadGoal(); }
    }, 60_000);
    const listener = AppState.addEventListener("change", state => {
      if (state === "active") { void loadGoal(); void refreshPermission(); }
    });
    const cancelReads = () => { goalGeneration.current++; permissionGeneration.current++; };
    return () => { mounted = false; cancelEntranceWork(); clearInterval(tick); listener.remove(); cancelReads(); };
  }, [loadGoal, refreshPermission, profile.timezone]);
  const sessionBlocksLogout = hasOpenSession || isRestoring || restoreError || actionBusy;
  const logout = async () => {
    if (lock.current || sessionBlocksLogout) return;
    lock.current = true; setBusy(true); setError("");
    try { const result = await signOut(); if (result.error) throw result.error; }
    catch { setError("Could not sign out. Check your connection and try again."); lock.current = false; setBusy(false); }
  };
  const saveGoal = async () => {
    if (lock.current || !goalData?.scheduling_available || !goalData.weekly_limit_available || !goalData.can_change_goal || goalError) return;
    const minutes = parseDailyGoal(draft), validation = validateDailyGoal(minutes);
    if (validation) { setError(validation); return; }
    lock.current = true; setBusy(true); setError("");
    const request = goalGeneration.current, owner = profile.id;
    try {
      const result = await scheduleDailyGoal(minutes, profile.id);
      if (request !== goalGeneration.current || owner !== goalOwner.current) return;
      goalGeneration.current++; setGoalData(result); setGoalError("");
      setSavedGoal(`Your ${result.next_goal_minutes}-minute goal starts on ${result.next_effective_date} in ${result.timezone}. Today's target and previous achievements stay unchanged.`);
    } catch (failure) {
      if (owner !== goalOwner.current) return;
      setGoalData(null);
      if (missingGoalAPI(failure)) {
        setGoalData(null);
        setGoalError("Goal settings are temporarily unavailable. Please try again later.");
      } else { setGoalError("Check your latest goal schedule before trying again."); setError("Could not schedule or confirm your goal change. A delayed change may still arrive. Check the current schedule before choosing another goal."); }
      void loadGoal();
    }
    finally { lock.current = false; setBusy(false); }
  };
  const notificationAction = async () => {
    if (lock.current || !permission?.action) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (permission.action === "enable") {
        const request = ++permissionGeneration.current;
        const result = await enableNotifications();
        if (request === permissionGeneration.current) setPermission(result);
        else await refreshPermission();
      } else if (permission.action === "settings") await openNotificationSettings();
      else await refreshPermission();
    } catch { setError("Could not update notification permission. Try again or check your phone settings."); }
    finally { lock.current = false; setBusy(false); }
  };
  const open = (next: typeof sheet) => {
    if (lock.current) return;
    setError(""); setSheet(next);
    if (next === "goal") { setDraft(String(goalData?.next_goal_minutes ?? profile.daily_goal_minutes)); setSavedGoal(""); void loadGoal(); }
    if (next === "notifications") void refreshPermission();
  };
  const canEditGoal = !!goalData?.scheduling_available && goalData.weekly_limit_available && goalData.can_change_goal && !goalError;
  const goalAvailability = goalData?.scheduling_available && goalData.weekly_limit_available && goalData.next_change_at && !goalData.can_change_goal
    ? `You can change your goal again on ${new Intl.DateTimeFormat(undefined, { timeZone: profile.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(goalData.next_change_at))}.`
    : "Goal settings are temporarily unavailable. Please try again later.";
  const goalSummary = goalData
    ? `Today: ${goalData.today_goal_minutes} min${goalData.pending ? ` · ${goalData.next_goal_minutes} min from ${goalData.next_effective_date}` : ""}`
    : `Today: ${savedTodayGoal ?? profile.daily_goal_minutes} min`;
  return (
    <PersonalPage title="Settings" subtitle="Make LifeRPG feel right for you." back animateTransition expandFromIcon>
      <View style={sectionStyle}>
        <Text style={p.label}>Account</Text>
      <PersonalRow icon="person-circle-outline" title={profile.username} subtitle={user?.email ?? "Signed in"} />
        <View style={p.divider} />
      </View>
      <View style={sectionStyle}>
        <Text style={p.label}>Goals & feedback</Text>
        <PersonalRow icon="flag-outline" title="Daily goal" subtitle={goalSummary} onPress={() => open("goal")} />
        {!canEditGoal && <Text style={p.caption}>{goalError || (goalData ? goalAvailability : "Checking whether goal editing is available...")}</Text>}
        <View style={p.divider} />
        <PersonalRow icon="phone-portrait-outline" title="Haptic feedback" subtitle="Gentle feedback when you interact"
          trailing={<Switch accessibilityLabel="Haptic feedback" value={hapticsEnabled} onValueChange={setHapticsEnabled} trackColor={{ false: colors.selection, true: colors.accentFill }} />} />
        {preferenceError && <Text style={p.error}>{preferenceError}</Text>}
        <Text style={p.caption}>Haptic preferences are saved for your account on this device. Phone notification settings control alert sounds.</Text>
      </View>
      <View style={sectionStyle}>
        <Text style={p.label}>Help & notifications</Text>
        <PersonalRow icon="notifications-outline" title="Notifications" subtitle={permission?.label ?? "Checking permission..."} onPress={() => open("notifications")} />
        <View style={p.divider} />
        <PersonalRow icon="information-circle-outline" title="How LifeRPG works" subtitle="Sessions, growth, goals and consistency" onPress={() => router.navigate("./guide")} />
        {Platform.OS === "android" && <PersonalRow icon="shield-checkmark-outline" title="Session protection" subtitle="Choose which apps stay available during a session" onPress={() => router.navigate("./protection")} />}
      </View>

      <View style={sectionStyle}>
        <Text style={p.label}>Session access</Text>
        <PersonalRow icon="log-out-outline" title="Sign out"
          subtitle={sessionBlocksLogout ? "Finish or end your session first" : "Your saved progress stays with your account"} onPress={() => open("signout")} />
      </View>
      <Text style={p.caption}>LifeRPG · Your effort, reflected. Character attributes describe recorded practice and consistency.</Text>
      <AppBuildInfo />
      <AppSheet label={sheet === "signout" ? "Sign out" : sheet === "goal" ? "Daily goal" : "Notifications"}
        motionMode="timed" compact
        visible={sheet !== null} guardDismiss={busy} onRequestClose={() => { if (!busy) setSheet(null); }}
        header={<View style={p.sheetHeader}><Text style={p.title}>{sheet === "signout" ? "Sign out of LifeRPG?" : sheet === "goal" ? "Daily goal" : "Session notifications"}</Text></View>}>
        <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={p.sheetBody}>
          {sheet === "signout" ? <>
            <Text style={p.body}>{sessionBlocksLogout
              ? "Finish or end your current session before signing out. If restoration failed, return to Session and retry first."
              : "Your character, routines and saved sessions remain with your account. Sign in again to continue."}</Text>
            {unsyncedSessionCount > 0 && <Text style={p.body} accessibilityRole="alert">
              {unsyncedSessionCount === 1 ? "1 session is not confirmed yet." : `${unsyncedSessionCount} sessions are not confirmed yet.`} Unconfirmed sessions stay on this phone for this account. To confirm them, reconnect while signed in to this same account. If you sign out, sign back into this account first.
            </Text>}
            <PersonalButton title={busy ? "Signing out..." : "Sign out"} disabled={busy || sessionBlocksLogout} onPress={() => void logout()} />
            <PersonalButton secondary title="Keep me signed in" disabled={busy} onPress={() => setSheet(null)} />
          </> : sheet === "goal" ? <>
            {!!savedGoal && <Text style={p.body} accessibilityRole="alert">{savedGoal}</Text>}
            {!canEditGoal ? <Text style={p.body} accessibilityRole="alert">{goalError || goalAvailability}</Text>
              : !goalData ? <Text style={p.body}>Loading your goal...</Text> : <>
                <Text style={p.body}>Today: {goalData.today_goal_minutes} minutes. Changes start on {goalData.next_effective_date} in {goalData.timezone}.</Text>
                <Text style={p.body}>The target for today and historical achievements stay unchanged. Editing a goal does not award or remove rewards or streaks.</Text>
                <Text style={p.body}>Choose at least 30 minutes per day. You can change this once every seven days.</Text>
                <BottomSheetTextInput accessibilityLabel="Daily goal in minutes" style={p.input} keyboardType="number-pad"
                  value={draft} onChangeText={value => { setDraft(value); setSavedGoal(""); }} editable={!busy} maxLength={3}
                  placeholder="Minutes (30-480)" placeholderTextColor={colors.muted} />
                <PersonalButton title={busy ? "Saving..." : "Save daily goal"} disabled={busy || !!savedGoal} onPress={() => void saveGoal()} />
              </>}
            {!!goalError && <PersonalButton secondary title="Retry goal check" disabled={busy} onPress={() => void loadGoal()} />}
          </> : <>
            <Text style={p.body} accessibilityRole="alert">{permission?.label ?? "Checking permission..."}</Text>
            <Text style={p.body}>Routine reminders use notification permission only. Usage Access and Display over other apps are separate, optional permissions for app protection.</Text>
            {alarmAccess && <Text style={p.body}>{alarmAccess === "allowed"
              ? "Precise timer alerts are allowed on this device."
              : "Precise timer alerts are off. Your timer still works; finish alerts may arrive later. Alarms & reminders is optional for more precise alerts."}</Text>}
            {Platform.OS === "android" && Number(Platform.Version) >= 31 && <>
              <Text style={p.body}>Alarms & reminders improves the timing of session alerts. Routine reminders still work without this extra access, though Android may deliver them later.</Text>
              <PersonalButton title="Alarms & reminders" accessibilityLabel="Open Alarms & reminders" onPress={() => { void openAlarmSettings().catch(() => setError("Couldn’t open Alarms & reminders. Open your phone’s app settings to check it.")); }} />
              <Text style={p.body}>{permission?.supported ? "These buttons open LifeRPG’s own permission pages. Return here after changing a setting. Your phone controls how its Settings screens look." : "Test background alerts with an installed LifeRPG build; Expo Go cannot verify this app’s alarm access."}</Text>
            </>}
            {permission?.supported && <Text style={p.body}>Phone permissions control whether session alerts can appear. Permission being allowed does not guarantee delivery; phone settings and battery restrictions can affect alerts.</Text>}
            {permission?.action && <PersonalButton title={busy ? "Please wait..." : permission.action === "enable" ? "Enable notifications" : permission.action === "settings" ? "Open phone settings" : "Retry permission check"}
              disabled={busy} onPress={() => void notificationAction()} />}
            {!permission?.supported && <PersonalButton title="Notification settings" accessibilityLabel="Open phone notification settings" onPress={() => { void openNotificationSettings().catch(() => setError("Couldn’t open phone settings.")); }} />}
          </>}
          {!!error && <Text style={p.error} accessibilityRole="alert">{error}</Text>}
        </BottomSheetScrollView>
      </AppSheet>
    </PersonalPage>
  );
}

const sectionStyle = { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 4 };
