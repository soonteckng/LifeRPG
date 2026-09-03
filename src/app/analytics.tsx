import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Header from '../components/Header';
import { getWeeklyStats, DailyStat } from '../../db/database';

export default function AnalyticsScreen() {
  const [weeklyStats, setWeeklyStats] = useState<DailyStat[]>([]);

  const loadData = useCallback(() => {
    try {
      const stats = getWeeklyStats();
      setWeeklyStats(stats || []);
    } catch (e) {
      setWeeklyStats([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const totalFocusMinutes = weeklyStats.reduce((acc, curr) => acc + (curr.focusMinutes || 0), 0);
  const totalXPEarned = weeklyStats.reduce((acc, curr) => acc + (curr.xpEarned || 0), 0);
  const maxMinutes = Math.max(...weeklyStats.map((s) => s.focusMinutes || 0), 60);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Header title="Analytics & Stats" subtitle="Mastery progression & weekly focus data" showBack={false} />

        <View style={styles.glassGrid}>
          <View style={[styles.glassStatCard, styles.glowBlue]}>
            <Text style={styles.statIcon}>⏱️</Text>
            <Text style={styles.statValue}>{totalFocusMinutes} <Text style={styles.unitText}>mins</Text></Text>
            <Text style={styles.statLabel}>7-DAY FOCUS TIME</Text>
          </View>

          <View style={[styles.glassStatCard, styles.glowGreen]}>
            <Text style={styles.statIcon}>⚡</Text>
            <Text style={[styles.statValue, { color: '#34D399' }]}>+{totalXPEarned} <Text style={styles.unitText}>XP</Text></Text>
            <Text style={styles.statLabel}>XP GAINED THIS WEEK</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>WEEKLY ACTIVITY BREAKDOWN</Text>
        <View style={styles.glassCard}>
          <View style={styles.chartRow}>
            {weeklyStats.map((stat, idx) => {
              const barHeight = Math.max(12, Math.round(((stat.focusMinutes || 0) / maxMinutes) * 100));
              const isToday = idx === weeklyStats.length - 1;

              return (
                <View key={idx} style={styles.barColumn}>
                  <Text style={styles.barValueText}>{stat.focusMinutes}m</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${barHeight}%` },
                        isToday && styles.barFillToday,
                      ]}
                    />
                  </View>
                  <Text style={[styles.barDayText, isToday && styles.barDayTextToday]}>
                    {stat.dayLabel}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionTitle}>DAILY LOG</Text>
        <View style={styles.glassCard}>
          {weeklyStats.map((stat, idx) => (
            <View key={idx} style={[styles.logRow, idx < weeklyStats.length - 1 && styles.logRowBorder]}>
              <View style={styles.dayBadge}>
                <Text style={styles.dayBadgeText}>{stat.dayLabel}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.logTitle}>{stat.focusMinutes} Minutes Focused</Text>
                <Text style={styles.logDate}>{stat.date}</Text>
              </View>
              <Text style={styles.logXP}>+{stat.xpEarned} XP</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  scrollContent: { padding: 20, paddingBottom: 120 },
  sectionTitle: { color: '#64748B', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10, marginTop: 16 },
  glassGrid: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  glassStatCard: {
    flex: 1,
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  glowBlue: { borderColor: 'rgba(99, 102, 241, 0.35)' },
  glowGreen: { borderColor: 'rgba(16, 185, 129, 0.35)' },
  statIcon: { fontSize: 20, marginBottom: 6 },
  statValue: { color: '#F8FAFC', fontSize: 22, fontWeight: '900' },
  unitText: { fontSize: 12, color: '#94A3B8', fontWeight: '700' },
  statLabel: { color: '#64748B', fontSize: 9, fontWeight: '800', marginTop: 4, letterSpacing: 0.8 },
  glassCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  chartRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 140, paddingTop: 10 },
  barColumn: { alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' },
  barValueText: { color: '#64748B', fontSize: 9, fontWeight: '700', marginBottom: 4 },
  barTrack: { width: 14, height: 85, backgroundColor: 'rgba(15, 23, 42, 0.6)', borderRadius: 7, overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { width: '100%', backgroundColor: '#6366F1', borderRadius: 7 },
  barFillToday: { backgroundColor: '#34D399' },
  barDayText: { color: '#64748B', fontSize: 11, fontWeight: '700', marginTop: 6 },
  barDayTextToday: { color: '#34D399', fontWeight: '900' },
  logRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  logRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
  dayBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  dayBadgeText: { color: '#38BDF8', fontWeight: 'bold', fontSize: 12 },
  logTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: 'bold' },
  logDate: { color: '#64748B', fontSize: 10, fontWeight: '600', marginTop: 2 },
  logXP: { color: '#34D399', fontWeight: '900', fontSize: 12 },
});