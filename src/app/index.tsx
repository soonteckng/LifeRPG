import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Attribute,
  DailyStat,
  getSubjects,
  getWeeklyStats,
} from '../../db/database';
import { useUser } from '../context/UserContext';

export default function HomeScreen() {
  const router = useRouter();
  const { profile, reloadProfile } = useUser();
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<DailyStat[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [codexModalVisible, setCodexModalVisible] = useState(false);

  const loadData = useCallback(() => {
    reloadProfile();
    const attrs = getSubjects();
    const weekly = getWeeklyStats();
    setAttributes(attrs);
    setWeeklyStats(weekly);
  }, [reloadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  }, [loadData]);

  const currentLevel = profile?.level || 1;
  const currentXP = profile?.current_xp || 0;
  const requiredXP = Math.floor(100 * Math.pow(currentLevel, 1.5));
  const xpProgress = Math.min(1, currentXP / requiredXP);

  const todayMinutes =
    weeklyStats.length > 0 ? weeklyStats[weeklyStats.length - 1].focusMinutes : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#818CF8" />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Header Banner */}
      <View style={styles.heroCard}>
        <View style={styles.heroRow}>
          <Text style={styles.avatar}>{profile?.avatar || '🧙‍♂️'}</Text>
          <View style={styles.heroInfo}>
            <Text style={styles.username}>{profile?.username || 'Hero'}</Text>
            <Text style={styles.classTitle}>
              Lvl {currentLevel} {profile?.class_title || 'Novice Scholar 📚'}
            </Text>
          </View>
          <View style={styles.goldBadge}>
            <Text style={styles.goldText}>💰 {profile?.gold || 0}</Text>
          </View>
        </View>

        {/* Hero Codex Tutorial Trigger Button */}
        <TouchableOpacity
          style={styles.codexButton}
          onPress={() => setCodexModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.codexButtonText}>📖 Hero Codex & Guide</Text>
        </TouchableOpacity>

        {/* XP Progress Bar */}
        <View style={styles.xpSection}>
          <View style={styles.xpHeader}>
            <Text style={styles.xpLabel}>XP PROGRESS</Text>
            <Text style={styles.xpValue}>
              {currentXP} / {requiredXP} XP
            </Text>
          </View>
          <View style={styles.xpBarBackground}>
            <View style={[styles.xpBarFill, { width: `${xpProgress * 100}%` }]} />
          </View>
        </View>
      </View>

      {/* Dedicated Analytics & Stats Card */}
      <TouchableOpacity
        style={styles.statsCard}
        onPress={() => router.push('/analytics')}
        activeOpacity={0.8}
      >
        <View style={styles.statsCardLeft}>
          <View style={styles.statsIconBadge}>
            <Text style={{ fontSize: 22 }}>📊</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statsCardTitle}>Focus Analytics & Logs</Text>
            <Text style={styles.statsCardSubtitle}>
              Today: {todayMinutes} mins studied • View weekly charts
            </Text>
          </View>
        </View>
        <Text style={styles.arrowText}>›</Text>
      </TouchableOpacity>

      {/* Quick Actions Grid */}
      <Text style={styles.sectionTitle}>Quick Hub</Text>
      <View style={styles.actionGrid}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/timer')}
          activeOpacity={0.8}
        >
          <Text style={styles.actionIcon}>⏱️</Text>
          <Text style={styles.actionTitle}>Start Focus</Text>
          <Text style={styles.actionSubtitle}>1m = 1 XP & 5 Gold</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/tasks')}
          activeOpacity={0.8}
        >
          <Text style={styles.actionIcon}>📜</Text>
          <Text style={styles.actionTitle}>Quests</Text>
          <Text style={styles.actionSubtitle}>Daily Tasks</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/shop')}
          activeOpacity={0.8}
        >
          <Text style={styles.actionIcon}>🛒</Text>
          <Text style={styles.actionTitle}>Item Shop</Text>
          <Text style={styles.actionSubtitle}>Redeem Rewards</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/profile')}
          activeOpacity={0.8}
        >
          <Text style={styles.actionIcon}>👤</Text>
          <Text style={styles.actionTitle}>Hero Profile</Text>
          <Text style={styles.actionSubtitle}>Stats & Streaks</Text>
        </TouchableOpacity>
      </View>

      {/* Character Attributes Overview */}
      <Text style={styles.sectionTitle}>Hero Attributes</Text>
      <View style={styles.attributesContainer}>
        {attributes.map((attr) => (
          <View key={attr.id} style={styles.attributeCard}>
            <View style={styles.attrRow}>
              <View style={styles.attrInfo}>
                <View
                  style={[styles.colorDot, { backgroundColor: attr.color_code || '#6366F1' }]}
                />
                <Text style={styles.attrTitle}>{attr.title}</Text>
              </View>
              <Text style={styles.attrLevel}>Lvl {attr.level}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* --- HERO CODEX / TUTORIAL MODAL --- */}
      <Modal
        visible={codexModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCodexModalVisible(false)}
      >
        <View style={styles.codexOverlay}>
          <View style={styles.codexCard}>
            <View style={styles.codexHeaderRow}>
              <Text style={styles.codexTitle}>📖 Hero Codex & Guide</Text>
              <TouchableOpacity onPress={() => setCodexModalVisible(false)}>
                <Text style={styles.codexCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.codexScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.codexSectionHeading}>⭐ Level Milestones & Class Titles</Text>
              <Text style={styles.codexBody}>
                Earn XP by completing focus sessions and quests to level up. Your class title evolves automatically as you reach new milestones:
              </Text>
              <View style={styles.codexBulletBox}>
                <Text style={styles.codexBullet}>• <Text style={styles.highlight}>Lv. 1 – 4:</Text> Novice Scholar 📚</Text>
                <Text style={styles.codexBullet}>• <Text style={styles.highlight}>Lv. 5 – 9:</Text> Adept Practitioner ⚡</Text>
                <Text style={styles.codexBullet}>• <Text style={styles.highlight}>Lv. 10 – 14:</Text> Master Wizard 🧙‍♂️</Text>
                <Text style={styles.codexBullet}>• <Text style={styles.highlight}>Lv. 15+:</Text> Grandmaster Archmage 👑</Text>
              </View>

              <Text style={styles.codexSectionHeading}>💰 The Economy & Item Shop</Text>
              <Text style={styles.codexBody}>
                Every minute focused earns you <Text style={styles.highlight}>1 XP & 5 Gold</Text>. Spend your hard-earned gold in the Item Shop on real-world rewards (e.g., coffee breaks, gaming sessions, movies).
              </Text>

              <Text style={styles.codexSectionHeading}>⚔️ Quests & Focus Sessions</Text>
              <Text style={styles.codexBody}>
                Manage your daily tasks in the Quest Log. Start dedicated focus sessions linked directly to your quests to log study time, maintain streaks, and boost your attributes!
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={styles.codexDismissBtn}
              onPress={() => setCodexModalVisible(false)}
            >
              <Text style={styles.codexDismissText}>Got It, Let's Focus!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 90,
  },
  heroCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    fontSize: 40,
    marginRight: 12,
  },
  heroInfo: {
    flex: 1,
  },
  username: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  classTitle: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  goldBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F59E0B44',
  },
  goldText: {
    color: '#F59E0B',
    fontSize: 15,
    fontWeight: '800',
  },
  codexButton: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6366F144',
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  codexButtonText: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '800',
  },
  xpSection: {
    gap: 6,
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  xpValue: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '700',
  },
  xpBarBackground: {
    height: 10,
    backgroundColor: '#0F172A',
    borderRadius: 5,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 5,
  },
  statsCard: {
    backgroundColor: '#131C2E',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#6366F144',
    marginBottom: 20,
  },
  statsCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statsIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsCardTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  statsCardSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  arrowText: {
    color: '#818CF8',
    fontSize: 22,
    fontWeight: '800',
    marginLeft: 8,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  actionTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  actionSubtitle: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  attributesContainer: {
    gap: 8,
  },
  attributeCard: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  attrRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attrInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  attrTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  attrLevel: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
  },
  /* --- HERO CODEX MODAL STYLES --- */
  codexOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 15, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 40,
  },
  codexCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#131C2E',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  codexHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingBottom: 10,
  },
  codexTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  codexCloseText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 6,
  },
  codexScroll: {
    gap: 12,
    paddingBottom: 10,
  },
  codexSectionHeading: {
    color: '#818CF8',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  codexBody: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
  },
  codexBulletBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 6,
  },
  codexBullet: {
    color: '#CBD5E1',
    fontSize: 13,
  },
  highlight: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  codexDismissBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  codexDismissText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});