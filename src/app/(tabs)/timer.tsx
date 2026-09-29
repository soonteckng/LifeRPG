import * as Haptics from "expo-haptics";
import { } from "expo-router";
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Header from "../../components/Header";
import { SESSION_ACTIVITIES } from "../../constants/sessionActivities";
import { useTimer } from "../../context/TimerContext";
import { useUser } from "../../context/UserContext";
import {
  getSubjects,
  getTasks,
  type Subject,
  type Task,
} from "../../services/taskService";

const PRESETS = [15, 30, 45, 60];

export default function TimerScreen() {
  const {
    timeLeft,
    duration,
    isRunning,
    isCompleted,
    hasOpenSession,

    activityType,
    setActivityType,

    targetAttributeId,
    setTargetAttributeId,

    linkedTaskId,
    setLinkedTaskId,

    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    setDurationInMinutes,
  } = useTimer();

  const { hapticsEnabled } = useUser();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [questPickerVisible, setQuestPickerVisible] = useState(false);
  const [areaPickerVisible, setAreaPickerVisible] = useState(false);

  const [isCustom, setIsCustom] = useState(false);
  const [customText, setCustomText] = useState("30");

  const currentMinutes = Math.max(
    1,
    Math.round(duration / 60),
  );

  const linkedTask = useMemo(
    () =>
      tasks.find(
        (task) => task.id === linkedTaskId,
      ) ?? null,
    [tasks, linkedTaskId],
  );

  const linkedArea = useMemo(
    () =>
      subjects.find(
        (subject) => subject.id === targetAttributeId,
      ) ?? null,
    [subjects, targetAttributeId],
  );

  const generalArea = useMemo(
    () =>
      subjects.find(
        (subject) => subject.title === "General",
      ) ?? null,
    [subjects],
  );

  const currentActivity =
    SESSION_ACTIVITIES.find(
      (activity) => activity.id === activityType,
    ) ??
    SESSION_ACTIVITIES[
      SESSION_ACTIVITIES.length - 1
    ];

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const formattedTime =
    `${minutes
      .toString()
      .padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;

  const isSessionLocked =
    hasOpenSession && !isCompleted;

  const loadChoices = async () => {
    try {
      const [taskList, subjectList] = await Promise.all([
        getTasks(),
        getSubjects(),
      ]);

      setTasks(
        taskList.filter(
          (task) =>
            task.is_due_today &&
            !task.is_completed_today,
        ),
      );
      setSubjects(subjectList);
    } catch (error) {
      console.error("Failed to load session choices:", error);
    }
  };

  useEffect(() => {
    void loadChoices();
  }, []);

  useEffect(() => {
    if (!generalArea || isSessionLocked || linkedTaskId !== null) {
      return;
    }

    if (targetAttributeId === null) {
      setTargetAttributeId(generalArea.id);
    }
  }, [
    generalArea,
    isSessionLocked,
    linkedTaskId,
    targetAttributeId,
    setTargetAttributeId,
  ]);

  React.useEffect(() => {
    if (!linkedTask || isSessionLocked) {
      return;
    }

    const questMinutes = linkedTask.target_minutes || 30;

    setDurationInMinutes(questMinutes);
    setCustomText(String(questMinutes));
    setIsCustom(!PRESETS.includes(questMinutes));

    setTargetAttributeId(
      linkedTask.subject_id ??
        generalArea?.id ??
        null,
    );
  }, [
    linkedTask?.id,
    linkedTask?.target_minutes,
    linkedTask?.subject_id,
    isSessionLocked,
    generalArea?.id,
    setDurationInMinutes,
    setTargetAttributeId,
  ]);

  const selectActivity = (type: string) => {
    if (isSessionLocked) {
      return;
    }

    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    setActivityType(type);
  };

  const selectPreset = (value: number) => {
    if (isSessionLocked || linkedTask) {
      return;
    }

    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    setIsCustom(false);
    setCustomText(String(value));
    setDurationInMinutes(value);
  };

  const selectCustom = () => {
    if (isSessionLocked || linkedTask) {
      return;
    }

    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    setIsCustom(true);

    const value =
      Number.parseInt(customText, 10) || 30;

    setDurationInMinutes(
      Math.min(480, Math.max(1, value)),
    );
  };

  const handleCustomChange = (text: string) => {
    if (isSessionLocked || linkedTask) {
      return;
    }

    setCustomText(text);

    const value = Number.parseInt(text, 10);

    if (
      Number.isFinite(value) &&
      value > 0
    ) {
      setDurationInMinutes(
        Math.min(480, value),
      );
    }
  };

  const chooseQuest = (task: Task) => {
    if (isSessionLocked) {
      return;
    }

    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    setLinkedTaskId(task.id);
    setTargetAttributeId(
      task.subject_id ??
        generalArea?.id ??
        null,
    );
    setDurationInMinutes(
      task.target_minutes || 30,
    );
    setCustomText(
      String(task.target_minutes || 30),
    );
    setIsCustom(
      !PRESETS.includes(
        task.target_minutes || 30,
      ),
    );

    setQuestPickerVisible(false);
  };

  const removeQuest = () => {
    if (isSessionLocked) {
      return;
    }

    setLinkedTaskId(null);
    setTargetAttributeId(
      generalArea?.id ?? null,
    );
    setDurationInMinutes(30);
    setCustomText("30");
    setIsCustom(false);
  };

  const chooseArea = (subject: Subject) => {
    if (isSessionLocked || linkedTask) {
      return;
    }

    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    setTargetAttributeId(subject.id);
    setAreaPickerVisible(false);
  };

  const handleStart = async () => {
    const value = Math.max(
      1,
      Math.min(
        480,
        isCustom
          ? Number.parseInt(
              customText,
              10,
            ) || 30
          : currentMinutes,
      ),
    );

    await startTimer(
      value,
      linkedTask?.title,
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={
          hasOpenSession
            ? "Current session"
            : "Start a session"
        }
        subtitle={
          hasOpenSession
            ? "Your progress is safe. Continue when you're ready."
            : "Choose only what you need, then start."
        }
        showBack={true}
        backTitle="Back"
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {isSessionLocked ? (
            <View style={styles.activeCard}>
              <View style={styles.activeCardTop}>
                <View>
                  <Text style={styles.eyebrow}>
                    {isRunning
                      ? "SESSION ACTIVE"
                      : "SESSION PAUSED"}
                  </Text>

                  <Text style={styles.timerText}>
                    {formattedTime}
                  </Text>
                </View>

                <View style={styles.activeActivity}>
                  <Text style={styles.activeActivityIcon}>
                    {currentActivity.icon}
                  </Text>
                  <Text style={styles.activeActivityText}>
                    {currentActivity.label}
                  </Text>
                </View>
              </View>

              <Text style={styles.activeHint}>
                {linkedTask
                  ? `Quest · ${linkedTask.title}`
                  : "Free session"}
              </Text>

              {!isCompleted ? (
                <View style={styles.activeActions}>
                  <TouchableOpacity
                    style={styles.primaryAction}
                    onPress={
                      isRunning
                        ? pauseTimer
                        : resumeTimer
                    }
                    activeOpacity={0.88}
                  >
                    <Text style={styles.primaryActionText}>
                      {isRunning
                        ? "PAUSE"
                        : "RESUME"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryAction}
                    onPress={resetTimer}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.secondaryActionText}>
                      RESET
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.completedBox}>
                  <Text style={styles.completedTitle}>
                    Session complete 🎉
                  </Text>
                  <TouchableOpacity
                    style={styles.primaryAction}
                    onPress={resetTimer}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.primaryActionText}>
                      NEW SESSION
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <>
              <View style={styles.block}>
                <Text style={styles.sectionEyebrow}>
                  WHAT ARE YOU DOING?
                </Text>

                <View style={styles.activityGrid}>
                  {SESSION_ACTIVITIES.map(
                    (activity) => {
                      const selected =
                        activity.id ===
                        activityType;

                      return (
                        <TouchableOpacity
                          key={activity.id}
                          style={[
                            styles.activityCard,
                            selected &&
                              styles.activityCardSelected,
                          ]}
                          onPress={() =>
                            selectActivity(
                              activity.id,
                            )
                          }
                          activeOpacity={0.85}
                        >
                          <Text style={styles.activityIcon}>
                            {activity.icon}
                          </Text>

                          <Text
                            style={[
                              styles.activityLabel,
                              selected &&
                                styles.activityLabelSelected,
                            ]}
                          >
                            {activity.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    },
                  )}
                </View>
              </View>

              <View style={styles.block}>
                <View style={styles.blockHeader}>
                  <View>
                    <Text style={styles.sectionEyebrow}>
                      HOW LONG?
                    </Text>
                    {linkedTask && (
                      <Text style={styles.helperText}>
                        Quest duration is fixed at{" "}
                        {linkedTask.target_minutes ||
                          30}{" "}
                        min
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.durationRow}>
                  {PRESETS.map((value) => {
                    const selected =
                      !isCustom &&
                      currentMinutes ===
                        value;

                    return (
                      <TouchableOpacity
                        key={value}
                        style={[
                          styles.durationButton,
                          selected &&
                            styles.durationButtonSelected,
                          linkedTask &&
                            styles.controlDisabled,
                        ]}
                        disabled={
                          !!linkedTask
                        }
                        onPress={() =>
                          selectPreset(
                            value,
                          )
                        }
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.durationValue,
                            selected &&
                              styles.durationValueSelected,
                          ]}
                        >
                          {value}
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

                  <TouchableOpacity
                    style={[
                      styles.durationButton,
                      isCustom &&
                        styles.durationButtonSelected,
                      linkedTask &&
                        styles.controlDisabled,
                    ]}
                    disabled={!!linkedTask}
                    onPress={selectCustom}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.durationValue,
                        isCustom &&
                          styles.durationValueSelected,
                      ]}
                    >
                      Custom
                    </Text>
                  </TouchableOpacity>
                </View>

                {isCustom && (
                  <View style={styles.customRow}>
                    <Text style={styles.customLabel}>
                      Minutes
                    </Text>

                    <View style={styles.customInputWrap}>
                      <TextInput
                        value={customText}
                        onChangeText={
                          handleCustomChange
                        }
                        keyboardType="number-pad"
                        editable={!linkedTask}
                        selectTextOnFocus
                        style={styles.customInput}
                      />
                      <Text style={styles.customUnit}>
                        MIN
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.block}>
                <View style={styles.blockHeader}>
                  <Text style={styles.sectionEyebrow}>
                    QUEST
                  </Text>
                  <Text style={styles.optionalText}>
                    Optional
                  </Text>
                </View>

                {linkedTask ? (
                  <View style={styles.selectedRow}>
                    <View style={styles.selectedRowMain}>
                      <Text style={styles.selectedIcon}>
                        📜
                      </Text>

                      <View style={styles.selectedRowText}>
                        <Text
                          style={styles.selectedTitle}
                          numberOfLines={1}
                        >
                          {linkedTask.title}
                        </Text>
                        <Text style={styles.selectedMeta}>
                          {linkedTask.target_minutes ||
                            30}{" "}
                          min
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={removeQuest}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.removeText}>
                        Remove
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.selectRow}
                    onPress={() =>
                      setQuestPickerVisible(true)
                    }
                    activeOpacity={0.85}
                  >
                    <View style={styles.selectRowMain}>
                      <Text style={styles.selectIcon}>
                        📜
                      </Text>
                      <View>
                        <Text style={styles.selectTitle}>
                          Add a quest
                        </Text>
                        <Text style={styles.selectMeta}>
                          Optional · use a quest as your session target
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.rowChevron}>
                      ›
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.block}>
                <View style={styles.blockHeader}>
                  <Text style={styles.sectionEyebrow}>
                    AREA
                  </Text>
                  <Text style={styles.optionalText}>
                    {linkedTask
                      ? "From quest"
                      : "Optional"}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.selectRow}
                  disabled={!!linkedTask}
                  onPress={() =>
                    setAreaPickerVisible(true)
                  }
                  activeOpacity={0.85}
                >
                  <View style={styles.selectRowMain}>
                    <View
                      style={[
                        styles.areaDot,
                        {
                          backgroundColor:
                            linkedArea?.color_code ??
                            generalArea?.color_code ??
                            "#8B8CF8",
                        },
                      ]}
                    />

                    <View>
                      <Text style={styles.selectTitle}>
                        {linkedArea?.title ??
                          generalArea?.title ??
                          "General"}
                      </Text>

                      <Text style={styles.selectMeta}>
                        {linkedTask
                          ? "Linked to this quest"
                          : "Where this session helps"}
                      </Text>
                    </View>
                  </View>

                  {!linkedTask && (
                    <Text style={styles.rowChevron}>
                      ›
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.timerPreview}>
                <Text style={styles.previewEyebrow}>
                  READY
                </Text>
                <Text style={styles.previewTimer}>
                  {isCustom
                    ? `${Math.floor(
                        Math.max(
                          1,
                          Number.parseInt(
                            customText,
                            10,
                          ) || 30,
                        ),
                      )
                        .toString()
                        .padStart(2, "0")}:00`
                    : `${currentMinutes
                        .toString()
                        .padStart(2, "0")}:00`}
                </Text>
                <Text style={styles.previewMeta}>
                  {currentActivity.icon}{" "}
                  {currentActivity.label}
                  {linkedTask
                    ? ` · ${linkedTask.title}`
                    : ""}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.startButton}
                onPress={handleStart}
                activeOpacity={0.88}
              >
                <Text style={styles.startButtonTitle}>
                  START SESSION
                </Text>
                <Text style={styles.startButtonSubtitle}>
                  Your timer starts immediately
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={questPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setQuestPickerVisible(false)
        }
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.questModal}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Choose a quest
                </Text>
                <Text style={styles.modalSubtitle}>
                  Only quests scheduled for today are shown
                </Text>
              </View>

              <TouchableOpacity
                onPress={() =>
                  setQuestPickerVisible(false)
                }
              >
                <Text style={styles.modalClose}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={
                styles.questModalList
              }
            >
              {tasks.length === 0 ? (
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyIcon}>
                    ✨
                  </Text>
                  <Text style={styles.modalEmptyTitle}>
                    No quests for today
                  </Text>
                  <Text style={styles.modalEmptyText}>
                    You can still start a free session.
                  </Text>
                </View>
              ) : (
                tasks.map((task) => {
                  const area = subjects.find(
                    (subject) =>
                      subject.id ===
                      task.subject_id,
                  );

                  return (
                    <TouchableOpacity
                      key={task.id}
                      style={styles.questOption}
                      onPress={() =>
                        chooseQuest(task)
                      }
                      activeOpacity={0.85}
                    >
                      <Text style={styles.questOptionIcon}>
                        📜
                      </Text>

                      <View style={styles.questOptionInfo}>
                        <Text
                          style={styles.questOptionTitle}
                          numberOfLines={1}
                        >
                          {task.title}
                        </Text>

                        <Text style={styles.questOptionMeta}>
                          {task.target_minutes || 30}{" "}
                          min
                          {area
                            ? ` · ${area.title}`
                            : ""}
                        </Text>
                      </View>

                      <Text style={styles.rowChevron}>
                        ›
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal> 
      <Modal
        visible={areaPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setAreaPickerVisible(false)
        }
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.questModal}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Choose an Area
                </Text>
                <Text style={styles.modalSubtitle}>
                  What part of your life does this session help?
                </Text>
              </View>

              <TouchableOpacity
                onPress={() =>
                  setAreaPickerVisible(false)
                }
              >
                <Text style={styles.modalClose}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.questModalList}
            >
              {subjects.map((subject) => {
                const selected =
                  targetAttributeId === subject.id;

                return (
                  <TouchableOpacity
                    key={subject.id}
                    style={[
                      styles.questOption,
                      selected &&
                        styles.areaOptionSelected,
                    ]}
                    onPress={() =>
                      chooseArea(subject)
                    }
                    activeOpacity={0.85}
                  >
                    <View
                      style={[
                        styles.areaDot,
                        {
                          backgroundColor:
                            subject.color_code ??
                            "#8B8CF8",
                        },
                      ]}
                    />

                    <View style={styles.questOptionInfo}>
                      <Text
                        style={styles.questOptionTitle}
                      >
                        {subject.title}
                      </Text>
                    </View>

                    {selected && (
                      <Text style={styles.areaCheck}>
                        ✓
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0D13",
  },

  flex: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 18,
    paddingBottom: 42,
    gap: 16,
  },

  block: {
    marginTop: 2,
  },

  blockHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  sectionEyebrow: {
    color: "#7D869A",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  optionalText: {
    color: "#646D80",
    fontSize: 9,
    fontWeight: "700",
  },

  helperText: {
    color: "#6F7789",
    fontSize: 9,
    marginTop: 3,
  },

  activityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  activityCard: {
    width: "31.7%",
    minHeight: 78,
    borderRadius: 18,
    backgroundColor: "#141821",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },

  activityCardSelected: {
    backgroundColor: "rgba(139,140,248,0.14)",
    borderColor: "rgba(165,180,252,0.42)",
  },

  activityIcon: {
    fontSize: 22,
    marginBottom: 5,
  },

  activityLabel: {
    color: "#8991A3",
    fontSize: 10,
    fontWeight: "800",
  },

  activityLabelSelected: {
    color: "#F3F4FF",
  },

  durationRow: {
    flexDirection: "row",
    gap: 8,
  },

  durationButton: {
    flex: 1,
    minHeight: 57,
    borderRadius: 16,
    backgroundColor: "#141821",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  durationButtonSelected: {
    backgroundColor: "rgba(139,140,248,0.14)",
    borderColor: "rgba(165,180,252,0.42)",
  },

  controlDisabled: {
    opacity: 0.45,
  },

  durationValue: {
    color: "#D4D8E2",
    fontSize: 15,
    fontWeight: "900",
  },

  durationValueSelected: {
    color: "#FFFFFF",
  },

  durationUnit: {
    color: "#6D7587",
    fontSize: 8,
    fontWeight: "800",
    marginTop: 2,
  },

  durationUnitSelected: {
    color: "#C7D2FE",
  },

  customRow: {
    marginTop: 8,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "#121620",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  customLabel: {
    color: "#A0A8B8",
    fontSize: 10,
    fontWeight: "700",
  },

  customInputWrap: {
    minWidth: 100,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#0D1017",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },

  customInput: {
    flex: 1,
    color: "#E9EBF2",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
    paddingVertical: 0,
  },

  customUnit: {
    color: "#697286",
    fontSize: 8,
    fontWeight: "900",
  },

  selectRow: {
    minHeight: 66,
    borderRadius: 18,
    backgroundColor: "#141821",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  selectedRow: {
    minHeight: 66,
    borderRadius: 18,
    backgroundColor: "rgba(139,140,248,0.08)",
    borderWidth: 1,
    borderColor: "rgba(165,180,252,0.18)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  selectRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },

  selectedRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },

  selectIcon: {
    fontSize: 20,
    marginRight: 11,
  },

  selectedIcon: {
    fontSize: 20,
    marginRight: 11,
  },

  selectTitle: {
    color: "#E7EAF1",
    fontSize: 12,
    fontWeight: "800",
  },

  selectedTitle: {
    color: "#EDF0F6",
    fontSize: 12,
    fontWeight: "800",
  },

  selectMeta: {
    color: "#747D90",
    fontSize: 9,
    marginTop: 3,
    maxWidth: 260,
  },

  selectedMeta: {
    color: "#747D90",
    fontSize: 9,
    marginTop: 3,
  },

  selectedRowText: {
    flex: 1,
    minWidth: 0,
  },

  removeText: {
    color: "#E18B8B",
    fontSize: 10,
    fontWeight: "800",
  },

  rowChevron: {
    color: "#70798C",
    fontSize: 25,
    marginLeft: 10,
  },

  areaRow: {
    gap: 8,
    paddingVertical: 1,
  },

  areaChip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: "#141821",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  areaChipText: {
    color: "#9199AA",
    fontSize: 9,
    fontWeight: "800",
  },

  areaChipTextSelected: {
    color: "#FFFFFF",
  },

  areaOptionSelected: {
    backgroundColor: "rgba(139,140,248,0.09)",
    borderColor: "rgba(165,180,252,0.16)",
  },

  areaCheck: {
    color: "#C7D2FE",
    fontSize: 13,
    fontWeight: "900",
  },

  areaDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 10,
  },

  timerPreview: {
    alignItems: "center",
    paddingTop: 3,
  },

  previewEyebrow: {
    color: "#687184",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  previewTimer: {
    color: "#F6F7FA",
    fontSize: 48,
    lineHeight: 56,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    marginTop: 3,
  },

  previewMeta: {
    color: "#7C8597",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3,
    textAlign: "center",
  },

  startButton: {
    minHeight: 70,
    borderRadius: 21,
    backgroundColor: "#E9EAFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: -2,
  },

  startButtonTitle: {
    color: "#171827",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  startButtonSubtitle: {
    color: "#5F6279",
    fontSize: 9,
    fontWeight: "600",
    marginTop: 4,
  },

  activeCard: {
    marginTop: 5,
    padding: 18,
    borderRadius: 24,
    backgroundColor: "#151923",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },

  activeCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  eyebrow: {
    color: "#7D869A",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  timerText: {
    color: "#F7F8FA",
    fontSize: 48,
    lineHeight: 54,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    marginTop: 4,
  },

  activeActivity: {
    alignItems: "center",
    marginTop: 4,
  },

  activeActivityIcon: {
    fontSize: 27,
  },

  activeActivityText: {
    color: "#C5CBD8",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 4,
  },

  activeHint: {
    color: "#7B8496",
    fontSize: 10,
    marginTop: 9,
  },

  activeActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },

  primaryAction: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#E9EAFF",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryActionText: {
    color: "#171827",
    fontSize: 11,
    fontWeight: "900",
  },

  secondaryAction: {
    width: 88,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryActionText: {
    color: "#A4ACBC",
    fontSize: 10,
    fontWeight: "900",
  },

  completedBox: {
    marginTop: 15,
    alignItems: "center",
  },

  completedTitle: {
    color: "#F0F2F6",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.50)",
    justifyContent: "flex-end",
  },

  questModal: {
    maxHeight: "82%",
    backgroundColor: "#11151E",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
  },

  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#4B5363",
    alignSelf: "center",
    marginBottom: 13,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  modalTitle: {
    color: "#F1F3F7",
    fontSize: 20,
    fontWeight: "800",
  },

  modalSubtitle: {
    color: "#737C8F",
    fontSize: 9,
    marginTop: 4,
  },

  modalClose: {
    color: "#9AA3B4",
    fontSize: 18,
    padding: 3,
  },

  questModalList: {
    paddingTop: 14,
    gap: 8,
  },

  questOption: {
    minHeight: 63,
    borderRadius: 17,
    backgroundColor: "#171B24",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  questOptionIcon: {
    fontSize: 19,
    marginRight: 11,
  },

  questOptionInfo: {
    flex: 1,
    minWidth: 0,
  },

  questOptionTitle: {
    color: "#E8EAF0",
    fontSize: 11,
    fontWeight: "800",
  },

  questOptionMeta: {
    color: "#737C8F",
    fontSize: 9,
    marginTop: 4,
  },

  modalEmpty: {
    alignItems: "center",
    paddingVertical: 36,
  },

  modalEmptyIcon: {
    fontSize: 25,
  },

  modalEmptyTitle: {
    color: "#E4E7ED",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
  },

  modalEmptyText: {
    color: "#727B8D",
    fontSize: 10,
    marginTop: 4,
  },
});
