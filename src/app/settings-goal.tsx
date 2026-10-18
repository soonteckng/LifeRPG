import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState, TextInput, View } from "react-native";
import { Text } from "../components/AppText";
import { PersonalButton, PersonalPage, p } from "../components/PersonalUI";
import { SettingsGroup, SettingsRow } from "../components/SettingsList";
import { colors } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { getDailyGoalSettings, missingGoalAPI, scheduleDailyGoal, type DailyGoalSettings } from "../services/dailyGoalService";
import { getTodayProgress } from "../services/dailyProgressService";
import { parseDailyGoal, validateDailyGoal } from "../utils/dailyGoal";
import { dateKey } from "../utils/progressAnalytics";
import { afterTransition } from "../utils/afterTransition";

/** Settings › Daily goal: today's target and a change that starts tomorrow. */
export default function GoalSettingsScreen() {
  const { profile } = useUser();
  const [loadedGoalData, setGoalData] = useState<DailyGoalSettings | null>(null);
  const goalData = loadedGoalData?.user_id === profile.id ? loadedGoalData : null;
  const [goalError, setGoalError] = useState("");
  const [savedTodayGoal, setSavedTodayGoal] = useState<number | null>(null);
  const [draft, setDraft] = useState(String(profile.daily_goal_minutes));
  const [edited, setEdited] = useState(false);
  const [savedGoal, setSavedGoal] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), goalGeneration = useRef(0), goalOwner = useRef(profile.id);
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
        setGoalError(missingGoalAPI(failure) ? "Goal settings are temporarily unavailable. Please try again later." : "Could not check your goal. Reconnect and try again.");
      }
    }
  }, [profile.id, profile.timezone]);
  useEffect(() => {
    let mounted = true;
    const cancel = afterTransition(() => { if (mounted) void loadGoal(); });
    let localDay = dateKey(new Date(), profile.timezone);
    const tick = setInterval(() => { const next = dateKey(new Date(), profile.timezone); if (next !== localDay) { localDay = next; void loadGoal(); } }, 60_000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") void loadGoal(); });
    const requests = goalGeneration;
    return () => { mounted = false; cancel(); clearInterval(tick); listener.remove(); requests.current++; };
  }, [loadGoal, profile.timezone]);
  if (goalData && !edited && draft !== String(goalData.next_goal_minutes)) setDraft(String(goalData.next_goal_minutes));
  const canEditGoal = !!goalData?.scheduling_available && goalData.weekly_limit_available && goalData.can_change_goal && !goalError;
  const goalAvailability = goalData?.scheduling_available && goalData.weekly_limit_available && goalData.next_change_at && !goalData.can_change_goal
    ? `You can change your goal again on ${new Intl.DateTimeFormat(undefined, { timeZone: profile.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(goalData.next_change_at))}.`
    : "Goal settings are temporarily unavailable. Please try again later.";
  const saveGoal = async () => {
    if (lock.current || !canEditGoal || !goalData) return;
    const minutes = parseDailyGoal(draft), validation = validateDailyGoal(minutes);
    if (validation) { setError(validation); return; }
    lock.current = true; setBusy(true); setError("");
    const request = goalGeneration.current, owner = profile.id;
    try {
      const result = await scheduleDailyGoal(minutes, profile.id);
      if (request !== goalGeneration.current || owner !== goalOwner.current) return;
      goalGeneration.current++; setGoalData(result); setGoalError(""); setEdited(false);
      setSavedGoal(`Your ${result.next_goal_minutes}-minute goal starts on ${result.next_effective_date} in ${result.timezone}. Today's target and previous achievements stay unchanged.`);
    } catch (failure) {
      if (owner !== goalOwner.current) return;
      setGoalData(null);
      if (missingGoalAPI(failure)) setGoalError("Goal settings are temporarily unavailable. Please try again later.");
      else { setGoalError("Check your latest goal schedule before trying again."); setError("Could not schedule or confirm your goal change. A delayed change may still arrive. Check the current schedule before choosing another goal."); }
      void loadGoal();
    } finally { lock.current = false; setBusy(false); }
  };
  const today = goalData?.today_goal_minutes ?? savedTodayGoal ?? profile.daily_goal_minutes;
  return <PersonalPage title="Daily goal" subtitle="" back animateTransition fallback="/settings">
    <SettingsGroup title="Now">
      <SettingsRow first icon="today-outline" title="Today" value={`${today} min`} />
      {goalData?.pending && <SettingsRow icon="calendar-outline" title={`From ${goalData.next_effective_date}`} value={`${goalData.next_goal_minutes} min`} />}
    </SettingsGroup>
    <SettingsGroup title="Change your goal" footer="Changes start tomorrow, in your time zone. Today’s target, your streak and past achievements stay as they are. You can change it once every seven days.">
      <View style={{ padding: 14, gap: 12 }}>
        {!canEditGoal ? <Text style={p.body} accessibilityRole="alert">{goalError || (goalData ? goalAvailability : "Checking whether goal editing is available...")}</Text> : <>
          <Text style={p.caption}>Minutes per day, from 30 to 480.</Text>
          <TextInput accessibilityLabel="Daily goal in minutes" style={p.input} keyboardType="number-pad" value={draft} editable={!busy} maxLength={3}
            onChangeText={value => { setDraft(value); setEdited(true); setSavedGoal(""); setError(""); }} placeholder="Minutes (30-480)" placeholderTextColor={colors.muted} />
          <PersonalButton title={busy ? "Saving..." : "Save daily goal"} disabled={busy || !!savedGoal} onPress={() => void saveGoal()} />
        </>}
        {!!savedGoal && <Text style={p.body} accessibilityRole="alert">{savedGoal}</Text>}
        {!!error && <Text style={p.error} accessibilityRole="alert">{error}</Text>}
        {!!goalError && !goalData && <PersonalButton secondary title="Retry goal check" disabled={busy} onPress={() => void loadGoal()} />}
      </View>
    </SettingsGroup>
  </PersonalPage>;
}
