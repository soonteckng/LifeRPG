import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  BackHandler,
  Platform,
  ActivityIndicator,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Constants from "expo-constants";

import { PersonalButton, p } from "../components/PersonalUI";
import AuthScreen from "../components/AuthScreen";
import LevelUpModal from "../components/LevelUpModal";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { TimerProvider, useTimer } from "../context/TimerContext";
import { UserProvider, useUser } from "../context/UserContext";
import { QuestProvider } from "../context/QuestContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { secondaryNativeOptions, sessionNativeOptions, traceSession } from "../utils/sessionTransition";

export const unstable_settings = { initialRouteName: "(tabs)" };

function GlobalBackHandler() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useUser();

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
          router.replace(profile.onboarding_completed ? "/" : "/onboarding");
        }
        return true;
      }

      // Tabs are root-level destinations. Android back always returns Home.
      if (pathname === "/progress" || pathname === "/profile") {
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

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress,
    );

    return () => subscription.remove();
  }, [pathname, router, profile.onboarding_completed]);

  return null;
}

function GlobalRewardListener() {
  const {
    sessionSummary,
    completedLevelUp,
    clearCompletionModal,
    rewardsVisible,
  } = useTimer();
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
      goldEarned={sessionSummary?.goldEarned || 0}
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
    traceSession("runtime/motion", {
      os: Platform.OS,
      nativeRN: Platform.constants.reactNativeVersion,
      executionEnvironment: Constants.executionEnvironment,
      reducedMotion,
    });
  }, [reducedMotion]);

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
          screenListeners={({ route, navigation }) =>
            route.name.startsWith("session")
              ? {
                  beforeRemove: (event) => {
                    traceSession("root beforeRemove", {
                      route: route.key,
                      action: event.data.action.type,
                      navigator: navigation.getState()?.key,
                      history: navigation.getState()?.routes.map((item) => ({
                        name: item.name,
                        key: item.key,
                      })),
                      reducedMotion,
                    });
                  },
                  transitionStart: (event) =>
                    traceSession("root transitionStart", {
                      route: route.key,
                      closing: event.data.closing,
                      reducedMotion,
                    }),
                  transitionEnd: (event) =>
                    traceSession("root transitionEnd", {
                      route: route.key,
                      closing: event.data.closing,
                      reducedMotion,
                    }),
                }
              : {}
          }
          screenOptions={{
            headerShown: false,
            animation: reducedMotion ? "none" : "slide_from_right",
            contentStyle: {
              backgroundColor: "#090D16",
            },
          }}
        >
          <Stack.Protected guard={profile.onboarding_completed}>
            <Stack.Screen
              name="(tabs)"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="session"
              dangerouslySingular
              options={sessionNativeOptions()}
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
              options={secondaryNativeOptions(reducedMotion)}
            />
            <Stack.Screen
              name="settings"
              options={secondaryNativeOptions(reducedMotion)}
            />
          </Stack.Protected>
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

function ProfileGate() {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const { profile, profileLoading, profileError, reloadProfile } = useUser();
  if (!profile.id)
    return (
      <View
        style={[p.page, { justifyContent: "center", padding: 28, gap: 18 }]}
      >
        {profileLoading ? (
          <ActivityIndicator />
        ) : (
          <>
            <Text style={p.error}>
              {profileError
                ? "Couldn’t load your account. Please try again."
                : "Your account profile is not available yet."}
            </Text>
            <PersonalButton
              title="Retry account loading"
              onPress={() => void reloadProfile()}
            />
            <PersonalButton
              secondary
              title={signingOut ? "Signing out…" : "Return to sign in"}
              disabled={signingOut}
              onPress={() => {
                setSigningOut(true);
                void signOut()
                  .then((result) => {
                    if (result.error)
                      setSignOutError("Couldn’t sign out. Please try again.");
                  })
                  .catch(() =>
                    setSignOutError("Couldn’t sign out. Please try again."),
                  )
                  .finally(() => setSigningOut(false));
              }}
            />
            {!!signOutError && <Text style={p.error}>{signOutError}</Text>}
          </>
        )}
      </View>
    );
  return <AppContent />;
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={[p.page, { justifyContent: "center" }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <UserProvider key={user.id}>
      <ProfileGate />
    </UserProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
