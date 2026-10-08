import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text, TextInput } from "./AppText";
import OnboardingFrame, { OnboardingChoice, useOnboardingTransition } from "./OnboardingFrame";
import OnboardingWelcome from "./OnboardingWelcome";
import OnboardingFinish from "./OnboardingFinish";
import { prepareFeatureTour } from "./FeatureTour";
import Pressable from "./MotionPressable";
import { FocusDirectionPicker } from "./GuidedChoice";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import { saveOnboardingProfile, finishOnboarding } from "../services/onboardingService";
import { useUser } from "../context/UserContext";
import { colors } from "../constants/theme";
import { DAILY_GOAL_PRESETS, validateDailyGoal } from "../utils/dailyGoal";
import { INTRO_PAGES, ONBOARDING_NAME_LIMIT } from "../constants/onboarding";

const TITLES = ["Find your rhythm.", "Make it yours.", "What should we call you?", "A little time for you."];
export default function OnboardingJourney({ initialStep = 0 }: { initialStep?: number }) {
  const router = useRouter();
  const { profile, reloadProfile } = useUser();
  const guided = useGuidedPreference(profile.id ?? "");
  const transition = useOnboardingTransition();
  const [welcoming, setWelcoming] = useState(initialStep === 0);
  const welcomeDone = useCallback(() => setWelcoming(false), []);
  const [step, setStep] = useState(initialStep);
  const [direction, setDirection] = useState({ ...guided.value, invited: true });
  const [preferenceReady, setPreferenceReady] = useState(guided.ready);
  const [choiceTouched, setChoiceTouched] = useState(false);
  if (guided.ready && !preferenceReady) {
    setPreferenceReady(true);
    if (!choiceTouched) setDirection({ ...guided.value, invited: true });
  }
  const [name, setName] = useState(profile.username === "Hero" ? "" : profile.username ?? "");
  const [goal, setGoal] = useState(Math.max(30, profile.daily_goal_minutes || 60));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [celebrating, setCelebrating] = useState(false), [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false), savedProfile = useRef(""), savedFinish = useRef(false), alive = useRef(true), completing = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const complete = useCallback(() => {
    if (!alive.current || completing.current) return;
    completing.current = true;
    void reloadProfile().then(ok => {
      if (!ok) throw new Error("Profile refresh failed");
      if (alive.current) router.replace("/");
    }).catch(() => {
      if (alive.current) { setCelebrating(false); setError("Your setup is saved. Couldn’t open Home yet—please try again."); setBusy(false); lock.current = false; }
    }).finally(() => { completing.current = false; });
  }, [reloadProfile, router]);
  const changeStep = (next: number) => { setError(""); transition.change(() => setStep(next)); };
  const next = async () => {
    if (lock.current || transition.moving) return;
    if (step === 2 && (!name.trim() || name.trim().length > ONBOARDING_NAME_LIMIT)) {
      setError(`Choose a name between 1 and ${ONBOARDING_NAME_LIMIT} characters.`); return;
    }
    if (step === 3) { const validation = validateDailyGoal(goal); if (validation) { setError(validation); return; } }
    if (step < 6) { changeStep(step + 1); return; }
    if (!savedFinish.current && (!name.trim() || name.trim().length > ONBOARDING_NAME_LIMIT)) {
      setStep(2); setError(`Choose a name between 1 and ${ONBOARDING_NAME_LIMIT} characters.`); return;
    }
    lock.current = true; setBusy(true); setError(""); Keyboard.dismiss();
    try {
      if (!savedFinish.current) {
        if (!(await guided.save(direction))) throw new Error("Preference save failed");
        const key = JSON.stringify([name.trim(), goal]);
        if (savedProfile.current !== key) {
          await saveOnboardingProfile(name.trim(), profile.avatar || "🌱", profile.class_title || "Adventurer", goal);
          savedProfile.current = key;
        }
        await finishOnboarding(); savedFinish.current = true;
        if (alive.current) setConfirmed(true);
        await prepareFeatureTour(profile.id ?? "").catch(() => {});
      }
      if (alive.current) setCelebrating(true);
    } catch {
      if (alive.current) { setError("Couldn’t save your setup. Your choices are still here—please try again."); setBusy(false); lock.current = false; }
    }
  };
  if (welcoming) return <OnboardingWelcome owner={profile.id ?? ""} onDone={welcomeDone} />;
  if (celebrating) return <OnboardingFinish onDone={complete} />;
  const intro = step >= 4 ? INTRO_PAGES[step - 4] : null;
  const subtitles = [
    "A gentle starting point, or space to focus your own way. You can change this anytime.",
    direction.enabled ? "Choose where you’d like to begin. You can change your suggestion on Home anytime." : "Choose your own duration and Focus area. Add personal quests whenever you want a little structure.",
    "A name for your journey. You can personalise your character in Profile later.",
    "Choose a starting daily goal. Short sessions count too—there’s no need to do it all at once.",
  ];
  return <OnboardingFrame step={step + 1} total={7} title={intro?.title ?? TITLES[step]} subtitle={intro?.body ?? subtitles[step]} opacity={transition.opacity}
    busy={busy || (step === 6 && !guided.ready)} transitioning={transition.moving} primary={busy ? "Finishing setup…" : step === 6 ? "Start my journey" : "Continue"} onNext={() => void next()}
    onBack={step > 0 && !confirmed ? () => changeStep(step - 1) : undefined}
    error={(step === 2 ? "" : error) || (guided.error ? "Your preferences couldn’t be loaded. Please try again." : "")} retry={guided.error && !guided.ready ? () => void guided.retry() : undefined}>
    {step === 0 && <View style={s.choices}>
      <OnboardingChoice title="Help me choose a focus" hint="A starting point for learning, work or everyday life." selected={direction.enabled} onPress={() => { setChoiceTouched(true); setDirection({ ...direction, enabled: true }); }} />
      <OnboardingChoice title="Just let me focus" hint="Your time, your focus, your own quests." selected={!direction.enabled} onPress={() => { setChoiceTouched(true); setDirection({ ...direction, enabled: false }); }} />
    </View>}
    {step === 1 && (direction.enabled ? <FocusDirectionPicker compact value={direction} onChange={value => { setChoiceTouched(true); setDirection(value); }} /> : <View style={s.note}><Text style={s.noteTitle}>Ready when you are.</Text><Text style={s.noteBody}>Home will offer free focus. Find your next step is there whenever you’d like a suggestion.</Text></View>)}
    {step === 2 && <View style={s.choices}><TextInput accessibilityLabel="Your name" value={name} onChangeText={value => { setName(value); setError(""); }} maxLength={ONBOARDING_NAME_LIMIT} placeholder="Your name" placeholderTextColor={colors.muted} style={[s.input, !!error && { borderColor: colors.danger }]} autoCapitalize="words" autoComplete="name" returnKeyType="next" onSubmitEditing={() => void next()} editable={!busy && !transition.moving} />{!!error && <Text testID="onboarding-name-error" style={s.inputError} accessibilityRole="alert">{error}</Text>}<Text style={s.hint}>Up to {ONBOARDING_NAME_LIMIT} characters. Make it feel like you.</Text></View>}
    {step === 3 && <View style={s.choices}><View style={s.goals}>{DAILY_GOAL_PRESETS.map(minutes => <Pressable key={minutes} accessibilityRole="radio" accessibilityLabel={`${minutes} min`} accessibilityState={{ checked: goal === minutes }} disabled={busy} onPress={() => setGoal(minutes)} style={[s.goal, goal === minutes && s.selected]}><Text style={s.goalNumber}>{minutes}</Text><Text style={s.hint}>min / day</Text></Pressable>)}</View><Text style={s.hint}>You can adjust your daily goal later, once every seven days. A quiet day never takes earned growth away.</Text></View>}
    {intro && <><View style={s.illustration}><View style={s.symbol}><Ionicons name={intro.icon} size={44} color={colors.accent} /></View></View><View style={s.note}><Text style={s.noteBody}>{intro.detail}</Text></View></>}
  </OnboardingFrame>;
}
const s = StyleSheet.create({
  choices: { gap: 12 }, note: { padding: 22, borderRadius: 22, backgroundColor: colors.surface, gap: 12 }, noteTitle: { color: colors.text, fontSize: 23, lineHeight: 29, fontWeight: "500" }, noteBody: { color: colors.secondary, fontSize: 17, lineHeight: 25 },
  inputError: { color: colors.danger, fontSize: 16, lineHeight: 23, fontWeight: "500" },
  input: { minHeight: 60, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16, color: colors.text, fontSize: 20 }, hint: { color: colors.secondary, fontSize: 15, lineHeight: 22 }, goals: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  goal: { flexGrow: 1, flexBasis: "45%", borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 18, gap: 6 }, selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, goalNumber: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "500" },
  illustration: { alignItems: "center", paddingVertical: 4 }, symbol: { width: 112, height: 112, borderRadius: 56, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
});
