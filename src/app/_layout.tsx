import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { BackHandler } from "react-native";


import AuthScreen from "../components/AuthScreen";
import LevelUpModal from "../components/LevelUpModal";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { TimerProvider, useTimer } from "../context/TimerContext";
import { UserProvider, useUser } from "../context/UserContext";
import { QuestProvider } from "../context/QuestContext";
import { useReducedMotion } from "../hooks/useReducedMotion";

export const unstable_settings = { initialRouteName: "(tabs)" };

function GlobalBackHandler() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onBackPress = () => {
      // Session owns keyboard/picker priority and native modal dismissal.
      if (pathname === "/session" || pathname === "/timer") return false;
      // Home is the root. Let Android handle the default exit behavior.
      if (pathname === "/" || pathname === "/index") {
        return false;
      }

      // Onboarding is intentionally not dismissible.
      if (pathname === "/onboarding") {
        return true;
      }

      // Tutorial returns to onboarding when there is no previous page.
      if (pathname === "/tutorial") {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/onboarding");
        }
        return true;
      }

      // Tabs are root-level destinations. Android back always returns Home.
      if (
        pathname === "/progress" ||
        pathname === "/profile"
      ) {
        router.replace("/");
        return true;
      }

      // Secondary screens and modal routes use the native stack history.
      if (router.canGoBack()) {
        router.back();
        return true;
      }

      router.replace("/");
      return true;
    };

    const subscription =
      BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );

    return () => subscription.remove();
  }, [pathname, router]);

  return null;
}

function GlobalRewardListener() {
  const { sessionSummary, completedLevelUp, clearCompletionModal, rewardsVisible } = useTimer();
  const { profile, reloadProfile } = useUser();

  useEffect(() => {
    if (sessionSummary || completedLevelUp) {
      reloadProfile();
    }
  }, [sessionSummary, completedLevelUp, reloadProfile]);

  const currentXP = profile?.current_xp || 0;
  const currentLevel = profile?.level || 1;
  const requiredXP = Math.floor(100 * Math.pow(currentLevel, 1.5));

  return (
    <LevelUpModal
      visible={rewardsVisible}
      xpEarned={sessionSummary?.xpEarned || 0}
      minutesSpent={sessionSummary?.minutesSpent || 0}
      durationSeconds={sessionSummary?.durationSeconds}
      questTitle={sessionSummary?.questTitle}
      isLevelUp={!!completedLevelUp?.leveledUp}
      newLevel={completedLevelUp?.newLevel || currentLevel}
      currentXP={currentXP}
      requiredXP={requiredXP}
      onClose={clearCompletionModal}
    />
  );
}

function AppContent() {
  const reducedMotion = useReducedMotion();
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useUser();

  useEffect(() => {
    if (!profile.id) {
      return;
    }

    const onboardingRoute = pathname === "/onboarding";
    const tutorialRoute = pathname === "/tutorial";

    if (!profile.onboarding_completed && !onboardingRoute && !tutorialRoute) {
      router.replace("/onboarding");
    }
  }, [profile.id, profile.onboarding_completed, pathname, router]);

  return (
    <TimerProvider>
      <QuestProvider>
        <GlobalBackHandler />

        <Stack
          screenOptions={{
            headerShown: false,
            animation: reducedMotion ? "none" : "slide_from_right",
            contentStyle: {
              backgroundColor: "#090D16",
            },
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="session"
            dangerouslySingular
            options={{
              // A full-screen card uses the reversible native stack slide on both platforms.
              presentation: "card",
              animation: reducedMotion ? "fade" : "slide_from_bottom",
              gestureDirection: "vertical",
              animationMatchesGesture: true,
            }}
          />
          <Stack.Screen
            name="quests"
            options={{
              presentation: "transparentModal",
              animation: "none",
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
          <Stack.Screen
            name="rewards"
            options={{
              presentation: "card",
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              presentation: "card",
            }}
          />
          <Stack.Screen
            name="onboarding"
            options={{
              headerShown: false,
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="tutorial"
            options={{
              headerShown: false,
            }}
          />
        </Stack>

        <GlobalRewardListener />
      </QuestProvider>
    </TimerProvider>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

