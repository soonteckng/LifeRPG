import { GlassView } from "expo-glass-effect";
import { Tabs, usePathname } from "expo-router";
import { Platform, StyleSheet, Text, View } from "react-native";

export default function TabsLayout() {
  const pathname = usePathname();

  const isHomeSubRoute =
    pathname === "/" || pathname === "/index";

  return (
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
            <View
              style={[
                styles.iconPill,
                focused && styles.iconPillActive,
              ]}
            >
              <Text
                style={[
                  styles.tabIcon,
                  focused && styles.tabIconActive,
                ]}
              >
                📜
              </Text>

              <Text
                style={[
                  styles.pillLabel,
                  focused && styles.pillLabelActive,
                ]}
              >
                Quests
              </Text>
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
            <View
              style={[
                styles.iconPill,
                focused && styles.iconPillActive,
              ]}
            >
              <Text
                style={[
                  styles.tabIcon,
                  focused && styles.tabIconActive,
                ]}
              >
                ⏱️
              </Text>

              <Text
                style={[
                  styles.pillLabel,
                  focused && styles.pillLabelActive,
                ]}
              >
                Focus
              </Text>
            </View>
          ),
        }}
      />

      {/* Tab 3: Home */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => {
            const isHomeActive =
              focused || isHomeSubRoute;

            return (
              <View
                style={[
                  styles.iconPill,
                  isHomeActive &&
                    styles.iconPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.tabIcon,
                    isHomeActive &&
                      styles.tabIconActive,
                  ]}
                >
                  🏰
                </Text>

                <Text
                  style={[
                    styles.pillLabel,
                    isHomeActive &&
                      styles.pillLabelActive,
                  ]}
                >
                  Home
                </Text>
              </View>
            );
          },
        }}
      />

      {/* Tab 4: Progress */}
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          tabBarIcon: ({ focused }) => (
            <View
              style={[
                styles.iconPill,
                focused && styles.iconPillActive,
              ]}
            >
              <Text
                style={[
                  styles.tabIcon,
                  focused && styles.tabIconActive,
                ]}
              >
                📈
              </Text>

              <Text
                style={[
                  styles.pillLabel,
                  focused && styles.pillLabelActive,
                ]}
              >
                Progress
              </Text>
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
            <View
              style={[
                styles.iconPill,
                focused && styles.iconPillActive,
              ]}
            >
              <Text
                style={[
                  styles.tabIcon,
                  focused && styles.tabIconActive,
                ]}
              >
                👤
              </Text>

              <Text
                style={[
                  styles.pillLabel,
                  focused && styles.pillLabelActive,
                ]}
              >
                Profile
              </Text>
            </View>
          ),
        }}
      />
    </Tabs>
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

  tabLabel: {
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },

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
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 4,
  },

  tabIcon: {
    fontSize: 20,
    opacity: 0.7,
  },

  tabIconActive: {
    fontSize: 24,
    opacity: 1,
  },

  pillLabel: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 1,
  },

  pillLabelActive: {
    color: "#FFFFFF",
  },
});