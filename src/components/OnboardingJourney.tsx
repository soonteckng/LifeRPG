import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Keyboard, StyleSheet, View } from "react-native";
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
import { useSessionProtection } from "../context/SessionProtectionContext";
import Segmented from "./Segmented";

const TITLES = ["Find your rhythm.", "Make it yours.", "What should we call you?", "A little time for you.", "Keep distractions aside."];
// Steps: 0–3 setup, 4 app protection (Android only), 5–7 intro pages.
const PROTECTION_STEP = 4, FIRST_INTRO = 5, LAST_STEP = 7;
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
  const protection = useSessionProtection();
  const [protectMode, setProtectMode] = useState<"essentials" | "allow-list">(protection.selection.mode === "allow-list" ? "allow-list" : "essentials");
  const caps = protection.capabilities;
  const refreshProtection = protection.refresh;
  // Permissions are granted in Android Settings; re-read them on return.
  useEffect(() => {
    if (step !== PROTECTION_STEP || !protection.supported) return;
    void refreshProtection();
    const listener = AppState.addEventListener("change", state => { if (state === "active") void refreshProtection(); });
    return () => listener.remove();
  }, [step, protection.supported, refreshProtection]);
  const lock = useRef(false), savedProfile = useRef(""), savedFinish = useRef(false), alive = useRef(true), completing = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const complete = useCallback(() => {
    if (!alive.current || completing.current) return;
    completing.current = true;
    void reloadProfile().then(ok => {
      if (!ok) throw new Error("Profile refresh failed");
      if (alive.current) router.replace("/");
    }).catch(() => {
      if (alive.current) { setCelebrating(false); setError("Your setup is saved. Couldn’t open Home yet. Please try again."); setBusy(false); lock.current = false; }
    }).finally(() => { completing.current = false; });
  }, [reloadProfile, router]);
  const changeStep = (next: number) => { setError(""); transition.change(() => setStep(next)); };
  const next = async () => {
    if (lock.current || transition.moving) return;
    if (step === 2 && (!name.trim() || name.trim().length > ONBOARDING_NAME_LIMIT)) {
      setError(`Choose a name between 1 and ${ONBOARDING_NAME_LIMIT} characters.`); return;
    }
    if (step === 3) { const validation = validateDailyGoal(goal); if (validation) { setError(validation); return; } }
    if (step === 3 && !protection.supported) { changeStep(FIRST_INTRO); return; }
    if (step === PROTECTION_STEP && caps?.usage && caps.overlay && caps.notifications) await protection.choose(protectMode).catch(() => false);
    if (step < LAST_STEP) { changeStep(step + 1); return; }
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
      if (alive.current) { setError("Couldn’t save your setup. Your choices are still here. Please try again."); setBusy(false); lock.current = false; }
    }
  };
  if (welcoming) return <OnboardingWelcome owner={profile.id ?? ""} onDone={welcomeDone} />;
  if (celebrating) return <OnboardingFinish onDone={complete} />;
  const intro = step >= FIRST_INTRO ? INTRO_PAGES[step - FIRST_INTRO] : null;
  const skipped = !protection.supported;
  const permissionRows = [
    { kind: "usage" as const, icon: "eye-outline" as const, title: "Usage Access", hint: "Notices which app is open.", granted: !!caps?.usage, allow: () => protection.openPermission("usage") },
    { kind: "overlay" as const, icon: "layers-outline" as const, title: "Display over other apps", hint: "Covers an app you set aside.", granted: !!caps?.overlay, allow: () => protection.openPermission("overlay") },
    { kind: "notifications" as const, icon: "notifications-outline" as const, title: "Notifications", hint: "Break reminders and End session, always in reach.", granted: !!caps?.notifications, allow: async () => { const { enableNotifications } = await import("../services/notificationPermissionService"); await enableNotifications(); await protection.refresh(); } },
  ];
  const subtitles = [
    "A gentle starting point, or space to focus your own way. You can change this anytime.",
    direction.enabled ? "Choose where you’d like to begin. You can change your suggestion on Home anytime." : "Choose your own duration and Focus area. Add personal quests whenever you want a little structure.",
    "A name for your journey. You can personalise your character in Profile later.",
    "Choose a starting daily goal. Short sessions count too. There’s no need to do it all at once.",
    "During a session, LifeRPG can cover the apps that pull you away. Optional, and you can change it on Home anytime.",
  ];
  return <OnboardingFrame step={step + 1 - (skipped && step > PROTECTION_STEP ? 1 : 0)} total={skipped ? 7 : 8} title={intro?.title ?? TITLES[step]} subtitle={intro?.body ?? subtitles[step]} opacity={transition.opacity}
    busy={busy || (step === LAST_STEP && !guided.ready)} transitioning={transition.moving} primary={busy ? "Finishing setup…" : step === LAST_STEP ? "Start my journey" : step === PROTECTION_STEP && !(caps?.usage && caps.overlay && caps.notifications) ? "Maybe later" : "Continue"} onNext={() => void next()}
    onBack={step > 0 && !confirmed ? () => changeStep(step === FIRST_INTRO && skipped ? 3 : step - 1) : undefined}
    error={(step === 2 ? "" : error) || (guided.error ? "Your preferences couldn’t be loaded. Please try again." : "")} retry={guided.error && !guided.ready ? () => void guided.retry() : undefined}>
    {step === 0 && <View style={s.choices}>
      <OnboardingChoice title="Help me choose a focus" hint="A starting point for learning, work or everyday life." selected={direction.enabled} onPress={() => { setChoiceTouched(true); setDirection({ ...direction, enabled: true }); }} />
      <OnboardingChoice title="Just let me focus" hint="Your time, your focus, your own quests." selected={!direction.enabled} onPress={() => { setChoiceTouched(true); setDirection({ ...direction, enabled: false }); }} />
    </View>}
    {step === 1 && (direction.enabled ? <FocusDirectionPicker compact value={direction} onChange={value => { setChoiceTouched(true); setDirection(value); }} /> : <View style={s.note}><Text style={s.noteTitle}>Ready when you are.</Text><Text style={s.noteBody}>Home will offer free focus. Find your next step is there whenever you’d like a suggestion.</Text></View>)}
    {step === 2 && <View style={s.choices}><TextInput accessibilityLabel="Your name" value={name} onChangeText={value => { setName(value); setError(""); }} maxLength={ONBOARDING_NAME_LIMIT} placeholder="Your name" placeholderTextColor={colors.muted} style={[s.input, !!error && { borderColor: colors.danger }]} autoCapitalize="words" autoComplete="name" returnKeyType="next" onSubmitEditing={() => void next()} editable={!busy && !transition.moving} />{!!error && <Text testID="onboarding-name-error" style={s.inputError} accessibilityRole="alert">{error}</Text>}<Text style={s.hint}>Up to {ONBOARDING_NAME_LIMIT} characters. Make it feel like you.</Text></View>}
    {step === 3 && <View style={s.choices}><View style={s.goals}>{DAILY_GOAL_PRESETS.map(minutes => <Pressable key={minutes} accessibilityRole="radio" accessibilityLabel={`${minutes} min`} accessibilityState={{ checked: goal === minutes }} disabled={busy} onPress={() => setGoal(minutes)} style={[s.goal, goal === minutes && s.selected]}><Text style={s.goalNumber}>{minutes}</Text><Text style={s.hint}>min / day</Text></Pressable>)}</View><Text style={s.hint}>Change your daily goal in Settings once every seven days. Changes start the next day. A quiet day never takes earned growth away.</Text></View>}
    {step === PROTECTION_STEP && <View style={s.choices}>
      <Segmented value={protectMode} onChange={setProtectMode} track={colors.surface}
        options={[{ value: "essentials", label: "Block apps" }, { value: "allow-list", label: "Allow list" }]} />
      <Text style={s.hint}>{protectMode === "essentials" ? "Pick the apps to cover when you start a session. Everything else stays open." : "Only the tools you choose stay open. Everything else is covered."}</Text>
      <View style={s.permissionList}>{permissionRows.map((row, index) => <View key={row.kind} style={[s.permissionRow, index > 0 && s.permissionDivider]}>
        <Ionicons name={row.icon} size={20} color={row.granted ? colors.accent : colors.secondary} />
        <View style={s.permissionCopy}><Text style={s.permissionTitle}>{row.title}</Text><Text style={s.hint}>{row.hint}</Text></View>
        {row.granted ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} accessibilityLabel={`${row.title} allowed`} />
          : <Pressable onPress={() => void row.allow()} accessibilityRole="button" accessibilityLabel={`Allow ${row.title}`} style={s.allow}><Text style={s.allowText}>Allow</Text></Pressable>}
      </View>)}</View>
      <Text style={s.hint}>Calls, Settings and LifeRPG always stay available. Calls and emergencies are never covered.</Text>
    </View>}
    {intro && <><View style={s.illustration}><View style={s.symbol}><Ionicons name={intro.icon} size={44} color={colors.accent} /></View></View><View style={s.note}><Text style={s.noteBody}>{intro.detail}</Text></View></>}
  </OnboardingFrame>;
}
const s = StyleSheet.create({
  permissionList: { borderRadius: 20, backgroundColor: colors.surface, overflow: "hidden" },
  permissionRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 10 },
  permissionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  permissionCopy: { flex: 1, minWidth: 0, gap: 2 }, permissionTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  allow: { minHeight: 36, paddingHorizontal: 16, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  allowText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  choices: { gap: 12 }, note: { padding: 22, borderRadius: 22, backgroundColor: colors.surface, gap: 12 }, noteTitle: { color: colors.text, fontSize: 23, lineHeight: 29, fontWeight: "500" }, noteBody: { color: colors.secondary, fontSize: 17, lineHeight: 22 },
  inputError: { color: colors.danger, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  input: { minHeight: 60, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16, color: colors.text, fontSize: 20 }, hint: { color: colors.secondary, fontSize: 15, lineHeight: 20 }, goals: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  goal: { flexGrow: 1, flexBasis: "45%", borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 18, gap: 6 }, selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, goalNumber: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "500" },
  illustration: { alignItems: "center", paddingVertical: 4 }, symbol: { width: 112, height: 112, borderRadius: 56, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
});
