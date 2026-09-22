import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, {
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUser } from "../context/UserContext";
import {
  finishOnboarding,
} from "../services/onboardingService";

const { width } =
  Dimensions.get("window");

const PAGES = [
  {
    icon: "⚡",
    title: "Sessions",
    description:
      "Do whatever helps you make progress. Study, work, code, exercise, read, clean, or simply focus on something important.",
  },
  {
    icon: "⭐",
    title: "XP & Gold",
    description:
      "Completed sessions help your character grow and earn Gold that you can use for rewards.",
  },
  {
    icon: "🔥",
    title: "Daily Goal",
    description:
      "Build consistency by reaching your Daily Goal. Completing it helps keep your streak alive.",
  },
  {
    icon: "🎯",
    title: "Quests",
    description:
      "Use quests when you want extra structure. They're optional, so you can always start a free session.",
  },
  {
    icon: "🎁",
    title: "Rewards",
    description:
      "Turn your progress into something meaningful with Gold, Daily Chests, personal rewards, and milestone rewards.",
  },
];

export default function TutorialScreen() {
  const router = useRouter();
  const { reloadProfile } =
    useUser();

  const flatListRef =
    useRef<FlatList>(null);

  const [page, setPage] =
    useState(0);

  const [finishing, setFinishing] =
    useState(false);

  const isLastPage =
    page === PAGES.length - 1;

  const handleNext = () => {
    if (isLastPage) {
      finish();
      return;
    }

    const nextPage =
      page + 1;

    flatListRef.current?.scrollToIndex(
      {
        index: nextPage,
        animated: true,
      },
    );

    setPage(nextPage);

    Haptics.impactAsync(
      Haptics.ImpactFeedbackStyle.Light,
    );
  };

  const finish = async () => {
    if (finishing) {
      return;
    }

    try {
      setFinishing(true);

      await finishOnboarding();
      await reloadProfile();

      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );

      router.replace("/");
    } catch (error) {
      console.error(
        "Failed to finish onboarding:",
        error,
      );

      setFinishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={PAGES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled
        keyExtractor={(_, index) =>
          String(index)
        }
        onMomentumScrollEnd={(event) => {
          const nextPage =
            Math.round(
              event.nativeEvent.contentOffset
                .x / width,
            );

          setPage(nextPage);
        }}
        renderItem={({ item }) => (
          <View style={styles.page}>
            <View
              style={styles.iconCircle}
            >
              <Text
                style={styles.pageIcon}
              >
                {item.icon}
              </Text>
            </View>

            <Text style={styles.pageTitle}>
              {item.title}
            </Text>

            <Text
              style={styles.pageDescription}
            >
              {item.description}
            </Text>
          </View>
        )}
      />

      <View
        style={styles.bottomSection}
      >
        <View
          style={styles.indicatorRow}
        >
          {PAGES.map(
            (_, index) => (
              <View
                key={index}
                style={[
                  styles.indicator,
                  index === page &&
                    styles.indicatorActive,
                ]}
              />
            ),
          )}
        </View>

        <Text
          style={styles.pageCounter}
        >
          {page + 1} / {PAGES.length}
        </Text>

        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNext}
          disabled={finishing}
          activeOpacity={0.85}
        >
          <Text
            style={styles.nextButtonText}
          >
            {finishing
              ? "STARTING..."
              : isLastPage
                ? "START YOUR JOURNEY"
                : "NEXT"}
          </Text>
        </TouchableOpacity>

        {!isLastPage && (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={finish}
            disabled={finishing}
          >
            <Text
              style={styles.skipText}
            >
              Skip tutorial
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090D16",
  },

  page: {
    width,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 34,
  },

  iconCircle: {
    width: 130,
    height: 130,
    borderRadius: 40,
    backgroundColor:
      "rgba(99,102,241,0.14)",
    borderWidth: 1,
    borderColor:
      "rgba(129,140,248,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },

  pageIcon: {
    fontSize: 62,
  },

  pageTitle: {
    color: "#F8FAFC",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },

  pageDescription: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 14,
    maxWidth: 330,
  },

  bottomSection: {
    paddingHorizontal: 24,
    paddingBottom: 25,
    alignItems: "center",
  },

  indicatorRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 9,
  },

  indicator: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor:
      "#334155",
  },

  indicatorActive: {
    width: 20,
    backgroundColor: "#818CF8",
  },

  pageCounter: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "800",
    marginBottom: 14,
  },

  nextButton: {
    width: "100%",
    height: 54,
    borderRadius: 16,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },

  nextButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  skipButton: {
    paddingVertical: 12,
  },

  skipText: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
  },
});