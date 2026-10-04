import { getSessionNotifications } from "../utils/sessionNotifications";
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
import { createSessionNotificationLifecycle } from "../services/sessionNotificationService";

// Optional notification API must never block timer or route loading.
const Notifications = getSessionNotifications();
let completionSoundEnabled = true;

try {
  if (
    Notifications &&
    typeof Notifications.setNotificationHandler === "function"
  ) {
    Notifications.setNotificationHandler({
      handleNotification: async notification => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: notification.request.content.data?.type === "COMPLETION" && completionSoundEnabled,
        shouldSetBadge: true,
      }),
    });
  }
} catch {
  console.warn("Session notification handler could not be configured.");
}

interface SessionSummary {
  xpEarned: number;
  goldEarned: number;
  minutesSpent: number;
  durationSeconds: number;
  questTitle?: string;
  creditVersion?: number;
  areaXpEarned?: number | null;
  characterRemainderSeconds?: number;
  areaRemainderSeconds?: number | null;
  dailyCompletedSeconds?: number;
  goalReachedNow?: boolean;
  creditedDate?: string;
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
  summaryViewed: boolean;
  acknowledgeSummary: () => void;

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
  const { reloadProfile, soundEnabled = true, hapticsEnabled = true } = useUser();
  const feedback = useRef({ sound: soundEnabled, haptics: hapticsEnabled });

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
  const [viewedSummary, setViewedSummary] = useState<SessionSummary | null>(null);
  const acknowledgeSummary = useCallback(() => setViewedSummary(sessionSummary), [sessionSummary]);

  const [completedLevelUp, setCompletedLevelUp] = useState<{
    leveledUp: boolean;
    newLevel: number;
  } | null>(null);

  const endTimeRef = useRef<number | null>(null);
  const activeQuestTitleRef = useRef<string | undefined>(undefined);

  const completionHandledRef = useRef(false);
  const timerSessionIdRef = useRef<string | null>(null);


  const [notificationLifecycle] = useState(() =>
    createSessionNotificationLifecycle(Notifications, Platform.OS, { sound: soundEnabled, haptics: hapticsEnabled }));
  useEffect(() => {
    feedback.current = { sound: soundEnabled, haptics: hapticsEnabled };
    notificationLifecycle.setPreferences(feedback.current);
    completionSoundEnabled = soundEnabled;
  }, [soundEnabled, hapticsEnabled, notificationLifecycle]);
  const ensureChannels = useCallback(() => notificationLifecycle.ensureChannels(), [notificationLifecycle]);
  const clearOngoingNotification = useCallback(() => notificationLifecycle.clear(), [notificationLifecycle]);
  useEffect(() => {
    notificationLifecycle.activate();
    return () => { void notificationLifecycle.dispose(); };
  }, [notificationLifecycle]);

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

      await clearOngoingNotification();

