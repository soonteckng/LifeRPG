import { requiredCharacterXP } from "../utils/levelTiers";
import { readSuggestedFocus } from "../constants/guidedQuests";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "expo-router";
import SessionResultSheet, { type SessionResultSheetProps } from "./SessionResultSheet";
import SaveSuggestedQuest, { type SuggestedQuestCompletion } from "./SaveSuggestedQuest";
import PostSessionCelebration from "./PostSessionCelebration";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { useQuests } from "../context/QuestContext";
import { lifeAreaColor } from "../utils/lifeAreaColor";

type PresentedResult = {
  ownerId: string;
  props: Omit<SessionResultSheetProps, "visible" | "onClose" | "onDismiss" | "onRetry" | "saveAction">;
  saveCompletion?: SuggestedQuestCompletion;
};

/** One result portal survives route changes and online/offline transitions. */
export default function GlobalRewardListener() {
  const pathname = usePathname();
  const insideSession = pathname === "/session" || pathname === "/timer";
  const auth = useAuth();
  const timer = useTimer();
  const { profile, reloadProfile } = useUser();
  const { tasks, subjects } = useQuests();
  const ownerId = auth.user?.id ?? auth.localOwner?.id ?? profile?.id;
  const currentOwner = useRef(ownerId);
  const closeRequested = useRef(false);
  useLayoutEffect(() => { currentOwner.current = ownerId; }, [ownerId]);
  useLayoutEffect(() => { closeRequested.current = false; }, [ownerId]);
  const online = auth.accessMode !== "local-only";
  const summary = timer.sessionSummary;
  const ending = timer.endingSession || timer.sessionEnded;
  const terminal = timer.isCompleted || ending || !!summary;
  const rejected = terminal && timer.syncStatus === "rejected";
  const pending = terminal && !summary && !rejected && (!ending || timer.endingSession);
  const pendingKey = pending && !ending ? timer.sessionId ?? "pending-result" : null;
  const [pendingSurface, setPendingSurface] = useState({ key: pendingKey, ready: false });
  if (pendingSurface.key !== pendingKey) setPendingSurface({ key: pendingKey, ready: false });
  useEffect(() => {
    if (!pendingKey) return;
    // Fast online replies never flash a saving page. Durable offline results
    // are usable immediately, including their Done action.
    const deadline = setTimeout(() => setPendingSurface(current => current.key === pendingKey
      ? { key: pendingKey, ready: true } : current), 700);
    return () => clearTimeout(deadline);
  }, [pendingKey]);
  const ready = !pending || ending || !online || timer.clientReported || !!timer.actionError
    || pendingSurface.key === pendingKey && pendingSurface.ready;
  const available = !!ownerId && terminal && !timer.hasOpenSession && !timer.summaryViewed && ready;
  const quest = tasks.find(item => item.id === timer.linkedTaskId);
  const area = subjects.find(item => item.id === timer.targetAttributeId);
  const suggestion = summary?.suggestion ?? (timer.linkedTaskId == null ? readSuggestedFocus(timer.notes) ?? undefined : undefined);
  const title = summary?.questTitle && summary.questTitle !== "Quest session" ? summary.questTitle
    : timer.linkedTaskId != null ? quest?.title ?? "Quest" : suggestion?.title ?? "Free session";
  const level = timer.completedLevelUp?.newLevel ?? profile?.level ?? 1;
  const candidate: PresentedResult | null = available && ownerId ? {
    ownerId,
    props: {
      sessionId: summary?.sessionId ?? timer.sessionId,
      completedAtMs: summary?.completedAtMs,
      recovered: summary?.recovered ?? timer.recoveredSession,
      pending, ending, rejected, localSaved: pending, offline: !online,
      syncError: timer.actionError, syncBusy: timer.actionBusy || timer.isRestoring,
      xpEarned: summary?.xpEarned, goldEarned: summary?.goldEarned,
      creditVersion: summary?.creditVersion, areaXpEarned: summary?.areaXpEarned,
      characterRemainderSeconds: summary?.characterRemainderSeconds,
      areaRemainderSeconds: summary?.areaRemainderSeconds,
      goalReachedNow: summary?.goalReachedNow,
      durationSeconds: summary?.durationSeconds ?? timer.duration,
      creditedDate: summary?.creditedDate,
      dailyCompletedSeconds: summary?.dailyCompletedSeconds,
      dailyGoalMinutes: summary?.dailyGoalMinutes,
      questTitle: title, areaTitle: area?.title,
      areaColor: lifeAreaColor(timer.targetAttributeId, area?.color_code),
      isLevelUp: !!timer.completedLevelUp?.leveledUp, newLevel: level,
      currentXP: profile?.current_xp ?? 0, requiredXP: requiredCharacterXP(level),
    },
    saveCompletion: online && summary?.sessionId && summary.suggestion && !ending && !rejected && timer.linkedTaskId == null
      ? { ownerId, sessionId: summary.sessionId, suggestion: summary.suggestion,
        durationSeconds: summary.durationSeconds, targetAttributeId: timer.targetAttributeId } : undefined,
  } : null;
  const [closing, setClosing] = useState(false);
  const [held, setHeld] = useState<PresentedResult | null>(null);
  const [heldOwner, setHeldOwner] = useState(ownerId);
  if (heldOwner !== ownerId) { setHeldOwner(ownerId); setClosing(false); setHeld(null); }
  const serialized = candidate && !closing ? JSON.stringify(candidate) : null;
  const heldSerialized = held ? JSON.stringify(held) : null;
  if (serialized && serialized !== heldSerialized) setHeld(candidate);
  const restoringHeld = !closing && timer.isRestoring && !timer.hasOpenSession && held?.ownerId === ownerId;
  const visible = !!candidate && !closing || restoringHeld;
  // The journal can clear synchronously on Done. Preserve this result's exact
  // identity, duration and actions while the sheet finishes its timed exit.
  const displayed = visible && candidate ? candidate : held?.ownerId === ownerId ? held : null;
  const closingOwner = displayed?.ownerId;
  const done = () => {
    if (!closingOwner || closingOwner !== currentOwner.current || closeRequested.current) return;
    closeRequested.current = true;
    setClosing(true);
    timer.acknowledgeSummary();
    timer.clearCompletionModal();
  };
  const retry = () => {
    if (!closingOwner || closingOwner !== currentOwner.current || closeRequested.current) return;
    void (async () => {
      if (!online) await auth.retrySessionVerification();
      if (closingOwner !== currentOwner.current) return;
      if (ending) await timer.retryAction();
      else await timer.retryCompletion();
    })().catch(() => {});
  };
  useEffect(() => {
    if (online && summary) void reloadProfile();
  }, [online, summary, reloadProfile]);
  return <><SessionResultSheet {...displayed?.props} visible={visible}
    saveAction={displayed?.saveCompletion && <SaveSuggestedQuest inSheet compact disabled={!visible} completion={displayed.saveCompletion} />}
    onClose={done} onDismiss={() => {
      if (closingOwner !== currentOwner.current) return;
      closeRequested.current = false; setClosing(false); if (!candidate) setHeld(null);
    }} onRetry={retry} />
    <PostSessionCelebration insideSession={insideSession || !online} /></>;
}
