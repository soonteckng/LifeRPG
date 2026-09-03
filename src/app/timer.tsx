import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getSubjects, getTasks, Attribute, Task } from '../../db/database';
import { useTimer } from '../context/TimerContext';
import { useUser } from '../context/UserContext';
import Header from '../components/Header';

const PRESETS = [15, 30, 45, 60];

export default function TimerScreen() {
  const {
    timeLeft,
    duration,
    isRunning,
    isCompleted,
    targetAttributeId,
    setTargetAttributeId,
    linkedTaskId,
    setLinkedTaskId,
    notes,
    setNotes,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    setDurationInMinutes,
  } = useTimer();

  const { hapticsEnabled } = useUser();

  const [selectedMinutes, setSelectedMinutes] = useState(30);
  const [isCustom, setIsCustom] = useState(false);
  const [customText, setCustomText] = useState('30');

  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const loadData = useCallback(() => {
    const attrs = getSubjects();
    const taskList = getTasks().filter((t) => t.is_completed === 0);
    setAttributes(attrs);
    setTasks(taskList);

    if (attrs.length > 0 && targetAttributeId === null) {
      setTargetAttributeId(attrs[0].id);
    }
  }, [targetAttributeId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSelectTask = (task: Task | null) => {
    if (isRunning) return;
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (task) {
      setLinkedTaskId(task.id);
      const targetMins = task.target_minutes || 30;
      setSelectedMinutes(targetMins);
      setIsCustom(!PRESETS.includes(targetMins));
      setCustomText(String(targetMins));
      setDurationInMinutes(targetMins);
    } else {
      setLinkedTaskId(null);
    }
  };

  const handleSelectPreset = (m: number) => {
    if (isRunning) return;
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsCustom(false);
    setSelectedMinutes(m);
    setDurationInMinutes(m);
  };

  const handleCustomChange = (text: string) => {
    if (isRunning) return;
    setCustomText(text);
    const mins = parseInt(text, 10);
    if (!isNaN(mins) && mins > 0) {
      setDurationInMinutes(mins);
    }
  };

  const handleStart = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const mins = isCustom ? parseInt(customText, 10) || 30 : selectedMinutes;
    const questObj = tasks.find((t) => t.id === linkedTaskId);
    startTimer(mins, questObj?.title);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;

  const linkedTaskObj = tasks.find((t) => t.id === linkedTaskId);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Header
              title="Focus Chamber"
              subtitle="Link a quest to convert study time into instant completion"
              showBack={false}
            />

            <Text style={styles.label}>🎯 LINKED QUEST (AUTO-COMPLETES ON FINISH)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
              <TouchableOpacity
                disabled={isRunning}
                style={[styles.chip, linkedTaskId === null && styles.chipActive]}
                onPress={() => handleSelectTask(null)}
              >
                <Text style={[styles.chipText, linkedTaskId === null && styles.chipTextActive]}>
                  None (Free Focus)
                </Text>
              </TouchableOpacity>
              {tasks.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  disabled={isRunning}
                  style={[styles.chip, linkedTaskId === t.id && styles.chipActive]}
                  onPress={() => handleSelectTask(t)}
                >
                  <Text style={[styles.chipText, linkedTaskId === t.id && styles.chipTextActive]}>
                    📜 {t.title} ({t.target_minutes || 30}m)
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {linkedTaskObj && (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  ✨ Focusing will finish: <Text style={{ color: '#F8FAFC' }}>{linkedTaskObj.title}</Text>
                </Text>
              </View>
            )}

            <Text style={styles.label}>TIMER DURATION</Text>
            <View style={styles.presetRow}>
              {PRESETS.map((m) => (
                <TouchableOpacity
                  key={m}
                  disabled={isRunning}
                  style={[styles.preset, !isCustom && selectedMinutes === m && styles.presetActive]}
                  onPress={() => handleSelectPreset(m)}
                >
                  <Text style={[styles.presetText, !isCustom && selectedMinutes === m && styles.presetTextActive]}>
                    {m}m
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                disabled={isRunning}
                style={[styles.preset, isCustom && styles.presetActive]}
                onPress={() => {
                  if (isRunning) return;
                  setIsCustom(true);
                  const mins = parseInt(customText, 10) || 30;
                  setDurationInMinutes(mins);
                }}
              >
                <Text style={[styles.presetText, isCustom && styles.presetTextActive]}>Custom</Text>
              </TouchableOpacity>
            </View>

            {isCustom && (
              <View style={styles.customCard}>
                <Text style={styles.customLabel}>Target Duration:</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.customInput}
                    keyboardType="number-pad"
                    value={customText}
                    onChangeText={handleCustomChange}
                    editable={!isRunning}
                    maxLength={3}
                  />
                  <Text style={styles.minSuffix}>MIN</Text>
                </View>
              </View>
            )}

            <View style={styles.timerCircle}>
              <Text style={styles.timerDigits}>{formattedTime}</Text>
              <Text style={styles.timerSub}>
                {isRunning ? 'FOCUSING...' : isCompleted ? 'COMPLETED!' : 'READY'}
              </Text>
            </View>

            <View style={styles.btnRow}>
              {!isRunning && (timeLeft === duration || isCompleted) ? (
                <TouchableOpacity style={styles.mainBtn} onPress={handleStart}>
                  <Text style={styles.btnText}>START FOCUS SESSION</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.mainBtn, isRunning ? styles.pauseBtn : styles.resumeBtn]}
                  onPress={isRunning ? pauseTimer : resumeTimer}
                >
                  <Text style={styles.btnText}>{isRunning ? 'PAUSE' : 'RESUME'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.resetBtn} onPress={resetTimer}>
                <Text style={styles.resetText}>RESET TIMER</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>SESSION NOTES / DISTRACTION DUMP</Text>
            <TextInput
              style={styles.notesInput}
              multiline
              placeholder="Jot down stray thoughts here..."
              placeholderTextColor="#64748B"
              value={notes}
              onChangeText={setNotes}
            />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  scrollContent: { padding: 20, paddingBottom: 140, alignItems: 'center' },
  label: { alignSelf: 'flex-start', color: '#64748B', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  row: { maxHeight: 38, marginBottom: 12, width: '100%' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(30, 41, 59, 0.55)', marginRight: 8, borderWidth: 1, borderColor: '#334155' },
  chipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  chipText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF', fontWeight: 'bold' },
  notice: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderWidth: 1, borderColor: '#10B981', padding: 8, borderRadius: 10, width: '100%', marginBottom: 12, alignItems: 'center' },
  noticeText: { color: '#10B981', fontSize: 12, fontWeight: 'bold' },
  presetRow: { flexDirection: 'row', gap: 6, marginBottom: 12, width: '100%' },
  preset: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(30, 41, 59, 0.55)', borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  presetActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  presetText: { color: '#94A3B8', fontWeight: 'bold', fontSize: 13 },
  presetTextActive: { color: '#FFFFFF' },
  customCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#6366F1',
    marginBottom: 12,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customLabel: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  customInput: {
    color: '#6366F1',
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'center',
  },
  minSuffix: { color: '#64748B', fontSize: 11, fontWeight: '800' },
  timerCircle: { width: 180, height: 180, borderRadius: 90, borderWidth: 6, borderColor: '#10B981', justifyContent: 'center', alignItems: 'center', marginVertical: 10, backgroundColor: 'rgba(30, 41, 59, 0.55)' },
  timerDigits: { color: '#F8FAFC', fontSize: 40, fontWeight: 'bold', fontVariant: ['tabular-nums'] },
  timerSub: { color: '#10B981', fontSize: 11, fontWeight: 'bold', marginTop: 4 },
  btnRow: { width: '100%', gap: 8, marginBottom: 16 },
  mainBtn: { backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  pauseBtn: { backgroundColor: '#F59E0B' },
  resumeBtn: { backgroundColor: '#3B82F6' },
  resetBtn: { backgroundColor: 'rgba(30, 41, 59, 0.55)', paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  btnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  resetText: { color: '#94A3B8', fontWeight: 'bold', fontSize: 12 },
  notesInput: { width: '100%', backgroundColor: 'rgba(30, 41, 59, 0.55)', color: '#F8FAFC', borderRadius: 12, padding: 12, height: 90, textAlignVertical: 'top', borderWidth: 1, borderColor: '#334155' },
});