import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  getTasks,
  addTask,
  updateTask,
  uncompleteTask,
  deleteTask,
  Task,
} from '../../db/database';
import { useUser } from '../context/UserContext';
import { useTimer } from '../context/TimerContext';
import Header from '../components/Header';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DURATION_OPTIONS = [15, 30, 45, 60];

export default function TasksScreen() {
  const router = useRouter();
  const { hapticsEnabled } = useUser();
  const { setLinkedTaskId, setDurationInMinutes } = useTimer();

  const [tasks, setTasks] = useState<Task[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [targetMinutes, setTargetMinutes] = useState(30);
  const [repeatType, setRepeatType] = useState<'once' | 'daily' | 'custom'>('once');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  const loadData = useCallback(() => {
    const taskList = getTasks();
    setTasks(taskList);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const resetForm = () => {
    setTitle('');
    setTargetMinutes(30);
    setRepeatType('once');
    setSelectedDays([]);
    setEditingTaskId(null);
  };

  const handleOpenCreateModal = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (task: Task) => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingTaskId(task.id);
    setTitle(task.title);
    setTargetMinutes(task.target_minutes || 30);

    const rule = task.repeat_rule || 'once';
    if (rule === 'once') {
      setRepeatType('once');
      setSelectedDays([]);
    } else if (rule === 'daily') {
      setRepeatType('daily');
      setSelectedDays([]);
    } else {
      setRepeatType('custom');
      setSelectedDays(rule.split(','));
    }

    setIsModalOpen(true);
  };

  const toggleDay = (day: string) => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const handleQuestPress = (task: Task) => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (task.is_completed === 1) {
      uncompleteTask(task.id);
      loadData();
    } else {
      setLinkedTaskId(task.id);
      setDurationInMinutes(task.target_minutes || 30);
      router.push('/timer');
    }
  };

  const handleSaveTask = () => {
    if (!title.trim()) return;
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    let rule = 'once';
    if (repeatType === 'daily') rule = 'daily';
    if (repeatType === 'custom') rule = selectedDays.length > 0 ? selectedDays.join(',') : 'once';

    if (editingTaskId) {
      updateTask(editingTaskId, title.trim(), 'medium', rule, targetMinutes);
    } else {
      addTask(title.trim(), 'medium', null, rule, targetMinutes);
    }

    resetForm();
    setIsModalOpen(false);
    loadData();
  };

  const getRepeatLabel = (rule?: string) => {
    if (!rule || rule === 'once') return 'One-time';
    if (rule === 'daily') return '🔄 Daily';
    return `📅 ${rule}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Header title="Quest Log" subtitle="Tap a quest to start a focus session" showBack={false} />

        <TouchableOpacity style={styles.addBtn} onPress={handleOpenCreateModal}>
          <Text style={styles.addBtnText}>+ CREATE NEW QUEST</Text>
        </TouchableOpacity>

        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, item.is_completed === 1 && styles.cardDone]}>
              <TouchableOpacity style={styles.checkArea} onPress={() => handleQuestPress(item)}>
                <View style={[styles.checkbox, item.is_completed === 1 && styles.checkboxDone]}>
                  {item.is_completed === 1 ? (
                    <Text style={styles.checkMark}>✓</Text>
                  ) : (
                    <Text style={styles.focusIcon}>⏱️</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.taskTitle, item.is_completed === 1 && styles.taskTitleDone]}>
                    {item.title}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.taskXP}>⏱️ {item.target_minutes || 30}m (+{item.xp_awarded} XP)</Text>
                    <Text style={styles.repeatBadge}>{getRepeatLabel(item.repeat_rule)}</Text>
                  </View>
                </View>
              </TouchableOpacity>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleOpenEditModal(item)}>
                  <Text style={styles.editIcon}>✏️</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => {
                    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    deleteTask(item.id);
                    loadData();
                  }}
                >
                  <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      </View>

      <Modal visible={isModalOpen} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ width: '100%' }}
            >
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>
                  {editingTaskId ? 'Edit Quest' : 'New Quest'}
                </Text>

                <Text style={styles.inputLabel}>QUEST NAME</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Quest Title..."
                  placeholderTextColor="#64748B"
                  value={title}
                  onChangeText={setTitle}
                  autoFocus
                />

                <Text style={styles.inputLabel}>TARGET DURATION</Text>
                <View style={styles.segmentedRow}>
                  {DURATION_OPTIONS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.segmentBtn, targetMinutes === m && styles.segmentActive]}
                      onPress={() => setTargetMinutes(m)}
                    >
                      <Text style={[styles.segmentText, targetMinutes === m && styles.segmentTextActive]}>
                        {m}m
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>REPEAT SCHEDULE</Text>
                <View style={styles.segmentedRow}>
                  <TouchableOpacity
                    style={[styles.segmentBtn, repeatType === 'once' && styles.segmentActive]}
                    onPress={() => setRepeatType('once')}
                  >
                    <Text style={[styles.segmentText, repeatType === 'once' && styles.segmentTextActive]}>
                      Once
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.segmentBtn, repeatType === 'daily' && styles.segmentActive]}
                    onPress={() => setRepeatType('daily')}
                  >
                    <Text style={[styles.segmentText, repeatType === 'daily' && styles.segmentTextActive]}>
                      Everyday
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.segmentBtn, repeatType === 'custom' && styles.segmentActive]}
                    onPress={() => setRepeatType('custom')}
                  >
                    <Text style={[styles.segmentText, repeatType === 'custom' && styles.segmentTextActive]}>
                      Specific Days
                    </Text>
                  </TouchableOpacity>
                </View>

                {repeatType === 'custom' && (
                  <View style={styles.daysRow}>
                    {DAYS_OF_WEEK.map((day) => {
                      const isSelected = selectedDays.includes(day);
                      return (
                        <TouchableOpacity
                          key={day}
                          style={[styles.dayChip, isSelected && styles.dayChipActive]}
                          onPress={() => toggleDay(day)}
                        >
                          <Text style={[styles.dayText, isSelected && styles.dayTextActive]}>
                            {day[0]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <View style={styles.modalRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      setIsModalOpen(false);
                      resetForm();
                    }}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.submitBtn} onPress={handleSaveTask}>
                    <Text style={styles.submitText}>
                      {editingTaskId ? 'Save Changes' : 'Add Quest'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { flex: 1, padding: 20, paddingBottom: 120 },
  addBtn: {
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6366F1',
    marginBottom: 16,
  },
  addBtnText: { color: '#6366F1', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 },
  list: { gap: 10 },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardDone: { opacity: 0.6 },
  checkArea: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  checkboxDone: { backgroundColor: '#10B981', borderColor: '#10B981' },
  checkMark: { color: '#FFFFFF', fontWeight: 'bold' },
  focusIcon: { fontSize: 13 },
  taskTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '600' },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#64748B' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  taskXP: { color: '#6366F1', fontSize: 11, fontWeight: 'bold' },
  repeatBadge: { color: '#64748B', fontSize: 10, fontWeight: '700', backgroundColor: '#0F172A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtn: { padding: 4 },
  editIcon: { fontSize: 14 },
  deleteText: { color: '#EF4444', fontSize: 16, paddingLeft: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', marginBottom: 14 },
  modalInput: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
    fontSize: 15,
  },
  inputLabel: { color: '#64748B', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  segmentedRow: { flexDirection: 'row', backgroundColor: '#0F172A', borderRadius: 10, padding: 3, marginBottom: 14 },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: '#6366F1' },
  segmentText: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  segmentTextActive: { color: '#FFFFFF' },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  dayChip: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  dayChipActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  dayText: { color: '#64748B', fontWeight: 'bold', fontSize: 12 },
  dayTextActive: { color: '#FFFFFF' },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#0F172A',
  },
  cancelText: { color: '#94A3B8', fontWeight: 'bold' },
  submitBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#6366F1',
  },
  submitText: { color: '#FFFFFF', fontWeight: 'bold' },
});