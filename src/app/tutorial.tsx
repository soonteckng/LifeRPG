import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useUser } from "../context/UserContext";
import { finishOnboarding } from "../services/onboardingService";
import {
  PersonalButton,
  PersonalPage,
  p,
  type PersonalIcon,
} from "../components/PersonalUI";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { colors } from "../constants/theme";
export const INTRO_PAGES: {
  icon: PersonalIcon;
  title: string;
  body: string;
}[] = [
  {
    icon: "timer-outline",
    title: "Make time for what matters",
    body: "Start a free session or choose a quest. Pause when you need to, or minimise the timer while your session continues.",
  },
  {
    icon: "person-outline",
    title: "Your effort becomes your character",
    body: "Life areas collect XP from completed sessions. Your Life areas are your character’s stats: view their saved levels and growth in Profile. Levels reflect focused effort you’ve logged.",
  },
  {
    icon: "flame-outline",
    title: "Showing up counts",
    body: "Any completed session with focused time makes an active day. Consecutive active days build consistency—even when you don’t reach your daily goal.",
  },
  {
    icon: "checkmark-circle-outline",
    title: "Give your day a direction",
    body: "Quests add optional structure. Your daily goal is a separate commitment, recognised when you reach it. Start small and build a rhythm that suits you.",
  },
  {
    icon: "ribbon-outline",
    title: "Keep the progress you earn",
    body: "Milestones unlock automatically through completed sessions, focused time and consistency. Reaching your daily goal is recognised separately. A missed day doesn’t erase earned milestones or your character’s growth.",
  },
];
export default function TutorialScreen() {
  const router = useRouter();
  const { profile, reloadProfile } = useUser();
  const [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0.6);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [page, opacity, reduced]);
  const item = INTRO_PAGES[page];
  const last = page === INTRO_PAGES.length - 1;
  const finish = async () => {
    if (lock.current) return;
    if (profile.onboarding_completed) {
      if (router.canGoBack()) router.back();
      else router.replace("/");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await finishOnboarding();
      if (!(await reloadProfile())) throw new Error("Profile refresh failed");
      router.replace("/");
    } catch {
      setError(
        "Couldn’t finish setup. Please check your connection and try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <PersonalPage
      title="A little introduction"
      subtitle={
        profile.onboarding_completed
          ? "A reminder of how LifeRPG works."
          : "Your first steps, at your pace."
      }
      back={profile.onboarding_completed}
    >
      <Text style={p.label}>
        STEP {page + 1} OF {INTRO_PAGES.length}
      </Text>
      <Animated.View
        style={[p.card, { paddingVertical: 36, gap: 24, opacity }]}
      >
        <View style={[p.icon, { width: 72, height: 72, borderRadius: 24 }]}>
          <Ionicons name={item.icon} size={34} color={colors.accent} />
        </View>
        <Text style={[p.title, { fontSize: 27 }]} accessibilityRole="header">
          {item.title}
        </Text>
        <Text style={[p.body, { fontSize: 17, lineHeight: 27 }]}>
          {item.body}
        </Text>
      </Animated.View>
      <View style={p.inline}>
        {INTRO_PAGES.map((_, i) => (
          <View
            key={i}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 2,
              backgroundColor: i <= page ? colors.accent : colors.line,
            }}
          />
        ))}
      </View>
      {!!error && (
        <Text style={p.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <PersonalButton
        title={
          busy
            ? "Finishing setup…"
            : last
              ? profile.onboarding_completed
                ? "Done"
                : "Start my journey"
              : "Continue"
        }
        disabled={busy}
        onPress={() => {
          if (last) void finish();
          else setPage((current) => current + 1);
        }}
      />
      {page > 0 && (
        <PersonalButton
          secondary
          title="Previous step"
          disabled={busy}
          onPress={() => setPage((current) => current - 1)}
        />
      )}
    </PersonalPage>
  );
}
