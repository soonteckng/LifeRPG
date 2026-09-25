import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Header from "../../components/Header";
import { useTimer } from "../../context/TimerContext";
import { useUser } from "../../context/UserContext";
import {
  createTask,
  deleteTask,
  getSubjects,
  getTasks,
  type Subject,
  type Task,
  updateTask,
} from "../../services/taskService";

const DURATION_OPTIONS = [15, 30, 45, 60];

type RepeatType = "once" | "daily" | "custom";

const DAYS_OF_WEEK = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

export default function TasksScreen() {
  const router = useRouter();

  const { hapticsEnabled } = useUser();

  const {
    setLinkedTaskId,
    setDurationInMinutes,
    setTargetAttributeId,
  } = useTimer();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const [deleteConfirmTask, setDeleteConfirmTask] =
    useState<Task | null>(null);

  const [title, setTitle] = useState("");
  const [targetMinutes, setTargetMinutes] = useState(30);
  const [customDuration, setCustomDuration] = useState("30");

  const [repeatType, setRepeatType] =
    useState<RepeatType>("once");

  const [selectedDays, setSelectedDays] = useState<string[]>(
    [],
  );

  const [selectedSubjectId, setSelectedSubjectId] =
    useState<number | null>(null);

  const [showMoreOptions, setShowMoreOptions] =
    useState(false);

  const keyboardVisibleRef = useRef(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      "keyboardDidShow",
      () => {
        keyboardVisibleRef.current = true;
      },
    );

    const hideSubscription = Keyboard.addListener(
      "keyboardDidHide",
      () => {
        keyboardVisibleRef.current = false;
      },
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!modalVisible) {
      return;
    }

    const backSubscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (keyboardVisibleRef.current) {
          Keyboard.dismiss();
          return true;
        }

        if (!saving) {
          Keyboard.dismiss();
          setModalVisible(false);
          resetForm();
        }

        return true;
      },
    );

    return () => {
      backSubscription.remove();
    };
  }, [modalVisible, saving]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [taskList, subjectList] = await Promise.all([
        getTasks(),
        getSubjects(),
      ]);

      setTasks(taskList);
      setSubjects(subjectList);
    } catch (error) {
      console.error("Failed to load quest data:", error);

      Alert.alert(
        "Couldn't load quests",
        "Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const activeTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.is_due_today && !task.is_completed_today,
      ),
    [tasks],
  );

  const completedTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          !task.is_due_today ||
          task.is_completed_today,
      ),
    [tasks],
  );

  const resetForm = () => {
    setEditingTask(null);
    setTitle("");
    setTargetMinutes(30);
    setCustomDuration("30");
    setRepeatType("once");
    setSelectedDays([]);
    setSelectedSubjectId(null);
    setShowMoreOptions(false);
  };

  const openCreateModal = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (task: Task) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    setEditingTask(task);
    setTitle(task.title);

    const minutes = task.target_minutes || 30;

    setTargetMinutes(minutes);
    setCustomDuration(String(minutes));

    if (!DURATION_OPTIONS.includes(minutes)) {
      setShowMoreOptions(true);
    }

    const rule = task.repeat_rule || "once";

    if (rule === "once") {
      setRepeatType("once");
      setSelectedDays([]);
    } else if (rule === "daily") {
      setRepeatType("daily");
      setSelectedDays([]);
      setShowMoreOptions(true);
    } else {
      setRepeatType("custom");
      setSelectedDays(
        rule
          .split(",")
          .map((day) => day.trim())
          .filter(Boolean),
      );
      setShowMoreOptions(true);
    }

    setSelectedSubjectId(task.subject_id ?? null);
    setModalVisible(true);
  };

  const closeModal = () => {
    if (saving) {
      return;
    }

    Keyboard.dismiss();
    setModalVisible(false);
    resetForm();
  };

  const toggleDay = (day: string) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day],
    );
  };

  const getRepeatRule = () => {
    if (repeatType === "daily") {
      return "daily";
    }

    if (repeatType === "custom") {
      return selectedDays.length > 0
        ? selectedDays.join(",")
        : "once";
    }

    return "once";
  };

  const saveQuest = async () => {
    const cleanTitle = title.trim();

    if (!cleanTitle) {
      Alert.alert(
        "Quest name missing",
        "Give your quest a name first.",
      );
      return;
    }

    let minutes = targetMinutes;

    if (
      showMoreOptions &&
      !DURATION_OPTIONS.includes(targetMinutes)
    ) {
      minutes = Number.parseInt(customDuration, 10);
    }

    if (!Number.isFinite(minutes) || minutes < 1) {
      Alert.alert(
        "Invalid duration",
        "Enter a duration of at least 1 minute.",
      );
      return;
    }

    if (
      repeatType === "custom" &&
      selectedDays.length === 0
    ) {
      Alert.alert(
        "Choose a day",
        "Select at least one day for a repeating quest.",
      );
      return;
    }

    try {
      setSaving(true);

      const repeatRule = getRepeatRule();

      const params = {
        title: cleanTitle,
        targetMinutes: minutes,
        subjectId: selectedSubjectId,
        repeatRule,
        difficulty: "medium" as const,
      };

      if (editingTask) {
        await updateTask(editingTask.id, params);
      } else {
        await createTask(params);
      }

      if (hapticsEnabled) {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }

      Keyboard.dismiss();
      setModalVisible(false);
      resetForm();

      await loadData();
    } catch (error) {
      console.error("Failed to save quest:", error);

      Alert.alert(
        "Couldn't save quest",
        "Please check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const requestDeleteQuest = (task: Task) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    setDeleteConfirmTask(task);
  };

  const confirmDeleteQuest = async () => {
    if (!deleteConfirmTask) {
      return;
    }

    try {
      await deleteTask(deleteConfirmTask.id);

      if (hapticsEnabled) {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }

      setDeleteConfirmTask(null);
      await loadData();
    } catch (error) {
      console.error("Failed to delete quest:", error);

      setDeleteConfirmTask(null);

      Alert.alert(
        "Couldn't delete quest",
        "Please try again.",
      );
    }
  };

  const startQuest = (task: Task) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Medium,
      );
    }

    setLinkedTaskId(task.id);

    setDurationInMinutes(
      task.target_minutes || 30,
    );

    setTargetAttributeId(
      task.subject_id ?? null,
    );

    router.push("/timer");
  };

  const getSubject = (subjectId: number | null) => {
    if (!subjectId) {
      return null;
    }

    return subjects.find(
      (subject) => subject.id === subjectId,
    );
  };

  const getRepeatLabel = (task: Task) => {
    if (!task.is_recurring) {
      return "One-time";
    }

    if (task.repeat_rule === "daily") {
      return "Daily";
    }

    return task.repeat_rule;
  };

  const renderTask = ({
    item,
    completed = false,
  }: {
    item: Task;
    completed?: boolean;
  }) => {
    const subject = getSubject(item.subject_id);

    return (
      <View
        style={[
          styles.questCard,
          completed && styles.questCardCompleted,
        ]}
      >
        <View style={styles.questTopRow}>
          <View style={styles.questTextArea}>
            <View style={styles.questTitleRow}>
              <View
                style={[
                  styles.statusDot,
                  completed && styles.statusDotDone,
                ]}
              />

              <Text
                style={[
                  styles.questTitle,
                  completed &&
                    styles.questTitleCompleted,
                ]}
                numberOfLines={2}
              >
                {item.title}
              </Text>
            </View>

            <View style={styles.metadataRow}>
              <Text style={styles.metadataText}>
                {item.target_minutes || 30} min
              </Text>

              <Text style={styles.metadataSeparator}>
                •
              </Text>

              <Text style={styles.metadataText}>
                +{item.target_minutes || 30} XP
              </Text>

              <Text style={styles.metadataSeparator}>
                •
              </Text>

              <Text style={styles.metadataText}>
                {getRepeatLabel(item)}
              </Text>
            </View>

            {subject && (
              <View
                style={[
                  styles.areaBadge,
                  {
                    borderColor:
                      subject.color_code ??
                      "#6366F1",
                  },
                ]}
              >
                <View
                  style={[
                    styles.areaDot,
                    {
                      backgroundColor:
                        subject.color_code ??
                        "#6366F1",
                    },
                  ]}
                />

                <Text
                  style={[
                    styles.areaBadgeText,
                    {
                      color:
                        subject.color_code ??
                        "#6366F1",
                    },
                  ]}
                >
                  {subject.title}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.questActions}>
            <TouchableOpacity
              onPress={() => openEditModal(item)}
              style={styles.iconButton}
            >
              <Text style={styles.iconButtonText}>
                ✏️
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                requestDeleteQuest(item)
              }
              style={styles.iconButton}
            >
              <Text
                style={[
                  styles.iconButtonText,
                  styles.deleteIcon,
                ]}
              >
                ✕
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {!completed && (
          <TouchableOpacity
            style={styles.startButton}
            activeOpacity={0.85}
            onPress={() => startQuest(item)}
          >
            <Text style={styles.startButtonText}>
              ▶ START
            </Text>

            <Text style={styles.startButtonDuration}>
              {item.target_minutes || 30} min
            </Text>
          </TouchableOpacity>
        )}

        {completed && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedBadgeText}>
              ✓ COMPLETED
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Quests"
        subtitle="Things you want to get done"
        showBack={false}
      />

      <View style={styles.content}>
        <View style={styles.goalHint}>
          <View style={styles.goalHintTextArea}>
            <Text style={styles.goalHintTitle}>
              Make progress without overthinking it
            </Text>

            <Text style={styles.goalHintText}>
              Add a quest when you want extra structure.
              You can also start a session directly.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.addButton}
            onPress={openCreateModal}
            activeOpacity={0.85}
          >
            <Text style={styles.addButtonText}>
              +
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Loading quests...
            </Text>
          </View>
        ) : (
          <FlatList
            data={activeTasks}
            keyExtractor={(item) =>
              String(item.id)
            }
            renderItem={(props) =>
              renderTask(props)
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    Today's quests
                  </Text>

                  <Text style={styles.sectionCount}>
                    {activeTasks.length}
                  </Text>
                </View>

                {activeTasks.length === 0 && (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyIcon}>
                      ✨
                    </Text>

                    <Text style={styles.emptyTitle}>
                      Nothing waiting for you
                    </Text>

                    <Text style={styles.emptyText}>
                      Start a session or add a quest when
                      you have something you want to accomplish.
                    </Text>
                  </View>
                )}
              </View>
            }
            ListFooterComponent={
              completedTasks.length > 0 ? (
                <View style={styles.completedSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                      Completed / upcoming
                    </Text>

                    <Text style={styles.sectionCount}>
                      {completedTasks.length}
                    </Text>
                  </View>

                  {completedTasks.map((task) => (
                    <View key={task.id}>
                      {renderTask({
                        item: task,
                        completed:
                          task.is_completed_today,
                      })}
                    </View>
                  ))}
                </View>
              ) : null
            }
          />
        )}
      </View>

      {/* Create / Edit Quest Overlay */}
      {modalVisible && (
        <View style={styles.questOverlay}>
          <KeyboardAvoidingView
            style={styles.questOverlayKeyboard}
            behavior="padding"
          >
            <View style={styles.modalCard}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={
                  styles.modalScrollContent
                }
              >
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>
                      {editingTask
                        ? "Edit Quest"
                        : "New Quest"}
                    </Text>

                    <Text style={styles.modalSubtitle}>
                      Keep it simple. You can add more later.
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={closeModal}
                    disabled={saving}
                  >
                    <Text style={styles.closeButton}>
                      ✕
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>
                  WHAT DO YOU WANT TO DO?
                </Text>

                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Finish my resume"
                  placeholderTextColor="#64748B"
                  style={styles.titleInput}
                  autoFocus
                  maxLength={120}
                />

                <Text style={styles.inputLabel}>
                  HOW LONG?
                </Text>

                <View style={styles.durationGrid}>
                  {DURATION_OPTIONS.map((minutes) => {
                    const selected =
                      targetMinutes === minutes &&
                      DURATION_OPTIONS.includes(
                        targetMinutes,
                      );

                    return (
                      <TouchableOpacity
                        key={minutes}
                        style={[
                          styles.durationButton,
                          selected &&
                            styles.durationButtonSelected,
                        ]}
                        onPress={() => {
                          setTargetMinutes(minutes);
                          setCustomDuration(
                            String(minutes),
                          );
                        }}
                      >
                        <Text
                          style={[
                            styles.durationButtonText,
                            selected &&
                              styles.durationButtonTextSelected,
                          ]}
                        >
                          {minutes}
                        </Text>

                        <Text
                          style={[
                            styles.durationUnit,
                            selected &&
                              styles.durationUnitSelected,
                          ]}
                        >
                          min
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={styles.moreOptionsToggle}
                  onPress={() =>
                    setShowMoreOptions(
                      (current) => !current,
                    )
                  }
                >
                  <Text
                    style={styles.moreOptionsText}
                  >
                    {showMoreOptions
                      ? "Hide options"
                      : "More options"}
                  </Text>

                  <Text style={styles.chevron}>
                    {showMoreOptions ? "⌃" : "⌄"}
                  </Text>
                </TouchableOpacity>

                {showMoreOptions && (
                  <View style={styles.advancedArea}>
                    <Text style={styles.inputLabel}>
                      CUSTOM DURATION
                    </Text>

                    <TextInput
                      value={customDuration}
                      onChangeText={(text) => {
                        setCustomDuration(text);

                        const value =
                          Number.parseInt(
                            text,
                            10,
                          );

                        if (
                          Number.isFinite(value) &&
                          value > 0
                        ) {
                          setTargetMinutes(value);
                        }
                      }}
                      keyboardType="number-pad"
                      placeholder="30"
                      placeholderTextColor="#64748B"
                      style={styles.titleInput}
                      maxLength={3}
                    />

                    <Text style={styles.inputLabel}>
                      AREA
                    </Text>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={
                        false
                      }
                      contentContainerStyle={
                        styles.areaScroll
                      }
                    >
                      <TouchableOpacity
                        style={[
                          styles.areaChip,
                          selectedSubjectId ===
                            null &&
                            styles.areaChipSelected,
                        ]}
                        onPress={() =>
                          setSelectedSubjectId(
                            null,
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.areaChipText,
                            selectedSubjectId ===
                              null &&
                              styles.areaChipTextSelected,
                          ]}
                        >
                          General
                        </Text>
                      </TouchableOpacity>

                      {subjects
                        .filter(
                          (subject) =>
                            subject.title !==
                            "General",
                        )
                        .map((subject) => {
                          const selected =
                            selectedSubjectId ===
                            subject.id;

                          return (
                            <TouchableOpacity
                              key={subject.id}
                              style={[
                                styles.areaChip,
                                selected && {
                                  backgroundColor:
                                    subject.color_code ??
                                    "#6366F1",
                                  borderColor:
                                    subject.color_code ??
                                    "#6366F1",
                                },
                              ]}
                              onPress={() =>
                                setSelectedSubjectId(
                                  subject.id,
                                )
                              }
                            >
                              <Text
                                style={[
                                  styles.areaChipText,
                                  selected &&
                                    styles.areaChipTextSelected,
                                ]}
                              >
                                {subject.title}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                    </ScrollView>

                    <Text style={styles.inputLabel}>
                      REPEAT
                    </Text>

                    <View style={styles.repeatRow}>
                      {[
                        {
                          value: "once" as const,
                          label: "Once",
                        },
                        {
                          value: "daily" as const,
                          label: "Daily",
                        },
                        {
                          value: "custom" as const,
                          label: "Days",
                        },
                      ].map((option) => {
                        const selected =
                          repeatType ===
                          option.value;

                        return (
                          <TouchableOpacity
                            key={option.value}
                            style={[
                              styles.repeatButton,
                              selected &&
                                styles.repeatButtonSelected,
                            ]}
                            onPress={() =>
                              setRepeatType(
                                option.value,
                              )
                            }
                          >
                            <Text
                              style={[
                                styles.repeatButtonText,
                                selected &&
                                  styles.repeatButtonTextSelected,
                              ]}
                            >
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {repeatType === "custom" && (
                      <View style={styles.daysContainer}>
                        {DAYS_OF_WEEK.map(
                          (day) => {
                            const selected =
                              selectedDays.includes(
                                day,
                              );

                            return (
                              <TouchableOpacity
                                key={day}
                                style={[
                                  styles.dayButton,
                                  selected &&
                                    styles.dayButtonSelected,
                                ]}
                                onPress={() =>
                                  toggleDay(day)
                                }
                              >
                                <Text
                                  style={[
                                    styles.dayButtonText,
                                    selected &&
                                      styles.dayButtonTextSelected,
                                  ]}
                                >
                                  {day[0]}
                                </Text>
                              </TouchableOpacity>
                            );
                          },
                        )}
                      </View>
                    )}
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    saving && styles.saveButtonDisabled,
                  ]}
                  onPress={saveQuest}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  <Text style={styles.saveButtonText}>
                    {saving
                      ? "SAVING..."
                      : editingTask
                        ? "SAVE QUEST"
                        : "ADD QUEST"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={closeModal}
                  disabled={saving}
                >
                  <Text style={styles.modalCancelText}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* Themed Delete Confirmation */}
      <Modal
        visible={!!deleteConfirmTask}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setDeleteConfirmTask(null)
        }
      >
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteCard}>
            <Text style={styles.deleteWarningIcon}>
              ⚠️
            </Text>

            <Text style={styles.deleteTitle}>
              Delete this quest?
            </Text>

            <Text style={styles.deleteMessage}>
              {deleteConfirmTask
                ? `"${deleteConfirmTask.title}" will be permanently removed.`
                : ""}
            </Text>

            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={styles.deleteCancelButton}
                onPress={() =>
                  setDeleteConfirmTask(null)
                }
              >
                <Text
                  style={styles.deleteCancelText}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteConfirmButton}
                onPress={confirmDeleteQuest}
              >
                <Text
                  style={styles.deleteConfirmText}
                >
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090D16",
  },

  content: {
    flex: 1,
    paddingHorizontal: 20,
  },

  goalHint: {
    marginTop: 6,
    marginBottom: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(129, 140, 248, 0.18)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  goalHintTextArea: {
    flex: 1,
    minWidth: 0,
  },

  goalHintTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },

  goalHintText: {
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },

  addButton: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: 14,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },

  addButtonText: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "300",
  },

  listContent: {
    paddingBottom: 120,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "900",
  },

  sectionCount: {
    color: "#818CF8",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 8,
    backgroundColor: "rgba(99, 102, 241, 0.12)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },

  questCard: {
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
    padding: 14,
    marginBottom: 10,
  },

  questCardCompleted: {
    opacity: 0.62,
  },

  questTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  questTextArea: {
    flex: 1,
    minWidth: 0,
  },

  questTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#818CF8",
  },

  statusDotDone: {
    backgroundColor: "#10B981",
  },

  questTitle: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
  },

  questTitleCompleted: {
    textDecorationLine: "line-through",
    color: "#64748B",
  },

  metadataRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 7,
    gap: 5,
  },

  metadataText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
  },

  metadataSeparator: {
    color: "#475569",
    fontSize: 10,
  },

  areaBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#0F172A",
    borderWidth: 1,
  },

  areaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  areaBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },

  questActions: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },

  iconButton: {
    padding: 6,
  },

  iconButtonText: {
    fontSize: 14,
  },

  deleteIcon: {
    color: "#EF4444",
    fontWeight: "800",
  },

  startButton: {
    marginTop: 14,
    height: 40,
    borderRadius: 11,
    backgroundColor: "#6366F1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },

  startButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  startButtonDuration: {
    color: "#E0E7FF",
    fontSize: 11,
    fontWeight: "800",
  },

  completedBadge: {
    marginTop: 14,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: "rgba(16, 185, 129, 0.10)",
    alignItems: "center",
  },

  completedBadgeText: {
    color: "#34D399",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  emptyCard: {
    padding: 24,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
  },

  emptyIcon: {
    fontSize: 28,
    marginBottom: 8,
  },

  emptyTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },

  emptyText: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 6,
  },

  completedSection: {
    marginTop: 18,
  },

  emptyState: {
    paddingTop: 60,
    alignItems: "center",
  },

  emptyStateText: {
    color: "#64748B",
    fontSize: 12,
  },

  /* CREATE / EDIT OVERLAY */

  questOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.76)",
    justifyContent: "flex-end",
    zIndex: 1000,
    elevation: 1000,
  },

  questOverlayKeyboard: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
  },

  modalCard: {
    width: "100%",
    maxHeight: "95%",
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },

  modalScrollContent: {
    paddingBottom: 32,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 24,
  },

  modalTitle: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "900",
  },

  modalSubtitle: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 5,
  },

  closeButton: {
    color: "#64748B",
    fontSize: 20,
    padding: 4,
  },

  inputLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 14,
  },

  titleInput: {
    backgroundColor: "#111C30",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.09)",
    color: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
  },

  durationGrid: {
    flexDirection: "row",
    gap: 8,
  },

  durationButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 13,
    backgroundColor: "#111C30",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  durationButtonSelected: {
    backgroundColor: "rgba(99, 102, 241, 0.22)",
    borderColor: "#6366F1",
  },

  durationButtonText: {
    color: "#CBD5E1",
    fontSize: 16,
    fontWeight: "900",
  },

  durationButtonTextSelected: {
    color: "#FFFFFF",
  },

  durationUnit: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 1,
  },

  durationUnitSelected: {
    color: "#C7D2FE",
  },

  moreOptionsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.07)",
    marginBottom: 2,
  },

  moreOptionsText: {
    color: "#A5B4FC",
    fontSize: 12,
    fontWeight: "800",
  },

  chevron: {
    color: "#A5B4FC",
    fontSize: 16,
  },

  advancedArea: {
    paddingTop: 2,
  },

  areaScroll: {
    gap: 8,
    paddingBottom: 3,
  },

  areaChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: "#111C30",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },

  areaChipSelected: {
    backgroundColor: "#6366F1",
    borderColor: "#6366F1",
  },

  areaChipText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
  },

  areaChipTextSelected: {
    color: "#FFFFFF",
  },

  repeatRow: {
    flexDirection: "row",
    gap: 8,
  },

  repeatButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: "#111C30",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  repeatButtonSelected: {
    backgroundColor: "rgba(99, 102, 241, 0.22)",
    borderColor: "#6366F1",
  },

  repeatButtonText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
  },

  repeatButtonTextSelected: {
    color: "#FFFFFF",
  },

  daysContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 10,
  },

  dayButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#111C30",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  dayButtonSelected: {
    backgroundColor: "#6366F1",
    borderColor: "#6366F1",
  },

  dayButtonText: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
  },

  dayButtonTextSelected: {
    color: "#FFFFFF",
  },

  saveButton: {
    marginTop: 24,
    height: 50,
    borderRadius: 14,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },

  saveButtonDisabled: {
    opacity: 0.55,
  },

  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  modalCancelButton: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  modalCancelText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800",
  },

  /* DELETE CONFIRMATION */

  deleteOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },

  deleteCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#111827",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
    padding: 24,
    alignItems: "center",
  },

  deleteWarningIcon: {
    fontSize: 30,
    marginBottom: 10,
  },

  deleteTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "900",
  },

  deleteMessage: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
  },

  deleteActions: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
    marginTop: 22,
  },

  deleteCancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },

  deleteCancelText: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "800",
  },

  deleteConfirmButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },

  deleteConfirmText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
});