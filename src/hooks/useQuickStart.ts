import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import { useQuests } from "../context/QuestContext";
import { useGuidedPreference } from "./useGuidedPreference";
import { useFocusDurationPreference } from "./useFocusDurationPreference";
import { preferenceForFocusArea } from "../utils/focusPreference";
import { generalArea } from "../utils/focusAreas";
import { validSessionSeconds } from "../utils/sessionSetup";
import { tapHaptic } from "../utils/tapHaptics";
import type { Task } from "../services/taskService";

/**
 * Starting a session from a tab: the remembered category and length, one
 * start at a time, and a kept draft when a start fails. Routines and Study
 * both use it, so every tab starts sessions the same way.
 */
export function useQuickStart() {
  const router = useRouter(), timer = useTimer(), { profile, hapticsEnabled } = useUser();
  const { subjects = [], loading: areasLoading, error: questsError } = useQuests();
  const owner = profile?.id ?? "";
  // The category is kept with the account's focus preference, as before.
  const preference = useGuidedPreference(owner);
  const duration = useFocusDurationPreference(owner);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState<{ owner: string; seconds: number; areaId: number | null; title: string } | null>(null);
  const lock = useRef(false);
  const general = generalArea(subjects);
  const area = preference.value.areaId !== undefined ? subjects.find(item => item.id === preference.value.areaId) ?? general : general;
  const kept = (failed || starting) && attempt?.owner === owner ? attempt : null;
  const seconds = kept?.seconds ?? duration.selectedSeconds;
  const areaId = kept ? kept.areaId : area?.id ?? null;
  const title = kept?.title ?? area?.title ?? "General";
  const blocked = !!(timer.actionBusy || timer.endingSession || timer.isRestoring || timer.restoreError || (timer.isCompleted && !timer.sessionSummary));
  // Start only looks unavailable when something needs fixing, never while a tab settles.
  const unavailable = !!timer.restoreError || !!questsError;
  const ready = preference.ready && duration.ready;

  const openSession = () => {
    timer.reviewSummary?.();
    if (hapticsEnabled) tapHaptic("medium");
    router.navigate("/session");
  };
  // Old routines keep their task link; the setup screen confirms before starting.
  const openQuestSession = (task: Task) => {
    if (!timer.hasOpenSession && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !(timer.isCompleted && !timer.sessionSummary)) {
      timer.setNotes(""); timer.setLinkedTaskId(task.id);
      timer.setDurationInMinutes(task.target_minutes || 30); timer.setTargetAttributeId(task.subject_id ?? null);
    }
    openSession();
  };
  const changeArea = async (id: number | null) => {
    if (timer.hasOpenSession || blocked || lock.current || areasLoading || questsError || preference.busy) return false;
    if (id !== null && !subjects.some(item => item.id === id)) return false;
    lock.current = true;
    try {
      const saved = await preference.save(preferenceForFocusArea(preference.value, id, subjects.find(item => item.id === id)?.title ?? "Everyday focus"));
      if (saved) { setFailed(false); setAttempt(null); }
      return saved;
    } finally { lock.current = false; }
  };
  const chooseDuration = (next: number, custom = false) => {
    if (timer.hasOpenSession || blocked || lock.current || areasLoading || !duration.ready || !validSessionSeconds(next)) return;
    void duration.choose(next, custom);
    setFailed(false); setAttempt(null);
  };
  const start = async (startSeconds = seconds, startArea = areaId, startTitle = title, routineName?: string) => {
    if (timer.hasOpenSession) { openSession(); return; }
    if (lock.current || blocked || areasLoading || questsError || preference.busy || !duration.ready) return;
    lock.current = true;
    setAttempt({ owner, seconds: startSeconds, areaId: startArea, title: startTitle });
    setStarting(true); setFailed(false);
    try {
      const request = timer.startFreeTimer(startSeconds, startArea, routineName);
      openSession();
      if (!await request) setFailed(true);
    } catch { setFailed(true); }
    finally { lock.current = false; setStarting(false); }
  };
  return { owner, preference, duration, seconds, areaId, title, starting, failed, blocked, unavailable, ready,
    areasLoading, questsError, openSession, openQuestSession, changeArea, chooseDuration, start };
}
