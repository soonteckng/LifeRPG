import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Header from '../components/Header';
import { resetDatabase } from '../../db/database';
import { useUser } from '../context/UserContext';

export default function SettingsScreen() {
  const { 
    soundEnabled, 
    setSoundEnabled, 
    hapticsEnabled, 
    setHapticsEnabled, 
    reloadProfile 
  } = useUser();

  const handleResetData = () => {
    Alert.alert(
      '⚠️ Reset All Game Data',
      'This will wipe all active quests, level progress, and study session history. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: () => {
            resetDatabase();
            reloadProfile();
            if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert('Reset Complete', 'Database cleared and restored to Level 1.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Header title="Settings" subtitle="System preferences and game controls" />

        <Text style={styles.sectionTitle}>AUDIO & TACTILE</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <Text style={styles.settingText}>🔊 Sound Effects</Text>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: '#334155', true: '#6366F1' }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <Text style={styles.settingText}>📳 Haptic Vibrations</Text>
            <Switch
              value={hapticsEnabled}
              onValueChange={(val) => {
                setHapticsEnabled(val);
                if (val) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              trackColor={{ false: '#334155', true: '#6366F1' }}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>DANGER ZONE</Text>
        <TouchableOpacity style={styles.dangerCard} onPress={handleResetData}>
          <Text style={styles.dangerTitle}>🗑️ Reset Game Progress</Text>
          <Text style={styles.dangerSubtitle}>Wipe database & restore Level 1 state</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  scrollContent: { padding: 20, paddingBottom: 110 },
  sectionTitle: { color: '#94A3B8', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  card: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#334155', marginBottom: 12 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  settingText: { color: '#F8FAFC', fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 12 },
  dangerCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EF4444' },
  dangerTitle: { color: '#EF4444', fontWeight: 'bold', fontSize: 14 },
  dangerSubtitle: { color: '#64748B', fontSize: 11, marginTop: 2 },
});