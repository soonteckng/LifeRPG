import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useTimer } from '../context/TimerContext';
import { useUser } from '../context/UserContext';
import * as Haptics from 'expo-haptics';

export default function FocusBanner() {
  const { isRunning, timeLeft, duration, pauseTimer, resumeTimer } = useTimer();
  const { hapticsEnabled } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  // Completely disappear if on timer screen or if timer has not started / has finished
  if (pathname === '/timer' || (!isRunning && timeLeft === duration) || timeLeft <= 0) {
    return null;
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <View style={styles.bannerContainer}>
      <TouchableOpacity
        style={styles.bannerContent}
        onPress={() => {
          if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/timer');
        }}
      >
        <View style={styles.leftGroup}>
          <View style={[styles.statusDot, isRunning && styles.statusDotActive]} />
          <View>
            <Text style={styles.bannerTitle}>
              {isRunning ? 'FOCUS SESSION ACTIVE' : 'FOCUS PAUSED'}
            </Text>
            <Text style={styles.timerDigits}>{formattedTime} remaining</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            isRunning ? pauseTimer() : resumeTimer();
          }}
        >
          <Text style={styles.actionBtnText}>{isRunning ? 'PAUSE' : 'RESUME'}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: { position: 'absolute', bottom: 82, left: 16, right: 16, zIndex: 99 },
  bannerContent: { backgroundColor: '#1E293B', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#10B981', elevation: 8 },
  leftGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B' },
  statusDotActive: { backgroundColor: '#10B981' },
  bannerTitle: { color: '#10B981', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  timerDigits: { color: '#F8FAFC', fontSize: 14, fontWeight: 'bold' },
  actionBtn: { backgroundColor: '#0F172A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
  actionBtnText: { color: '#F8FAFC', fontSize: 11, fontWeight: 'bold' },
});