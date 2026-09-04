import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getTasks, getSubjects, Task, Attribute } from '../../db/database';
import { useUser } from '../context/UserContext';
import { useTimer } from '../context/TimerContext';
import Header from '../components/Header';

export default function HomeScreen() {
  const router = useRouter();
  const { profile, hapticsEnabled } = useUser();
  const { isRunning, timeLeft, setLinkedTaskId } = useTimer();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);

  const loadDashboardData = useCallback(() => {
    try {
      const allTasks = getTasks() || [];
      const activeTasks = allTasks.filter((t) => t.is_completed === 0);
      const attrs = getSubjects() || [];

      setTasks(activeTasks);
      setAttributes(attrs);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [loadDashboardData])
  );

  const handleQuestPress = (task: Task) => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLinkedTaskId(task.id);
    router.push('/timer');
  };

  const handleEnterChamber = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/timer');
  };

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#F8FAFC', fontSize: 16 }}>Loading Character Data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const requiredXP = Math.floor(100 * Math.pow(profile.level || 1, 1.5));
  const xpProgressPercent = Math.min(
    100,
    Math.round(((profile.current_xp || 0) / requiredXP) * 100)
  );

  const formatTimerExact = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Header
          title={`Welcome, ${profile.username || 'Hero'}`}
          subtitle={`${profile.class_title || 'Novice'} • Level ${profile.level || 1}`}
          showBack={false}
        />

        <View style={styles.heroGlassCard}>
          <View style={styles.heroHeader}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarEmoji}>{profile.avatar || '🧙‍♂️'}</Text>
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroLevel}>Level {profile.level || 1}</Text>
              <View style={styles.xpBarBackground}>
                <View style={[styles.xpBarFill, { width: `${xpProgressPercent}%` }]} />
              </View>
              <Text style={styles.xpText}>
                {profile.current_xp || 0} / {requiredXP} XP ({xpProgressPercent}%)
              </Text>
            </View>
          </View>

          <View style={styles.streakBadge}>
            <Text style={styles.streakText}>🔥 {profile.streak_count || 0} Day Streak</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.chamberCard} onPress={handleEnterChamber} activeOpacity={0.85}>
          <View style={styles.chamberInfo}>
            <Text style={styles.chamberTitle}>
              {isRunning ? '⏱️ Session In Progress' : '⚡ Enter Focus Chamber'}
            </Text>
            <Text style={styles.chamberSub}>
              {isRunning
                ? `${formatTimerExact(timeLeft)} remaining • Tap to manage`
                : 'Start countdown or link a quest to earn XP'}
            </Text>
          </View>
          <Text style={styles.chamberChevron}>›</Text>
        </TouchableOpacity>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>ACTIVE QUESTS</Text>
          <TouchableOpacity onPress={() => router.push('/tasks')}>
            <Text style={styles.seeAllText}>View Log ›</Text>
          </TouchableOpacity>
        </View>

        {tasks.length === 0 ? (
          <View style={styles.emptyGlassCard}>
            <Text style={styles.emptyText}>No active quests right now.</Text>
            <TouchableOpacity onPress={() => router.push('/tasks')}>
              <Text style={styles.createTaskLink}>+ Create a Quest</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.questList}>
            {tasks.slice(0, 4).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.questGlassCard}
                onPress={() => handleQuestPress(item)}
                activeOpacity={0.7}
              >
                <View style={styles.questIconBox}>
                  <Text style={styles.questIcon}>⏱️</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.questTitle}>{item.title}</Text>
                  <Text style={styles.questSub}>Tap to start focus • +{item.xp_awarded} XP</Text>
                </View>
                <Text style={styles.focusBtnText}>Focus ›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>ATTRIBUTES & MASTERY</Text>
        <View style={styles.attrGrid}>
          {attributes.map((attr) => (
            <View key={attr.id} style={styles.attrGlassCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.attrTitle}>{attr.title}</Text>
                <Text style={[styles.attrLevel, { color: attr.color_code || '#818CF8' }]}>
                  Lvl {attr.level}
                </Text>
              </View>
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
  heroGlassCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
  },
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#6366F1',
  },
  avatarEmoji: { fontSize: 30 },
  heroInfo: { flex: 1 },
  heroLevel: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  xpBarBackground: {
    height: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  xpBarFill: { height: '100%', backgroundColor: '#6366F1', borderRadius: 5 },
  xpText: { color: '#94A3B8', fontSize: 11, fontWeight: '700', marginTop: 4 },
  streakBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 12,
  },
  streakText: { color: '#F59E0B', fontSize: 11, fontWeight: 'bold' },
  chamberCard: {
    backgroundColor: '#10B981',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  chamberInfo: { flex: 1 },
  chamberTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  chamberSub: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 12, marginTop: 2, fontWeight: '600' },
  chamberChevron: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginLeft: 10 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: '#64748B', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  seeAllText: { color: '#38BDF8', fontSize: 12, fontWeight: 'bold' },
  emptyGlassCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 20,
  },
  emptyText: { color: '#94A3B8', fontSize: 13 },
  createTaskLink: { color: '#10B981', fontWeight: 'bold', marginTop: 6, fontSize: 13 },
  questList: { gap: 10, marginBottom: 20 },
  questGlassCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  questIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  questIcon: { fontSize: 14 },
  questTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '600' },
  questSub: { color: '#64748B', fontSize: 11, fontWeight: '700', marginTop: 2 },
  focusBtnText: { color: '#38BDF8', fontWeight: 'bold', fontSize: 12 },
  attrGrid: { gap: 8 },
  attrGlassCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  attrTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: 'bold' },
  attrLevel: { fontSize: 12, fontWeight: 'bold' },
});