import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import {
  getCompletedSessions,
  getProgressSubjects,
  type ProgressSession,
} from "../services/progressService";
import type { Subject } from "../services/taskService";
import { validMapping, type AreaMapping } from "../utils/characterGrowth";

export function useCharacterData() {
  const { profile } = useUser();
  const { sessionSummary } = useTimer();
  const [data, setData] = useState<{
    userId: string;
    areas: Subject[];
    sessions: ProgressSession[];
    mapping: AreaMapping;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const focused = useRef(false);
  const storageKey = `liferpg:character-areas:${profile.id}`;
  const refresh = useCallback(async () => {
    if (!profile.id) return;
    const request = ++generation.current;
    setLoading(true);
    try {
      const [areas, sessions, stored] = await Promise.all([
        getProgressSubjects(),
        getCompletedSessions("1970-01-01T00:00:00Z", new Date().toISOString()),
        AsyncStorage.getItem(storageKey),
      ]);
      let mapping: AreaMapping = {};
      try {
        mapping = validMapping(stored ? JSON.parse(stored) : {});
      } catch {
        /* Invalid device cache does not hide saved growth. */
      }
      if (request === generation.current) {
        setData({ userId: profile.id, areas, sessions, mapping });
        setError(false);
      }
    } catch {
      if (request === generation.current) setError(true);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [profile.id, storageKey]);
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
    if (sessionSummary && focused.current) void refresh();
  }, [sessionSummary, refresh]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && focused.current) void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  const saveMapping = async (mapping: AreaMapping) => {
    // Invalidate an older refresh before it can overwrite the newly saved choice.
    generation.current++;
    setLoading(false);
    await AsyncStorage.setItem(
      storageKey,
      JSON.stringify(validMapping(mapping)),
    );
    setData((current) =>
      current?.userId === profile.id
        ? { ...current, mapping: validMapping(mapping) }
        : current,
    );
  };
  return {
    data: data?.userId === profile.id ? data : null,
    loading,
    error,
    refresh,
    saveMapping,
  };
}
