import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { saveOnboardingProfile } from "../services/onboardingService";
import { useUser } from "../context/UserContext";
import { PersonalButton, p } from "../components/PersonalUI";
import CharacterPortrait from "../components/CharacterPortrait";
import { colors } from "../constants/theme";
const AVATARS = ["🧙‍♂️", "🏋️", "🧑‍💻", "🎨", "🌱", "🥷"];
export default function OnboardingScreen() {
  const router = useRouter();
  const { profile, reloadProfile } = useUser();
  const [name, setName] = useState(
    profile.username === "Hero" ? "" : profile.username,
  );
  const [avatar, setAvatar] = useState(profile.avatar || "🌱");
  const [goal, setGoal] = useState(profile.daily_goal_minutes || 60);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const next = async () => {
    if (lock.current) return;
    if (!name.trim() || name.trim().length > 40) {
      setError("Enter a name between 1 and 40 characters.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await saveOnboardingProfile(
        name.trim(),
        avatar,
        profile.class_title || "Adventurer",
        goal,
      );
      await reloadProfile();
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
          <Text style={p.pageTitle}>Start with you.</Text>
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
          <Text style={p.rowTitle}>Choose a character badge</Text>
          <View style={[p.inline, { flexWrap: "wrap" }]}>
            {AVATARS.map((item) => (
              <Pressable
                key={item}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${item}`}
                accessibilityState={{ selected: avatar === item }}
                onPress={() => setAvatar(item)}
                style={[
                  p.pill,
                  {
                    padding: 16,
                    borderWidth: 1,
                    borderColor:
                      avatar === item ? colors.accent : "transparent",
                  },
                ]}
              >
                <Text style={{ fontSize: 28 }}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={p.rowTitle}>A daily goal you can return to</Text>
          <Text style={p.body}>
            This is a starting point, not a measure of your worth. Any completed
            session counts as showing up.
          </Text>
          <View style={[p.inline, { flexWrap: "wrap" }]}>
            {[30, 60, 90, 120].map((minutes) => (
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
            disabled={busy}
            onPress={() => void next()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
