import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { uuid } from "expo-modules-core";
import { readSuggestedFocus, encodeSuggestedFocus, suggestedFocus, type SuggestedFocus } from "../constants/guidedQuests";
import { createJournalSessionTransport } from "../services/sessionService";
import { createAsyncStorageSessionJournalStore } from "../services/sessionJournalAsyncStorage";
import { createSessionTimerController, type SessionTimerController, type SessionTimerControllerSnapshot } from "../services/sessionTimerController";
import { createSessionNotificationLifecycle } from "../services/sessionNotificationService";
import { getSessionNotifications } from "../utils/sessionNotifications";
import { validSessionSeconds } from "../utils/sessionSetup";
import { sessionBackendIdentity } from "../utils/sessionBackend";
import type { JournalClock, JournalScope, JournalSetup } from "../types/sessionJournal";
import { useAuth } from "./AuthContext";
import { useUser } from "./UserContext";

const Notifications = getSessionNotifications();
let completionSoundEnabled = true;
try {
  Notifications?.setNotificationHandler?.({ handleNotification: async notification => ({
    shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldSetBadge: true,
    shouldPlaySound: notification.request.content.data?.type === "COMPLETION" && completionSoundEnabled,
  }) });
} catch { console.warn("Session notification handler could not be configured."); }

interface SessionSummary {
  completedAtMs?: number; recovered?: boolean;
  sessionId?: string; suggestion?: SuggestedFocus; xpEarned: number; goldEarned: number;
  minutesSpent: number; durationSeconds: number; questTitle?: string; creditVersion?: number;
  areaXpEarned?: number | null; characterRemainderSeconds?: number; areaRemainderSeconds?: number | null;
  dailyCompletedSeconds?: number; goalReachedNow?: boolean; creditedDate?: string;
}
interface TimerContextType {
  sessionId: string | null; recoveredSession: boolean;
  timeLeft: number; duration: number; isRunning: boolean; isCompleted: boolean; hasOpenSession: boolean;
  isRestoring: boolean; restoreError: boolean; retryRestore: () => void; actionBusy: boolean;
  actionError: string | null; rewardsVisible: boolean; retryCompletion: () => Promise<void>; retryAction: () => Promise<void>;
  syncStatus: "idle" | "waiting" | "saved" | "rejected"; awaitingStart: boolean; endingSession: boolean; unsyncedSessionCount: number;
  interactionKind: "start" | "pause" | "resume" | null;
  resolveQuestTitle: (id: number, title: string) => void; activityType: string; targetAttributeId: number | null;
  linkedTaskId: number | null; notes: string; sessionSummary: SessionSummary | null; summaryViewed: boolean;
  acknowledgeSummary: () => void; setActivityType: (type: string) => void; setNotes: (text: string) => void;
  setTargetAttributeId: (id: number | null) => void; setLinkedTaskId: (id: number | null) => void;
  startTimer: (totalSeconds: number, questTitle?: string) => Promise<void>;
  startFreeTimer: (totalSeconds: number, subjectId: number | null) => Promise<boolean>;
  startSuggestedTimer: (focus: SuggestedFocus, subjectId: number | null) => Promise<boolean>;
  pauseTimer: () => Promise<void>; resumeTimer: () => Promise<void>; resetTimer: () => Promise<void>;
  setDurationInMinutes: (minutes: number) => void; setDurationInSeconds: (seconds: number) => void;
  completedLevelUp: { leveledUp: boolean; newLevel: number } | null; clearCompletionModal: () => void;
}
const TimerContext = createContext<TimerContextType | undefined>(undefined);
const initialRuntime: SessionTimerControllerSnapshot = {
  record: null, timeLeft: 0, restoring: true, busy: false, error: null, restoreError: false,
  syncStatus: "idle", receipt: null, rewardsVisible: false,
  ending: false, unsyncedSessionCount: 0, interaction: null, displayTimeLeft: null, recovered: false,
};
const getClock = (): JournalClock => ({ wallTimeMs: Date.now(), monotonicTimeMs: null, bootId: null });
const numberOr = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const optionalNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const nullableNumber = (value: unknown) => value === null ? null : optionalNumber(value);

