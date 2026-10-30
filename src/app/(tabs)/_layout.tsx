import { tapHaptic, tapHapticsEnabled } from "../../utils/tapHaptics";
import { FloatingDockProvider } from "../../context/FloatingDockContext";
import { PinnedActionProvider } from "../../components/PinnedAction";
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
    <FloatingDockProvider><PinnedActionProvider><Tabs
      tabBar={(props) => <SessionTabBar {...props} />}
      screenListeners={{ tabPress: () => { if (tapHapticsEnabled()) tapHaptic(); } }}
      initialRouteName="index"
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        // Always the same fade (instant when the phone asks for less motion):
        // switching animation modes could leave a tab's content hidden.
        animation: "fade",
        transitionSpec: { animation: "timing", config: { duration: reducedMotion ? 0 : 180 } },
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => <GlassSurface radius={33} />,
        tabBarItemStyle: styles.tabItem,
        tabBarActiveTintColor: colors.primary,
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
        name="routines"
        options={{
          title: "Routines",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} name="repeat-outline" size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="study"
        options={{
          title: "Study",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} name="school-outline" size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="squads"
        options={{
          title: "Squads",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} name="people-outline" size={23} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="progress"
        options={{
          title: "Your rhythm",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} name="stats-chart-outline" size={21} color={color} />
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
    </Tabs></PinnedActionProvider></FloatingDockProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 66,
    borderRadius: 33,
    backgroundColor: "transparent",
    borderTopWidth: 0,
    borderWidth: 0,
    borderColor: colors.line,
    paddingTop: 7,
    paddingBottom: Platform.OS === "ios" ? 8 : 7,
    elevation: 0,
    shadowColor: colors.text,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },

  tabItem: {
    justifyContent: "center",
    alignItems: "center",
  },

  tabLabel: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "System" : undefined,
    fontWeight: "500",
    marginTop: 1,
  },

});
