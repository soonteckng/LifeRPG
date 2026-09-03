import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Header from '../components/Header';
import { useUser } from '../context/UserContext';

const AVATARS = ['🧙‍♂️', '🥷', '🛡️', '👨‍💻', '⚡', '🐉'];
const CLASSES = ['Scholar', 'Mage', 'Warrior', 'Coder', 'Monk'];

export function getRankTitle(level: number): string {
  if (level >= 10) return 'Legendary Hero';
  if (level >= 7) return 'Master Specialist';
  if (level >= 5) return 'Rising Adventurer';
  if (level >= 3) return 'Apprentice Scholar';
  return 'Novice Adventurer';
}

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, username, avatar, classTitle, updateProfile, hapticsEnabled } = useUser();

  const [inputName, setInputName] = useState(username);
  const [selectedAvatar, setSelectedAvatar] = useState(avatar);
  const [selectedClass, setSelectedClass] = useState(classTitle);

  useEffect(() => {
    setInputName(username);
    setSelectedAvatar(avatar);
    setSelectedClass(classTitle);
  }, [username, avatar, classTitle]);

  if (!profile) return null;

  const handleSave = () => {
    if (!inputName.trim()) return;
    updateProfile(inputName.trim(), selectedAvatar, selectedClass);
    if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Saved', 'Character identity updated successfully!');
  };

  const rankTitle = getRankTitle(profile.level);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Header title="Hero Profile" subtitle="Character identity & class customization" showBack={false} />

            <View style={styles.heroCard}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarEmoji}>{selectedAvatar}</Text>
              </View>

              <Text style={styles.heroName}>{inputName}</Text>
              <View style={styles.titleBadge}>
                <Text style={styles.titleBadgeText}>✨ {selectedClass} • {rankTitle}</Text>
              </View>

              <View style={styles.heroStatsRow}>
                <View style={styles.heroStatItem}>
                  <Text style={styles.heroStatValue}>Level {profile.level}</Text>
                  <Text style={styles.heroStatLabel}>Character Rank</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.heroStatItem}>
                  <Text style={[styles.heroStatValue, { color: '#F59E0B' }]}>
                    🔥 {profile.streak_count}
                  </Text>
                  <Text style={styles.heroStatLabel}>Day Streak</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>CHARACTER NAME</Text>
            <View style={styles.card}>
              <TextInput
                style={styles.input}
                value={inputName}
                onChangeText={setInputName}
                placeholder="Enter username..."
                placeholderTextColor="#64748B"
              />
            </View>

            <Text style={styles.sectionTitle}>CHOOSE AVATAR</Text>
            <View style={styles.avatarGrid}>
              {AVATARS.map((av) => (
                <TouchableOpacity
                  key={av}
                  style={[styles.avatarOption, selectedAvatar === av && styles.avatarSelected]}
                  onPress={() => {
                    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedAvatar(av);
                  }}
                >
                  <Text style={styles.avatarText}>{av}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>CHARACTER CLASS</Text>
            <View style={styles.classRow}>
              {CLASSES.map((cls) => (
                <TouchableOpacity
                  key={cls}
                  style={[styles.classChip, selectedClass === cls && styles.classChipActive]}
                  onPress={() => {
                    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedClass(cls);
                  }}
                >
                  <Text style={[styles.classText, selectedClass === cls && styles.classTextActive]}>
                    {cls}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>SAVE CHANGES</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => router.push('/settings')}
            >
              <Text style={styles.settingsBtnText}>⚙️ Advanced Settings & Data Reset</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  scrollContent: { padding: 20, paddingBottom: 140 },
  heroCard: { backgroundColor: 'rgba(30, 41, 59, 0.55)', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#6366F1' },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 2, borderColor: '#F59E0B' },
  avatarEmoji: { fontSize: 40 },
  heroName: { color: '#F8FAFC', fontSize: 22, fontWeight: 'bold' },
  titleBadge: { backgroundColor: 'rgba(245, 158, 11, 0.15)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginVertical: 8, borderWidth: 1, borderColor: '#F59E0B' },
  titleBadgeText: { color: '#F59E0B', fontSize: 12, fontWeight: 'bold' },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, width: '100%', paddingTop: 16, borderTopWidth: 1, borderTopColor: '#334155' },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatValue: { color: '#6366F1', fontSize: 18, fontWeight: 'bold' },
  heroStatLabel: { color: '#64748B', fontSize: 11, marginTop: 2, fontWeight: '600' },
  divider: { width: 1, height: 30, backgroundColor: '#334155' },
  sectionTitle: { color: '#94A3B8', fontSize: 11, fontWeight: '800', marginBottom: 8, marginTop: 12, letterSpacing: 1 },
  card: { backgroundColor: 'rgba(30, 41, 59, 0.55)', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#334155', marginBottom: 12 },
  input: { backgroundColor: '#0F172A', color: '#F8FAFC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#334155', fontWeight: 'bold' },
  avatarGrid: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 12 },
  avatarOption: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(30, 41, 59, 0.55)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  avatarSelected: { borderColor: '#6366F1', backgroundColor: '#312E81' },
  avatarText: { fontSize: 24 },
  classRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  classChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(30, 41, 59, 0.55)', borderWidth: 1, borderColor: '#334155' },
  classChipActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  classText: { color: '#94A3B8', fontSize: 12, fontWeight: 'bold' },
  classTextActive: { color: '#FFFFFF' },
  saveBtn: { backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  saveBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  settingsBtn: { backgroundColor: 'rgba(30, 41, 59, 0.55)', padding: 16, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  settingsBtnText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 13 },
});