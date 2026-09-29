import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import {
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import AuthScreen from "../components/AuthScreen";
import LevelUpModal from "../components/LevelUpModal";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { TimerProvider, useTimer } from "../context/TimerContext";
import { UserProvider, useUser } from "../context/UserContext";

function GlobalBackHandler() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onBackPress = () => {
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
  const { sessionSummary, completedLevelUp, clearCompletionModal } = useTimer();
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
      visible={!!sessionSummary || !!completedLevelUp}
      xpEarned={sessionSummary?.xpEarned || 0}
      minutesSpent={sessionSummary?.minutesSpent || 0}
      questTitle={sessionSummary?.questTitle}
      isLevelUp={!!completedLevelUp?.leveledUp}
      newLevel={completedLevelUp?.newLevel || currentLevel}
      currentXP={currentXP}
      requiredXP={requiredXP}
      onClose={clearCompletionModal}
    />
  );
}

function ActiveTimerBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const { isRunning, timeLeft, duration, isCompleted } = useTimer();

  const isSessionActive = (isRunning || timeLeft < duration) && !isCompleted;

  if (!isSessionActive || pathname === "/session") return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;

  return (
    <TouchableOpacity
      style={[styles.activeBanner, !isRunning && styles.pausedBanner]}
      onPress={() => router.push("/session")}
      activeOpacity={0.85}
    >
      <View style={styles.bannerInfo}>
        <View style={[styles.pulseDot, !isRunning && styles.pausedDot]} />
        <Text style={styles.bannerTitle}>
          {isRunning ? "Focus Session Active" : "Session Paused"}
        </Text>
      </View>
      <Text style={styles.bannerTimer}>{formattedTime} ›</Text>
    </TouchableOpacity>
  );
}

function AppContent() {
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
      <GlobalBackHandler />

      <Stack
        screenOptions={{
          headerShown: false,
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
          options={{
            presentation: "fullScreenModal",
            animation: "slide_from_bottom",
          }}
        />
        <Stack.Screen
          name="quests"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [0.72, 1],
            sheetInitialDetentIndex: 0,
            sheetGrabberVisible: true,
            sheetCornerRadius: 28,
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

      <ActiveTimerBanner />
      <GlobalRewardListener />
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

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 24 : 16,
    left: "4%",
    right: "4%",
    height: 50,
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    borderRadius: 25,
    borderWidth: 0,
    borderTopColor: "transparent",
    paddingBottom: 0,
    paddingTop: 0,
    shadowColor: "transparent",
    elevation: 0,
  },
  glassBackground: {
    ...StyleSheet.absoluteFill,
    borderRadius: 25,
    overflow: "hidden",
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  tabItem: {
    flex: 1,
    paddingVertical: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  tabIconContainer: {
    marginTop: 0,
    marginBottom: 0,
    alignSelf: "center",
  },
  tabLabel: { fontSize: 10, fontWeight: "800", marginTop: 2 },
  iconPill: {
    width: 54,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: 4 }],
    marginTop: 0,
  },
  iconPillActive: {
    backgroundColor: "rgba(129, 140, 248, 0.34)",
    borderWidth: 1,
    borderColor: "rgba(199, 210, 254, 0.7)",
    shadowColor: "#818CF8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 4,
  },
  tabIcon: { fontSize: 20, opacity: 0.7 },
  tabIconActive: { fontSize: 24, opacity: 1 },
  pillLabel: { color: "#94A3B8", fontSize: 9, fontWeight: "800", marginTop: 1 },
  pillLabelActive: { color: "#FFFFFF" },
  activeBanner: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 98 : 90,
    left: 16,
    right: 16,
    backgroundColor: "#10B981",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 1000,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  pausedBanner: { backgroundColor: "#F59E0B", shadowColor: "#F59E0B" },
  bannerInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  pausedDot: { backgroundColor: "rgba(255, 255, 255, 0.6)" },
  bannerTitle: { color: "#FFFFFF", fontSize: 12, fontWeight: "bold" },
  bannerTimer: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
});
