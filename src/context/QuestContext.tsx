import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useTimer } from "./TimerContext";
import { getSubjects, getTasks, type Subject, type Task } from "../services/taskService";
import { readOfflineFocusAreas } from "../services/offlineFocusCatalog";
import type { JournalScope } from "../types/sessionJournal";

interface QuestState {
  tasks: Task[];
  subjects: Subject[];
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  refresh: (fresh?: boolean) => Promise<void>;
  upsert: (task: Task) => void;
  remove: (id: number) => void;
}
const QuestContext = createContext<QuestState | null>(null);

/**
 * Routines and categories. Offline, categories come from the copy saved the
 * last time this phone was online, so sessions can still pick one.
 */
export function QuestProvider({ children, online = true, offlineScope = null }: { children: React.ReactNode; online?: boolean; offlineScope?: JournalScope | null }) {
  const { sessionSummary, cloudSaveVersion } = useTimer();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const revision = useRef(0);
  const request = useRef(0);
  const alive = useRef(true);
  const onlineRef = useRef(online);
  useLayoutEffect(() => { onlineRef.current = online; }, [online]);
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
    if (!alive.current || !onlineRef.current) return Promise.resolve();
    if (fresh && pendingRefresh.current) return pendingRefresh.current.then(() => refresh(), () => refresh());
    if (!pendingRefresh.current) {
      const flight = loadQuests().finally(() => { if (pendingRefresh.current === flight) pendingRefresh.current = null; });
      pendingRefresh.current = flight;
    }
    return pendingRefresh.current;
  }, [loadQuests]);
  const upsert = useCallback((task: Task) => {
    if (!alive.current) return;
    revision.current++;
    setTasks((current) => current.some((item) => item.id === task.id)
      ? current.map((item) => item.id === task.id ? task : item) : [task, ...current]);
  }, []);
  // Session completion is an external persistence event; reload its server-derived schedule and completion state.
  useEffect(() => {
    if (online && (sessionSummary || cloudSaveVersion > 0)) {
      // A read begun before completion can still contain the old actionable row.
      revision.current++;
      void refresh(true);
    }
  }, [sessionSummary, cloudSaveVersion, refresh, online]);
  useEffect(() => {
    if (!online) {
      request.current++; pendingRefresh.current = null; setRefreshing(false);
    } else void refresh();
  }, [online, refresh]);
  const ownerId = offlineScope?.ownerId, backendId = offlineScope?.backendId;
  useEffect(() => {
    if (online || !ownerId || !backendId) return;
    let live = true;
    void readOfflineFocusAreas({ ownerId, backendId }).then(areas => {
      if (!live || !alive.current || !areas.length) return;
      // Only fills an empty list: categories loaded online stay as they are.
      setSubjects(current => current.length ? current : areas.map(area => ({ ...area, level: 1, current_xp: 0 })));
      setLoading(false);
    });
    return () => { live = false; };
  }, [online, ownerId, backendId]);
  const invalidateReads = useCallback(() => {
    // AuthGate keys this provider by owner. Ignore reads from an outgoing account.
    alive.current = false;
    request.current++;
    pendingRefresh.current = null;
  }, []);
  useLayoutEffect(() => {
    alive.current = true;
    return invalidateReads;
  }, [invalidateReads]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(true); });
    return () => subscription.remove();
  }, [refresh]);
  const remove = useCallback((id: number) => {
    if (!alive.current) return;
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
