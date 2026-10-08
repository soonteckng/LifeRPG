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
  const [data, setData] = useState<DailyGoalSettings | null>(null), [draft, setDraft] = useState(""), [error, setError] = useState(""), [saved, setSaved] = useState(false), [busy, setBusy] = useState(false);
  const generation = useRef(0), lock = useRef(false);
  const [unavailable, setUnavailable] = useState(false);
  const load = useCallback(async () => {
    const current = ++generation.current; setError(""); setUnavailable(false); setData(null);
    try { const next = await getDailyGoalSettings(); if (current === generation.current) { setData(next); setDraft(String(next.next_goal_minutes)); } }
    catch (failure) { if (current === generation.current) { setData(null); setUnavailable(missingGoalAPI(failure)); setError(missingGoalAPI(failure) ? "Goal changes aren’t available yet. Your current goal stays the same." : "Couldn’t check your goal. Please try again."); } }
  }, []);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active && visible) { setSaved(false); void load(); } });
    return () => { active = false; invalidate(); };
  }, [visible, load, invalidate]);
  const canSave = !!data?.scheduling_available && data.weekly_limit_available && data.can_change_goal && !saved;
  const save = async () => {
    if (lock.current || !canSave) return;
    const validation = validateDailyGoal(parseDailyGoal(draft)); if (validation) { setError(validation); return; }
    lock.current = true; setBusy(true); setError(""); const current = generation.current;
    try { const result = await scheduleDailyGoal(parseDailyGoal(draft)); if (current === generation.current) { setData(result); setSaved(true); onSaved(); } }
    catch { if (current === generation.current) { setError("Couldn’t save your goal. Your current goal is unchanged. Please retry."); void load(); } }
    finally { lock.current = false; setBusy(false); }
  };
  return <AppSheet visible={visible} onRequestClose={() => { if (!busy) onClose(); }} guardDismiss={busy} expanded heightRatio={0.62} keyboardBehavior="fillParent" motionMode="timed" label="daily focus goal"
    header={<Text style={[p.title, { paddingHorizontal: 20, paddingBottom: 12 }]}>Your daily focus goal</Text>}
    footer={<View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 12, backgroundColor: colors.surface }}><TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy || !canSave, busy }} disabled={busy || !canSave} onPress={() => void save()} style={[p.button, (busy || !canSave) && { opacity: 0.45 }]}><Text style={p.buttonText}>{busy ? "Saving…" : saved ? "Goal saved" : "Save daily goal"}</Text></TouchableOpacity></View>}>
    <BottomSheetScrollView enableFooterMarginAdjustment contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={p.body}>Today: {data?.today_goal_minutes ?? todayGoalMinutes ?? profile.daily_goal_minutes} minutes.</Text>
      <Text style={p.body}>Choose 30–480 minutes a day. Change your goal once every seven days. A new goal starts tomorrow, so today’s target and earned progress stay intact.</Text>
      {data && <Text style={p.caption}>{saved || data.pending ? `${data.next_goal_minutes} minutes from ${data.next_effective_date}.` : data.can_change_goal ? "Choose a steady, realistic amount of time." : data.next_change_at ? `Next change: ${new Intl.DateTimeFormat(undefined, { timeZone: profile.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(data.next_change_at))}.` : "Goal editing is not available yet."}</Text>}
      {canSave && <BottomSheetTextInput accessibilityLabel="Daily focus goal in minutes" style={p.input} keyboardType="number-pad" value={draft} onChangeText={setDraft} editable={!busy} maxLength={3} />}
      {!!error && <><Text style={p.error} accessibilityRole="alert">{error}</Text>{!unavailable && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void load()}><Text style={p.rowTitle}>Retry goal check</Text></TouchableOpacity>}</>}
    </BottomSheetScrollView>
  </AppSheet>;
}
