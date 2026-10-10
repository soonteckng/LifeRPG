import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useTimer } from "./TimerContext";
import { getSubjects, getTasks, type Subject, type Task } from "../services/taskService";

interface QuestState {
  tasks: Task[];
  subjects: Subject[];
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  upsert: (task: Task) => void;
  remove: (id: number) => void;
}
const QuestContext = createContext<QuestState | null>(null);

export function QuestProvider({ children }: { children: React.ReactNode }) {
  const { sessionSummary } = useTimer();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const revision = useRef(0);
  const request = useRef(0);
  const loadQuests = useCallback(async () => {
    const currentRequest = ++request.current;
    const currentRevision = revision.current;
    setRefreshing(true);
    try {
      const [nextTasks, nextSubjects] = await Promise.all([getTasks(), getSubjects()]);
      if (currentRequest !== request.current) return;
      // A slow refresh must not overwrite a quest saved while the request was in flight.
      if (currentRevision === revision.current) setTasks(nextTasks);
      setSubjects(nextSubjects);
      setError(false);
    } catch {
      if (currentRequest === request.current) setError(true);
    } finally {
      if (currentRequest === request.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);
  const pendingRefresh = useRef<Promise<void> | null>(null);
  const refresh = useCallback(function refresh(fresh = false): Promise<void> {
    if (fresh && pendingRefresh.current) return pendingRefresh.current.then(() => refresh(), () => refresh());
    if (!pendingRefresh.current) {
      pendingRefresh.current = loadQuests().finally(() => { pendingRefresh.current = null; });
    }
    return pendingRefresh.current;
  }, [loadQuests]);
  const upsert = useCallback((task: Task) => {
    revision.current++;
    setTasks((current) => current.some((item) => item.id === task.id)
      ? current.map((item) => item.id === task.id ? task : item) : [task, ...current]);
  }, []);
  // Session completion is an external persistence event; reload its server-derived schedule and completion state.
  useEffect(() => { if (sessionSummary) void refresh(true); }, [sessionSummary, refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(true); });
    return () => subscription.remove();
  }, [refresh]);
  const remove = useCallback((id: number) => {
    revision.current++;
    setTasks((current) => current.filter((task) => task.id !== id));
  }, []);
  return <QuestContext.Provider value={{ tasks, subjects, loading, refreshing, error, refresh, upsert, remove }}>{children}</QuestContext.Provider>;
}

export function useQuests() {
  const context = useContext(QuestContext);
  if (!context) throw new Error("useQuests must be used within QuestProvider");
  return context;
}
