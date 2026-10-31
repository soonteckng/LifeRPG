import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Keyboard, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text, TextInput } from "./AppText";
import OnboardingFrame, { useOnboardingTransition } from "./OnboardingFrame";
import OnboardingWelcome from "./OnboardingWelcome";
import OnboardingFinish from "./OnboardingFinish";
import { prepareFeatureTour } from "./FeatureTour";
import Pressable from "./MotionPressable";
import IdeaAreaPicker from "./IdeaAreaPicker";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import type { IdeaArea } from "../constants/routineIdeas";
import { saveOnboardingProfile, finishOnboarding, usernameAvailable } from "../services/onboardingService";
import { introHandoff } from "../services/introHandoff";
import { PROFILE_NAME_TAKEN, profileNameError } from "../constants/profile";
import { useUser } from "../context/UserContext";
import { colors, edge } from "../constants/theme";
import { DAILY_GOAL_PRESETS, validateDailyGoal } from "../utils/dailyGoal";
import { INTRO_PAGES, ONBOARDING_NAME_LIMIT } from "../constants/onboarding";
import { useSessionProtection } from "../context/SessionProtectionContext";

const TITLES = ["What would you like to make time for?", "What should we call you?", "A little time for you", "Keep distractions away"];
// Steps: 0 areas you'd like to make time for, 1 name, 2 goal, 3 app protection (Android only), 4 how it works.
const NAME_STEP = 1, GOAL_STEP = 2, PROTECTION_STEP = 3, LAST_STEP = 4;
export const FIRST_INTRO = 4;
export default function OnboardingJourney({ initialStep = 0 }: { initialStep?: number }) {
  const router = useRouter();
  const { profile, reloadProfile } = useUser();
  const guided = useGuidedPreference(profile.id ?? "");
  const transition = useOnboardingTransition();
  // A new person started the intro before their account existed: carry on
  // from the name step with what they picked, counting the account step too.
  const [handoff] = useState(() => initialStep === 0 ? introHandoff.peek() : null);
  const offset = handoff ? 1 : 0;
  const [welcoming, setWelcoming] = useState(initialStep === 0 && !handoff);
  const welcomeDone = useCallback(() => setWelcoming(false), []);
  const [step, setStep] = useState(handoff ? NAME_STEP : initialStep);
  // Up to three areas; nothing is created here. After the intro and the
  // guide, Routines gathers ideas from them under "For you".
  const [areas, setAreas] = useState<IdeaArea[]>(handoff?.areas ?? []);
  const [name, setName] = useState(profile.username === "Hero" ? "" : profile.username ?? "");
  const [goal, setGoal] = useState(Math.max(30, profile.daily_goal_minutes || 60));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [celebrating, setCelebrating] = useState(false), [confirmed, setConfirmed] = useState(false);
  const protection = useSessionProtection();
  // Protection is two pages: first the three permissions it needs, then (only
  // once all three are allowed) which apps stay open, so nobody finishes the
  // intro with every app covered by surprise.
  const [choosingApps, setChoosingApps] = useState(false);
  const [allowed, setAllowed] = useState<string[]>([]), [search, setSearch] = useState("");
  const appsSeeded = useRef(false);
  const caps = protection.capabilities;
  const appsReady = !!(caps?.usage && caps.overlay && caps.notifications);
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
    if (step === NAME_STEP && (!name.trim() || name.trim().length > ONBOARDING_NAME_LIMIT)) {
      setError(`Choose a name between 1 and ${ONBOARDING_NAME_LIMIT} characters.`); return;
    }
    if (step === NAME_STEP) {
      const invalid = profileNameError(name);
      if (invalid) { setError(invalid); return; }
      // Names are unique, so check now rather than at the very end.
      lock.current = true; setBusy(true);
      const free = await usernameAvailable(name).catch(() => true);
      lock.current = false;
      if (!alive.current) return;
      setBusy(false);
      if (!free) { setError(PROFILE_NAME_TAKEN); return; }
    }
    if (step === GOAL_STEP) { const validation = validateDailyGoal(goal); if (validation) { setError(validation); return; } }
    if (step === GOAL_STEP && !protection.supported) { changeStep(FIRST_INTRO); return; }
    if (step === PROTECTION_STEP && appsReady && !choosingApps) {
      // First visit starts from any saved choice; coming back keeps your ticks.
      if (!appsSeeded.current) { appsSeeded.current = true; setAllowed(protection.selection.mode === "allow-list" ? protection.selection.allowed : []); }
      setSearch("");
      void refreshProtection();
      transition.change(() => setChoosingApps(true)); return;
    }
    if (step === PROTECTION_STEP && choosingApps) { await protection.choose("allow-list", allowed).catch(() => false); setChoosingApps(false); }
    if (step < LAST_STEP) { changeStep(step + 1); return; }
    if (!savedFinish.current && (!name.trim() || name.trim().length > ONBOARDING_NAME_LIMIT)) {
      setStep(NAME_STEP); setError(`Choose a name between 1 and ${ONBOARDING_NAME_LIMIT} characters.`); return;
    }
    lock.current = true; setBusy(true); setError(""); Keyboard.dismiss();
    try {
      if (!savedFinish.current) {
        if (!(await guided.save({ ...guided.value, invited: true, ideaAreas: areas }))) throw new Error("Preference save failed");
        const key = JSON.stringify([name.trim(), goal]);
        if (savedProfile.current !== key) {
          await saveOnboardingProfile(name.trim(), profile.avatar || "🌱", goal);
          savedProfile.current = key;
        }
        await finishOnboarding(); savedFinish.current = true;
        introHandoff.clear();
        if (alive.current) setConfirmed(true);
        await prepareFeatureTour(profile.id ?? "").catch(() => {});
      }
      if (alive.current) setCelebrating(true);
    } catch (cause) {
      if (!alive.current) return;
      // Someone took this name in the meantime: choose another, nothing is lost.
      if ((cause as { code?: string })?.code === "23505") { setStep(NAME_STEP); setError(PROFILE_NAME_TAKEN); }
      else setError("Couldn’t save your setup. Your choices are still here. Please try again.");
      setBusy(false); lock.current = false;
    }
  };
  if (welcoming) return <OnboardingWelcome owner={profile.id ?? ""} onDone={welcomeDone} />;
  if (celebrating) return <OnboardingFinish onDone={complete} />;
  const intro = step >= FIRST_INTRO ? INTRO_PAGES[step - FIRST_INTRO] : null;
  const skipped = !protection.supported;
  const permissionRows = [
    { kind: "usage" as const, icon: "eye-outline" as const, title: "Usage Access", hint: "Sees which app is open", granted: !!caps?.usage, allow: () => protection.openPermission("usage") },
    { kind: "overlay" as const, icon: "layers-outline" as const, title: "Display over other apps", hint: "Covers distracting apps", granted: !!caps?.overlay, allow: () => protection.openPermission("overlay") },
    { kind: "notifications" as const, icon: "notifications-outline" as const, title: "Notifications", hint: "Break and End session alerts", granted: !!caps?.notifications, allow: async () => { const { enableNotifications } = await import("../services/notificationPermissionService"); await enableNotifications(); await protection.refresh(); } },
  ];
  const subtitles = [
    "Choose what matters to you right now. We’ll have ideas waiting once you’ve settled in.",
    "This is the name your squads will see. You can change it in Profile later.",
    "Start small, short sessions count too. You don’t have to do it all at once.",
    "LifeRPG can cover distracting apps while you focus. Optional, and you can change it in Settings.",
  ];
  const firstLabel = areas.length ? "Continue" : "Skip for now";
  const appsPage = step === PROTECTION_STEP && choosingApps;
  const query = search.trim().toLowerCase();
  const phoneApps = protection.apps ?? [];
  const apps = [...phoneApps].sort((a, b) => a.label.localeCompare(b.label)).filter(app => !query || app.label.toLowerCase().includes(query));
  const toggleApp = (pkg: string) => setAllowed(current => current.includes(pkg) ? current.filter(item => item !== pkg) : current.length < 64 ? [...current, pkg] : current);
  return <OnboardingFrame step={step + 1 + (step >= NAME_STEP ? offset : 0) - (skipped && step > PROTECTION_STEP ? 1 : 0)} total={(skipped ? 4 : 5) + offset} title={appsPage ? "Choose your apps" : intro?.title ?? TITLES[step]} subtitle={appsPage ? "Tick the apps you need while you focus. Everything else is covered during a session." : intro?.body ?? subtitles[step]} opacity={transition.opacity}
    busy={busy || (step === LAST_STEP && !guided.ready)} transitioning={transition.moving} primary={busy ? step === NAME_STEP ? "Checking…" : "Finishing setup…" : step === 0 ? firstLabel : step === LAST_STEP ? "Go to Today" : step === PROTECTION_STEP && !appsReady ? "Maybe later" : "Continue"} onNext={() => void next()}
    onBack={appsPage ? () => transition.change(() => setChoosingApps(false)) : step > 0 && !confirmed ? () => changeStep(step === FIRST_INTRO && skipped ? GOAL_STEP : step - 1) : undefined}
    error={(step === NAME_STEP ? "" : error) || (guided.error ? "Your preferences couldn’t be loaded. Please try again." : "")} retry={guided.error && !guided.ready ? () => void guided.retry() : undefined}>
    {step === 0 && <IdeaAreaPicker value={areas} onChange={setAreas} disabled={busy} />}
    {step === NAME_STEP && <View style={s.choices}><TextInput accessibilityLabel="Your name" value={name} onChangeText={value => { setName(value); setError(""); }} maxLength={ONBOARDING_NAME_LIMIT} placeholder="Your name" placeholderTextColor={colors.muted} style={[s.input, !!error && { borderColor: colors.danger }]} autoCapitalize="words" autoComplete="name" returnKeyType="next" onSubmitEditing={() => void next()} editable={!busy && !transition.moving} />{!!error && <Text testID="onboarding-name-error" style={s.inputError} accessibilityRole="alert">{error}</Text>}<Text style={s.hint}>Up to {ONBOARDING_NAME_LIMIT} characters. Make it feel like you.</Text></View>}
    {step === GOAL_STEP && <View style={s.choices}><View style={s.goals}>{DAILY_GOAL_PRESETS.map(minutes => <Pressable key={minutes} accessibilityRole="radio" accessibilityLabel={`${minutes} min`} accessibilityState={{ checked: goal === minutes }} disabled={busy} onPress={() => setGoal(minutes)} style={[s.goal, goal === minutes && s.selected]}><Text style={s.goalNumber}>{minutes}</Text><Text style={s.hint}>min / day</Text></Pressable>)}</View><Text style={s.hint}>You can change your goal in Settings once a week, and it kicks in the next day. A quiet day never takes away what you’ve earned.</Text></View>}
    {step === PROTECTION_STEP && !choosingApps && <View style={s.choices}>
      <View style={s.permissionList}>{permissionRows.map((row, index) => <View key={row.kind} style={[s.permissionRow, index > 0 && s.permissionDivider]}>
        <Ionicons name={row.icon} size={20} color={row.granted ? colors.accent : colors.secondary} />
        <View style={s.permissionCopy}><Text style={s.permissionTitle}>{row.title}</Text><Text style={s.permissionHint} numberOfLines={1}>{row.hint}</Text></View>
        {row.granted ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} accessibilityLabel={`${row.title} allowed`} />
          : <Pressable onPress={() => void row.allow()} accessibilityRole="button" accessibilityLabel={`Allow ${row.title}`} style={s.allow}><Text style={s.allowText}>Allow</Text></Pressable>}
      </View>)}</View>
      {!appsReady && <Text style={s.permissionHint}>Allow all three to turn protection on. Next, you’ll pick the apps that stay open.</Text>}
      {/* Two facts, one line each: the break, and what is never blocked. */}
      <View style={s.facts}>
        <View style={s.fact}><Ionicons name="cafe-outline" size={18} color={colors.secondary} /><Text style={s.permissionHint}>One 5-minute break per session</Text></View>
        <View style={s.fact}><Ionicons name="call-outline" size={18} color={colors.secondary} /><Text style={s.permissionHint}>Calls and Settings can never be blocked</Text></View>
      </View>
    </View>}
    {appsPage && <View style={s.choices}>
      {phoneApps.length > 12 && <TextInput accessibilityLabel="Search apps" value={search} onChangeText={setSearch} placeholder="Search apps" placeholderTextColor={colors.muted}
        autoCapitalize="none" autoCorrect={false} style={s.search} />}
      {!phoneApps.length ? <View style={s.permissionList}><View style={s.permissionRow}><Text style={[s.permissionHint, s.flex]}>Finding the apps on this phone…</Text>
        <Pressable onPress={() => void refreshProtection()} accessibilityRole="button" style={s.allow}><Text style={s.allowText}>Retry</Text></Pressable></View></View>
      : <View style={s.permissionList}>{apps.map((app, index) => {
        const on = allowed.includes(app.packageName);
        return <Pressable key={app.packageName} onPress={() => toggleApp(app.packageName)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={app.label}
          testID={`onboarding-app-${app.packageName}`} style={[s.appRow, index > 0 && s.permissionDivider]}>
          <Text style={[s.permissionTitle, s.flex]} numberOfLines={1}>{app.label}</Text>
          <View style={[s.check, on && s.checkOn]}>{on && <Ionicons name="checkmark" size={15} color={colors.background} />}</View>
        </Pressable>;
      })}{!apps.length && <View style={s.permissionRow}><Text style={s.permissionHint}>No apps match “{search.trim()}”.</Text></View>}</View>}
      <Text style={s.permissionHint}>{allowed.length ? `${allowed.length} ${allowed.length === 1 ? "app stays" : "apps stay"} open. You can change this in Settings.` : "None picked yet. Calls, Settings and LifeRPG always stay open."}</Text>
    </View>}
    {intro && <><View style={s.illustration}><View style={s.symbol}><Ionicons name={intro.icon} size={44} color={colors.accent} /></View></View><View style={s.note}><Text style={s.noteBody}>{intro.detail}</Text></View></>}
  </OnboardingFrame>;
}
const s = StyleSheet.create({
  permissionList: { ...edge, borderRadius: 20, backgroundColor: colors.surface, overflow: "hidden" },
  permissionRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 10 },
  permissionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  permissionCopy: { flex: 1, minWidth: 0, gap: 1 }, permissionTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  // The same sizes as the areas list on the first page, so every intro page reads alike.
  permissionHint: { color: colors.secondary, fontSize: 14, lineHeight: 18 },
  appRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 8 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.tertiary, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  search: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.text, fontSize: 16 },
  flex: { flex: 1, minWidth: 0 },
  facts: { gap: 10, paddingHorizontal: 6 }, fact: { flexDirection: "row", alignItems: "center", gap: 10 },
  allow: { minHeight: 36, paddingHorizontal: 16, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  allowText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  choices: { gap: 12 }, note: { ...edge, padding: 22, borderRadius: 22, backgroundColor: colors.surface, gap: 12 }, noteTitle: { color: colors.text, fontSize: 23, lineHeight: 29, fontWeight: "500" }, noteBody: { color: colors.secondary, fontSize: 17, lineHeight: 22 },
  inputError: { color: colors.danger, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  input: { minHeight: 60, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16, color: colors.text, fontSize: 20 }, hint: { color: colors.secondary, fontSize: 15, lineHeight: 20 }, goals: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  goal: { flexGrow: 1, flexBasis: "45%", borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 18, gap: 6 }, selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, goalNumber: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "500" },
  illustration: { alignItems: "center", paddingVertical: 4 }, symbol: { width: 112, height: 112, borderRadius: 56, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
});
