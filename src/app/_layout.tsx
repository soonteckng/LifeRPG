import { Tabs, usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { GlassView } from "expo-glass-effect";
import {
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { initDatabase } from "../../db/database";
import LevelUpModal from "../components/LevelUpModal";
import { TimerProvider, useTimer } from "../context/TimerContext";
import { UserProvider, useUser } from "../context/UserContext";

function GlobalBackHandler() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onBackPress = () => {
      // 1. Home Screen: Allow system default (minimize/exit app)
      if (pathname === "/" || pathname === "/index") {
        return false;
      }

      // 2. Second Layer Sub-pages (Analytics, Settings, etc.): Go back to previous screen
      if (pathname === "/analytics" || pathname === "/settings") {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/");
        }
        return true;
      }

      // 3. Any Tab in Tab Layer (Quests, Focus, Shop, Profile): Go directly to Home
      router.replace("/");
      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
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

  if (!isSessionActive || pathname === "/timer") return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;

  return (
    <TouchableOpacity
      style={[styles.activeBanner, !isRunning && styles.pausedBanner]}
      onPress={() => router.push("/timer")}
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

export default function RootLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const previousPathname = useRef(pathname);
  const lastHomeSubRoute = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === "/analytics") {
      lastHomeSubRoute.current = pathname;
    } else if (
      (pathname === "/" || pathname === "/index") &&
      previousPathname.current === "/analytics"
    ) {
      lastHomeSubRoute.current = null;
    }

    previousPathname.current = pathname;
  }, [pathname]);

  useEffect(() => {
    try {
      initDatabase();
      console.log("Database initialized successfully on startup!");
    } catch (e) {
      console.error("Failed to initialize database on startup:", e);
    }
  }, []);

  // Check if current route is Home or a sub-page of Home (e.g., /analytics)
  const isHomeSubRoute =
    pathname === "/" || pathname === "/index" || pathname === "/analytics";

  return (
    <UserProvider>
      <TimerProvider>
        <GlobalBackHandler />
        <Tabs
          initialRouteName="index"
          backBehavior="initialRoute"
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: false,
            tabBarStyle: styles.tabBar,
            tabBarItemStyle: styles.tabItem,
            tabBarIconStyle: styles.tabIconContainer,
            tabBarBackground: () => (
              <GlassView
                style={styles.glassBackground}
                glassEffectStyle="clear"
              />
            ),
            tabBarActiveTintColor: "#FFFFFF",
            tabBarInactiveTintColor: "#94A3B8",
            tabBarLabelStyle: styles.tabLabel,
          }}
        >
          {/* Tab 1: Quests */}
          <Tabs.Screen
            name="tasks"
            options={{
              title: "Quests",
              tabBarIcon: ({ focused }) => (
                <View style={[styles.iconPill, focused && styles.iconPillActive]}>
                  <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>📜</Text>
                  <Text style={[styles.pillLabel, focused && styles.pillLabelActive]}>Quests</Text>
                </View>
              ),
            }}
          />

          {/* Tab 2: Focus Timer */}
          <Tabs.Screen
            name="timer"
            options={{
              title: "Focus",
              tabBarIcon: ({ focused }) => (
                <View style={[styles.iconPill, focused && styles.iconPillActive]}>
                  <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>⏱️</Text>
                  <Text style={[styles.pillLabel, focused && styles.pillLabelActive]}>Focus</Text>
                </View>
              ),
            }}
          />

          {/* Tab 3: Home (Highlights for Home and Home Sub-pages like /analytics) */}
          <Tabs.Screen
            name="index"
            options={{
              title: "Home",
              listeners: {
                tabPress: (event) => {
                  if (
                    lastHomeSubRoute.current === "/analytics" &&
                    pathname !== "/analytics"
                  ) {
                    event.preventDefault();
                    router.navigate("/analytics");
                  }
                },
              },
              tabBarIcon: ({ focused }) => {
                const isHomeActive = focused || isHomeSubRoute;
                return (
                  <View style={[styles.iconPill, isHomeActive && styles.iconPillActive]}>
                    <Text style={[styles.tabIcon, isHomeActive && styles.tabIconActive]}>🏰</Text>
                    <Text style={[styles.pillLabel, isHomeActive && styles.pillLabelActive]}>Home</Text>
                  </View>
                );
              },
            }}
          />

          {/* Tab 4: Shop */}
          <Tabs.Screen
            name="shop"
            options={{
              title: "Shop",
              tabBarIcon: ({ focused }) => (
                <View style={[styles.iconPill, focused && styles.iconPillActive]}>
                  <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>🛒</Text>
                  <Text style={[styles.pillLabel, focused && styles.pillLabelActive]}>Shop</Text>
                </View>
              ),
            }}
          />

          {/* Tab 5: Profile */}
          <Tabs.Screen
            name="profile"
            options={{
              title: "Profile",
              tabBarIcon: ({ focused }) => (
                <View style={[styles.iconPill, focused && styles.iconPillActive]}>
                  <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>👤</Text>
                  <Text style={[styles.pillLabel, focused && styles.pillLabelActive]}>Profile</Text>
                </View>
              ),
            }}
          />

          {/* Hidden Routes */}
          <Tabs.Screen name="analytics" options={{ href: null }} />
          <Tabs.Screen name="settings" options={{ href: null }} />
        </Tabs>

        <ActiveTimerBanner />
        <GlobalRewardListener />
      </TimerProvider>
    </UserProvider>
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
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
  pausedDot: { backgroundColor: "rgba(255, 255, 255, 0.6)" },
  bannerTitle: { color: "#FFFFFF", fontSize: 12, fontWeight: "bold" },
  bannerTimer: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
});