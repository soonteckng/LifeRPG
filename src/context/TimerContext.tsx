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
  cancelActivitySession,
  completeActivitySession,
  pauseActivitySession,
  resumeActivitySession,
  startActivitySession,
} from "../services/sessionService";
import { useUser } from "./UserContext";

// Dynamically load expo-notifications to prevent Expo Go crashes
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

const ONGOING_CHANNEL_ID = "session-ongoing-channel-v17";
const COMPLETION_CHANNEL_ID = "session-complete-channel-v17";

interface SessionSummary {
  xpEarned: number;
  goldEarned: number;
  minutesSpent: number;
  questTitle?: string;
}

interface TimerContextType {
  timeLeft: number;
  duration: number;
  isRunning: boolean;
  isCompleted: boolean;

  activityType: string;

  targetAttributeId: number | null;
  linkedTaskId: number | null;
  notes: string;

  sessionSummary: SessionSummary | null;

  setActivityType: (type: string) => void;
  setNotes: (text: string) => void;
  setTargetAttributeId: (id: number | null) => void;
  setLinkedTaskId: (id: number | null) => void;

  startTimer: (minutes: number, questTitle?: string) => Promise<void>;
  pauseTimer: () => Promise<void>;
  resumeTimer: () => Promise<void>;
  resetTimer: () => Promise<void>;

  setDurationInMinutes: (minutes: number) => void;

  completedLevelUp: {
    leveledUp: boolean;
    newLevel: number;
  } | null;

  clearCompletionModal: () => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { reloadProfile } = useUser();

  const [duration, setDuration] = useState(30 * 60);
  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [activityType, setActivityType] = useState("general");

  const [targetAttributeId, setTargetAttributeId] = useState<number | null>(
    null,
  );

  const [linkedTaskId, setLinkedTaskId] = useState<number | null>(null);

  const [notes, setNotes] = useState("");

  const [sessionSummary, setSessionSummary] =
    useState<SessionSummary | null>(null);

  const [completedLevelUp, setCompletedLevelUp] = useState<{
    leveledUp: boolean;
    newLevel: number;
  } | null>(null);

  const endTimeRef = useRef<number | null>(null);
  const activeQuestTitleRef = useRef<string | undefined>(undefined);

  const completionHandledRef = useRef(false);
  const timerSessionIdRef = useRef<string | null>(null);

