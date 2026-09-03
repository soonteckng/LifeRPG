import React from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { TimerProvider, useTimer } from '../context/TimerContext';
import { UserProvider, useUser } from '../context/UserContext';
import LevelUpModal from '../components/LevelUpModal';

function GlobalRewardListener() {
  const { sessionSummary, completedLevelUp, clearCompletionModal } = useTimer();
  const { profile } = useUser();

  const requiredXP = profile ? Math.floor(100 * Math.pow(profile.level, 1.5)) : 100;

  return (
    <LevelUpModal
      visible={!!sessionSummary || !!completedLevelUp}
      xpEarned={sessionSummary?.xpEarned || 0}
      minutesSpent={sessionSummary?.minutesSpent || 0}
      questTitle={sessionSummary?.questTitle}
      isLevelUp={!!completedLevelUp?.leveledUp}
      newLevel={completedLevelUp?.newLevel || profile?.level || 1}
      currentXP={profile?.current_xp || 0}
      requiredXP={requiredXP}
      onClose={clearCompletionModal}
    />
  );
}

function ActiveTimerBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const { isRunning, timeLeft, duration, isCompleted } = useTimer();

  // Show banner whenever a session is active OR paused (not finished, not zero)
  const isSessionActive = (isRunning || timeLeft < duration) && !isCompleted;

  if (!isSessionActive || pathname === '/timer') return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;

  return (
    <TouchableOpacity
      style={[styles.activeBanner, !isRunning && styles.pausedBanner]}
      onPress={() => router.push('/timer')}
      activeOpacity={0.85}
    >
      <View style={styles.bannerInfo}>
        <View style={[styles.pulseDot, !isRunning && styles.pausedDot]} />
        <Text style={styles.bannerTitle}>
          {isRunning ? 'Focus Session Active' : 'Session Paused'}
        </Text>
      </View>
      <Text style={styles.bannerTimer}>{formattedTime} ›</Text>
    </TouchableOpacity>
  );
}

export default function RootLayout() {
  return (
    <UserProvider>
      <TimerProvider>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: true,
            tabBarStyle: styles.tabBar,
            tabBarItemStyle: styles.tabItem,
            tabBarActiveTintColor: '#818CF8',
            tabBarInactiveTintColor: '#64748B',
            tabBarLabelStyle: styles.tabLabel,
          }}
        >
          <Tabs.Screen
            name="tasks"
            options={{
              title: 'Quests',
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.6 }}>📜</Text>
              ),
            }}
          />
          <Tabs.Screen
            name="analytics"
            options={{
              title: 'Stats',
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.6 }}>📊</Text>
              ),
            }}
          />
          <Tabs.Screen
            name="index"
            options={{
              title: 'Home',
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.6 }}>🏰</Text>
              ),
            }}
          />
          <Tabs.Screen
            name="timer"
            options={{
              title: 'Focus',
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.6 }}>⏱️</Text>
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'Profile',
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.6 }}>👤</Text>
              ),
            }}
          />

          {/* Explicitly hide non-tab screens */}
          <Tabs.Screen name="settings" options={{ href: null }} />
          <Tabs.Screen name="explore" options={{ href: null }} />
          <Tabs.Screen name="stats" options={{ href: null }} />
        </Tabs>

        <ActiveTimerBanner />
        <GlobalRewardListener />
      </TimerProvider>
    </UserProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 16,
    right: 16,
    height: 64,
    backgroundColor: 'rgba(30, 41, 59, 0.92)',
    borderRadius: 24,
    borderTopWidth: 0,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingBottom: Platform.OS === 'ios' ? 8 : 8,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  tabItem: {
    paddingVertical: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  activeBanner: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 98 : 90,
    left: 16,
    right: 16,
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1000,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  pausedBanner: {
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
  },
  bannerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  pausedDot: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  bannerTimer: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
});