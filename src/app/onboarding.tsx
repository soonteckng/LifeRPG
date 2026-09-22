import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  saveOnboardingProfile,
} from "../services/onboardingService";

const AVATARS = [
  "🧙‍♂️",
  "⚔️",
  "🧑‍💻",
  "🏋️",
  "🧠",
  "🥷",
];

const CLASS_TITLES = [
  "Adventurer",
  "Scholar",
  "Warrior",
  "Creator",
];

const GOAL_OPTIONS = [
  30,
  60,
  90,
  120,
];

export default function OnboardingScreen() {
  const router = useRouter();

  const [username, setUsername] =
    useState("");

  const [avatar, setAvatar] =
    useState("🧙‍♂️");

  const [classTitle, setClassTitle] =
    useState("Adventurer");

  const [dailyGoal, setDailyGoal] =
    useState(60);

  const [saving, setSaving] =
    useState(false);

  const handleContinue = async () => {
    const cleanUsername =
      username.trim();

    if (!cleanUsername) {
      return;
    }

    try {
      setSaving(true);

      await saveOnboardingProfile(
        cleanUsername,
        avatar,
        classTitle,
        dailyGoal,
      );

      if (true) {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }

      router.replace("/tutorial");
    } catch (error) {
      console.error(
        "Failed to save onboarding:",
        error,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topSection}>
          <Text style={styles.logo}>
            🏰
          </Text>

          <Text style={styles.title}>
            Welcome to LifeRPG
          </Text>

          <Text style={styles.subtitle}>
            Let's set up your character
            before you begin.
          </Text>
        </View>

        {/* AVATAR */}
        <Text style={styles.label}>
          CHOOSE YOUR AVATAR
        </Text>

        <View style={styles.avatarGrid}>
          {AVATARS.map((item) => {
            const selected =
              avatar === item;

            return (
              <TouchableOpacity
                key={item}
                style={[
                  styles.avatarButton,
                  selected &&
                    styles.avatarButtonSelected,
                ]}
                onPress={() =>
                  setAvatar(item)
                }
              >
                <Text
                  style={
                    styles.avatarEmoji
                  }
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* USERNAME */}
        <Text style={styles.label}>
          USERNAME
        </Text>

        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="What should we call you?"
          placeholderTextColor="#64748B"
          style={styles.input}
          maxLength={30}
          autoCapitalize="words"
        />

        {/* CLASS */}
        <Text style={styles.label}>
          YOUR TITLE
        </Text>

        <View style={styles.choiceGrid}>
          {CLASS_TITLES.map(
            (title) => {
              const selected =
                classTitle === title;

              return (
                <TouchableOpacity
                  key={title}
                  style={[
                    styles.choiceButton,
                    selected &&
                      styles.choiceButtonSelected,
                  ]}
                  onPress={() =>
                    setClassTitle(title)
                  }
                >
                  <Text
                    style={[
                      styles.choiceText,
                      selected &&
                        styles.choiceTextSelected,
                    ]}
                  >
                    {title}
                  </Text>
                </TouchableOpacity>
              );
            },
          )}
        </View>

        {/* DAILY GOAL */}
        <Text style={styles.label}>
          DAILY GOAL
        </Text>

        <Text style={styles.goalHint}>
          How much focused progress do
          you want to aim for each day?
        </Text>

        <View style={styles.goalGrid}>
          {GOAL_OPTIONS.map(
            (minutes) => {
              const selected =
                dailyGoal === minutes;

              return (
                <TouchableOpacity
                  key={minutes}
                  style={[
                    styles.goalButton,
                    selected &&
                      styles.goalButtonSelected,
                  ]}
                  onPress={() =>
                    setDailyGoal(
                      minutes,
                    )
                  }
                >
                  <Text
                    style={[
                      styles.goalValue,
                      selected &&
                        styles.goalValueSelected,
                    ]}
                  >
                    {minutes}
                  </Text>

                  <Text
                    style={[
                      styles.goalUnit,
                      selected &&
                        styles.goalUnitSelected,
                    ]}
                  >
                    min
                  </Text>
                </TouchableOpacity>
              );
            },
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.continueButton,
            (!username.trim() ||
              saving) &&
              styles.continueButtonDisabled,
          ]}
          onPress={
            handleContinue
          }
          disabled={
            !username.trim() ||
            saving
          }
          activeOpacity={0.85}
        >
          <Text
            style={
              styles.continueText
            }
          >
            {saving
              ? "SAVING..."
              : "CONTINUE"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          You can change these later.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090D16",
  },

  content: {
    paddingHorizontal: 24,
    paddingBottom: 50,
  },

  topSection: {
    alignItems: "center",
    marginTop: 34,
    marginBottom: 34,
  },

  logo: {
    fontSize: 44,
    marginBottom: 12,
  },

  title: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },

  subtitle: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 280,
  },

  label: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 9,
    marginTop: 18,
  },

  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  avatarButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor:
      "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarButtonSelected: {
    backgroundColor:
      "rgba(99,102,241,0.20)",
    borderColor: "#6366F1",
  },

  avatarEmoji: {
    fontSize: 27,
  },

  input: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#111C30",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.09)",
    color: "#F8FAFC",
    paddingHorizontal: 14,
    fontSize: 14,
  },

  choiceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  choiceButton: {
    flex: 1,
    minWidth: "47%",
    height: 46,
    borderRadius: 13,
    backgroundColor: "#111C30",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  choiceButtonSelected: {
    backgroundColor:
      "rgba(99,102,241,0.20)",
    borderColor: "#6366F1",
  },

  choiceText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
  },

  choiceTextSelected: {
    color: "#FFFFFF",
  },

  goalHint: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
    marginBottom: 9,
  },

  goalGrid: {
    flexDirection: "row",
    gap: 8,
  },

  goalButton: {
    flex: 1,
    minHeight: 62,
    borderRadius: 14,
    backgroundColor: "#111C30",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  goalButtonSelected: {
    backgroundColor:
      "rgba(99,102,241,0.20)",
    borderColor: "#6366F1",
  },

  goalValue: {
    color: "#CBD5E1",
    fontSize: 17,
    fontWeight: "900",
  },

  goalValueSelected: {
    color: "#FFFFFF",
  },

  goalUnit: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "800",
    marginTop: 2,
  },

  goalUnitSelected: {
    color: "#C7D2FE",
  },

  continueButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
  },

  continueButtonDisabled: {
    opacity: 0.45,
  },

  continueText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  footerText: {
    color: "#475569",
    fontSize: 9,
    textAlign: "center",
    marginTop: 12,
  },
});