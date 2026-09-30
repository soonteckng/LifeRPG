import SessionTabBar from "../../components/SessionTabBar";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <SessionTabBar {...props} />}
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
            <Ionicons name="home-outline" size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          tabBarIcon: ({ color }) => (
            <Ionicons name="stats-chart-outline" size={21} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-outline" size={22} color={color} />
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

});
