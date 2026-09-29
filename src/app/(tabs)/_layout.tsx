import { Tabs } from "expo-router";
import { Platform, StyleSheet, Text } from "react-native";

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="index"
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarActiveTintColor: "#F8FAFC",
        tabBarInactiveTintColor: "#8B93A7",
        tabBarLabelStyle: styles.tabLabel,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <Text style={[styles.icon, { color }]}>⌂</Text>
          ),
        }}
      />

      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          tabBarIcon: ({ color }) => (
            <Text style={[styles.icon, { color }]}>↗</Text>
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Text style={[styles.icon, { color }]}>◉</Text>
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
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: Platform.OS === "ios" ? 18 : 14,
    height: 66,
    borderRadius: 24,
    backgroundColor: "rgba(20, 24, 34, 0.94)",
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    paddingTop: 7,
    paddingBottom: Platform.OS === "ios" ? 8 : 7,
    elevation: 0,
    shadowColor: "transparent",
  },

  tabItem: {
    justifyContent: "center",
    alignItems: "center",
  },

  tabLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },

  icon: {
    fontSize: 21,
    fontWeight: "600",
  },
});
