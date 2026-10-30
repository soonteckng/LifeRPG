import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  getCompletedSessions,
  getFocusStreak,
  getFocusStreakDetail,
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
  /** Rest days still held, and the days they covered (Your rhythm's week). */
  restDays?: number;
  rested?: string[];
}
type Cached = ProgressData & { at: number; cloudSaveVersion: number; completion: unknown };
// Periods already seen stay ready across tab visits, scoped to the account.
// Only the few most recent are kept.
const cache = new Map<string, Cached>();
type PendingProgress = { request: Promise<ProgressData>; cloudSaveVersion: number; completion: unknown; obsolete: boolean };
const prefetching = new Map<string, PendingProgress>();
function remember(id: string, value: ProgressData, cloudSaveVersion = 0, completion: unknown = null) {
  cache.delete(id);
  cache.set(id, { ...value, at: Date.now(), cloudSaveVersion, completion });
  while (cache.size > 6) cache.delete(cache.keys().next().value!);
}
async function loadProgress(period: ProgressPeriod, timeZone: string, key: string, owner: string): Promise<ProgressData> {
  const bounds = queryBounds(period), now = new Date(), who = owner || undefined;
  const [sessions, goals, areas, streak, longestStreak] = await Promise.all([
    getCompletedSessions(bounds.since, bounds.until, who),
    getProgressGoals(period.start, period.end, who),
    getProgressSubjects(who),
    // The detail adds rest days; the plain count stays as the fallback.
    typeof getFocusStreakDetail === "function" ? getFocusStreakDetail(timeZone, now, who)
      : getFocusStreak(timeZone, now, who).then(current => ({ current, restDays: 0, rested: [] as string[] })),
    getLongestFocusStreak(timeZone, now, who),
  ]);
  return { key, sessions, goals, areas, streak: streak.current, longestStreak, restDays: streak.restDays, rested: streak.rested };
}
const periodKey = (period: ProgressPeriod, timeZone: string) => `${period.start}:${period.mode}:${timeZone}`;
function readProgress(period: ProgressPeriod, timeZone: string, key: string, owner: string, cloudSaveVersion: number, completion: unknown): PendingProgress {
  const id = `${owner}|${key}`, existing = prefetching.get(id);
  if (existing && (!completion || !existing.completion || existing.completion === completion) && existing.cloudSaveVersion === cloudSaveVersion) {
    if (completion) existing.completion = completion;
    return existing;
  }
  if (existing) existing.obsolete = true;
  const request = loadProgress(period, timeZone, key, owner);
  const pending = { request, cloudSaveVersion, completion, obsolete: false };
  prefetching.set(id, pending);
  request.then(value => {
    if (prefetching.get(id) === pending) remember(id, value, cloudSaveVersion, pending.completion);
  }, () => {}).finally(() => {
    if (prefetching.get(id) === pending) prefetching.delete(id);
  });
  return pending;
}
/** Loads this week quietly so the first visit to Progress is already drawn. */
export function prefetchProgress(owner: string, timeZone: string, now = new Date(), cloudSaveVersion = 0) {
  const period = periodFor("week", dateKey(now, timeZone), timeZone, now);
  const key = periodKey(period, timeZone), id = `${owner}|${key}`;
  if (!owner || cache.has(id) && (!cloudSaveVersion || cache.get(id)?.cloudSaveVersion === cloudSaveVersion)
    || prefetching.has(id) && (!cloudSaveVersion || prefetching.get(id)?.cloudSaveVersion === cloudSaveVersion)) return;
  readProgress(period, timeZone, key, owner, cloudSaveVersion, null);
}

