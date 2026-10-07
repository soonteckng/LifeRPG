import { useRef, useState } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Text, TextInput } from "../components/AppText";
import OnboardingFrame, { OnboardingChoice, useOnboardingTransition } from "../components/OnboardingFrame";
import Pressable from "../components/MotionPressable";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import { DEFAULT_GUIDED_PREFERENCE } from "../services/guidedPreferenceService";
import { saveOnboardingProfile } from "../services/onboardingService";
import { useUser } from "../context/UserContext";
import { colors } from "../constants/theme";
import { STUDY_NEEDS, defaultFocusId } from "../constants/guidedQuests";
import { DAILY_GOAL_PRESETS, validateDailyGoal } from "../utils/dailyGoal";
const TITLES = ["Find your rhythm.", "Make it yours.", "What should we call you?", "A little time for you."];
export default function OnboardingScreen() {
  const router = useRouter();
  const { profile, reloadProfile } = useUser();
  const guided = useGuidedPreference(profile.id ?? "");
  const transition = useOnboardingTransition();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState({ ...DEFAULT_GUIDED_PREFERENCE, invited: true });
  const [name, setName] = useState(profile.username === "Hero" ? "" : profile.username);
  const [goal, setGoal] = useState(Math.max(30, profile.daily_goal_minutes || 60));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  const changeStep = (next: number) => { setError(""); transition.change(() => setStep(next)); };
  const next = async () => {
    if (lock.current || transition.moving) return;
    if (step < 3) {
      if (step === 2 && (!name.trim() || name.trim().length > 40)) { setError("Enter a name between 1 and 40 characters."); return; }
      changeStep(step + 1); return;
    }
    const goalError = validateDailyGoal(goal);
    if (goalError) { setError(goalError); return; }
    lock.current = true; setBusy(true); setError(""); Keyboard.dismiss();
    try {
      if (!(await guided.save(direction))) throw new Error("Suggestion preferences could not be saved");
      await saveOnboardingProfile(name.trim(), profile.avatar || "🌱", profile.class_title || "Adventurer", goal);
      if (!(await reloadProfile())) throw new Error("Profile refresh failed");
      router.replace("/tutorial");
    } catch { setError("Couldn’t save your profile. Your choices are still here—please try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  const subtitles = ["A gentle starting point, or space to focus your own way. You can change this anytime.", direction.enabled ? "Choose the study block you’d like to see on Home. Your own quests can live alongside it." : "Choose your own duration and Life area. Add personal quests whenever you want a little structure.", "A name for your journey. You can personalise your character in Profile later.", "Choose a starting daily goal. Short sessions count too—there’s no need to do it all at once."];
  return <OnboardingFrame step={step + 1} total={7} title={TITLES[step]} subtitle={subtitles[step]} opacity={transition.opacity}
    busy={busy || transition.moving || (step === 3 && !guided.ready)} primary={busy ? "Saving…" : "Continue"} onNext={() => void next()}
    onBack={step > 0 ? () => changeStep(step - 1) : undefined}
    error={error || (guided.error ? "Your preferences couldn’t be loaded. Please try again." : "")} retry={guided.error && !guided.ready ? () => void guided.retry() : undefined}>
    {step === 0 && <View style={s.choices}>
      <OnboardingChoice title="Study and assignments" hint="A thoughtful suggestion to help you begin." selected={direction.enabled} onPress={() => setDirection({ ...direction, enabled: true })} />
      <OnboardingChoice title="Just let me focus" hint="Your time, your focus, your own quests." selected={!direction.enabled} onPress={() => setDirection({ ...direction, enabled: false })} />
    </View>}
    {step === 1 && (direction.enabled ? <View style={s.choices}>{STUDY_NEEDS.map(need => <OnboardingChoice key={need.id} title={need.title} hint={need.hint} selected={direction.need === need.id} onPress={() => setDirection({ ...direction, need: need.id, templateId: defaultFocusId(need.id), smaller: false })} />)}</View> : <View style={s.note}><Text style={s.noteTitle}>Ready when you are.</Text><Text style={s.noteBody}>Home will offer free focus. Suggestions are always available later in Settings.</Text></View>)}
    {step === 2 && <View style={s.choices}><TextInput accessibilityLabel="Your name" value={name} onChangeText={value => { setName(value); setError(""); }} maxLength={40} placeholder="Your name" placeholderTextColor={colors.muted} style={s.input} autoCapitalize="words" autoComplete="name" returnKeyType="next" onSubmitEditing={() => void next()} editable={!busy && !transition.moving} /><Text style={s.hint}>Your progress starts here. Make it feel like you.</Text></View>}
    {step === 3 && <View style={s.choices}><View style={s.goals}>{DAILY_GOAL_PRESETS.map(minutes => <Pressable key={minutes} accessibilityRole="radio" accessibilityLabel={`${minutes} min`} accessibilityState={{ checked: goal === minutes }} disabled={busy} onPress={() => setGoal(minutes)} style={[s.goal, goal === minutes && s.selected]}><Text style={s.goalNumber}>{minutes}</Text><Text style={s.hint}>min / day</Text></Pressable>)}</View><Text style={s.hint}>Your character grows with completed focus time. A quiet day never takes earned growth away.</Text></View>}
  </OnboardingFrame>;
}
const s = StyleSheet.create({ choices: { gap: 12 }, note: { padding: 24, borderRadius: 24, backgroundColor: colors.surface, gap: 12 }, noteTitle: { color: colors.text, fontSize: 23, lineHeight: 29, fontWeight: "500" }, noteBody: { color: colors.secondary, fontSize: 17, lineHeight: 25 }, input: { minHeight: 60, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16, color: colors.text, fontSize: 20 }, hint: { color: colors.secondary, fontSize: 15, lineHeight: 22 }, goals: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, goal: { flexGrow: 1, flexBasis: "45%", borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 18, gap: 6 }, selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, goalNumber: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "500" } });
