import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TouchableOpacity from "./SheetTouchable";
import { Ionicons } from "@expo/vector-icons";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import { Text } from "./AppText";
import { useUser } from "../context/UserContext";
import { getDailyGoalSettings, missingGoalAPI, scheduleDailyGoal, type DailyGoalSettings } from "../services/dailyGoalService";
import { parseDailyGoal, validateDailyGoal } from "../utils/dailyGoal";
import { colors, edge } from "../constants/theme";

import { cachedDailyGoal as cached, forgetDailyGoal, rememberDailyGoal as remember } from "../utils/dailyGoalCache";
import SheetTextInput from "./SheetTextInput";

export default function DailyGoalSheet({ visible, onClose, onSaved, todayGoalMinutes }: { visible: boolean; onClose: () => void; onSaved: () => void; todayGoalMinutes?: number }) {
  const { profile } = useUser(), insets = useSafeAreaInsets();
  const [loadedData, setData] = useState<DailyGoalSettings | null>(null), [draft, setDraft] = useState(""), [error, setError] = useState(""), [saved, setSaved] = useState(false), [busy, setBusy] = useState(false);
  const data = loadedData?.user_id === profile.id ? loadedData : null;
  const [needsCheck, setNeedsCheck] = useState(false);
  const generation = useRef(0), lock = useRef(false), edited = useRef(false);
  const [unavailable, setUnavailable] = useState(false);
  // While typing, the rules step aside so Save stays above the keyboard.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setTyping(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setTyping(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const show = useCallback((next: DailyGoalSettings) => { setData(next); if (!edited.current) setDraft(String(next.next_goal_minutes)); }, []);
  const load = useCallback(async () => {
    const current = ++generation.current; setError(""); setUnavailable(false);
    const known = cached(profile.id);
    if (known) show(known); else setData(null);
    try { const next = await getDailyGoalSettings(profile.id); remember(next); if (current === generation.current) { show(next); setNeedsCheck(false); } }
    catch (failure) {
      // A recent reading stays usable offline; the save itself is still checked by the server.
      if (current === generation.current && !known) { setData(null); setUnavailable(missingGoalAPI(failure)); setError(missingGoalAPI(failure) ? "Goal settings are temporarily unavailable. Please try again later." : "Couldn’t check your goal. Please try again."); }
    }
  }, [profile.id, show]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active && visible) { edited.current = false; setSaved(false); void load(); } });
    return () => { active = false; invalidate(); };
  }, [visible, load, invalidate]);
  // Read quietly once Home has settled, so the first open is already filled in.
  useEffect(() => {
    if (visible || !profile.id || cached(profile.id)) return;
    const later = setTimeout(() => { void getDailyGoalSettings(profile.id).then(remember, () => {}); }, 1500);
    return () => clearTimeout(later);
  }, [visible, profile.id]);
  const canSave = !!data?.scheduling_available && data.weekly_limit_available && data.can_change_goal && !saved && !needsCheck;
  const save = async () => {
    if (lock.current || !canSave) return;
    const validation = validateDailyGoal(parseDailyGoal(draft)); if (validation) { setError(validation); return; }
    lock.current = true; setBusy(true); setNeedsCheck(true); setError(""); const current = generation.current;
    try { const result = await scheduleDailyGoal(parseDailyGoal(draft), profile.id); remember(result); if (current === generation.current) { setData(result); setNeedsCheck(false); setSaved(true); onSaved(); } }
    catch {
      // A lost reply can follow a successful write. Read the ledger before
      // offering another save; do not tell the user the write never happened.
      forgetDailyGoal(profile.id);
      if (current === generation.current) {
        try {
          const checked = await getDailyGoalSettings(profile.id);
          remember(checked);
          if (current === generation.current) { setData(checked); setNeedsCheck(false); setError("We checked your goal after a connection problem. Your latest schedule is shown below. A delayed change may still arrive; check again before choosing another goal."); }
        } catch { if (current === generation.current) setError("Couldn’t confirm your goal change. Reconnect and check its status before trying again."); }
      }
    }
    finally { lock.current = false; setBusy(false); }
  };
  const checking = !data && !error;
  const todayMinutes = data?.today_goal_minutes ?? todayGoalMinutes ?? profile.daily_goal_minutes;
  const editable = canSave || (busy && !!data?.can_change_goal);
  const change = (value: string) => { edited.current = true; setDraft(value); setError(""); };
  const step = (delta: number) => {
    if (!editable || busy) return;
    const current = parseDailyGoal(draft);
    const base = Number.isFinite(current) ? current : todayMinutes ?? 60;
    change(String(Math.min(480, Math.max(30, Math.round((base + delta) / 15) * 15))));
  };
  const status = data ? `${saved || data.pending ? `${data.next_goal_minutes} minutes from ${data.next_effective_date}. ` : ""}${!data.scheduling_available || !data.weekly_limit_available ? "Goal changes are temporarily unavailable. Please try again later." : data.can_change_goal ? "" : data.next_change_at ? `Next change: ${new Intl.DateTimeFormat(undefined, { timeZone: profile.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(data.next_change_at))}.` : "Finish setup before changing your goal."}` : "";
  const selected = parseDailyGoal(draft);
  // Full width from the bottom edge, like the other editors, above the phone's own bar.
  return <AppSheet visible={visible} onRequestClose={() => { if (!busy) onClose(); }} guardDismiss={busy} attached compact keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan" motionMode="timed" label="daily goal"
    header={<SheetHeader title="Daily goal" subtitle={`Today stays at ${todayMinutes} min.`} onClose={() => { if (!busy) onClose(); }} />}>
    <BottomSheetScrollView contentContainerStyle={[g.body, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} keyboardShouldPersistTaps="handled">
      <View style={g.stepperCard}>
        <View style={g.stepper}>
          {editable && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Decrease daily goal by 15 minutes" disabled={busy} onPress={() => step(-15)} style={g.stepButton}><Ionicons name="remove" size={24} color={colors.accent} /></TouchableOpacity>}
          <View style={g.value}>
            {editable ? <SheetTextInput accessibilityLabel="Daily goal in minutes" style={g.input} keyboardType="number-pad" value={draft} onChangeText={change} editable={!busy} maxLength={3} selectTextOnFocus />
              : <Text style={g.number}>{checking ? "–" : data?.next_goal_minutes ?? todayMinutes}</Text>}
            <Text style={g.unit}>minutes a day</Text>
          </View>
          {editable && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Increase daily goal by 15 minutes" disabled={busy} onPress={() => step(15)} style={g.stepButton}><Ionicons name="add" size={24} color={colors.accent} /></TouchableOpacity>}
        </View>
        {editable && <View style={g.presets}>{[30, 60, 90, 120].map(value => <View key={value} style={g.presetCell}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Set daily goal to ${value} minutes`} accessibilityState={{ selected: selected === value }} disabled={busy} onPress={() => change(String(value))} style={[g.preset, selected === value && g.presetSelected]}><Text style={[g.presetText, selected === value && g.presetTextSelected]}>{value}</Text></TouchableOpacity></View>)}</View>}
      </View>
      {!typing && <View style={g.rules}>
        <View style={g.rule}><Ionicons name="calendar-outline" size={16} color={colors.tertiary} style={g.ruleIcon} /><Text style={g.ruleText}>A new goal starts tomorrow, so today’s progress stays intact.</Text></View>
        <View style={g.rule}><Ionicons name="time-outline" size={16} color={colors.tertiary} style={g.ruleIcon} /><Text style={g.ruleText}>Choose 30–480 minutes. You can change it once every 7 days.</Text></View>
      </View>}
      {checking ? <Text style={g.caption}>Checking your goal…</Text> : !!status && <Text style={g.caption}>{status}</Text>}
      {!!error && <><Text style={g.error} accessibilityRole="alert">{error}</Text>{!unavailable && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void load()}><Text style={g.link}>Retry goal check</Text></TouchableOpacity>}</>}
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy || !canSave, busy: busy || checking }} disabled={busy || !canSave} onPress={() => void save()} style={[g.button, (busy || !canSave) && g.buttonQuiet]}>
        <Text style={[g.buttonText, (busy || !canSave) && g.buttonTextQuiet]}>{busy ? "Saving…" : saved ? "Goal saved" : checking ? "Checking your goal…" : "Save daily goal"}</Text>
      </TouchableOpacity>
    </BottomSheetScrollView>
  </AppSheet>;
}
// Plain style objects keep this sheet free of extra native imports.
const g = {
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 16 },
  stepperCard: { ...edge, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12, gap: 14, borderRadius: 22, backgroundColor: colors.sheetCard },
  stepper: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 12 },
  stepButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: colors.accentSoft },
  value: { flex: 1, alignItems: "center" as const },
  input: { minWidth: 110, color: colors.text, fontSize: 46, lineHeight: 54, fontWeight: "700" as const, textAlign: "center" as const, paddingVertical: 0, fontVariant: ["tabular-nums" as const] },
  number: { color: colors.text, fontSize: 46, lineHeight: 54, fontWeight: "700" as const, textAlign: "center" as const, fontVariant: ["tabular-nums" as const] },
  unit: { color: colors.secondary, fontSize: 14, lineHeight: 18 },
  presets: { ...edge, flexDirection: "row" as const, gap: 4, padding: 4, borderRadius: 14, backgroundColor: colors.surfaceRaised },
  // Sheet touchables wrap their style in an inner view on Android, so the cell takes the width.
  presetCell: { flex: 1 },
  preset: { minHeight: 36, borderRadius: 10, alignItems: "center" as const, justifyContent: "center" as const },
  presetSelected: { backgroundColor: colors.selection },
  presetText: { color: colors.secondary, fontSize: 15, fontWeight: "600" as const, fontVariant: ["tabular-nums" as const] },
  presetTextSelected: { color: colors.text },
  rules: { gap: 8, paddingHorizontal: 4 },
  rule: { flexDirection: "row" as const, gap: 10 },
  ruleIcon: { marginTop: 2 },
  ruleText: { flex: 1, color: colors.secondary, fontSize: 14, lineHeight: 20 },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  link: { color: colors.accent, fontSize: 15, fontWeight: "500" as const, paddingVertical: 8, paddingHorizontal: 4 },
  button: { minHeight: 54, padding: 14, borderRadius: 27, backgroundColor: colors.primary, alignItems: "center" as const, justifyContent: "center" as const },
  buttonQuiet: { backgroundColor: colors.sheetCard },
  buttonText: { color: colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight: "600" as const },
  buttonTextQuiet: { color: colors.secondary },
};
