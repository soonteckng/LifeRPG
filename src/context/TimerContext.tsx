import * as Haptics from "expo-haptics";
import React, {
  createContext,
  useCallback,
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
  getOpenActivitySession,
  startActivitySession,
} from "../services/sessionService";
import { useUser } from "./UserContext";
import { validSessionSeconds } from "../utils/sessionSetup";

// Dynamically load expo-notifications to prevent Expo Go crashes
let Notifications: any = null;

try {
  // Optional in Expo Go; notification failures must not block the timer.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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
} catch {
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
  durationSeconds: number;
  questTitle?: string;
}

interface TimerContextType {
  timeLeft: number;
  duration: number;
  isRunning: boolean;
  isCompleted: boolean;
  hasOpenSession: boolean;
  isRestoring: boolean;
  restoreError: boolean;
  retryRestore: () => void;
  actionBusy: boolean;
  actionError: string | null;
  rewardsVisible: boolean;
  retryCompletion: () => Promise<void>;
  retryAction: () => Promise<void>;
  resolveQuestTitle: (id: number, title: string) => void;

  activityType: string;

  targetAttributeId: number | null;
  linkedTaskId: number | null;
  notes: string;

  sessionSummary: SessionSummary | null;

  setActivityType: (type: string) => void;
  setNotes: (text: string) => void;
  setTargetAttributeId: (id: number | null) => void;
  setLinkedTaskId: (id: number | null) => void;

  startTimer: (totalSeconds: number, questTitle?: string) => Promise<void>;
  pauseTimer: () => Promise<void>;
  resumeTimer: () => Promise<void>;
  resetTimer: () => Promise<void>;

