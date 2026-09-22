import React, { useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Switch,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Header from '../components/Header';
import { useUser } from '../context/UserContext';

export default function SettingsScreen() {
  const router = useRouter();
  const { 
    soundEnabled, 
    setSoundEnabled, 
    hapticsEnabled, 
    setHapticsEnabled, 
  } = useUser();

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.navigate('/profile' as any);
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => subscription.remove();
    }, [router])
  );

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Settings" subtitle="System preferences and game controls" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090D16' },
  scrollContent: { padding: 20, paddingBottom: 110 },
  sectionTitle: { color: '#94A3B8', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  card: { backgroundColor: 'rgba(255, 255, 255, 0.07)', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)', marginBottom: 12 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  settingText: { color: '#F8FAFC', fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 12 },
  dangerCard: { backgroundColor: 'rgba(255, 255, 255, 0.07)', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.7)' },
  dangerTitle: { color: '#EF4444', fontWeight: 'bold', fontSize: 14 },
  dangerSubtitle: { color: '#64748B', fontSize: 11, marginTop: 2 },
});