import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  getCompletedSessions,
  getFocusStreak,
  getLongestFocusStreak,
  getProgressGoals,
  getProgressSubjects,
  type ProgressGoal,
  type ProgressSession,
} from "../services/progressService";
import type { Subject } from "../services/taskService";
import { queryBounds, type ProgressPeriod } from "../utils/progressAnalytics";
import { afterTransition } from "../utils/afterTransition";

export interface ProgressData {
  key: string;
  sessions: ProgressSession[];
  goals: ProgressGoal[];
  areas: Subject[];
  streak: number;
  longestStreak: number;
}
export function useProgressData(
  period: ProgressPeriod,
  timeZone: string,
  completion: unknown,
) {
  const key = `${period.start}:${period.mode}:${timeZone}`;
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const generation = useRef(0);
  const focused = useRef(false);
  const lastDay = useRef(period.today);
  const lastLoaded = useRef<{ key: string; at: number } | null>(null);
  const lastCompletion = useRef(completion);
  const bounds = queryBounds(period);
  const refresh = useCallback(async (quiet = false) => {
    const request = ++generation.current;
    if (!quiet) setLoading(true);
    try {
      const [sessions, goals, areas, streak, longestStreak] = await Promise.all([
        getCompletedSessions(bounds.since, bounds.until),
        getProgressGoals(period.start, period.end),
        getProgressSubjects(),
        getFocusStreak(timeZone),
        getLongestFocusStreak(timeZone),
      ]);
      if (generation.current === request) {
        setData({ key, sessions, goals, areas, streak, longestStreak });
        lastLoaded.current = { key, at: Date.now() };
        setErrorKey(null);
      }
    } catch {
      if (generation.current === request) setErrorKey(key);
    } finally {
      if (generation.current === request) setLoading(false);
    }
  }, [key, bounds.since, bounds.until, period.start, period.end, timeZone]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const cached = lastLoaded.current;
      const cancelEntranceWork = afterTransition(() => {
        if (!cached || cached.key !== key || Date.now() - cached.at > 60_000) void refresh(cached?.key === key);
      });
      return () => {
        cancelEntranceWork();
        focused.current = false;
        generation.current++;
      };
    }, [refresh, key]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && focused.current) void refresh(true);
    });
    return () => subscription.remove();
  }, [refresh]);
  useEffect(() => {
    if (lastCompletion.current === completion) return;
    lastCompletion.current = completion;
    lastLoaded.current = null;
    if (completion && focused.current) void refresh(true);
  }, [completion, refresh]);
  useEffect(() => {
    if (lastDay.current !== period.today) {
      lastDay.current = period.today;
      lastLoaded.current = null;
      if (focused.current) void refresh(true);
    }
  }, [period.today, refresh]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  return {
    data: data?.key === key ? data : null,
    loading,
    error: errorKey === key,
    refresh,
  };
}
