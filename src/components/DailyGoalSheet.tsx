import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput, TouchableOpacity } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import { Text } from "./AppText";
import { p } from "./PersonalUI";
import { useUser } from "../context/UserContext";
import { getDailyGoalSettings, missingGoalAPI, scheduleDailyGoal, type DailyGoalSettings } from "../services/dailyGoalService";
import { parseDailyGoal, validateDailyGoal } from "../utils/dailyGoal";
import { colors } from "../constants/theme";
export default function DailyGoalSheet({ visible, onClose, onSaved, todayGoalMinutes }: { visible: boolean; onClose: () => void; onSaved: () => void; todayGoalMinutes?: number }) {
  const { profile } = useUser(), insets = useSafeAreaInsets();
  const [loadedData, setData] = useState<DailyGoalSettings | null>(null), [draft, setDraft] = useState(""), [error, setError] = useState(""), [saved, setSaved] = useState(false), [busy, setBusy] = useState(false);
  const data = loadedData?.user_id === profile.id ? loadedData : null;
  const [needsCheck, setNeedsCheck] = useState(false);
  const generation = useRef(0), lock = useRef(false);
  const [unavailable, setUnavailable] = useState(false);
  const load = useCallback(async () => {
    const current = ++generation.current; setError(""); setUnavailable(false); setData(null);
    try { const next = await getDailyGoalSettings(profile.id); if (current === generation.current) { setData(next); setDraft(String(next.next_goal_minutes)); setNeedsCheck(false); } }
    catch (failure) { if (current === generation.current) { setData(null); setUnavailable(missingGoalAPI(failure)); setError(missingGoalAPI(failure) ? "Goal settings are temporarily unavailable. Please try again later." : "Couldn’t check your goal. Please try again."); } }
  }, [profile.id]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active && visible) { setSaved(false); void load(); } });
    return () => { active = false; invalidate(); };
  }, [visible, load, invalidate]);
  const canSave = !!data?.scheduling_available && data.weekly_limit_available && data.can_change_goal && !saved && !needsCheck;
  const save = async () => {
    if (lock.current || !canSave) return;
    const validation = validateDailyGoal(parseDailyGoal(draft)); if (validation) { setError(validation); return; }
    lock.current = true; setBusy(true); setNeedsCheck(true); setError(""); const current = generation.current;
    try { const result = await scheduleDailyGoal(parseDailyGoal(draft), profile.id); if (current === generation.current) { setData(result); setNeedsCheck(false); setSaved(true); onSaved(); } }
    catch {
      // A lost reply can follow a successful write. Read the ledger before
      // offering another save; do not tell the user the write never happened.
      if (current === generation.current) {
        try {
          const checked = await getDailyGoalSettings(profile.id);
          if (current === generation.current) { setData(checked); setNeedsCheck(false); setError("We checked your goal after a connection problem. Your latest schedule is shown below. A delayed change may still arrive; check again before choosing another goal."); }
        } catch { if (current === generation.current) setError("Couldn’t confirm your goal change. Reconnect and check its status before trying again."); }
      }
    }
    finally { lock.current = false; setBusy(false); }
  };
  return <AppSheet visible={visible} onRequestClose={() => { if (!busy) onClose(); }} guardDismiss={busy} expanded heightRatio={0.5} keyboardBehavior="fillParent" motionMode="timed" label="daily goal"
    header={<Text style={[p.title, { paddingHorizontal: 20, paddingBottom: 12 }]}>Your daily goal</Text>}
    footer={<View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 12, backgroundColor: colors.surface }}><TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy || !canSave, busy }} disabled={busy || !canSave} onPress={() => void save()} style={[p.button, (busy || !canSave) && { opacity: 0.45 }]}><Text style={p.buttonText}>{busy ? "Saving…" : saved ? "Goal saved" : "Save daily goal"}</Text></TouchableOpacity></View>}>
    <BottomSheetScrollView enableFooterMarginAdjustment contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={p.body}>Today: {data?.today_goal_minutes ?? todayGoalMinutes ?? profile.daily_goal_minutes} minutes.</Text>
      <Text style={p.body}>Choose 30–480 minutes a day. Change your goal once every seven days. A new goal starts tomorrow, so today’s target and earned progress stay intact.</Text>
      {data && <Text style={p.caption}>{saved || data.pending ? `${data.next_goal_minutes} minutes from ${data.next_effective_date}. ` : ""}{!data.scheduling_available || !data.weekly_limit_available ? "Goal changes are temporarily unavailable. Please try again later." : data.can_change_goal ? "Choose a steady, realistic amount of time." : data.next_change_at ? `Next change: ${new Intl.DateTimeFormat(undefined, { timeZone: profile.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(data.next_change_at))}.` : "Finish setup before changing your goal."}</Text>}
      {(canSave || (busy && data?.can_change_goal)) && <BottomSheetTextInput accessibilityLabel="Daily goal in minutes" style={p.input} keyboardType="number-pad" value={draft} onChangeText={setDraft} editable={!busy} maxLength={3} />}
      {!!error && <><Text style={p.error} accessibilityRole="alert">{error}</Text>{!unavailable && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void load()}><Text style={p.rowTitle}>Retry goal check</Text></TouchableOpacity>}</>}
    </BottomSheetScrollView>
  </AppSheet>;
}