export function useProgressData(
  period: ProgressPeriod,
  timeZone: string,
  completion: unknown,
  owner = "",
  cloudSaveVersion = 0,
) {
  const key = periodKey(period, timeZone);
  const id = `${owner}|${key}`;
  const [loaded, setLoaded] = useState<{ id: string; value: ProgressData } | null>(() => {
    const cached = cache.get(id);
    return cached ? { id, value: cached } : null;
  });
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const generation = useRef(0);
  const focused = useRef(false);
  const lastDay = useRef(period.today);
  const lastCompletion = useRef(completion);
  const completionChecked = useRef(false);
  const lastCloud = useRef({ owner, version: cloudSaveVersion });
  const cloudVersion = useRef(cloudSaveVersion);
  const summary = useRef(completion);
  // The key fixes the queried dates; read the latest period without making
  // every new period object a new request.
  const latestPeriod = useRef(period);
  useLayoutEffect(() => { latestPeriod.current = period; cloudVersion.current = cloudSaveVersion; summary.current = completion; });
  const stale = useCallback((signal?: { completion: unknown; cloud: number }) => {
    const prefix = `${owner}|`;
    const outdated = (value: { completion: unknown; cloudSaveVersion: number }) => !signal
      || !!signal.completion && value.completion !== signal.completion || !!signal && value.cloudSaveVersion !== signal.cloud;
    for (const [scope, value] of cache) if (scope.startsWith(prefix) && outdated(value)) value.at = 0;
    // A Home prefetch begun before the save is not a post-completion read.
    // Detach it without cancelling shared I/O; its identity fences its late
    // cache write and cleanup if another prefetch starts meanwhile.
    for (const [scope, value] of prefetching) if (scope.startsWith(prefix) && outdated(value)) { value.obsolete = true; prefetching.delete(scope); }
  }, [owner]);
  const refresh = useCallback(async (quiet = false) => {
    const request = ++generation.current;
    if (!quiet) setLoading(true);
    try {
      const pending = readProgress(latestPeriod.current, timeZone, key, owner, cloudVersion.current, summary.current);
      const value = await pending.request;
      if (generation.current === request && !pending.obsolete) {
        setLoaded({ id, value });
        setErrorKey(null);
      }
    } catch {
      if (generation.current === request) setErrorKey(id);
    } finally {
      if (generation.current === request) setLoading(false);
    }
  }, [id, key, timeZone, owner]);
  useLayoutEffect(() => {
    const firstCompletion = !completionChecked.current && !!completion;
    const sameOwner = lastCloud.current.owner === owner;
    const firstCloud = !completionChecked.current && (cloudSaveVersion > 0 || cache.has(id) || prefetching.has(id))
      && (cache.get(id)?.cloudSaveVersion ?? prefetching.get(id)?.cloudSaveVersion) !== cloudSaveVersion;
    // Zero can be a recreated controller after re-admission. It must invalidate
    // an old numeric counter before a new import increments that number again.
    const cloudChanged = sameOwner ? lastCloud.current.version !== cloudSaveVersion
      : cache.has(id) && cache.get(id)?.cloudSaveVersion !== cloudSaveVersion;
    lastCloud.current = { owner, version: cloudSaveVersion };
    completionChecked.current = true;
    if (!firstCompletion && !firstCloud && !cloudChanged && lastCompletion.current === completion) return;
    lastCompletion.current = completion;
    // Invalidate before focus work, including the first visit after a save.
    // That first visit starts one fresh read instead of joining an old prefetch
    // or starting duplicate focus/completion reads.
    stale({ completion, cloud: cloudSaveVersion });
    const cached = cache.get(id);
    if (cached && cached.at > 0 && (!completion || cached.completion === completion) && cached.cloudSaveVersion === cloudSaveVersion) {
      // Another Home/Profile consumer can already have refreshed this signal.
      const request = generation.current;
      void Promise.resolve().then(() => {
        if (generation.current === request && focused.current && cache.get(id) === cached && cached.at > 0)
          setLoaded(current => current?.value === cached ? current : { id, value: cached });
      });
    } else if ((completion || firstCloud || cloudChanged) && sameOwner && focused.current) void refresh(true);
  }, [completion, cloudSaveVersion, owner, id, refresh, stale]);
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
    data: loaded?.id === id ? loaded.value : cache.get(id) ?? null,
    loading,
    error: errorKey === id,
    refresh,
  };
}
