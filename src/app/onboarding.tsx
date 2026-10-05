import GuidedChoice from "../components/GuidedChoice";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import { DEFAULT_GUIDED_PREFERENCE } from "../services/guidedPreferenceService";
import Pressable from "../components/MotionPressable";
import { Text, TextInput } from "../components/AppText";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { saveOnboardingProfile } from "../services/onboardingService";
import { useUser } from "../context/UserContext";
import { PersonalButton, p } from "../components/PersonalUI";
import CharacterPortrait from "../components/CharacterPortrait";
import { colors } from "../constants/theme";
import { DAILY_GOAL_PRESETS, validateDailyGoal } from "../utils/dailyGoal";
export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState({ ...DEFAULT_GUIDED_PREFERENCE, invited: true });
  const { profile, reloadProfile } = useUser();
  const guided = useGuidedPreference(profile.id ?? "");
  const [name, setName] = useState(
    profile.username === "Hero" ? "" : profile.username,
  );
  const avatar = profile.avatar || "🌱";
  const [goal, setGoal] = useState(Math.max(30, profile.daily_goal_minutes || 60));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const next = async () => {
    if (lock.current) return;
    if (!name.trim() || name.trim().length > 40) {
      setError("Enter a name between 1 and 40 characters.");
      return;
    }
    const goalError = validateDailyGoal(goal);
    if (goalError) { setError(goalError); return; }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await guided.save(direction))) throw new Error("Suggestion preferences could not be saved");
      await saveOnboardingProfile(
        name.trim(),
        avatar,
        profile.class_title || "Adventurer",
        goal,
      );
      if (!(await reloadProfile())) throw new Error("Profile refresh failed");
      router.replace("/tutorial");
    } catch {
      setError(
        "Couldn’t save your profile. Your choices are still here—please try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={p.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 24, paddingBottom: 40, gap: 18 }}
        >
          <Text style={p.label}>WELCOME TO LIFERPG</Text>
          <Text style={p.pageTitle}>{step === 0 ? "A little direction." : "Start with you."}</Text>
          {step === 0 ? <>
            <Text style={p.body}>You can start with a suggestion or focus your own way. Change this anytime in Settings.</Text>
            <GuidedChoice value={direction} onChange={setDirection} />
            <PersonalButton title="Continue" onPress={() => setStep(1)} />
            <PersonalButton secondary title="Skip suggestions" onPress={() => { setDirection({ ...DEFAULT_GUIDED_PREFERENCE, invited: true }); setStep(1); }} />
          </> : <>
          <Text style={p.body}>
            Your character will grow through the time you invest in your life.
          </Text>
          <CharacterPortrait avatar={avatar} />
          <Text style={p.rowTitle}>What should we call you?</Text>
          <TextInput
            accessibilityLabel="Your name"
            style={p.input}
            editable={!busy}
            maxLength={40}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
          />
          <Text style={p.body}>You can personalise your character in Profile later.</Text>
          <Text style={p.rowTitle}>Your starting daily goal</Text>
          <Text style={p.body}>
            Keep the default or choose another starting point. Smaller sessions still count as showing up.
          </Text>
          <View style={[p.inline, { flexWrap: "wrap" }]}>
            {DAILY_GOAL_PRESETS.map((minutes) => (
              <Pressable
                key={minutes}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ selected: goal === minutes }}
                onPress={() => setGoal(minutes)}
                style={[
                  p.pill,
                  {
                    borderWidth: 1,
                    borderColor:
                      goal === minutes ? colors.accent : "transparent",
                  },
                ]}
              >
                <Text style={p.rowTitle}>{minutes} min</Text>
              </Pressable>
            ))}
          </View>
          {!!error && (
            <Text style={p.error} accessibilityRole="alert">
              {error}
            </Text>
          )}
          <PersonalButton
            title={busy ? "Saving…" : "Continue to the introduction"}
            disabled={busy || !guided.ready}
            onPress={() => void next()}
          />
          {!guided.ready && guided.error && <PersonalButton secondary title="Retry loading preferences" onPress={() => void guided.retry()} />}
          <PersonalButton secondary title="Back to direction" disabled={busy} onPress={() => setStep(0)} />
          </>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