      if (feedback.current.haptics) await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});

      const result =
        await completeActivitySession(sessionId);

      // The server has saved this session. Keep its summary, but release the
      // active identity immediately so it cannot lock a later setup draft.
      timerSessionIdRef.current = null;
      setHasOpenSession(false);

      await reloadProfile().catch(() => false);

      setSessionSummary({
        xpEarned: result.xp_earned,
        goldEarned: result.gold_earned,
        minutesSpent: result.minutes ?? Math.floor(result.duration_seconds / 60),
        durationSeconds: result.duration_seconds,
        creditVersion: result.credit_version,
        areaXpEarned: result.area_xp_earned,
        characterRemainderSeconds: result.character_remainder_seconds,
        areaRemainderSeconds: result.area_remainder_seconds,
        dailyCompletedSeconds: result.daily_completed_seconds,
        goalReachedNow: result.goal_reached_now,
        creditedDate: result.credited_date,
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
  }, [reloadProfile, clearOngoingNotification]);

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

        const finalStatus = existingStatus;

        // Permission prompts are initiated by the explicit Settings action.

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

    let subscription: ReturnType<typeof Notifications.addNotificationResponseReceivedListener>;
    try {
      subscription =
      Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data = response?.notification?.request?.content?.data;

          if (data?.type === "COMPLETION" && endTimeRef.current && endTimeRef.current <= Date.now()) {
            setTimeLeft(0);
          }
        },
      );
    } catch {
      console.warn("Session notification responses are unavailable; the timer continues.");
      return;
    }
    return () => { try { subscription.remove(); } catch { /* Optional native cleanup. */ } };
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

        if (remainingSec > 0) {
          await notificationLifecycle.refreshOngoing(activeQuestTitleRef.current);
        }

      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [isRunning, handleComplete, notificationLifecycle]);

  const scheduleNotificationLifecycle = useCallback((seconds: number, questTitle?: string) => {
    if (questTitle) activeQuestTitleRef.current = questTitle;
    return notificationLifecycle.schedule(seconds, activeQuestTitleRef.current);
  }, [notificationLifecycle]);

  useEffect(() => {
    let cancelled = false;
    const restoreOpenSession = async () => {
      setIsRestoring(true);
      setRestoreError(false);
      try {
        const session = await getOpenActivitySession();
        if (cancelled) return;
        if (!session) { await clearOngoingNotification(); return; }
        const targetSeconds = Math.max(1, session.target_duration_seconds);
        let elapsedSeconds = Math.max(0, session.elapsed_seconds);
        if (session.status === "active" && session.last_resumed_at) {
          elapsedSeconds += Math.max(0, Math.floor((Date.now() - new Date(session.last_resumed_at).getTime()) / 1000));
        }
        const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);
        timerSessionIdRef.current = session.id;
        completionHandledRef.current = false;
        setHasOpenSession(true);
        setDuration(targetSeconds);
        setTimeLeft(remainingSeconds);
        setIsCompleted(false);
        setActivityType(session.activity_type || "other");
        setTargetAttributeId(session.subject_id);
        setLinkedTaskId(session.task_id);
        setNotes(session.notes ?? "");
        activeQuestTitleRef.current = session.task_id === null ? "Free session" : undefined;
        if (remainingSeconds <= 0) {
          await clearOngoingNotification();
          if (cancelled) return;
          endTimeRef.current = Date.now();
          setIsRunning(true);
          return;
        }
        if (session.status === "active") {
          endTimeRef.current = Date.now() + remainingSeconds * 1000;
          setIsRunning(true);
          await scheduleNotificationLifecycle(remainingSeconds);
        } else {
          await clearOngoingNotification();
          if (cancelled) return;
          endTimeRef.current = null;
          setIsRunning(false);
        }
      } catch {
        if (!cancelled) setRestoreError(true);
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    };
    void restoreOpenSession();
    return () => { cancelled = true; void clearOngoingNotification(); };
  }, [restoreAttempt, scheduleNotificationLifecycle, clearOngoingNotification]);

  // Quest boundaries remain whole minutes. The timer itself always uses seconds.
  const setDurationInMinutes = (minutes: number) => {
    if (Number.isInteger(minutes)) setDurationInSeconds(minutes * 60);
  };
  const setDurationInSeconds = (totalSec: number) => {
    if (isRunning || hasOpenSession || actionLock.current || isRestoring || restoreError || (isCompleted && !sessionSummary)) return;
    if (!validSessionSeconds(totalSec)) return;
    // Setup has no open server session. Clear a stale completed identity too
    // (including a draft retained through development Fast Refresh).
    timerSessionIdRef.current = null;
    completionHandledRef.current = false;
    // A saved summary can become a new draft. Never abandon a saving/failed
    // completion, and never carry its old server ID into the next Start.
    if (sessionSummary) {
      timerSessionIdRef.current = null;
      completionHandledRef.current = false;
      activeQuestTitleRef.current = undefined;
      setRewardsVisible(false);
    }
    setSessionSummary(null);
    setCompletedLevelUp(null);
    setIsCompleted(false);
    setDuration(totalSec);
    setTimeLeft(totalSec);
  };

  const startTimer = async (totalSeconds: number, questTitle?: string) => {
    if (actionLock.current || timerSessionIdRef.current || isRestoring || restoreError) return;
    if (!validSessionSeconds(totalSeconds)) return;
    actionLock.current = true;
    setActionBusy(true);
    setActionError(null);
    failedAction.current = "start";
    setDuration(totalSeconds);
    setTimeLeft(totalSeconds);
    activeQuestTitleRef.current = questTitle;
    try {
      const sessionId = await startActivitySession({
        targetDurationSeconds: totalSeconds, activityType, taskId: linkedTaskId,
        subjectId: targetAttributeId, notes,
      });
      timerSessionIdRef.current = sessionId;
      completionHandledRef.current = false;
      activeQuestTitleRef.current = questTitle;
      setHasOpenSession(true);
      setSessionSummary(null);
      setCompletedLevelUp(null);
      setRewardsVisible(false);
      setIsCompleted(false);
      setDuration(totalSeconds);
      setTimeLeft(totalSeconds);
      endTimeRef.current = Date.now() + totalSeconds * 1000;
      setIsRunning(true);
      await scheduleNotificationLifecycle(totalSeconds, questTitle);
    } catch {
      setActionError("Couldn’t start your session. Check your connection and try again.");
    } finally { actionLock.current = false; setActionBusy(false); }
  };
  const pauseTimer = async () => {
    const id = timerSessionIdRef.current;
    if (!id || !isRunning || actionLock.current || completionHandledRef.current) return;
    actionLock.current = true; setActionBusy(true); setActionError(null); failedAction.current = "pause";
    try {
      await pauseActivitySession(id);
      const remaining = Math.max(0, Math.ceil(((endTimeRef.current ?? Date.now()) - Date.now()) / 1000));
      setTimeLeft(remaining);
      endTimeRef.current = null;
      setIsRunning(false);
      await clearOngoingNotification();
    } catch {
      setActionError("Couldn’t pause your session. Check your connection and try again.");
    } finally { actionLock.current = false; setActionBusy(false); }
  };
  const resumeTimer = async () => {
    const id = timerSessionIdRef.current;
    if (!id || isRunning || actionLock.current || completionHandledRef.current) return;
    actionLock.current = true; setActionBusy(true); setActionError(null); failedAction.current = "resume";
    try {
      await resumeActivitySession(id);
      endTimeRef.current = Date.now() + timeLeft * 1000;
      setIsRunning(true);
      await scheduleNotificationLifecycle(timeLeft);
    } catch {
      setActionError("Couldn’t resume your session. Check your connection and try again.");
    } finally { actionLock.current = false; setActionBusy(false); }
  };
  const resetTimer = async () => {
    if (actionLock.current || isRestoring || restoreError) return;
    const id = timerSessionIdRef.current;
    actionLock.current = true; setActionBusy(true); setActionError(null); failedAction.current = "end";
    try {
      // Never erase a running/paused session locally when server cancellation fails.
      if (id && hasOpenSession) await cancelActivitySession(id);
      timerSessionIdRef.current = null;
      completionHandledRef.current = false;
      endTimeRef.current = null;
      activeQuestTitleRef.current = undefined;
      setHasOpenSession(false);
      setIsRunning(false);
      setIsCompleted(false);
      setRewardsVisible(false);
      setSessionSummary(null);
      setCompletedLevelUp(null);
      setTimeLeft(duration);
      await clearOngoingNotification();
    } catch {
      setActionError("Couldn’t end your session. Check your connection and try again.");
    } finally { actionLock.current = false; setActionBusy(false); }
  };
  const retryAction = async () => {
    switch (failedAction.current) {
      case "start": return startTimer(duration, activeQuestTitleRef.current);
      case "pause": return pauseTimer();
      case "resume": return resumeTimer();
      case "end": return resetTimer();
      case "complete": return handleComplete();
    }
  };
  const setupLocked = () => actionLock.current || hasOpenSession || isRestoring || restoreError;
  return (
    <TimerContext.Provider value={{
      timeLeft, duration, isRunning, isCompleted, hasOpenSession, isRestoring, restoreError,
      retryRestore: () => setRestoreAttempt(value => value + 1),
      actionBusy, actionError, rewardsVisible, retryCompletion: handleComplete, retryAction,
      resolveQuestTitle: (id, title) => { if (id === linkedTaskId) activeQuestTitleRef.current = title; },
      activityType, targetAttributeId, linkedTaskId, notes,
      setActivityType: value => { if (!setupLocked()) setActivityType(value); },
      setTargetAttributeId: value => { if (!setupLocked()) setTargetAttributeId(value); },
      setLinkedTaskId: value => { if (!setupLocked()) setLinkedTaskId(value); },
      setNotes: value => { if (!setupLocked()) setNotes(value); },
      setDurationInMinutes, setDurationInSeconds,
      startTimer, pauseTimer, resumeTimer, resetTimer,
      sessionSummary, summaryViewed: !!sessionSummary && viewedSummary === sessionSummary, acknowledgeSummary,
      completedLevelUp, clearCompletionModal: () => setRewardsVisible(false),
    }}>
      {children}
    </TimerContext.Provider>
  );
}
export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) throw new Error("useTimer must be used within a TimerProvider");
  return context;
}
