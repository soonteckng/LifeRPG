import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  getCompletedSessions,
  getFocusStreak,
  getProgressGoals,
  getProgressSubjects,
  type ProgressGoal,
  type ProgressSession,
} from "../services/progressService";
import type { Subject } from "../services/taskService";
import { queryBounds, type ProgressPeriod } from "../utils/progressAnalytics";

export interface ProgressData {
  key: string;
  sessions: ProgressSession[];
  goals: ProgressGoal[];
  areas: Subject[];
  streak: number;
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
  const bounds = queryBounds(period);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const [sessions, goals, areas, streak] = await Promise.all([
        getCompletedSessions(bounds.since, bounds.until),
        getProgressGoals(period.start, period.end),
        getProgressSubjects(),
        getFocusStreak(timeZone),
      ]);
      if (generation.current === request) {
        setData({ key, sessions, goals, areas, streak });
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
      void refresh();
      return () => {
        focused.current = false;
        generation.current++;
      };
    }, [refresh]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && focused.current) void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  useEffect(() => {
    if (completion && focused.current) void refresh();
  }, [completion, refresh]);
  useEffect(() => {
    if (lastDay.current !== period.today) {
      lastDay.current = period.today;
      if (focused.current) void refresh();
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