/** Foreground journal adapter. Android's native authority replaces it before the combined release. */
export function TimerProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { reloadProfile, soundEnabled = true, hapticsEnabled = true } = useUser();
  const authRef = useRef(auth);
  useLayoutEffect(() => { authRef.current = auth; }, [auth]);
  const identity = sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "");
  const backendId = auth.localOwner?.backendId ?? identity?.backendId;
  const ownerId = auth.user?.id ?? auth.localOwner?.id;
  const controllerRef = useRef<SessionTimerController | null>(null);
  const startInFlight = useRef(false);
  const [runtime, setRuntime] = useState(initialRuntime);
  const [draft, setDraft] = useState({ seconds: 1800, activityType: "other", subjectId: null as number | null,
    taskId: null as number | null, notes: "" });
  const [hiddenSavedId, setHiddenSavedId] = useState<string | null>(null);
  const [viewedSummaryId, setViewedSummaryId] = useState<string | null>(null);
  const [questTitle, setQuestTitle] = useState<{ id: number; title: string } | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [notificationLifecycle] = useState(() => createSessionNotificationLifecycle(Notifications, Platform.OS,
    { sound: soundEnabled, haptics: hapticsEnabled }));
  const seenReceipts = useRef(new Set<string>());
  const celebrated = useRef(new Set<string>());
  const backgroundBanner = useRef<{ title: string; deadline: number } | null>(null);

  useEffect(() => {
    if (!ownerId || !backendId) return;
    const scope: JournalScope = { backendId, ownerId };
    const currentScope = (): JournalScope | null => {
      const current = authRef.current;
      const id = current.user?.id ?? current.localOwner?.id;
      const backend = current.localOwner?.backendId ?? identity?.backendId;
      return id && backend ? { ownerId: id, backendId: backend } : null;
    };
    const verify = async (): Promise<JournalScope | null> => {
      const verified = await authRef.current.verifyCurrentOwner();
      return verified ? { ownerId: verified.id, backendId: verified.backendId } : null;
    };
    const currentEpoch = () => authRef.current.admissionEpoch;
    const controller = createSessionTimerController({ scope,
      store: createAsyncStorageSessionJournalStore(scope),
      server: createJournalSessionTransport(scope, { ensureVerifiedScope: verify, currentScope, currentEpoch, getClock }),
      authority: { currentScope, currentEpoch, verify }, clock: getClock, uuid: () => uuid.v4().toLowerCase(),
    });
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(next => setRuntime(current =>
      current.record?.clientSessionId === next.record?.clientSessionId
      && current.record?.revision === next.record?.revision && current.timeLeft === next.timeLeft
      && current.restoring === next.restoring && current.busy === next.busy && current.error === next.error
      && current.restoreError === next.restoreError && current.syncStatus === next.syncStatus
      && current.ending === next.ending && current.unsyncedSessionCount === next.unsyncedSessionCount
      && current.interaction?.kind === next.interaction?.kind && current.interaction?.timeLeft === next.interaction?.timeLeft
      && current.displayTimeLeft === next.displayTimeLeft
      && current.recovered === next.recovered
      && current.rewardsVisible === next.rewardsVisible ? current : next));
    void controller.initialize();
    const interval = setInterval(() => { void controller.tick(); }, 200);
    const appState = AppState.addEventListener("change", next => {
      if (next === "active") void controller.refresh();
      if (next === "background" && backgroundBanner.current && backgroundBanner.current.deadline > Date.now()) {
        void notificationLifecycle.refreshOngoing(backgroundBanner.current.title);
      }
    });
    return () => {
      unsubscribe(); clearInterval(interval); appState.remove();
      if (controllerRef.current === controller) controllerRef.current = null;
      void controller.dispose();
    };
    // Mode changes keep the same journal/controller. Identity or admission revocation replaces it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, backendId, auth.admissionEpoch, restoreAttempt]);

  useEffect(() => { if (auth.accessMode === "online") void controllerRef.current?.refresh(); }, [auth.accessMode]);
  useEffect(() => {
    notificationLifecycle.activate();
    return () => { void notificationLifecycle.dispose(); };
  }, [notificationLifecycle]);
  useEffect(() => {
    notificationLifecycle.setPreferences({ sound: soundEnabled, haptics: hapticsEnabled });
    completionSoundEnabled = soundEnabled;
  }, [soundEnabled, hapticsEnabled, notificationLifecycle]);

  const interactionKind = runtime.interaction?.kind ?? null;
  const record = interactionKind === "start" || (runtime.record?.state === "completed" && runtime.record.clientSessionId === hiddenSavedId)
    ? null : runtime.record;
  const open = !runtime.ending && (interactionKind === "start" || !!record && ["running", "paused", "not_started"].includes(record.state));
  const isCompleted = record?.state === "completed";
  const awaitingStart = interactionKind === "start" || record?.state === "not_started";
  const setup = record && (open || isCompleted || runtime.ending) ? record.setup : null;
  const duration = setup?.targetSeconds ?? draft.seconds;
  const timeLeft = runtime.displayTimeLeft ?? runtime.interaction?.timeLeft ?? (record && record.state !== "cancelled" ? runtime.timeLeft : draft.seconds);
  const notes = setup?.notes ?? draft.notes;
  const linkedTaskId = setup ? setup.taskId : draft.taskId;
  const targetAttributeId = setup ? setup.subjectId : draft.subjectId;
  const activityType = setup?.activityType ?? draft.activityType;
  const resolvedTitle = record?.setup.title ?? (linkedTaskId !== null && questTitle?.id === linkedTaskId ? questTitle.title : null)
    ?? readSuggestedFocus(notes)?.title ?? (linkedTaskId === null ? "Free session" : "Quest session");
  const receipt = record?.sync.receipt;
  const result = receipt?.result;
  const summaryId = receipt ? record!.clientSessionId : null;
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  useEffect(() => {
    if (!receipt || !result || !record) {
      // Summary is a view of durable receipt state, never a reward authority.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSessionSummary(null); return;
    }
    const summary: SessionSummary = {
      sessionId: receipt.sessionId, suggestion: record.setup.taskId === null ? readSuggestedFocus(record.setup.notes) ?? undefined : undefined,
      completedAtMs: record.completedAtMs ?? undefined, recovered: runtime.recovered,
      durationSeconds: receipt.durationSeconds, minutesSpent: numberOr(result.minutes, Math.floor(receipt.durationSeconds / 60)),
      xpEarned: numberOr(result.xp_earned), goldEarned: numberOr(result.gold_earned), questTitle: resolvedTitle,
      creditVersion: optionalNumber(result.credit_version), areaXpEarned: nullableNumber(result.area_xp_earned),
      characterRemainderSeconds: optionalNumber(result.character_remainder_seconds), areaRemainderSeconds: nullableNumber(result.area_remainder_seconds),
      dailyCompletedSeconds: optionalNumber(result.daily_completed_seconds), goalReachedNow: result.goal_reached_now === true,
      creditedDate: typeof result.credited_date === "string" ? result.credited_date : undefined,
    };
    setSessionSummary(current => current && current.sessionId === summary.sessionId && current.questTitle === summary.questTitle
      && current.completedAtMs === summary.completedAtMs && current.recovered === summary.recovered ? current : summary);
    if (!seenReceipts.current.has(record.clientSessionId)) {
      seenReceipts.current.add(record.clientSessionId);
      if (auth.accessMode === "online") void reloadProfile().catch(() => false);
    }
    if (runtime.rewardsVisible && hapticsEnabled && !celebrated.current.has(record.clientSessionId)) {
      celebrated.current.add(record.clientSessionId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [record, receipt, result, resolvedTitle, runtime.rewardsVisible, runtime.recovered, hapticsEnabled, reloadProfile, auth.accessMode]);

  const notificationId = record?.clientSessionId;
  const notificationState = record?.state;
  const deadline = record?.endsAtMs;
  useLayoutEffect(() => {
    backgroundBanner.current = notificationState === "running" && !runtime.ending && interactionKind !== "pause"
      && runtime.syncStatus !== "waiting" && deadline ? { title: resolvedTitle, deadline } : null;
  }, [notificationState, runtime.ending, interactionKind, runtime.syncStatus, deadline, resolvedTitle]);
  useEffect(() => {
    if (notificationState === "running" && !runtime.ending && interactionKind !== "pause" && runtime.syncStatus !== "waiting" && deadline && deadline > Date.now()) {
      void notificationLifecycle.schedule(Math.max(1, (deadline - Date.now()) / 1000), resolvedTitle);
    } else void notificationLifecycle.clear();
  }, [notificationId, notificationState, deadline, resolvedTitle, runtime.ending, runtime.syncStatus, interactionKind, soundEnabled, hapticsEnabled, notificationLifecycle]);

  const locked = () => startInFlight.current || open || runtime.ending || runtime.busy || runtime.restoring || runtime.restoreError
    || (isCompleted && !record?.sync.receipt);
  const prepareDraft = () => {
    if (record?.state === "completed" && record.sync.receipt) {
      setHiddenSavedId(record.clientSessionId); controllerRef.current?.dismissSummary();
    }
  };
  const setDurationInSeconds = (seconds: number) => {
    if (locked() || !validSessionSeconds(seconds)) return;
    prepareDraft();
    setDraft(current => {
      const suggestion = readSuggestedFocus(current.notes);
      return { ...current, seconds, notes: suggestion ? encodeSuggestedFocus({ ...suggestion, seconds }) : current.notes };
    });
  };
  const start = async (seconds: number, title?: string, explicit?: { subjectId: number | null; suggestion?: SuggestedFocus }): Promise<boolean> => {
    if (locked() || !validSessionSeconds(seconds) || !controllerRef.current || auth.accessMode !== "online") return false;
    // Lock before changing the draft, including two taps before React renders.
    startInFlight.current = true;
    const controller = controllerRef.current;
    const next = explicit ? { seconds, activityType: "other", taskId: null, subjectId: explicit.subjectId,
      notes: explicit.suggestion ? encodeSuggestedFocus(explicit.suggestion) : "" } : { ...draft, seconds };
    setDraft(next); setHiddenSavedId(record?.state === "completed" ? record.clientSessionId : null); setViewedSummaryId(null);
    const startSetup: JournalSetup = { targetSeconds: seconds, activityType: next.activityType,
      taskId: next.taskId, subjectId: next.subjectId, notes: next.notes, title: title ?? readSuggestedFocus(next.notes)?.title ?? null };
    try { return await controller.start(startSetup); }
    finally { startInFlight.current = false; }
  };
  const startSuggestedTimer = (focus: SuggestedFocus, subjectId: number | null) => {
    const validated = suggestedFocus(focus.templateId, focus.smaller === true);
    if (!validated || !validSessionSeconds(focus.seconds)) return Promise.resolve(false);
    return start(focus.seconds, validated.title, { subjectId, suggestion: { ...validated, seconds: focus.seconds } });
  };
  const resetTimer = async () => {
    if (!controllerRef.current || runtime.restoring || runtime.restoreError) return;
    const saved = await controllerRef.current.end();
    if (saved) { setHiddenSavedId(null); setViewedSummaryId(null); setQuestTitle(null); }
  };
  const completedLevelUp = result?.leveled_up === true
    ? { leveledUp: true, newLevel: numberOr(result.level, 1) } : null;
  const retry = async () => { await controllerRef.current?.retry(); };
  const acknowledgeSummary = useCallback(() => setViewedSummaryId(summaryId), [summaryId]);
  return <TimerContext.Provider value={{
    sessionId: record?.serverSessionId ?? null, recoveredSession: runtime.recovered,
    timeLeft, duration, isRunning: !runtime.ending && (interactionKind === "pause" ? false : interactionKind === "resume" || interactionKind === "start" ? true : record?.state === "running"), isCompleted, hasOpenSession: open,
    isRestoring: runtime.restoring, restoreError: runtime.restoreError, retryRestore: () => setRestoreAttempt(value => value + 1),
    actionBusy: runtime.busy, actionError: runtime.error, rewardsVisible: runtime.rewardsVisible && !!record,
    syncStatus: runtime.syncStatus, awaitingStart, endingSession: runtime.ending, unsyncedSessionCount: runtime.unsyncedSessionCount, interactionKind,
    retryCompletion: retry, retryAction: retry,
    resolveQuestTitle: (id, title) => { if (id === linkedTaskId) setQuestTitle(current => current?.id === id && current.title === title ? current : { id, title }); },
    activityType, targetAttributeId, linkedTaskId, notes,
    setActivityType: value => { if (!locked()) { prepareDraft(); setDraft(current => ({ ...current, activityType: value })); } },
    setNotes: value => { if (!locked()) { prepareDraft(); setDraft(current => ({ ...current, notes: value })); } },
    setTargetAttributeId: value => { if (!locked()) { prepareDraft(); setDraft(current => ({ ...current, subjectId: value })); } },
    setLinkedTaskId: value => { if (!locked()) { prepareDraft(); setDraft(current => ({ ...current, taskId: value })); } },
    setDurationInMinutes: minutes => { if (Number.isInteger(minutes)) setDurationInSeconds(minutes * 60); }, setDurationInSeconds,
    startTimer: async (seconds, title) => { await start(seconds, title); },
    startFreeTimer: (seconds, subjectId) => start(seconds, undefined, { subjectId }), startSuggestedTimer,
    pauseTimer: async () => { await controllerRef.current?.pause(); }, resumeTimer: async () => { await controllerRef.current?.resume(); }, resetTimer,
    sessionSummary: receipt?.sessionId === sessionSummary?.sessionId ? sessionSummary : null, summaryViewed: summaryId !== null && viewedSummaryId === summaryId, acknowledgeSummary,
    completedLevelUp, clearCompletionModal: () => controllerRef.current?.dismissSummary(),
  }}>{children}</TimerContext.Provider>;
}
export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) throw new Error("useTimer must be used within a TimerProvider");
  return context;
}
