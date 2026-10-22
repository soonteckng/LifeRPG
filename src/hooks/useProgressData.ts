import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { dateKey, periodFor, queryBounds, type ProgressPeriod } from "../utils/progressAnalytics";
import { afterTransition } from "../utils/afterTransition";

export interface ProgressData {
  key: string;
  sessions: ProgressSession[];
  goals: ProgressGoal[];
  areas: Subject[];
  streak: number;
  longestStreak: number;
}
type Cached = ProgressData & { at: number };
// Periods already seen stay ready across tab visits, scoped to the account.
// Only the few most recent are kept.
const cache = new Map<string, Cached>();
const prefetching = new Map<string, Promise<ProgressData>>();
function remember(id: string, value: ProgressData) {
  cache.delete(id);
  cache.set(id, { ...value, at: Date.now() });
  while (cache.size > 6) cache.delete(cache.keys().next().value!);
}
async function loadProgress(period: ProgressPeriod, timeZone: string, key: string, owner: string): Promise<ProgressData> {
  const bounds = queryBounds(period), now = new Date(), who = owner || undefined;
  const [sessions, goals, areas, streak, longestStreak] = await Promise.all([
    getCompletedSessions(bounds.since, bounds.until, who),
    getProgressGoals(period.start, period.end, who),
    getProgressSubjects(who),
    getFocusStreak(timeZone, now, who),
    getLongestFocusStreak(timeZone, now, who),
  ]);
  return { key, sessions, goals, areas, streak, longestStreak };
}
const periodKey = (period: ProgressPeriod, timeZone: string) => `${period.start}:${period.mode}:${timeZone}`;
/** Loads this week quietly so the first visit to Progress is already drawn. */
export function prefetchProgress(owner: string, timeZone: string, now = new Date()) {
  const period = periodFor("week", dateKey(now, timeZone), timeZone, now);
  const key = periodKey(period, timeZone), id = `${owner}|${key}`;
  if (!owner || cache.has(id) || prefetching.has(id)) return;
  const request = loadProgress(period, timeZone, key, owner);
  prefetching.set(id, request);
  request.then(value => remember(id, value), () => {}).finally(() => prefetching.delete(id));
}

export function useProgressData(
  period: ProgressPeriod,
  timeZone: string,
  completion: unknown,
  owner = "",
) {
  const key = periodKey(period, timeZone);
  const id = `${owner}|${key}`;
  const [data, setData] = useState<ProgressData | null>(() => cache.get(id) ?? null);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const generation = useRef(0);
  const focused = useRef(false);
  const lastDay = useRef(period.today);
  const lastCompletion = useRef(completion);
  // The key fixes the queried dates; read the latest period without making
  // every new period object a new request.
  const latestPeriod = useRef(period);
  useLayoutEffect(() => { latestPeriod.current = period; });
  const stale = useCallback(() => { for (const value of cache.values()) value.at = 0; }, []);
  const refresh = useCallback(async (quiet = false) => {
    const request = ++generation.current;
    if (!quiet) setLoading(true);
    try {
      const value = await (prefetching.get(id) ?? loadProgress(latestPeriod.current, timeZone, key, owner));
      if (generation.current === request) {
        remember(id, value);
        setData(value);
        setErrorKey(null);
      }
    } catch {
      if (generation.current === request) setErrorKey(key);
    } finally {
      if (generation.current === request) setLoading(false);
    }
  }, [id, key, timeZone, owner]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const cached = cache.get(id);
      // Nothing to show yet: start at once. Otherwise refresh quietly after
      // the entrance, and only when the saved copy is over a minute old.
      let cancelEntranceWork = () => {};
      if (!cached) void refresh(false);
      else if (Date.now() - cached.at > 60_000) cancelEntranceWork = afterTransition(() => { void refresh(true); });
      return () => {
        cancelEntranceWork();
        focused.current = false;
        generation.current++;
      };
    }, [refresh, id]),
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
    stale();
    if (completion && focused.current) void refresh(true);
  }, [completion, refresh, stale]);
  useEffect(() => {
    if (lastDay.current !== period.today) {
      lastDay.current = period.today;
      stale();
      if (focused.current) void refresh(true);
    }
  }, [period.today, refresh, stale]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  return {
    data: data?.key === key ? data : cache.get(id) ?? null,
    loading,
    error: errorKey === key,
    refresh,
  };
}
