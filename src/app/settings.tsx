import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import AppSheet from "../components/AppSheet";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { PersonalButton, PersonalPage, PersonalRow, p } from "../components/PersonalUI";
import { colors } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import { getDailyGoalSettings, missingGoalAPI, scheduleDailyGoal, type DailyGoalSettings } from "../services/dailyGoalService";
import { enableNotifications, readNotificationPermission, type NotificationPermission } from "../services/notificationPermissionService";
import { parseDailyGoal, validateDailyGoal } from "../utils/dailyGoal";
import { dateKey } from "../utils/progressAnalytics";
import { getTodayProgress } from "../services/dailyProgressService";

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, soundEnabled, setSoundEnabled, hapticsEnabled, setHapticsEnabled, preferenceError } = useUser();
  const { user, signOut } = useAuth();
  const { hasOpenSession, isRestoring, restoreError, actionBusy } = useTimer();
  const [sheet, setSheet] = useState<"signout" | "notifications" | "goal" | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [goalData, setGoalData] = useState<DailyGoalSettings | null>(null);
  const [goalError, setGoalError] = useState("");
  const [savedTodayGoal, setSavedTodayGoal] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [savedGoal, setSavedGoal] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  const goalGeneration = useRef(0), permissionGeneration = useRef(0);
  const loadGoal = useCallback(async () => {
    const request = ++goalGeneration.current;
    try {
      const data = await getDailyGoalSettings();
      if (request === goalGeneration.current) { setGoalData(data); setGoalError(""); }
    } catch (failure) {
      // Stored daily targets remain authoritative even without the editing API.
      const today = await getTodayProgress(profile.timezone).catch(() => null);
      if (request === goalGeneration.current) {
        setSavedTodayGoal(today?.goal_minutes ?? null);
        setGoalData(null);
        setGoalError(missingGoalAPI(failure)
          ? "Your daily goal is read-only. Goal changes are not available yet."
          : "Could not check goal editing availability. Your current goal is unchanged.");
      }
    }
  }, [profile.timezone]);
  const refreshPermission = useCallback(async () => {
    const request = ++permissionGeneration.current;
    const result = await readNotificationPermission();
    if (request === permissionGeneration.current) setPermission(result);
  }, []);
  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) { void loadGoal(); void refreshPermission(); } });
    let localDay = dateKey(new Date(), profile.timezone);
    const tick = setInterval(() => {
      const next = dateKey(new Date(), profile.timezone);
      if (next !== localDay) { localDay = next; void loadGoal(); }
    }, 60_000);
    const listener = AppState.addEventListener("change", state => {
      if (state === "active") { void loadGoal(); void refreshPermission(); }
    });
    const cancelReads = () => { goalGeneration.current++; permissionGeneration.current++; };
    return () => { mounted = false; clearInterval(tick); listener.remove(); cancelReads(); };
  }, [loadGoal, refreshPermission, profile.timezone]);
  const sessionBlocksLogout = hasOpenSession || isRestoring || restoreError || actionBusy;
  const logout = async () => {
    if (lock.current || sessionBlocksLogout) return;
    lock.current = true; setBusy(true); setError("");
    try { const result = await signOut(); if (result.error) throw result.error; }
    catch { setError("Could not sign out. Check your connection and try again."); lock.current = false; setBusy(false); }
  };
  const saveGoal = async () => {
    if (lock.current || !goalData?.scheduling_available || goalError) return;
    const minutes = parseDailyGoal(draft), validation = validateDailyGoal(minutes);
    if (validation) { setError(validation); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await scheduleDailyGoal(minutes);
      goalGeneration.current++; setGoalData(result); setGoalError("");
      setSavedGoal(`Your ${result.next_goal_minutes}-minute goal starts on ${result.next_effective_date} in ${result.timezone}. Today's target and previous achievements stay unchanged.`);
    } catch (failure) {
      if (missingGoalAPI(failure)) {
        setGoalData(null);
        setGoalError("Your daily goal is read-only. Goal changes are not available yet.");
      } else setError("Could not schedule your goal. Your current goal is unchanged. Check your connection and try again later.");
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
      } else if (permission.action === "settings") await Linking.openSettings();
      else await refreshPermission();
    } catch { setError("Could not update notification permission. Try again or check your phone settings."); }
    finally { lock.current = false; setBusy(false); }
  };
  const open = (next: typeof sheet) => {
    if (lock.current) return;
    if (next === "goal" && (!goalData?.scheduling_available || goalError)) return;
    setError(""); setSheet(next);
    if (next === "goal") { setDraft(String(goalData?.next_goal_minutes ?? profile.daily_goal_minutes)); setSavedGoal(""); void loadGoal(); }
    if (next === "notifications") void refreshPermission();
  };
  const canEditGoal = !!goalData?.scheduling_available && !goalError;
  const goalSummary = goalData
    ? `Today: ${goalData.today_goal_minutes} min${goalData.pending ? ` · ${goalData.next_goal_minutes} min from ${goalData.next_effective_date}` : ""}`
    : `Today: ${savedTodayGoal ?? profile.daily_goal_minutes} min`;
  return (
    <PersonalPage title="Settings" subtitle="Make focus feel right for you." back animateTransition>
      <View style={p.card}>
        <Text style={p.label}>ACCOUNT</Text>
        <PersonalRow icon="person-circle-outline" title={profile.username} subtitle={user?.email ?? "Signed in"} />
        <PersonalRow icon="create-outline" title="Edit profile" subtitle="Your name and character badge" onPress={() => router.navigate("/profile")} />
        <View style={p.divider} />
        <PersonalRow icon="globe-outline" title="Progress time zone" subtitle={profile.timezone} />
      </View>
      <View style={[p.card, { borderColor: colors.line }]}>
        <Text style={p.label}>SESSION ACCESS</Text>
        <PersonalRow icon="log-out-outline" title="Sign out"
          subtitle={sessionBlocksLogout ? "Finish or end your session first" : "Your saved progress stays with your account"} onPress={() => open("signout")} />
      </View>
      <View style={p.card}>
        <Text style={p.label}>FOCUS & FEEDBACK</Text>
        <PersonalRow icon="flag-outline" title="Daily focus goal" subtitle={goalSummary} onPress={canEditGoal ? () => open("goal") : undefined} />
        {!canEditGoal && <Text style={p.caption}>{goalError || (goalData ? "Your daily goal is read-only. Goal changes are not available yet." : "Checking whether goal editing is available...")}</Text>}
        <View style={p.divider} />
        <PersonalRow icon="volume-medium-outline" title="Completion sound" subtitle="Sound for the session notification"
          trailing={<Switch accessibilityLabel="Completion sound" value={soundEnabled} onValueChange={setSoundEnabled} trackColor={{ false: "#343B4E", true: colors.accentFill }} />} />
        <View style={p.divider} />
        <PersonalRow icon="phone-portrait-outline" title="Haptic feedback" subtitle="Gentle feedback when you interact"
          trailing={<Switch accessibilityLabel="Haptic feedback" value={hapticsEnabled} onValueChange={setHapticsEnabled} trackColor={{ false: "#343B4E", true: colors.accentFill }} />} />
        {preferenceError && <Text style={p.error}>{preferenceError}</Text>}
        <Text style={p.caption}>These preferences are saved for your account on this device. Sound changes apply when the next session alert is scheduled. Phone notification settings can override sound.</Text>
      </View>
      <View style={p.card}>
        <Text style={p.label}>YOUR EXPERIENCE</Text>
        <PersonalRow icon="notifications-outline" title="Notifications" subtitle={permission?.label ?? "Checking permission..."} onPress={() => open("notifications")} />
        <View style={p.divider} />
        <PersonalRow icon="compass-outline" title="Replay the introduction" subtitle="Sessions, growth, goals and rewards" onPress={() => router.navigate("/tutorial")} />
      </View>

      <Text style={p.caption}>LifeRPG · Your effort, reflected. Character attributes describe recorded practice and consistency.</Text>
      <AppSheet label={sheet === "signout" ? "Sign out" : sheet === "goal" ? "Daily focus goal" : "Notifications"}
        visible={sheet !== null} guardDismiss={busy} onRequestClose={() => { if (!busy) setSheet(null); }}
        header={<View style={p.sheetHeader}><Text style={p.title}>{sheet === "signout" ? "Sign out of LifeRPG?" : sheet === "goal" ? "Daily focus goal" : "Session notifications"}</Text></View>}>
        <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={p.sheetBody}>
          {sheet === "signout" ? <>
            <Text style={p.body}>{sessionBlocksLogout
              ? "Finish or end your current session before signing out. If restoration failed, return to Session and retry first."
              : "Your character, quests and saved sessions remain with your account. Sign in again to continue."}</Text>
            <PersonalButton title={busy ? "Signing out..." : "Sign out"} disabled={busy || sessionBlocksLogout} onPress={() => void logout()} />
            <PersonalButton secondary title="Keep me signed in" disabled={busy} onPress={() => setSheet(null)} />
          </> : sheet === "goal" ? <>
            {!canEditGoal ? <Text style={p.body} accessibilityRole="alert">{goalError || "Goal editing is currently unavailable. Your current goal is unchanged."}</Text>
              : !goalData ? <Text style={p.body}>Loading your goal...</Text> : <>
                <Text style={p.body}>Today: {goalData.today_goal_minutes} minutes. Changes start on {goalData.next_effective_date} in {goalData.timezone}.</Text>
                <Text style={p.body}>The target for today and historical achievements stay unchanged. Editing a goal does not award or remove rewards or streaks.</Text>
                <BottomSheetTextInput accessibilityLabel="Daily focus goal in minutes" style={p.input} keyboardType="number-pad"
                  value={draft} onChangeText={value => { setDraft(value); setSavedGoal(""); }} editable={!busy} maxLength={3}
                  placeholder="Minutes (15-480)" placeholderTextColor={colors.muted} />
                {!!savedGoal && <Text style={p.body} accessibilityRole="alert">{savedGoal}</Text>}
                <PersonalButton title={busy ? "Saving..." : "Save daily goal"} disabled={busy || !!savedGoal} onPress={() => void saveGoal()} />
              </>}
          </> : <>
            <Text style={p.body} accessibilityRole="alert">{permission?.label ?? "Checking permission..."}</Text>
            {permission?.supported && <Text style={p.body}>Phone permissions control whether session alerts can appear. Permission being allowed does not guarantee delivery; phone settings and battery restrictions can affect alerts.</Text>}
            {permission?.action && <PersonalButton title={busy ? "Please wait..." : permission.action === "enable" ? "Enable notifications" : permission.action === "settings" ? "Open phone settings" : "Retry permission check"}
              disabled={busy} onPress={() => void notificationAction()} />}
          </>}
          {!!error && <Text style={p.error} accessibilityRole="alert">{error}</Text>}
        </BottomSheetScrollView>
      </AppSheet>
    </PersonalPage>
  );
}