  setDurationInMinutes: (minutes: number) => void;
  setDurationInSeconds: (seconds: number) => void;

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
  const [hasOpenSession, setHasOpenSession] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rewardsVisible, setRewardsVisible] = useState(false);
  const actionLock = useRef(false);
  const failedAction = useRef<"start" | "pause" | "resume" | "end" | "complete">("start");
  const [activityType, setActivityType] = useState("other");

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


  const ensureChannels = useCallback(async () => {
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
  }, []);

  const handleComplete = useCallback(async () => {
    const sessionId = timerSessionIdRef.current;

    if (completionHandledRef.current || !sessionId || actionLock.current) {
      return;
    }

    completionHandledRef.current = true;
    setActionError(null);

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
      ).catch(() => {});

      const result =
        await completeActivitySession(sessionId);

      setHasOpenSession(false);

      await reloadProfile().catch(() => false);

      setSessionSummary({
        xpEarned: result.xp_earned,
        goldEarned: result.gold_earned,
        minutesSpent: result.minutes ?? Math.floor(result.duration_seconds / 60),
        durationSeconds: result.duration_seconds,
        questTitle:
          activeQuestTitleRef.current ??
          "Quest session",
      });

      setRewardsVisible(!result.already_completed);
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
      failedAction.current = "complete";
      setActionError("Couldn’t save your completed session. Retry to confirm your rewards.");
    }
  }, [reloadProfile]);

  // A pause/end request can overlap the final tick. Finish once it settles.
  useEffect(() => {
    if (hasOpenSession && timeLeft === 0 && !actionBusy && !actionError && !sessionSummary) {
      // Synchronize the expired timer with the completion RPC after an in-flight action.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void handleComplete();
    }
  }, [hasOpenSession, timeLeft, actionBusy, actionError, sessionSummary, handleComplete]);

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

    void setupNotifications();
  }, [ensureChannels]);

  useEffect(() => {
    if (!Notifications) {
      return;
    }

    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
          const data = response?.notification?.request?.content?.data;

          if (data?.type === "COMPLETION" && endTimeRef.current && endTimeRef.current <= Date.now()) {
            setTimeLeft(0);
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
  }, [isRunning, handleComplete]);

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
  }, [isRunning, handleComplete]);

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

  const scheduleNotificationLifecycle = useCallback(async (
    seconds: number,
    questTitle?: string,
  ) => {
    if (!Notifications) {
      return;
    }

    const validSeconds = Math.max(1, seconds);

    if (questTitle) activeQuestTitleRef.current = questTitle;

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
            notification.identifier === notificationId,
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
  }, [ensureChannels]);

  useEffect(() => {
    let cancelled = false;

    const restoreOpenSession = async () => {
      setIsRestoring(true);
      setRestoreError(false);
      try {
        const session = await getOpenActivitySession();

        if (!session || cancelled) {
          return;
        }

        const targetSeconds = Math.max(
          1,
          session.target_duration_seconds,
        );

        let elapsedSeconds = Math.max(
          0,
          session.elapsed_seconds,
        );

        if (
          session.status === "active" &&
          session.last_resumed_at
        ) {
          elapsedSeconds += Math.max(
            0,
            Math.floor(
              (Date.now() -
                new Date(
                  session.last_resumed_at,
                ).getTime()) /
                1000,
            ),
          );
        }

        const remainingSeconds = Math.max(
          0,
          targetSeconds - elapsedSeconds,
        );

        timerSessionIdRef.current = session.id;
        completionHandledRef.current = false;
        setHasOpenSession(true);

        setDuration(targetSeconds);
        setTimeLeft(remainingSeconds);
        setIsCompleted(false);
        setActivityType(
          session.activity_type || "other",
        );
        setTargetAttributeId(
          session.subject_id,
        );
        setLinkedTaskId(session.task_id);
        setNotes(session.notes ?? "");

        activeQuestTitleRef.current = session.task_id === null ? "Free session" : undefined;

        if (remainingSeconds <= 0) {
          endTimeRef.current = Date.now();
          setIsRunning(true);
          return;
        }

        if (session.status === "active") {
          endTimeRef.current =
            Date.now() + remainingSeconds * 1000;
          setIsRunning(true);

          await scheduleNotificationLifecycle(
            remainingSeconds,
          );
        } else {
          endTimeRef.current = null;
          setIsRunning(false);
        }
      } catch (error) {
        console.error(
          "Failed to restore open activity session:",
          error,
        );
        if (!cancelled) setRestoreError(true);
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    };

    void restoreOpenSession();

    return () => {
      cancelled = true;
    };
  }, [restoreAttempt, scheduleNotificationLifecycle]);

  // Quest boundaries remain whole minutes. The timer itself always uses seconds.
  const setDurationInMinutes = (minutes: number) => {
    if (Number.isInteger(minutes)) setDurationInSeconds(minutes * 60);
  };
  const setDurationInSeconds = (totalSec: number) => {
    if (isRunning || actionLock.current || (timerSessionIdRef.current && !completionHandledRef.current)) {
      return;
    }

    if (!validSessionSeconds(totalSec)) return;
    setSessionSummary(null);
    setCompletedLevelUp(null);
    setRewardsVisible(false);
    setActionError(null);

    setDuration(totalSec);
    setTimeLeft(totalSec);
    setIsCompleted(false);

    completionHandledRef.current = false;
    timerSessionIdRef.current = null;
  };

  const startTimer = async (
    totalSec: number,
    questTitle?: string,
  ) => {
    if (actionLock.current || timerSessionIdRef.current || isRestoring || restoreError) return;
    if (!validSessionSeconds(totalSec)) {
      setActionError("Choose a duration from 1 second to 480 minutes."); return;
    }
    actionLock.current = true; setActionBusy(true); setActionError(null);


    try {
      const sessionId = await startActivitySession({
        targetDurationSeconds: totalSec,
        activityType: "other", // Neutral compatibility field; Life area is the category.
        taskId: linkedTaskId,
        subjectId: targetAttributeId,
        notes: notes.trim() || null,
      });

      timerSessionIdRef.current = sessionId;
      setHasOpenSession(true);

      activeQuestTitleRef.current = questTitle ?? "Free session";

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
        "Failed to start activity session:", error,
      );
      failedAction.current = "start";
      setActionError("Couldn’t start your session. Check your connection and try again.");
    } finally { actionLock.current = false; setActionBusy(false); }
  };

  const pauseTimer = async () => {
    const sessionId = timerSessionIdRef.current;

    if (!sessionId || !isRunning) {
      return;
    }

    if (actionLock.current) return;
    actionLock.current = true; setActionBusy(true); setActionError(null);
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
      failedAction.current = "pause";
      setActionError("Couldn’t pause your session. Please try again.");
    } finally { actionLock.current = false; setActionBusy(false); }
  };

  const resumeTimer = async () => {
    const sessionId = timerSessionIdRef.current;

    if (!sessionId) {
      return;
    }

    if (timeLeft <= 0) {
      await handleComplete();
      return;
    }

    if (actionLock.current) return;
    actionLock.current = true; setActionBusy(true); setActionError(null);
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
      failedAction.current = "resume";
      setActionError("Couldn’t resume your session. Please try again.");
    } finally { actionLock.current = false; setActionBusy(false); }
  };

  const resetTimer = async () => {
    const sessionId = timerSessionIdRef.current;

    if (actionLock.current) return;
    actionLock.current = true; setActionBusy(true); setActionError(null);
    try {
      if (sessionId && !completionHandledRef.current) {
        await cancelActivitySession(sessionId);
      }
    } catch (error) {
      console.error(
        "Failed to cancel activity session:",
        error,
      );
      failedAction.current = "end";
      setActionError("Couldn’t end your session. Please try again.");
      return;
    } finally { actionLock.current = false; setActionBusy(false); }

    setSessionSummary(null); setCompletedLevelUp(null); setRewardsVisible(false);
    setIsRunning(false);
    setIsCompleted(false);

    completionHandledRef.current = false;

    timerSessionIdRef.current = null;
    endTimeRef.current = null;
    setHasOpenSession(false);

    setTimeLeft(duration);

    activeQuestTitleRef.current = undefined;

    await clearOngoingNotification();
  };


  const retryAction = async () => {
    if (failedAction.current === "end") await resetTimer();
    else if (failedAction.current === "pause") await pauseTimer();
    else if (failedAction.current === "resume") await resumeTimer();
    else if (failedAction.current === "complete") await handleComplete();
    // Start retry uses the screen's validated draft.
  };
  const clearCompletionModal = () => {
    setRewardsVisible(false);
  };

  return (
    <TimerContext.Provider
      value={{
        timeLeft,
        duration,
        isRunning,
        isCompleted,
        hasOpenSession,
        isRestoring, restoreError, retryRestore: () => setRestoreAttempt((value) => value + 1),
        actionBusy, actionError, rewardsVisible, retryCompletion: handleComplete, retryAction,
        resolveQuestTitle: (id, title) => { if (id === linkedTaskId && !activeQuestTitleRef.current) activeQuestTitleRef.current = title; },
        activityType,

        targetAttributeId,
        linkedTaskId,
        notes,

        sessionSummary,

        setNotes,
        setTargetAttributeId: (id) => { if (!actionLock.current && !hasOpenSession) setTargetAttributeId(id); },
        setLinkedTaskId: (id) => { if (!actionLock.current && !hasOpenSession) setLinkedTaskId(id); },
        setActivityType: (type) => { if (!actionLock.current && !hasOpenSession) setActivityType(type); },
        
        startTimer,
        pauseTimer,
        resumeTimer,
        resetTimer,

        setDurationInMinutes,
        setDurationInSeconds,

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
