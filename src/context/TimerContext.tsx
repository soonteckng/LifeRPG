import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { addXPAndCheckLevelUp, logStudySession, completeTask, getTasks } from '../../db/database';
import { useUser } from './UserContext';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
  if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
} catch (e) {}

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
  const [targetAttributeId, setTargetAttributeId] = useState<number | null>(null);
  const [linkedTaskId, setLinkedTaskId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [completedLevelUp, setCompletedLevelUp] = useState<{ leveledUp: boolean; newLevel: number } | null>(null);

  const endTimeRef = useRef<number | null>(null);

  const ensureChannel = async () => {
    if (!Notifications || Platform.OS !== 'android') return;
    try {
      // Versioned channel ID forces Android to create a fresh channel with sound enabled
      await Notifications.setNotificationChannelAsync('focus-timer-v2', {
        name: 'Focus Timer Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
        sound: 'default',
        enableVibrate: true,
      });
    } catch (e) {
      console.error('Failed to configure channel:', e);
    }
  };

  useEffect(() => {
    async function setupNotifications() {
      if (!Notifications) return;
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus === 'granted') {
          await ensureChannel();
        }
      } catch (e) {
        console.error('Notification setup failed:', e);
      }
    }
    setupNotifications();
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

  const scheduleNotification = async (seconds: number, questTitle?: string) => {
    if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') return;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await ensureChannel();

      const targetTime = new Date(Date.now() + seconds * 1000);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚔️ Focus Session Complete!',
          body: questTitle
            ? `Quest Completed: "${questTitle}"! Tap to claim your XP!`
            : 'Focus session finished! Tap to claim your rewards.',
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          channelId: 'focus-timer-v2',
        },
        trigger: {
          type: 'date',
          timestamp: targetTime.getTime(),
        },
      });
    } catch (error) {
      console.error('Failed to schedule notification:', error);
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

    scheduleNotification(totalSec, questTitle);
  };

  const pauseTimer = async () => {
    setIsRunning(false);
    endTimeRef.current = null;
    if (Notifications) {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  };

  const resumeTimer = () => {
    if (timeLeft <= 0) {
      resetTimer();
      return;
    }
    endTimeRef.current = Date.now() + timeLeft * 1000;
    setIsRunning(true);
    scheduleNotification(timeLeft);
  };

  const resetTimer = async () => {
    setIsRunning(false);
    setIsCompleted(false);
    endTimeRef.current = null;
    setTimeLeft(duration);
    if (Notifications) {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  };

  const handleComplete = async () => {
    setIsRunning(false);
    setIsCompleted(true);
    endTimeRef.current = null;
    setTimeLeft(0);

    if (Notifications) {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }

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

    let activeQuestName = 'Focus Session';
    if (linkedTaskId) {
      const allTasks = getTasks();
      const currentTask = allTasks.find((t) => t.id === linkedTaskId);
      if (currentTask) activeQuestName = currentTask.title;
    }

    setSessionSummary({
      xpEarned: linkedTaskId ? (getTasks().find((t) => t.id === linkedTaskId)?.xp_awarded || 100) : xpEarned,
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
  if (!context) throw new Error('useTimer must be used within a TimerProvider');
  return context;
}