import * as Haptics from "expo-haptics";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import {
  addXPAndCheckLevelUp,
  completeTask,
  getTasks,
  logStudySession,
} from "../../db/database";
import { useUser } from "./UserContext";

import { SchedulableTriggerInputTypes } from "expo-notifications";

let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
  if (
    Notifications &&
    typeof Notifications.setNotificationHandler === "function"
  ) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch (e) {
  console.warn("expo-notifications module not found or failed to load.");
}

const ONGOING_NOTIFICATION_ID = "life-rpg-ongoing-timer";
const COMPLETION_NOTIFICATION_ID = "life-rpg-completion-timer";
const ONGOING_CHANNEL_ID = "focus-ongoing-channel-v16";
const COMPLETION_CHANNEL_ID = "focus-complete-channel-v16";

interface SessionSummary {
  xpEarned: number;
  minutesSpent: number;
  questTitle?: string;
}

interface TimerContextType {
  timeLeft: number;
  duration: number;
  isRunning: boolean;
  isCompleted: boolean;
  targetAttributeId: number | null;
  linkedTaskId: number | null;
  notes: string;
  sessionSummary: SessionSummary | null;
  setNotes: (text: string) => void;
  setTargetAttributeId: (id: number | null) => void;
  setLinkedTaskId: (id: number | null) => void;
  startTimer: (minutes: number, questTitle?: string) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  setDurationInMinutes: (minutes: number) => void;
  completedLevelUp: { leveledUp: boolean; newLevel: number } | null;
  clearCompletionModal: () => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { reloadProfile } = useUser();

  const [duration, setDuration] = useState(30 * 60);
  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [targetAttributeId, setTargetAttributeId] = useState<number | null>(
    null,
  );
  const [linkedTaskId, setLinkedTaskId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(
    null,
  );
  const [completedLevelUp, setCompletedLevelUp] = useState<{
    leveledUp: boolean;
    newLevel: number;
  } | null>(null);

  const endTimeRef = useRef<number | null>(null);
  const activeQuestTitleRef = useRef<string | undefined>(undefined);

  const ensureChannels = async () => {
    if (!Notifications || Platform.OS !== "android") return;
    try {
      await Notifications.setNotificationChannelAsync(
        ONGOING_CHANNEL_ID,
        {
          name: "Active Session Banner",
          importance: Notifications.AndroidImportance.LOW,
          sound: undefined,
          enableVibrate: false,
          showBadge: false,
        },
      );

      await Notifications.setNotificationChannelAsync(
        COMPLETION_CHANNEL_ID,
        {
          name: "Session Finish Alert",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 250, 500],
          sound: "default",
          enableVibrate: true,
          showBadge: true,
        },
      );
    } catch (e) {
      console.error("Failed to configure channels:", e);
    }
  };

