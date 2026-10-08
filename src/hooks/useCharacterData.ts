import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
// Profile and its milestone collection share one account-scoped snapshot. Keep
// only the last account, and refresh quietly after each route's entrance.
let lastSnapshot: CharacterData | null = null;
export function useCharacterData() {
  const { profile } = useUser();
  const { sessionSummary } = useTimer();
  const [data, setData] = useState<CharacterData | null>(() => lastSnapshot?.userId === profile.id ? lastSnapshot : null);
  const [loading, setLoading] = useState(() => lastSnapshot?.userId !== profile.id);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const focused = useRef(false);
  const refresh = useCallback(async () => {
    if (!profile.id) return;
    const request = ++generation.current;
    setLoading(true);
    try {
      const [areas, sessions] = await Promise.all([
        getProgressSubjects(),
        getCompletedSessions("1970-01-01T00:00:00Z", new Date().toISOString()),
      ]);
      if (request === generation.current) {
        const snapshot = { userId: profile.id, areas, sessions };
        lastSnapshot = snapshot;
        setData(snapshot);
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
      const cancelEntranceWork = afterTransition(() => { void refresh(); });
      return () => {
        cancelEntranceWork();
        focused.current = false;
        generation.current++;
      };
    }, [refresh]),
  );
  useEffect(() => {
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
