import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { resetDatabase } from '../../db/database';
import { useUser } from '../context/UserContext';
import Header from '../components/Header';

const PRESET_AVATARS = ['🧙‍♂️', '🧝‍♂️', '🛡️', '⚔️', '🔮', '🐉', '🐱', '🤖', '🚀', '⭐'];

export default function ProfileScreen() {
  const {
    profile,
    reloadProfile,
    updateProfile,
    soundEnabled,
    hapticsEnabled,
    setSoundEnabled,
    setHapticsEnabled,
  } = useUser();

  const [usernameInput, setUsernameInput] = useState(profile?.username || 'Hero');
  const [avatarInput, setAvatarInput] = useState(profile?.avatar || '🧙‍♂️');
  const [isEditing, setIsEditing] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState({ title: '', body: '', isError: false });

  useFocusEffect(
    useCallback(() => {
      reloadProfile();
    }, [reloadProfile])
  );

  const handleSaveProfile = () => {
    if (!usernameInput.trim()) {
      setSuccessModalMessage({
        title: 'INVALID INPUT',
        body: 'Username cannot be empty. Please enter a valid hero name.',
        isError: true,
      });
      setSuccessModalVisible(true);
      return;
    }
    // Keep existing automated class title while saving username and avatar changes
    updateProfile(usernameInput.trim(), avatarInput.trim() || '🧙‍♂️', profile?.class_title || 'Novice Scholar 📚');
    setIsEditing(false);
    reloadProfile();
    setSuccessModalMessage({
      title: 'PROFILE UPDATED!',
      body: 'Your hero avatar and name have been successfully saved.',
      isError: false,
    });
    setSuccessModalVisible(true);
  };

  const confirmResetDatabase = () => {
    resetDatabase();
    reloadProfile();
    setResetModalVisible(false);
    setSuccessModalMessage({
      title: 'PURGE COMPLETE!',
      body: 'Database successfully wiped. All hero stats have been reset to default initial state.',
      isError: false,
    });
    setSuccessModalVisible(true);
  };

  const currentLevel = profile?.level || 1;
  const currentXP = profile?.current_xp || 0;
  const requiredXP = Math.floor(100 * Math.pow(currentLevel, 1.5));
  const xpProgress = Math.min(1, currentXP / requiredXP);

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Profile" subtitle="Manage your hero identity and preferences" showBack={false} />
      <ScrollView contentContainerStyle={styles.contentContainer}>
      {/* Profile Identity Card */}
      <View style={styles.card}>
        <View style={styles.avatarRow}>
          <Text style={styles.avatarDisplay}>{profile?.avatar || '🧙‍♂️'}</Text>
          <View style={styles.identityText}>
            <Text style={styles.usernameDisplay}>{profile?.username || 'Hero'}</Text>
            <Text style={styles.classTitleDisplay}>
              Lvl {currentLevel} {profile?.class_title || 'Novice Scholar 📚'}
            </Text>
          </View>
        </View>

        <View style={styles.statGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>🔥 {profile?.streak_count || 1}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>💰 {profile?.gold || 0}</Text>
            <Text style={styles.statLabel}>Gold</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>⭐ {currentLevel}</Text>
            <Text style={styles.statLabel}>Level</Text>
          </View>
        </View>

        {/* XP Progress */}
        <View style={styles.xpSection}>
          <View style={styles.xpHeader}>
            <Text style={styles.xpLabel}>CURRENT XP</Text>
            <Text style={styles.xpValue}>
              {currentXP} / {requiredXP}
            </Text>
          </View>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${xpProgress * 100}%` }]} />
          </View>
        </View>
      </View>

      {/* Profile Edit Section */}
      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.cardTitle}>Hero Customization</Text>
          <TouchableOpacity onPress={() => setIsEditing(!isEditing)}>
            <Text style={styles.editToggleText}>{isEditing ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        {isEditing ? (
          <View style={styles.formGroup}>
            <Text style={styles.inputLabel}>Choose Avatar</Text>
            <View style={styles.avatarPresetRow}>
              {PRESET_AVATARS.map((emoji) => {
                const isSelected = avatarInput === emoji;
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.avatarChip, isSelected && styles.avatarChipSelected]}
                    onPress={() => setAvatarInput(emoji)}
                  >
                    <Text style={styles.avatarChipText}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.inputLabel}>Username</Text>
            <TextInput
              style={styles.input}
              value={usernameInput}
              onChangeText={setUsernameInput}
              placeholder="Hero Name"
              placeholderTextColor="#64748B"
            />

            <Text style={styles.infoNote}>
              *Class titles evolve automatically based on your Level milestones.
            </Text>

            <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile}>
              <Text style={styles.saveButtonText}>Save Hero Details</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.infoText}>
            Tap Edit to customize your avatar emoji and hero name.
          </Text>
        )}
      </View>

      {/* System Settings */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>App Preferences</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Sound Effects</Text>
          <Switch
            value={soundEnabled}
            onValueChange={setSoundEnabled}
            trackColor={{ false: '#334155', true: '#6366F1' }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Haptic Feedback</Text>
          <Switch
            value={hapticsEnabled}
            onValueChange={setHapticsEnabled}
            trackColor={{ false: '#334155', true: '#6366F1' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* Danger Zone */}
      <View style={[styles.card, styles.dangerCard]}>
        <Text style={styles.dangerTitle}>Danger Zone (Testing Tool)</Text>
        <Text style={styles.dangerText}>
          Resetting the database will clear all local records and revert your hero stats to initial defaults.
        </Text>
        <TouchableOpacity
          style={styles.resetButton}
          onPress={() => setResetModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.resetButtonText}>⚠️ Reset Local Database</Text>
        </TouchableOpacity>
      </View>

      {/* Custom Themed Dark RPG Reset Modal */}
      <Modal
        visible={resetModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setResetModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.darkModalCard}>
            <Text style={styles.modalIcon}>⚠️</Text>
            <Text style={styles.modalTitle}>PURGE ALL HERO DATA?</Text>
            <Text style={styles.modalText}>
              This action will permanently erase your study logs, gold, level progress, and item vault. This cannot be undone.
            </Text>
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setResetModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmResetDatabase}
              >
                <Text style={styles.modalConfirmText}>Purge Data</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success / Notification Modal */}
      <Modal
        visible={successModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSuccessModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.successModalCard, successModalMessage.isError && styles.errorModalCard]}>
            <Text style={styles.modalIcon}>{successModalMessage.isError ? '⚠️' : '✨'}</Text>
            <Text style={[styles.successModalTitle, successModalMessage.isError && styles.errorModalTitle]}>
              {successModalMessage.title}
            </Text>
            <Text style={styles.modalText}>{successModalMessage.body}</Text>
            <TouchableOpacity
              style={[styles.successButton, successModalMessage.isError && styles.errorButton]}
              onPress={() => setSuccessModalVisible(false)}
            >
              <Text style={styles.successButtonText}>Got It</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 90,
    gap: 14,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  avatarDisplay: {
    fontSize: 48,
  },
  identityText: {
    flex: 1,
  },
  usernameDisplay: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
  },
  classTitleDisplay: {
    color: '#818CF8',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  statGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statValue: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  xpSection: {
    gap: 6,
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xpLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
  },
  xpValue: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '700',
  },
  xpTrack: {
    height: 10,
    backgroundColor: '#0F172A',
    borderRadius: 5,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 5,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  editToggleText: {
    color: '#818CF8',
    fontSize: 14,
    fontWeight: '700',
  },
  formGroup: {
    gap: 8,
    marginTop: 6,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  avatarPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  avatarChip: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatarChipSelected: {
    borderColor: '#6366F1',
    backgroundColor: '#6366F133',
  },
  avatarChipText: {
    fontSize: 22,
  },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  infoNote: {
    color: '#64748B',
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  saveButton: {
    backgroundColor: '#6366F1',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  infoText: {
    color: '#64748B',
    fontSize: 13,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  settingLabel: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  dangerCard: {
    borderColor: '#EF444433',
    backgroundColor: '#1E1218',
  },
  dangerTitle: {
    color: '#F87171',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  dangerText: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 18,
  },
  resetButton: {
    backgroundColor: '#EF444422',
    borderWidth: 1,
    borderColor: '#EF444466',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#F87171',
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 15, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  darkModalCard: {
    width: '100%',
    backgroundColor: '#1E1218',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  successModalCard: {
    width: '100%',
    backgroundColor: '#131C2E',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1.5,
    borderColor: '#10B981',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  errorModalCard: {
    backgroundColor: '#1E1218',
    borderColor: '#EF4444',
  },
  modalIcon: { fontSize: 36, marginBottom: 8 },
  modalTitle: { color: '#F87171', fontSize: 18, fontWeight: '900', letterSpacing: 0.5, marginBottom: 8 },
  successModalTitle: { color: '#34D399', fontSize: 18, fontWeight: '900', letterSpacing: 0.5, marginBottom: 8 },
  errorModalTitle: { color: '#F87171' },
  modalText: { color: '#94A3B8', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  modalActionRow: { flexDirection: 'row', gap: 10, width: '100%' },
  modalCancelButton: { flex: 1, backgroundColor: '#1E293B', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  modalCancelText: { color: '#F8FAFC', fontWeight: '700', fontSize: 13 },
  modalConfirmButton: { flex: 1, backgroundColor: '#EF4444', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalConfirmText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  successButton: { width: '100%', backgroundColor: '#10B981', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  errorButton: { backgroundColor: '#EF4444' },
  successButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
});