  useEffect(() => {
    async function setupNotifications() {
      if (!Notifications) return;
      try {
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus === "granted") {
          await ensureChannels();
        }
      } catch (e) {
        console.error("Notification setup failed:", e);
      }
    }
    setupNotifications();
  }, []);

  useEffect(() => {
    if (!Notifications) return;
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response: any) => {
        const data = response?.notification?.request?.content?.data;
        if (data?.type === "COMPLETION") {
          setIsCompleted(true);
        }
      },
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (isRunning && endTimeRef.current) {
      interval = setInterval(() => {
        const now = Date.now();
        const diff = Math.max(0, Math.ceil((endTimeRef.current! - now) / 1000));
        setTimeLeft(diff);

        if (diff <= 0) {
          if (interval) clearInterval(interval);
          handleComplete();
        }
      }, 500);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && isRunning && endTimeRef.current) {
        const now = Date.now();
        const diff = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
        setTimeLeft(diff);
        if (diff <= 0) {
          handleComplete();
        }
      }

      if (
        (nextAppState === "background" || nextAppState === "inactive") &&
        isRunning &&
        endTimeRef.current
      ) {
        const now = Date.now();
        const remainingSec = Math.max(
          0,
          Math.ceil((endTimeRef.current - now) / 1000),
        );

        if (remainingSec > 0 && Notifications) {
          await Notifications.scheduleNotificationAsync({
            identifier: ONGOING_NOTIFICATION_ID,
            content: {
              title: "🚀 Focus Session Active",
              body: activeQuestTitleRef.current
                ? `Quest: "${activeQuestTitleRef.current}" in progress...`
                : "Stay focused! Tap to view timer.",
              sticky: true,
              autoDismiss: false,
              channelId: ONGOING_CHANNEL_ID,
            },
            trigger: null,
          }).catch((error: unknown) => {
            console.error("Failed to refresh ongoing notification:", error);
          });
        }
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [isRunning]);

  const clearOngoingNotification = async () => {
    if (!Notifications) return;
    try {
      await Notifications.dismissNotificationAsync(
        ONGOING_NOTIFICATION_ID,
      ).catch((error: unknown) => {
        console.error("Failed to dismiss ongoing notification:", error);
      });
      await Notifications.cancelScheduledNotificationAsync(
        COMPLETION_NOTIFICATION_ID,
      ).catch((error: unknown) => {
        console.error("Failed to cancel completion notification:", error);
      });
    } catch (error) {
      console.error("Failed to clear timer notifications:", error);
    }
  };

  const scheduleNotificationLifecycle = async (
    seconds: number,
    questTitle?: string,
  ) => {
    if (!Notifications) return;
    const validSeconds = Math.max(1, seconds);
    activeQuestTitleRef.current = questTitle;

    try {
      await ensureChannels();

      await Notifications.cancelScheduledNotificationAsync(
        COMPLETION_NOTIFICATION_ID,
      ).catch((error: unknown) => {
        console.error("Failed to replace completion notification:", error);
      });

      // Immediate Ongoing Sticky Banner
      await Notifications.scheduleNotificationAsync({
        identifier: ONGOING_NOTIFICATION_ID,
        content: {
          title: "🚀 Focus Session Active",
          body: questTitle
            ? `Quest: "${questTitle}" in progress...`
            : "Stay focused! Tap to view timer.",
          sticky: true,
          autoDismiss: false,
          channelId: ONGOING_CHANNEL_ID,
        },
        trigger: null,
      });

      // Completion Alarm
      const notificationId = await Notifications.scheduleNotificationAsync({
        identifier: COMPLETION_NOTIFICATION_ID,
        content: {
          title: "⚔️ Focus Session Complete!",
          body: questTitle
            ? `Quest Completed: "${questTitle}"! Tap to claim your XP!`
            : "Focus session finished! Tap to claim your rewards.",
          sound: "default",
          priority: Notifications.AndroidNotificationPriority?.MAX,
          channelId: COMPLETION_CHANNEL_ID,
          data: { type: "COMPLETION" },
        },
        trigger: {
          type: SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: validSeconds,
          repeats: false,
        },
      });

      const scheduledNotifications =
        await Notifications.getAllScheduledNotificationsAsync();
      const completionNotification = scheduledNotifications.find(
        (notification: any) =>
          notification.request.identifier === notificationId,
      );

      if (!completionNotification) {
        throw new Error(
          "The completion notification was accepted but is not present in the scheduled notification list.",
        );
      }
    } catch (error) {
      console.error("Failed to schedule notification lifecycle:", error);
    }
  };

  const setDurationInMinutes = (minutes: number) => {
    if (isRunning) return;
    const totalSec = Math.max(1, minutes) * 60;
    setDuration(totalSec);
    setTimeLeft(totalSec);
    setIsCompleted(false);
  };

  const startTimer = (minutes: number, questTitle?: string) => {
    const totalSec = Math.max(1, minutes) * 60;
    setDuration(totalSec);
    setTimeLeft(totalSec);
    setIsCompleted(false);
    endTimeRef.current = Date.now() + totalSec * 1000;
    setIsRunning(true);

    scheduleNotificationLifecycle(totalSec, questTitle);
  };

  const pauseTimer = async () => {
    setIsRunning(false);
    endTimeRef.current = null;
    await clearOngoingNotification();
  };

  const resumeTimer = () => {
    if (timeLeft <= 0) {
      resetTimer();
      return;
    }
    endTimeRef.current = Date.now() + timeLeft * 1000;
    setIsRunning(true);
    scheduleNotificationLifecycle(timeLeft, activeQuestTitleRef.current);
  };

  const resetTimer = async () => {
    setIsRunning(false);
    setIsCompleted(false);
    endTimeRef.current = null;
    setTimeLeft(duration);
    activeQuestTitleRef.current = undefined;
    await clearOngoingNotification();
  };

  const handleComplete = async () => {
    setIsRunning(false);
    setIsCompleted(true);
    endTimeRef.current = null;
    setTimeLeft(0);

    await Notifications?.dismissNotificationAsync(
      ONGOING_NOTIFICATION_ID,
    ).catch((error: unknown) => {
      console.error("Failed to dismiss ongoing notification on completion:", error);
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const minutesSpent = Math.max(1, Math.round(duration / 60));
    const xpEarned = minutesSpent * 10;

    logStudySession(duration, xpEarned, targetAttributeId);

    let result = { leveledUp: false, newLevel: 1 };

    if (linkedTaskId) {
      result = completeTask(linkedTaskId);
    } else {
      const levelRes = addXPAndCheckLevelUp(xpEarned);
      result = { leveledUp: levelRes.leveledUp, newLevel: levelRes.newLevel };
    }

    reloadProfile();

    let activeQuestName = "Focus Session";
    if (linkedTaskId) {
      const allTasks = getTasks();
      const currentTask = allTasks.find((t) => t.id === linkedTaskId);
      if (currentTask) activeQuestName = currentTask.title;
    }

    setSessionSummary({
      xpEarned: linkedTaskId
        ? getTasks().find((t) => t.id === linkedTaskId)?.xp_awarded || 100
        : xpEarned,
      minutesSpent,
      questTitle: activeQuestName,
    });

    if (result.leveledUp) {
      setCompletedLevelUp({ leveledUp: true, newLevel: result.newLevel });
    }
  };

  const clearCompletionModal = () => {
    setSessionSummary(null);
    setCompletedLevelUp(null);
    resetTimer();
  };

  return (
    <TimerContext.Provider
      value={{
        timeLeft,
        duration,
        isRunning,
        isCompleted,
        targetAttributeId,
        linkedTaskId,
        notes,
        sessionSummary,
        setNotes,
        setTargetAttributeId,
        setLinkedTaskId,
        startTimer,
        pauseTimer,
        resumeTimer,
        resetTimer,
        setDurationInMinutes,
        completedLevelUp,
        clearCompletionModal,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) throw new Error("useTimer must be used within a TimerProvider");
  return context;
}