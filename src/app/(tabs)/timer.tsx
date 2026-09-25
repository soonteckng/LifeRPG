import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
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
import { useTimer } from "../../context/TimerContext";
import { useUser } from "../../context/UserContext";
import {
  getSubjects,
  getTasks,
  type Subject,
  type Task,
} from "../../services/taskService";

const PRESETS = [15, 30, 45, 60];

const ACTIVITIES = [
  { id: "general", label: "General", icon: "✨" },
  { id: "study", label: "Study", icon: "📚" },
  { id: "work", label: "Work", icon: "💼" },
  { id: "coding", label: "Coding", icon: "💻" },
  { id: "workout", label: "Workout", icon: "🏋️" },
  { id: "reading", label: "Reading", icon: "📖" },
  { id: "cleaning", label: "Cleaning", icon: "🧹" },
  { id: "other", label: "Other", icon: "✨" },
];

export default function TimerScreen() {
  const router = useRouter();

  const {
    timeLeft,
    duration,
    isRunning,
    isCompleted,

    activityType,
    setActivityType,

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

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [loadingTasks, setLoadingTasks] = useState(true);

  const [isCustom, setIsCustom] = useState(false);
  const [customText, setCustomText] = useState("30");

  const [showOptions, setShowOptions] = useState(false);
  const [showQuestPicker, setShowQuestPicker] =
    useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoadingTasks(true);

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
      console.error(
        "Failed to load timer data:",
        error,
      );
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const linkedTask = useMemo(
    () =>
      tasks.find(
        (task) => task.id === linkedTaskId,
      ) ?? null,
    [tasks, linkedTaskId],
  );

  const linkedSubject = useMemo(
    () =>
      subjects.find(
        (subject) =>
          subject.id === targetAttributeId,
      ) ?? null,
    [subjects, targetAttributeId],
  );

  const generalSubject = useMemo(
    () =>
      subjects.find(
        (subject) => subject.title === "General",
      ) ?? null,
    [subjects],
  );

  const currentMinutes = Math.max(
    1,
    Math.round(duration / 60),
  );

  /*
   * Synchronize the visible duration controls with
   * TimerContext whenever the actual timer duration changes.
   *
   * This fixes the old problem where a Quest could be
   * 15 minutes while the visible selector still showed 30.
   */
  useEffect(() => {
    if (isRunning) {
      return;
    }

    setCustomText(String(currentMinutes));

    setIsCustom(
      !PRESETS.includes(currentMinutes),
    );
  }, [currentMinutes, isRunning]);

  /*
   * When arriving from the Quest screen, use the Quest's
   * duration and subject automatically.
   */
  useEffect(() => {
    if (isRunning || !linkedTask) {
      return;
    }

    const questMinutes =
      linkedTask.target_minutes || 30;

    setDurationInMinutes(questMinutes);
    setCustomText(String(questMinutes));

    setIsCustom(
      !PRESETS.includes(questMinutes),
    );

    setTargetAttributeId(
      linkedTask.subject_id ??
        generalSubject?.id ??
        null,
    );
  }, [
    linkedTask,
    isRunning,
    generalSubject,
    setDurationInMinutes,
    setTargetAttributeId,
  ]);

  useEffect(() => {
    if (
      isRunning ||
      linkedTaskId !== null ||
      !generalSubject
    ) {
      return;
    }

    setTargetAttributeId(
      generalSubject.id,
    );
  }, [
    isRunning,
    linkedTaskId,
    generalSubject,
    setTargetAttributeId,
  ]);

  const selectActivity = (type: string) => {
    if (isRunning) {
      return;
    }

    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    setActivityType(type);
  };

  const selectQuest = (task: Task | null) => {
    if (isRunning) {
      return;
    }

    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    if (!task) {
      setLinkedTaskId(null);
      setTargetAttributeId(
        generalSubject?.id ?? null,
      );
      return;
    }

    setLinkedTaskId(task.id);

    if (task.subject_id !== null) {
      setTargetAttributeId(
        task.subject_id,
      );
    }

    const questMinutes =
      task.target_minutes || 30;

    setDurationInMinutes(
      questMinutes,
    );

    setCustomText(
      String(questMinutes),
    );

    setIsCustom(
      !PRESETS.includes(questMinutes),
    );
  };

  const selectPreset = (minutes: number) => {
    if (isRunning || linkedTask) {
      return;
    }

    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    setIsCustom(false);
    setCustomText(String(minutes));
    setDurationInMinutes(minutes);
  };

  const selectCustom = () => {
    if (isRunning || linkedTask) {
      return;
    }

    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    setIsCustom(true);

    const minutes =
      Number.parseInt(
        customText,
        10,
      ) || 30;

    setDurationInMinutes(
      Math.max(1, minutes),
    );
  };

  const handleCustomChange = (
    text: string,
  ) => {
    if (isRunning || linkedTask) {
      return;
    }

    setCustomText(text);

    const minutes =
      Number.parseInt(
        text,
        10,
      );

    if (
      Number.isFinite(minutes) &&
      minutes > 0
    ) {
      setDurationInMinutes(
        Math.min(480, minutes),
      );
    }
  };

  const removeQuest = () => {
    if (isRunning) {
      return;
    }

    setLinkedTaskId(null);

    setTargetAttributeId(
      generalSubject?.id ?? null,
    );

    setShowQuestPicker(false);

    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light,
      );
    }

    /*
     * Once the Quest is removed, return to the
     * default 30-minute free-session duration.
     */
    setIsCustom(false);
    setCustomText("30");
    setDurationInMinutes(30);
  };

  const handleStart = async () => {
    const minutes = Math.max(
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

    if (hapticsEnabled) {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Medium,
      );
    }

    await startTimer(
      minutes,
      linkedTask?.title,
    );
  };

  const minutes = Math.floor(
    timeLeft / 60,
  );

  const seconds = timeLeft % 60;

  const formattedTime =
    `${minutes
      .toString()
      .padStart(2, "0")}:` +
    `${seconds
      .toString()
      .padStart(2, "0")}`;

  const currentActivity =
    ACTIVITIES.find(
      (activity) =>
        activity.id === activityType,
    ) ?? ACTIVITIES[0];

  const isReady =
    !isRunning &&
    !isCompleted &&
    timeLeft === duration;

  const selectedDuration =
    linkedTask
      ? linkedTask.target_minutes || 30
      : currentMinutes;

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Session"
        subtitle="Make progress on something that matters"
        showBack={false}
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
          contentContainerStyle={
            styles.scrollContent
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* QUEST */}
          <View style={styles.section}>
            <View
              style={styles.sectionHeader}
            >
              <Text style={styles.sectionLabel}>
                QUEST
              </Text>

              <Text
                style={styles.optionalLabel}
              >
                Optional
              </Text>
            </View>

            {linkedTask ? (
              <View style={styles.linkedQuestCard}>
                <View
                  style={styles.questIcon}
                >
                  <Text
                    style={
                      styles.questIconText
                    }
                  >
                    📜
                  </Text>
                </View>

                <View
                  style={styles.questInfo}
                >
                  <Text
                    style={
                      styles.questTitle
                    }
                    numberOfLines={2}
                  >
                    {linkedTask.title}
                  </Text>

                  <View
                    style={
                      styles.questMeta
                    }
                  >
                    <Text
                      style={
                        styles.questMetaText
                      }
                    >
                      {selectedDuration} min
                    </Text>

                    {linkedSubject && (
                      <>
                        <Text
                          style={
                            styles.metaDot
                          }
                        >
                          •
                        </Text>

                        <Text
                          style={[
                            styles.questMetaText,
                            {
                              color:
                                linkedSubject.color_code ??
                                "#818CF8",
                            },
                          ]}
                        >
                          {
                            linkedSubject.title
                          }
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                {!isRunning && (
                  <TouchableOpacity
                    style={
                      styles.removeQuestButton
                    }
                    onPress={
                      removeQuest
                    }
                  >
                    <Text
                      style={
                        styles.removeQuestText
                      }
                    >
                      Remove
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={
                  styles.addQuestCard
                }
                onPress={() =>
                  setShowQuestPicker(
                    (current) =>
                      !current,
                  )
                }
                disabled={isRunning}
                activeOpacity={0.85}
              >
                <View
                  style={
                    styles.addQuestIcon
                  }
                >
                  <Text
                    style={
                      styles.addQuestIconText
                    }
                  >
                    +
                  </Text>
                </View>

                <View
                  style={styles.addQuestInfo}
                >
                  <Text
                    style={
                      styles.addQuestTitle
                    }
                  >
                    Add a quest
                  </Text>

                  <Text
                    style={
                      styles.addQuestText
                    }
                  >
                    Optional — just focus on
                    whatever you want to do.
                  </Text>
                </View>

                <Text
                  style={styles.chevron}
                >
                  ›
                </Text>
              </TouchableOpacity>
            )}

            {!linkedTask &&
              showQuestPicker && (
                <View
                  style={
                    styles.questPicker
                  }
                >
                  <TouchableOpacity
                    style={[
                      styles.questPickerItem,
                      styles.freeSessionItem,
                    ]}
                    onPress={() => {
                      setShowQuestPicker(
                        false,
                      );
                    }}
                  >
                    <Text
                      style={
                        styles.questPickerIcon
                      }
                    >
                      ✨
                    </Text>

                    <Text
                      style={[
                        styles.questPickerText,
                        {
                          color:
                            "#C7D2FE",
                        },
                      ]}
                    >
                      Keep it as a free
                      session
                    </Text>
                  </TouchableOpacity>

                  {loadingTasks ? (
                    <Text
                      style={
                        styles.loadingText
                      }
                    >
                      Loading quests...
                    </Text>
                  ) : tasks.length === 0 ? (
                    <Text
                      style={
                        styles.loadingText
                      }
                    >
                      No active quests yet.
                    </Text>
                  ) : (
                    tasks.map(
                      (task) => (
                        <TouchableOpacity
                          key={task.id}
                          style={
                            styles.questPickerItem
                          }
                          onPress={() =>
                            selectQuest(
                              task,
                            )
                          }
                        >
                          <Text
                            style={
                              styles.questPickerIcon
                            }
                          >
                            📜
                          </Text>

                          <View
                            style={
                              styles.questPickerInfo
                            }
                          >
                            <Text
                              style={
                                styles.questPickerText
                              }
                              numberOfLines={
                                1
                              }
                            >
                              {
                                task.title
                              }
                            </Text>

                            <Text
                              style={
                                styles.questPickerMeta
                              }
                            >
                              {task.target_minutes ||
                                30}{" "}
                              min
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ),
                    )
                  )}
                </View>
              )}
          </View>

          {/* ACTIVITY */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              WHAT ARE YOU DOING?
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.activityRow
              }
            >
              {ACTIVITIES.map(
                (activity) => {
                  const selected =
                    activity.id ===
                    activityType;

                  return (
                    <TouchableOpacity
                      key={
                        activity.id
                      }
                      style={[
                        styles.activityChip,
                        selected &&
                          styles.activityChipSelected,
                      ]}
                      onPress={() =>
                        selectActivity(
                          activity.id,
                        )
                      }
                      disabled={isRunning}
                    >
                      <Text
                        style={
                          styles.activityIcon
                        }
                      >
                        {
                          activity.icon
                        }
                      </Text>

                      <Text
                        style={[
                          styles.activityText,
                          selected &&
                            styles.activityTextSelected,
                        ]}
                      >
                        {
                          activity.label
                        }
                      </Text>
                    </TouchableOpacity>
                  );
                },
              )}
            </ScrollView>
          </View>

          {/* DURATION */}
          <View style={styles.section}>
            <View
              style={styles.sectionHeader}
            >
              <Text style={styles.sectionLabel}>
                DURATION
              </Text>

              {linkedTask && (
                <Text
                  style={
                    styles.lockedLabel
                  }
                >
                  Quest duration
                </Text>
              )}
            </View>

            <View style={styles.presetRow}>
              {PRESETS.map(
                (preset) => {
                  const selected =
                    !isCustom &&
                    selectedDuration ===
                      preset;

                  return (
                    <TouchableOpacity
                      key={
                        preset
                      }
                      disabled={
                        isRunning ||
                        !!linkedTask
                      }
                      style={[
                        styles.presetButton,
                        selected &&
                          styles.presetButtonSelected,
                        !!linkedTask &&
                          styles.presetButtonLocked,
                      ]}
                      onPress={() =>
                        selectPreset(
                          preset,
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.presetText,
                          selected &&
                            styles.presetTextSelected,
                        ]}
                      >
                        {preset}
                      </Text>

                      <Text
                        style={[
                          styles.presetUnit,
                          selected &&
                            styles.presetUnitSelected,
                        ]}
                      >
                        min
                      </Text>
                    </TouchableOpacity>
                  );
                },
              )}

              {!linkedTask && (
                <TouchableOpacity
                  disabled={isRunning}
                  style={[
                    styles.presetButton,
                    isCustom &&
                      styles.presetButtonSelected,
                  ]}
                  onPress={
                    selectCustom
                  }
                >
                  <Text
                    style={[
                      styles.presetText,
                      isCustom &&
                        styles.presetTextSelected,
                    ]}
                  >
                    Custom
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {!linkedTask &&
              isCustom && (
                <View
                  style={
                    styles.customDurationCard
                  }
                >
                  <Text
                    style={
                      styles.customDurationLabel
                    }
                  >
                    Minutes
                  </Text>

                  <View
                    style={
                      styles.customInputWrapper
                    }
                  >
                    <TextInput
                      value={
                        customText
                      }
                      onChangeText={
                        handleCustomChange
                      }
                      keyboardType="number-pad"
                      editable={
                        !isRunning
                      }
                      style={
                        styles.customInput
                      }
                      selectTextOnFocus
                    />

                    <Text
                      style={
                        styles.customInputUnit
                      }
                    >
                      MIN
                    </Text>
                  </View>
                </View>
              )}
          </View>

          {/* TIMER */}
          <View
            style={
              styles.timerSection
            }
          >
            <View
              style={[
                styles.timerCircle,
                isRunning &&
                  styles.timerCircleRunning,
                isCompleted &&
                  styles.timerCircleCompleted,
              ]}
            >
              <Text
                style={
                  styles.timerDigits
                }
              >
                {formattedTime}
              </Text>

              <Text
                style={
                  styles.timerStatus
                }
              >
                {isRunning
                  ? "IN SESSION"
                  : isCompleted
                    ? "COMPLETED"
                    : "READY"}
              </Text>

              <Text
                style={
                  styles.activitySummary
                }
              >
                {currentActivity.icon}{" "}
                {currentActivity.label}
              </Text>
            </View>

            {isReady ? (
              <TouchableOpacity
                style={
                  styles.startButton
                }
                onPress={
                  handleStart
                }
                activeOpacity={
                  0.85
                }
              >
                <Text
                  style={
                    styles.startButtonText
                  }
                >
                  START SESSION
                </Text>

                <Text
                  style={
                    styles.startButtonSubtext
                  }
                >
                  {currentMinutes} min
                </Text>
              </TouchableOpacity>
            ) : isCompleted ? (
              <View
                style={
                  styles.completedActions
                }
              >
                <View
                  style={
                    styles.completedMessage
                  }
                >
                  <Text
                    style={
                      styles.completedMessageTitle
                    }
                  >
                    Session complete 🎉
                  </Text>

                  <Text
                    style={
                      styles.completedMessageText
                    }
                  >
                    Your progress has been
                    saved.
                  </Text>
                </View>

                <TouchableOpacity
                  style={
                    styles.startButton
                  }
                  onPress={
                    resetTimer
                  }
                  activeOpacity={
                    0.85
                  }
                >
                  <Text
                    style={
                      styles.startButtonText
                    }
                  >
                    NEW SESSION
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View
                style={
                  styles.runningActions
                }
              >
                <TouchableOpacity
                  style={[
                    styles.pauseResumeButton,
                    !isRunning &&
                      styles.resumeButton,
                  ]}
                  onPress={
                    isRunning
                      ? pauseTimer
                      : resumeTimer
                  }
                  activeOpacity={
                    0.85
                  }
                >
                  <Text
                    style={
                      styles.pauseResumeText
                    }
                  >
                    {isRunning
                      ? "PAUSE"
                      : "RESUME"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={
                    styles.resetButton
                  }
                  onPress={
                    resetTimer
                  }
                  activeOpacity={
                    0.85
                  }
                >
                  <Text
                    style={
                      styles.resetButtonText
                    }
                  >
                    RESET
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* MORE OPTIONS */}
          <TouchableOpacity
            style={
              styles.moreToggle
            }
            onPress={() =>
              setShowOptions(
                (current) =>
                  !current,
              )
            }
          >
            <Text
              style={
                styles.moreToggleText
              }
            >
              {showOptions
                ? "Hide options"
                : "More options"}
            </Text>

            <Text
              style={
                styles.moreToggleArrow
              }
            >
              {showOptions
                ? "⌃"
                : "⌄"}
            </Text>
          </TouchableOpacity>

          {showOptions && (
            <View
              style={
                styles.optionsCard
              }
            >
              <Text
                style={
                  styles.optionLabel
                }
              >
                AREA
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={
                  false
                }
                contentContainerStyle={
                  styles.areaRow
                }
              >
                {subjects.map(
                  (subject) => {
                    const selected =
                      targetAttributeId ===
                      subject.id;

                    return (
                      <TouchableOpacity
                        key={
                          subject.id
                        }
                        style={[
                          styles.areaChip,
                          selected &&
                            styles.areaChipSelected,
                          selected && {
                            borderColor:
                              subject.color_code ??
                              "#6366F1",
                          },
                        ]}
                        onPress={() => {
                          if (
                            isRunning
                          ) {
                            return;
                          }

                          setTargetAttributeId(
                            subject.id,
                          );
                        }}
                        disabled={
                          isRunning
                        }
                      >
                        <Text
                          style={[
                            styles.areaChipText,
                            selected &&
                              styles.areaChipTextSelected,
                          ]}
                        >
                          {
                            subject.title
                          }
                        </Text>
                      </TouchableOpacity>
                    );
                  },
                )}
              </ScrollView>

              <Text
                style={[
                  styles.optionLabel,
                  styles.notesLabel,
                ]}
              >
                NOTES
              </Text>

              <TextInput
                style={
                  styles.notesInput
                }
                multiline
                value={notes}
                onChangeText={
                  setNotes
                }
                placeholder="Optional notes..."
                placeholderTextColor="#64748B"
                editable={
                  !isRunning
                }
                textAlignVertical="top"
              />
            </View>
          )}

          <View
            style={
              styles.bottomSpace
            }
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090D16",
  },

  flex: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 130,
  },

  section: {
    marginTop: 8,
    marginBottom: 18,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  sectionLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },

  optionalLabel: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "700",
  },

  lockedLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
  },

  linkedQuestCard: {
    width: "100%",
    padding: 15,
    borderRadius: 18,
    backgroundColor:
      "rgba(99, 102, 241, 0.10)",
    borderWidth: 1,
    borderColor:
      "rgba(129, 140, 248, 0.35)",
    flexDirection: "row",
    alignItems: "center",
  },

  questIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor:
      "rgba(99, 102, 241, 0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  questIconText: {
    fontSize: 20,
  },

  questInfo: {
    flex: 1,
    minWidth: 0,
  },

  questTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },

  questMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    gap: 6,
  },

  questMetaText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
  },

  metaDot: {
    color: "#475569",
    fontSize: 10,
  },

  removeQuestButton: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor:
      "rgba(239, 68, 68, 0.08)",
  },

  removeQuestText: {
    color: "#F87171",
    fontSize: 9,
    fontWeight: "800",
  },

  addQuestCard: {
    width: "100%",
    padding: 15,
    borderRadius: 18,
    backgroundColor:
      "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor:
      "rgba(255, 255, 255, 0.08)",
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
  },

  addQuestIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor:
      "rgba(99, 102, 241, 0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  addQuestIconText: {
    color: "#818CF8",
    fontSize: 24,
    fontWeight: "300",
  },

  addQuestInfo: {
    flex: 1,
    minWidth: 0,
  },

  addQuestTitle: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "800",
  },

  addQuestText: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },

  chevron: {
    color: "#64748B",
    fontSize: 24,
    marginLeft: 8,
  },

  questPicker: {
    marginTop: 8,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor:
      "rgba(255, 255, 255, 0.035)",
    borderWidth: 1,
    borderColor:
      "rgba(255, 255, 255, 0.08)",
  },

  questPickerItem: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor:
      "rgba(255, 255, 255, 0.05)",
  },

  freeSessionItem: {
    backgroundColor:
      "rgba(99, 102, 241, 0.07)",
  },

  questPickerIcon: {
    fontSize: 17,
    marginRight: 11,
  },

  questPickerInfo: {
    flex: 1,
  },

  questPickerText: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "800",
  },

  questPickerMeta: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 3,
  },

  loadingText: {
    color: "#64748B",
    fontSize: 11,
    padding: 16,
    textAlign: "center",
  },

  activityRow: {
    gap: 8,
    paddingTop: 6,
    paddingBottom: 2,
  },

  activityChip: {
    minWidth: 90,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 13,
    backgroundColor:
      "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor:
      "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
  },

  activityChipSelected: {
    backgroundColor:
      "rgba(99, 102, 241, 0.20)",
    borderColor: "#6366F1",
  },

  activityIcon: {
    fontSize: 17,
    marginBottom: 3,
  },

  activityText: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "800",
  },

  activityTextSelected: {
    color: "#FFFFFF",
  },

  presetRow: {
    width: "100%",
    flexDirection: "row",
    gap: 7,
  },

  presetButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 14,
    backgroundColor:
      "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor:
      "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  presetButtonSelected: {
    backgroundColor:
      "rgba(99, 102, 241, 0.22)",
    borderColor: "#6366F1",
  },

  presetButtonLocked: {
    opacity: 0.8,
  },

  presetText: {
    color: "#CBD5E1",
    fontSize: 15,
    fontWeight: "900",
  },

  presetTextSelected: {
    color: "#FFFFFF",
  },

  presetUnit: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "800",
    marginTop: 2,
  },

  presetUnitSelected: {
    color: "#C7D2FE",
  },

  customDurationCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor:
      "rgba(99, 102, 241, 0.08)",
    borderWidth: 1,
    borderColor:
      "rgba(99, 102, 241, 0.25)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  customDurationLabel: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "800",
  },

  customInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 10,
  },

  customInput: {
    color: "#A5B4FC",
    fontSize: 17,
    fontWeight: "900",
    minWidth: 42,
    textAlign: "center",
    paddingVertical: 7,
  },

  customInputUnit: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900",
  },

  timerSection: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
  },

  timerCircle: {
    width: 238,
    height: 238,
    borderRadius: 119,
    borderWidth: 7,
    borderColor: "#6366F1",
    backgroundColor:
      "rgba(99, 102, 241, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },

  timerCircleRunning: {
    borderColor: "#10B981",
    backgroundColor:
      "rgba(16, 185, 129, 0.06)",
  },

  timerCircleCompleted: {
    borderColor: "#F59E0B",
    backgroundColor:
      "rgba(245, 158, 11, 0.06)",
  },

  timerDigits: {
    color: "#F8FAFC",
    fontSize: 43,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },

  timerStatus: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 6,
  },

  activitySummary: {
    color: "#A5B4FC",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 8,
  },

  startButton: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },

  startButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  startButtonSubtext: {
    color: "#C7D2FE",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 3,
  },

  completedActions: {
    width: "100%",
  },

  completedMessage: {
    alignItems: "center",
    marginTop: 14,
  },

  completedMessageTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "900",
  },

  completedMessageText: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 4,
  },

  runningActions: {
    width: "100%",
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },

  pauseResumeButton: {
    flex: 1,
    height: 50,
    borderRadius: 15,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
  },

  resumeButton: {
    backgroundColor: "#3B82F6",
  },

  pauseResumeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  resetButton: {
    width: 90,
    height: 50,
    borderRadius: 15,
    backgroundColor:
      "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor:
      "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  resetButtonText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "900",
  },

  moreToggle: {
    marginTop: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor:
      "rgba(255, 255, 255, 0.07)",
  },

  moreToggleText: {
    color: "#A5B4FC",
    fontSize: 12,
    fontWeight: "800",
  },

  moreToggleArrow: {
    color: "#A5B4FC",
    fontSize: 16,
  },

  optionsCard: {
    marginTop: 12,
    padding: 15,
    borderRadius: 17,
    backgroundColor:
      "rgba(255, 255, 255, 0.035)",
    borderWidth: 1,
    borderColor:
      "rgba(255, 255, 255, 0.07)",
  },

  optionLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  notesLabel: {
    marginTop: 16,
  },

  areaRow: {
    gap: 8,
  },

  areaChip: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#111C30",
    borderWidth: 1,
    borderColor:
      "rgba(255, 255, 255, 0.08)",
  },

  areaChipSelected: {
    backgroundColor:
      "rgba(99, 102, 241, 0.18)",
  },

  areaChipText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "800",
  },

  areaChipTextSelected: {
    color: "#FFFFFF",
  },

  notesInput: {
    width: "100%",
    minHeight: 90,
    backgroundColor: "#0F172A",
    borderRadius: 13,
    borderWidth: 1,
    borderColor:
      "rgba(255, 255, 255, 0.08)",
    color: "#F8FAFC",
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 12,
  },

  bottomSpace: {
    height: 20,
  },
});