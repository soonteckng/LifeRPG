import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  getSubjects,
  Attribute,
} from '../../db/database';
import { useUser } from '../context/UserContext';
import Header from '../components/Header';

interface Badge {
  id: string;
  icon: string;
  title: string;
  description: string;
  isUnlocked: boolean;
}

export default function StatsScreen() {
  const { profile, hapticsEnabled } = useUser(); // Pull profile directly from UserContext
  const [attributes, setAttributes] = useState<Attribute[]>([]);

  const loadData = useCallback(() => {
    try {
      const attrs = getSubjects() || [];
      setAttributes(attrs);
    } catch (error) {
      console.error('Failed to load attributes:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading Hero Stats...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const level = profile.level || 1;
  const streak = profile.streak_count || 0;

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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <Header
          title="Hero Stat Sheet"
          subtitle="Character progress & unlocked achievements"
        />

        <View style={styles.statsGrid}>
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
        </View>

        <Text style={styles.sectionTitle}>Attribute Progress</Text>
        <View style={styles.attrList}>
          {attributes.map((attr) => {
            const attrLvl = attr.level || 1;
            const reqXP = Math.floor(100 * Math.pow(attrLvl, 1.5));
            const progress = Math.min(
              Math.round(((attr.current_xp || 0) / reqXP) * 100),
              100
            );

            return (
              <View key={attr.id} style={styles.attrCard}>
                <View style={styles.attrHeader}>
                  <Text style={styles.attrTitle}>{attr.title}</Text>
                  <Text style={[styles.attrLevel, { color: attr.color_code || '#818CF8' }]}>
                    Lv. {attrLvl}
                  </Text>
                </View>
                <View style={styles.attrProgressBg}>
                  <View
                    style={[
                      styles.attrProgressFill,
                      { width: `${progress}%`, backgroundColor: attr.color_code || '#6366F1' },
                    ]}
                  />
                </View>
                <Text style={styles.xpDetail}>
                  {attr.current_xp || 0} / {reqXP} XP ({progress}%)
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.badgeHeaderRow}>
          <Text style={styles.sectionTitle}>Achievements</Text>
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
  container: { flex: 1, backgroundColor: '#0F172A' },
  scrollContent: { padding: 20, paddingBottom: 110 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94A3B8', fontSize: 16 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  summaryCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryValue: { color: '#6366F1', fontSize: 24, fontWeight: 'bold' },
  summaryLabel: { color: '#64748B', fontSize: 12, marginTop: 4, fontWeight: '600' },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  attrList: { gap: 10, marginBottom: 24 },
  attrCard: {
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  attrHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  attrTitle: { color: '#F8FAFC', fontWeight: '600', fontSize: 14 },
  attrLevel: { fontWeight: 'bold', fontSize: 14 },
  attrProgressBg: { height: 8, backgroundColor: '#334155', borderRadius: 4, overflow: 'hidden' },
  attrProgressFill: { height: '100%', borderRadius: 4 },
  xpDetail: { color: '#64748B', fontSize: 11, textAlign: 'right', marginTop: 6 },
  badgeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  badgeCounter: { color: '#6366F1', fontSize: 12, fontWeight: 'bold' },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  badgeCard: {
    width: '48%',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  badgeCardLocked: {
    borderColor: '#334155',
    opacity: 0.5,
  },
  badgeIcon: { fontSize: 28, marginBottom: 8 },
  badgeTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  badgeTitleLocked: { color: '#94A3B8' },
  badgeDesc: { color: '#64748B', fontSize: 11, lineHeight: 14 },
});