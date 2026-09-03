import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useUser } from '../context/UserContext';

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { hapticsEnabled } = useUser();

  const navItems = [
    { label: 'Quests', route: '/tasks', icon: '📜' },
    { label: 'Stats', route: '/analytics', icon: '📊' },
    { label: 'Home', route: '/', icon: '🏰' },
    { label: 'Focus', route: '/timer', icon: '⏱️' },
    { label: 'Profile', route: '/profile', icon: '👤' },
  ];

  const handleNavigate = (route: string) => {
    if (pathname === route) return;
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace(route as any);
  };

  return (
    <View style={styles.floatingWrapper}>
      <View style={styles.glassContainer}>
        {navItems.map((item) => {
          const isActive = pathname === item.route;
          return (
            <TouchableOpacity
              key={item.route}
              style={[
                styles.navItem,
                isActive && styles.activePill,
              ]}
              onPress={() => handleNavigate(item.route)}
              activeOpacity={0.7}
            >
              <Text style={[styles.icon, isActive && styles.activeIcon]}>
                {item.icon}
              </Text>
              <Text style={[styles.label, isActive && styles.activeLabel]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 999,
  },
  glassContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 6,
    borderRadius: 18,
  },
  activePill: {
    backgroundColor: 'rgba(99, 102, 241, 0.25)',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  icon: {
    fontSize: 18,
    opacity: 0.6,
  },
  activeIcon: {
    opacity: 1,
  },
  label: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  activeLabel: {
    color: '#818CF8',
    fontWeight: '800',
  },
});