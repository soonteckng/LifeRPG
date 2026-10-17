import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput, TouchableOpacity } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import { Text } from "./AppText";
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
  const checking = !data && !error;
  const todayMinutes = data?.today_goal_minutes ?? todayGoalMinutes ?? profile.daily_goal_minutes;
  const editable = canSave || (busy && !!data?.can_change_goal);
  const step = (delta: number) => {
    if (!editable || busy) return;
    const current = parseDailyGoal(draft);
    const base = Number.isFinite(current) ? current : todayMinutes ?? 60;
    setDraft(String(Math.min(480, Math.max(30, Math.round((base + delta) / 15) * 15)))); setError("");
  };
  const status = data ? `${saved || data.pending ? `${data.next_goal_minutes} minutes from ${data.next_effective_date}. ` : ""}${!data.scheduling_available || !data.weekly_limit_available ? "Goal changes are temporarily unavailable. Please try again later." : data.can_change_goal ? "Choose a steady, realistic amount of time." : data.next_change_at ? `Next change: ${new Intl.DateTimeFormat(undefined, { timeZone: profile.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(data.next_change_at))}.` : "Finish setup before changing your goal."}` : "";
  return <AppSheet visible={visible} onRequestClose={() => { if (!busy) onClose(); }} guardDismiss={busy} expanded heightRatio={0.62} keyboardBehavior="fillParent" motionMode="timed" label="daily goal"
    header={<View style={g.header}><Text style={g.title}>Daily goal</Text><Text style={g.subtitle}>Today: {todayMinutes} minutes.</Text></View>}
    footer={<View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 12, backgroundColor: colors.surfaceRaised }}><TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy || !canSave, busy: busy || checking }} disabled={busy || !canSave} onPress={() => void save()} style={[g.button, (busy || !canSave) && !checking && { opacity: 0.45 }, checking && g.buttonChecking]}><Text style={[g.buttonText, checking && g.buttonTextChecking]}>{busy ? "Saving…" : saved ? "Goal saved" : checking ? "Checking your goal…" : "Save daily goal"}</Text></TouchableOpacity></View>}>
    <BottomSheetScrollView enableFooterMarginAdjustment contentContainerStyle={g.body} keyboardShouldPersistTaps="handled">
      <View style={g.stepper}>
        {editable && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Decrease daily goal by 15 minutes" disabled={busy} onPress={() => step(-15)} style={g.stepButton}><Text style={g.stepText}>−</Text></TouchableOpacity>}
        <View style={g.value}>
          {editable ? <BottomSheetTextInput accessibilityLabel="Daily goal in minutes" style={g.input} keyboardType="number-pad" value={draft} onChangeText={value => { setDraft(value); setError(""); }} editable={!busy} maxLength={3} selectTextOnFocus />
            : <Text style={g.number}>{checking ? "–" : data?.next_goal_minutes ?? todayMinutes}</Text>}
          <Text style={g.unit}>minutes a day</Text>
        </View>
        {editable && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Increase daily goal by 15 minutes" disabled={busy} onPress={() => step(15)} style={g.stepButton}><Text style={g.stepText}>+</Text></TouchableOpacity>}
      </View>
      {editable && <View style={g.presets}>{[30, 60, 90, 120].map(value => <View key={value} style={g.presetCell}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Set daily goal to ${value} minutes`} accessibilityState={{ selected: parseDailyGoal(draft) === value }} disabled={busy} onPress={() => { setDraft(String(value)); setError(""); }} style={[g.preset, parseDailyGoal(draft) === value && g.presetSelected]}><Text style={[g.presetText, parseDailyGoal(draft) === value && g.presetTextSelected]}>{value}</Text></TouchableOpacity></View>)}</View>}
      <View style={g.rules}>
        <Text style={g.rule}>· Choose 30–480 minutes a day.</Text>
        <Text style={g.rule}>· A new goal starts tomorrow, so today’s target and earned progress stay intact.</Text>
        <Text style={g.rule}>· You can change your goal once every seven days.</Text>
      </View>
      {checking ? <Text style={g.caption}>Checking your goal…</Text> : !!status && <Text style={g.caption}>{status}</Text>}
      {!!error && <><Text style={g.error} accessibilityRole="alert">{error}</Text>{!unavailable && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void load()}><Text style={g.link}>Retry goal check</Text></TouchableOpacity>}</>}
    </BottomSheetScrollView>
  </AppSheet>;
}
// Plain style objects keep this sheet free of extra native imports.
const g = {
  header: { paddingHorizontal: 20, paddingBottom: 14, gap: 4 },
  title: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "600" as const, letterSpacing: -0.5 },
  subtitle: { color: colors.secondary, fontSize: 15, lineHeight: 21 },
  body: { paddingHorizontal: 20, paddingBottom: 20, gap: 16 },
  stepper: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 12, paddingVertical: 18, paddingHorizontal: 14, borderRadius: 24, backgroundColor: colors.sheetCard, borderWidth: 0.5, borderColor: colors.line },
  stepButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: colors.accentSoft },
  stepText: { color: colors.accent, fontSize: 26, lineHeight: 30, fontWeight: "500" as const },
  value: { flex: 1, alignItems: "center" as const, gap: 2 },
  input: { minWidth: 110, color: colors.text, fontSize: 46, lineHeight: 54, fontWeight: "600" as const, textAlign: "center" as const, paddingVertical: 0, fontVariant: ["tabular-nums" as const] },
  number: { color: colors.text, fontSize: 46, lineHeight: 54, fontWeight: "600" as const, textAlign: "center" as const, fontVariant: ["tabular-nums" as const] },
  unit: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  presets: { flexDirection: "row" as const, gap: 8 },
  // Sheet touchables wrap their style in an inner view on Android, so the cell takes the width.
  presetCell: { flex: 1 },
  preset: { minHeight: 44, borderRadius: 14, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: colors.sheetCard, borderWidth: 0.5, borderColor: colors.line },
  presetSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  presetText: { color: colors.secondary, fontSize: 15, fontWeight: "500" as const },
  presetTextSelected: { color: colors.accent },
  rules: { gap: 6 },
  rule: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  link: { color: colors.accent, fontSize: 15, fontWeight: "500" as const, paddingVertical: 8 },
  button: { minHeight: 54, padding: 14, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center" as const, justifyContent: "center" as const },
  buttonChecking: { backgroundColor: colors.sheetCard },
  buttonText: { color: colors.primaryText, fontSize: 17, lineHeight: 23, fontWeight: "600" as const },
  buttonTextChecking: { color: colors.secondary },
};
