import { FloatingDockProvider } from "../../context/FloatingDockContext";
import GlassSurface from "../../components/GlassSurface";
import { colors } from "../../constants/theme";
import SessionTabBar from "../../components/SessionTabBar";
import TabIcon from "../../components/TabIcon";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";

export default function TabsLayout() {
  const reducedMotion = useReducedMotion();
  return (
    <FloatingDockProvider><Tabs
      tabBar={(props) => <SessionTabBar {...props} />}
      initialRouteName="index"
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        animation: reducedMotion ? "none" : "fade",
        transitionSpec: { animation: "timing", config: { duration: reducedMotion ? 0 : 180 } },
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => <GlassSurface radius={24} />,
        tabBarItemStyle: styles.tabItem,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} name="home-outline" size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} name="stats-chart-outline" size={21} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} name="person-outline" size={22} color={color} />
          ),
        }}
      />

      {/* Kept as routes for now, but no longer exposed as tabs. */}
      <Tabs.Screen
        name="tasks"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="timer"
        options={{
          href: null,
        }}
      />
    </Tabs></FloatingDockProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 66,
    borderRadius: 24,
    backgroundColor: "transparent",
    borderTopWidth: 0,
    borderWidth: 0,
    borderColor: "rgba(255,255,255,0.07)",
    paddingTop: 7,
    paddingBottom: Platform.OS === "ios" ? 8 : 7,
    elevation: 0,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },

  tabItem: {
    justifyContent: "center",
    alignItems: "center",
  },

  tabLabel: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "System" : undefined,
    fontWeight: "500",
    marginTop: 1,
  },

});