  const ensureChannels = async () => {
    if (!Notifications || Platform.OS !== "android") {
      return;
    }

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
    } catch (error) {
      console.error("Failed to configure notification channels:", error);
    }
  };

  useEffect(() => {
    async function setupNotifications() {
      if (!Notifications) {
        return;
      }

      try {
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();

        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } =
            await Notifications.requestPermissionsAsync();

          finalStatus = status;
        }

        if (finalStatus === "granted") {
          await ensureChannels();
        }
      } catch (error) {
        console.error("Notification setup failed:", error);
      }
    }

    setupNotifications();
  }, []);

  useEffect(() => {
    if (!Notifications) {
      return;
    }

    const subscription =
      Notifications.addNotificationResponseReceivedListener(
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

        const diff = Math.max(
          0,
          Math.ceil((endTimeRef.current! - now) / 1000),
        );

        setTimeLeft(diff);

        if (diff <= 0) {
          if (interval) {
            clearInterval(interval);
          }

          handleComplete();
        }
      }, 500);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isRunning]);

  useEffect(() => {
    const handleAppStateChange = async (
      nextAppState: AppStateStatus,
    ) => {
      if (
        nextAppState === "active" &&
        isRunning &&
        endTimeRef.current
      ) {
        const now = Date.now();

        const diff = Math.max(
          0,
          Math.ceil((endTimeRef.current - now) / 1000),
        );

        setTimeLeft(diff);

        if (diff <= 0) {
          await handleComplete();
        }
      }

      if (
        (nextAppState === "background" ||
          nextAppState === "inactive") &&
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
              title: "🚀 Session Active",
              body: activeQuestTitleRef.current
                ? `Quest: "${activeQuestTitleRef.current}" in progress...`
                : "Session in progress. Tap to view your timer.",
              sticky: true,
              autoDismiss: false,
              channelId: ONGOING_CHANNEL_ID,
            },
            trigger: null,
          }).catch((error: unknown) => {
            console.error(
              "Failed to refresh ongoing notification:",
              error,
            );
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
    if (!Notifications) {
      return;
    }

    try {
      await Notifications.dismissNotificationAsync(
        ONGOING_NOTIFICATION_ID,
      ).catch((error: unknown) => {
        console.error(
          "Failed to dismiss ongoing notification:",
          error,
        );
      });

      await Notifications.cancelScheduledNotificationAsync(
        COMPLETION_NOTIFICATION_ID,
      ).catch((error: unknown) => {
        console.error(
          "Failed to cancel completion notification:",
          error,
        );
      });
    } catch (error) {
      console.error(
        "Failed to clear timer notifications:",
        error,
      );
    }
  };

  const scheduleNotificationLifecycle = async (
    seconds: number,
    questTitle?: string,
  ) => {
    if (!Notifications) {
      return;
    }

    const validSeconds = Math.max(1, seconds);

    activeQuestTitleRef.current = questTitle;

    try {
      await ensureChannels();

      await Notifications.cancelScheduledNotificationAsync(
        COMPLETION_NOTIFICATION_ID,
      ).catch((error: unknown) => {
        console.error(
          "Failed to replace completion notification:",
          error,
        );
      });

      await Notifications.scheduleNotificationAsync({
        identifier: ONGOING_NOTIFICATION_ID,
        content: {
          title: "🚀 Session Active",
          body: questTitle
            ? `Quest: "${questTitle}" in progress...`
            : "Session in progress. Tap to view your timer.",
          sticky: true,
          autoDismiss: false,
          channelId: ONGOING_CHANNEL_ID,
        },
        trigger: null,
      });

      const notificationId =
        await Notifications.scheduleNotificationAsync({
          identifier: COMPLETION_NOTIFICATION_ID,
          content: {
            title: "⚔️ Session Complete!",
            body: questTitle
              ? `Quest "${questTitle}" is complete! Open LifeRPG to see your rewards.`
              : "Your session is complete! Open LifeRPG to see your rewards.",
            sound: "default",
            priority:
              Notifications.AndroidNotificationPriority?.MAX,
            channelId: COMPLETION_CHANNEL_ID,
            data: {
              type: "COMPLETION",
            },
          },
          trigger: {
            type:
              Notifications?.SchedulableTriggerInputTypes
                ?.TIME_INTERVAL ?? "timeInterval",
            seconds: validSeconds,
            repeats: false,
          },
        });

      const scheduledNotifications =
        await Notifications.getAllScheduledNotificationsAsync();

      const completionNotification =
        scheduledNotifications.find(
          (notification: any) =>
            notification.request.identifier === notificationId,
        );

      if (!completionNotification) {
        throw new Error(
          "The completion notification was accepted but is not present in the scheduled notification list.",
        );
      }
    } catch (error) {
      console.error(
        "Failed to schedule notification lifecycle:",
        error,
      );
    }
  };

  const setDurationInMinutes = (minutes: number) => {
    if (isRunning) {
      return;
    }

    const totalSec = Math.max(1, minutes) * 60;

    setDuration(totalSec);
    setTimeLeft(totalSec);
    setIsCompleted(false);

    completionHandledRef.current = false;
    timerSessionIdRef.current = null;
  };

  const startTimer = async (
    minutes: number,
    questTitle?: string,
  ) => {
    if (isRunning) {
      return;
    }

    const totalSec = Math.max(1, minutes) * 60;

    try {
      const sessionId = await startActivitySession({
        targetDurationSeconds: totalSec,
        activityType,
        taskId: linkedTaskId,
        subjectId: targetAttributeId,
        notes: notes.trim() || null,
      });

      timerSessionIdRef.current = sessionId;

      activeQuestTitleRef.current = questTitle;

      setDuration(totalSec);
      setTimeLeft(totalSec);
      setIsCompleted(false);

      completionHandledRef.current = false;

      endTimeRef.current = Date.now() + totalSec * 1000;

      setIsRunning(true);

      await scheduleNotificationLifecycle(
        totalSec,
        questTitle,
      );
    } catch (error) {
      console.error(
        "Failed to start activity session:",
        error,
      );
    }
  };

  const pauseTimer = async () => {
    const sessionId = timerSessionIdRef.current;

    if (!sessionId || !isRunning) {
      return;
    }

    try {
      await pauseActivitySession(sessionId);

      const now = Date.now();

      if (endTimeRef.current) {
        const remainingSec = Math.max(
          0,
          Math.ceil(
            (endTimeRef.current - now) / 1000,
          ),
        );

        setTimeLeft(remainingSec);
      }

      setIsRunning(false);
      endTimeRef.current = null;

      await clearOngoingNotification();
    } catch (error) {
      console.error(
        "Failed to pause activity session:",
        error,
      );
    }
  };

  const resumeTimer = async () => {
    const sessionId = timerSessionIdRef.current;

    if (!sessionId) {
      return;
    }

    if (timeLeft <= 0) {
      await resetTimer();
      return;
    }

    try {
      await resumeActivitySession(sessionId);

      endTimeRef.current =
        Date.now() + timeLeft * 1000;

      setIsRunning(true);

      await scheduleNotificationLifecycle(
        timeLeft,
        activeQuestTitleRef.current,
      );
    } catch (error) {
      console.error(
        "Failed to resume activity session:",
        error,
      );
    }
  };

  const resetTimer = async () => {
    const sessionId = timerSessionIdRef.current;

    try {
      if (sessionId && !completionHandledRef.current) {
        await cancelActivitySession(sessionId);
      }
    } catch (error) {
      console.error(
        "Failed to cancel activity session:",
        error,
      );
    }

    setIsRunning(false);
    setIsCompleted(false);

    completionHandledRef.current = false;

    timerSessionIdRef.current = null;
    endTimeRef.current = null;

    setTimeLeft(duration);

    activeQuestTitleRef.current = undefined;

    await clearOngoingNotification();
  };

  const handleComplete = async () => {
    const sessionId = timerSessionIdRef.current;

    if (completionHandledRef.current || !sessionId) {
      return;
    }

    completionHandledRef.current = true;

    try {
      setIsRunning(false);
      setIsCompleted(true);

      endTimeRef.current = null;
      setTimeLeft(0);

      if (Notifications) {
        await Notifications.dismissNotificationAsync(
          ONGOING_NOTIFICATION_ID,
        ).catch((error: unknown) => {
          console.error(
            "Failed to dismiss ongoing notification on completion:",
            error,
          );
        });

        await Notifications.cancelScheduledNotificationAsync(
          COMPLETION_NOTIFICATION_ID,
        ).catch((error: unknown) => {
          console.error(
            "Failed to cancel completion notification:",
            error,
          );
        });
      }

      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );

      const result =
        await completeActivitySession(sessionId);

      await reloadProfile();

      setSessionSummary({
        xpEarned: result.xp_earned,
        goldEarned: result.gold_earned,
        minutesSpent: result.minutes,
        questTitle:
          activeQuestTitleRef.current ??
          "Activity Session",
      });

      if (result.leveled_up) {
        setCompletedLevelUp({
          leveledUp: true,
          newLevel: result.level,
        });
      }
    } catch (error) {
      console.error(
        "Failed to complete activity session:",
        error,
      );

      completionHandledRef.current = false;
      setIsCompleted(false);
    }
  };

  const clearCompletionModal = () => {
    setSessionSummary(null);
    setCompletedLevelUp(null);

    void resetTimer();
  };

  return (
    <TimerContext.Provider
      value={{
        timeLeft,
        duration,
        isRunning,
        isCompleted,
        activityType,

        targetAttributeId,
        linkedTaskId,
        notes,

        sessionSummary,

        setNotes,
        setTargetAttributeId,
        setLinkedTaskId,
        setActivityType,
        
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

  if (!context) {
    throw new Error(
      "useTimer must be used within a TimerProvider",
    );
  }

  return context;
}