import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Attribute,
  DailyStat,
  getSubjects,
  getWeeklyStats,
} from '../../db/database';
import Header from '../components/Header';
import { useUser } from '../context/UserContext';

interface Badge {
  id: string;
  icon: string;
  title: string;
  description: string;
  isUnlocked: boolean;
}

export default function AnalyticsScreen() {
  const { profile, hapticsEnabled } = useUser();
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<DailyStat[]>([]);

  const loadData = useCallback(() => {
    try {
      const attrs = getSubjects() || [];
      const stats = getWeeklyStats() || [];
      setAttributes(attrs);
      setWeeklyStats(stats);
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const level = profile?.level || 1;
  const streak = profile?.streak_count || 0;

  const totalWeeklyMinutes = weeklyStats.reduce((sum, d) => sum + d.focusMinutes, 0);
  const totalWeeklyXP = weeklyStats.reduce((sum, d) => sum + d.xpEarned, 0);
  const maxDailyMinutes = Math.max(...weeklyStats.map((d) => d.focusMinutes), 60);

  const badges: Badge[] = [
    {
      id: 'lvl_2',
      icon: '🐣',
      title: 'First Step',
      description: 'Reach Character Level 2',
      isUnlocked: level >= 2,
    },
    {
      id: 'streak_3',
      icon: '🔥',
      title: 'Consistent Hero',
      description: 'Maintain a 3-Day Streak',
      isUnlocked: streak >= 3,
    },
    {
      id: 'lvl_5',
      icon: '⚡',
      title: 'Rising Adventurer',
      description: 'Reach Character Level 5',
      isUnlocked: level >= 5,
    },
    {
      id: 'multi_attr',
      icon: '💪',
      title: 'Jack of All Trades',
      description: 'Level 2+ in 2 or more Stat Trees',
      isUnlocked: (attributes || []).filter((a) => (a.level || 1) >= 2).length >= 2,
    },
    {
      id: 'streak_7',
      icon: '👑',
      title: 'Streak Veteran',
      description: 'Maintain a 7-Day Streak',
      isUnlocked: streak >= 7,
    },
    {
      id: 'lvl_10',
      icon: '🏆',
      title: 'Legendary Hero',
      description: 'Reach Character Level 10',
      isUnlocked: level >= 10,
    },
  ];

  const unlockedCount = badges.filter((b) => b.isUnlocked).length;

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Analytics & Hero Stats"
        subtitle="Study performance, mastery, & achievements"
        showBack={true}
        fallbackRoute="/"
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* --- OVERALL HERO SUMMARY --- */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>Lv. {level}</Text>
            <Text style={styles.summaryLabel}>Overall Level</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>
              {streak} Days
            </Text>
            <Text style={styles.summaryLabel}>Active Streak</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: '#10B981' }]}>
              {totalWeeklyMinutes}m
            </Text>
            <Text style={styles.summaryLabel}>Weekly Focus</Text>
          </View>
        </View>

        {/* --- WEEKLY ACTIVITY CHART --- */}
        <Text style={styles.sectionTitle}>WEEKLY FOCUS ACTIVITY</Text>
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTotalText}>
              Total XP Earned This Week:{' '}
              <Text style={{ color: '#6366F1', fontWeight: 'bold' }}>+{totalWeeklyXP} XP</Text>
            </Text>
          </View>

          <View style={styles.barContainer}>
            {weeklyStats.map((item, index) => {
              const heightPercent = Math.min(
                100,
                Math.round((item.focusMinutes / maxDailyMinutes) * 100)
              );

              return (
                <View key={index} style={styles.barGroup}>
                  <Text style={styles.barValueText}>
                    {item.focusMinutes > 0 ? `${item.focusMinutes}m` : ''}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${Math.max(item.focusMinutes > 0 ? 12 : 0, heightPercent)}%`,
                          backgroundColor: item.focusMinutes > 0 ? '#6366F1' : '#334155',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barDayLabel}>{item.dayLabel}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* --- HERO ATTRIBUTES / SKILL TREES --- */}
        <Text style={styles.sectionTitle}>HERO STAT MASTERY</Text>
        <View style={styles.attributesCard}>
          {attributes.map((attr) => {
            const attrLevel = attr.level || 1;
            const attrXP = attr.current_xp || 0;
            const requiredXP = attrLevel * 50;
            const progress = Math.min(1, attrXP / requiredXP);

            return (
              <View key={attr.id} style={styles.attrRow}>
                <View style={styles.attrHeader}>
                  <View style={styles.attrTitleGroup}>
                    <View
                      style={[
                        styles.colorDot,
                        { backgroundColor: attr.color_code || '#6366F1' },
                      ]}
                    />
                    <Text style={styles.attrTitle}>{attr.title}</Text>
                  </View>
                  <Text style={styles.attrLevelText}>
                    Lv. {attrLevel} <Text style={styles.attrXPText}>({attrXP}/{requiredXP} XP)</Text>
                  </Text>
                </View>
                <View style={styles.attrTrack}>
                  <View
                    style={[
                      styles.attrFill,
                      {
                        width: `${progress * 100}%`,
                        backgroundColor: attr.color_code || '#6366F1',
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* --- FOCUS HISTORY --- */}
        <Text style={styles.sectionTitle}>FOCUS HISTORY · LAST 7 DAYS</Text>
        <View style={styles.historyCard}>
          {weeklyStats.map((item, index) => {
            const date = new Date(`${item.date}T00:00:00`);
            const dateLabel = date.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });

            return (
              <View
                key={item.date}
                style={[styles.historyRow, index === weeklyStats.length - 1 && styles.historyRowLast]}
              >
                <View>
                  <Text style={styles.historyDay}>{item.dayLabel}</Text>
                  <Text style={styles.historyDate}>{dateLabel}</Text>
                </View>
                <View style={styles.historyMetric}>
                  <Text style={styles.historyMinutes}>{item.focusMinutes}m</Text>
                  <Text style={styles.historyCaption}>focused</Text>
                </View>
                <View style={styles.historyMetric}>
                  <Text style={styles.historyXP}>+{item.xpEarned}</Text>
                  <Text style={styles.historyCaption}>XP</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* --- ACHIEVEMENTS --- */}
        <View style={styles.badgeHeaderRow}>
          <Text style={styles.sectionTitle}>ACHIEVEMENTS</Text>
          <Text style={styles.badgeCounter}>
            {unlockedCount} / {badges.length} Unlocked
          </Text>
        </View>

        <View style={styles.badgesGrid}>
          {badges.map((badge) => (
            <TouchableOpacity
              key={badge.id}
              style={[
                styles.badgeCard,
                !badge.isUnlocked && styles.badgeCardLocked,
              ]}
              onPress={() => {
                if (badge.isUnlocked && hapticsEnabled) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              }}
              activeOpacity={badge.isUnlocked ? 0.7 : 1}
            >
              <Text style={styles.badgeIcon}>
                {badge.isUnlocked ? badge.icon : '🔒'}
              </Text>
              <Text
                style={[
                  styles.badgeTitle,
                  !badge.isUnlocked && styles.badgeTitleLocked,
                ]}
              >
                {badge.title}
              </Text>
              <Text style={styles.badgeDesc}>{badge.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090D16' },
  scrollContent: { padding: 20, paddingBottom: 120 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  summaryCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 20,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  summaryValue: { color: '#6366F1', fontSize: 20, fontWeight: 'bold' },
  summaryLabel: { color: '#64748B', fontSize: 10, marginTop: 4, fontWeight: '700' },
  sectionTitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 20,
  },
  chartHeader: { marginBottom: 12 },
  chartTotalText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  barContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    paddingTop: 16,
  },
  barGroup: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barValueText: { color: '#94A3B8', fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  barTrack: {
    width: 12,
    height: 80,
    backgroundColor: '#0F172A',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: 6 },
  barDayLabel: { color: '#64748B', fontSize: 10, fontWeight: 'bold', marginTop: 6 },

  attributesCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 20,
    gap: 12,
  },
  attrRow: { gap: 6 },
  attrHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  attrTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorDot: { width: 8, height: 8, borderRadius: 4 },
  attrTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  attrLevelText: { color: '#818CF8', fontSize: 12, fontWeight: '800' },
  attrXPText: { color: '#64748B', fontSize: 10, fontWeight: '600' },
  attrTrack: {
    height: 8,
    backgroundColor: '#0F172A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  attrFill: { height: '100%', borderRadius: 4 },

  historyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  historyRowLast: { borderBottomWidth: 0 },
  historyDay: { color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  historyDate: { color: '#64748B', fontSize: 10, marginTop: 2 },
  historyMetric: { minWidth: 58, alignItems: 'flex-end' },
  historyMinutes: { color: '#A5B4FC', fontSize: 13, fontWeight: '800' },
  historyXP: { color: '#6EE7B7', fontSize: 13, fontWeight: '800' },
  historyCaption: { color: '#64748B', fontSize: 9, marginTop: 2, textTransform: 'uppercase' },
  badgeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  badgeCounter: { color: '#6366F1', fontSize: 11, fontWeight: 'bold' },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  badgeCard: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  badgeCardLocked: {
    borderColor: '#334155',
    opacity: 0.5,
  },
  badgeIcon: { fontSize: 24, marginBottom: 6 },
  badgeTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
  badgeTitleLocked: { color: '#94A3B8' },
  badgeDesc: { color: '#64748B', fontSize: 10, lineHeight: 13 },
});