import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { afterTransition } from "../utils/afterTransition";
import {
  getCompletedSessions,
  getProgressSubjects,
  type ProgressSession,
} from "../services/progressService";
import type { Subject } from "../services/taskService";

type CharacterData = { userId: string; areas: Subject[]; sessions: ProgressSession[] };
type Snapshot = CharacterData & { at: number; summary: unknown };
// Profile and its milestone collection share one account-scoped snapshot. Keep
// only the last account. It is reused for a minute, and never after a newer
// session has finished, so area levels and milestones are not left behind.
let lastSnapshot: Snapshot | null = null;
let prefetching: { userId: string; request: Promise<CharacterData> } | null = null;
async function loadCharacter(userId: string): Promise<CharacterData> {
  const [areas, sessions] = await Promise.all([
    getProgressSubjects(),
    getCompletedSessions("1970-01-01T00:00:00Z", new Date().toISOString()),
  ]);
  return { userId, areas, sessions };
}
const remember = (value: CharacterData, summary: unknown) => (lastSnapshot = { ...value, at: Date.now(), summary });
/** Loads Profile's growth quietly so its first visit is already drawn. */
export function prefetchCharacterData(userId: string, summary: unknown) {
  if (!userId || lastSnapshot?.userId === userId || prefetching?.userId === userId) return;
  const request = loadCharacter(userId);
  prefetching = { userId, request };
  request.then(value => { remember(value, summary); }, () => {})
    .finally(() => { if (prefetching?.request === request) prefetching = null; });
}
export function useCharacterData() {
  const { profile } = useUser();
  const { sessionSummary } = useTimer();
  const [data, setData] = useState<CharacterData | null>(() => lastSnapshot?.userId === profile.id ? lastSnapshot : null);
  const [loading, setLoading] = useState(() => lastSnapshot?.userId !== profile.id);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const focused = useRef(false);
  const summary = useRef(sessionSummary);
  useLayoutEffect(() => { summary.current = sessionSummary; }, [sessionSummary]);
  const refresh = useCallback(async () => {
    if (!profile.id) return;
    const request = ++generation.current;
    const seen = summary.current;
    setLoading(true);
    try {
      const value = await (prefetching?.userId === profile.id ? prefetching.request : loadCharacter(profile.id));
      if (request === generation.current) {
        setData(remember(value, seen));
        setError(false);
      }
    } catch {
      if (request === generation.current) setError(true);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [profile.id]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const cached = lastSnapshot?.userId === profile.id ? lastSnapshot : null;
      // Nothing to show yet: start at once. Otherwise refresh quietly after
      // the entrance, only when the copy is old or a session finished since.
      let cancelEntranceWork = () => {};
      if (!cached) void refresh();
      else {
        if (data !== cached) setData(cached);
        if (Date.now() - cached.at > 60_000 || cached.summary !== summary.current) cancelEntranceWork = afterTransition(() => { void refresh(); });
      }
      return () => {
        cancelEntranceWork();
        focused.current = false;
        generation.current++;
      };
      // data is read only to adopt a newer shared copy on focus.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh, profile.id]),
  );
  // A session finishing while this screen is open; a mount is handled on focus.
  const lastSummary = useRef(sessionSummary);
  useEffect(() => {
    if (lastSummary.current === sessionSummary) return;
    lastSummary.current = sessionSummary;
    if (sessionSummary && focused.current) void refresh();
  }, [sessionSummary, refresh]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && focused.current) void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  return {
    data: data?.userId === profile.id ? data : null,
    loading,
    error,
    refresh,
  };
}
