import { requiredCharacterXP } from "../utils/levelTiers";
import { readSuggestedFocus } from "../constants/guidedQuests";
import { readRoutineSession } from "../utils/routineSession";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "expo-router";
import { AppState } from "react-native";
import SessionResultSheet, { type SessionResultSheetProps } from "./SessionResultSheet";
import SaveSuggestedQuest, { type SuggestedQuestCompletion } from "./SaveSuggestedQuest";
import PostSessionCelebration from "./PostSessionCelebration";
import RewardMoments from "./RewardMoments";
import SessionSavingOverlay from "./SessionSavingOverlay";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { useQuests } from "../context/QuestContext";
import { lifeAreaColor } from "../utils/lifeAreaColor";
import { globalSessionLifecycle, type SessionResultDismissal } from "../services/globalSessionLifecycle";
import { sessionBackendIdentity } from "../utils/sessionBackend";
import { sessionTrail } from "../services/sessionTrail";
import { launchIntroState } from "../services/launchIntroState";
import { RETURN_TO_CAMP_MS, sessionReturn, sessionReturnKey } from "../services/sessionReturn";
import { useReducedMotion } from "../hooks/useReducedMotion";

type PresentedResult = {
  ownerId: string;
  accountKey: string;
  props: Omit<SessionResultSheetProps, "visible" | "onClose" | "onDismiss" | "onRetry" | "saveAction">;
  saveCompletion?: SuggestedQuestCompletion;
};

/** One result portal survives route changes and online/offline transitions. */
// While the finished session is being confirmed, the screen dims behind one
// "Saving your session" message (after a short pause, so instant replies
// never flash it). The card opens only once the result is in. A reply slower
// than the limit opens the card in its saved-on-this-phone state instead.
const SAVING_DELAY_MS = 250;
const SAVING_LIMIT_MS = 10_000;

export default function GlobalRewardListener() {
  const pathname = usePathname();
  const insideSession = pathname === "/session" || pathname === "/timer";
  const auth = useAuth();
  const timer = useTimer({ live: false });
  const { profile, reloadProfile } = useUser();
  const { tasks, subjects } = useQuests();
  const ownerId = auth.user?.id ?? auth.localOwner?.id ?? profile?.id;
  const backendId = auth.localOwner?.backendId ?? sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId;
  const accountKey = JSON.stringify([backendId, ownerId]);
  const presentationScope = JSON.stringify([backendId, ownerId, auth.admissionEpoch]);
  const currentOwner = useRef(ownerId);
  const currentScope = useRef(presentationScope);
  const currentTimer = useRef(timer);
  const closeRequested = useRef(false);
  const pendingDismissal = useRef<SessionResultDismissal | null>(null);
  useLayoutEffect(() => { currentOwner.current = ownerId; }, [ownerId]);
  useLayoutEffect(() => { currentScope.current = presentationScope; }, [presentationScope]);
  useLayoutEffect(() => { currentTimer.current = timer; }, [timer]);
  useLayoutEffect(() => { closeRequested.current = false; pendingDismissal.current = null; }, [presentationScope]);
  const online = auth.accessMode !== "local-only";
  const summary = timer.sessionSummary;
  const reducedMotion = useReducedMotion();
  const openReturnKey = sessionReturnKey(presentationScope, timer.sessionId);
  const [witnessedOpen, setWitnessedOpen] = useState<string | null>(null);
  const nextWitness = !insideSession || !ownerId || timer.endingSession || timer.sessionEnded || timer.summaryViewed
    ? null : timer.hasOpenSession ? openReturnKey : witnessedOpen;
  if (nextWitness !== witnessedOpen) setWitnessedOpen(nextWitness);
  const returnState = useSyncExternalStore(sessionReturn.subscribe, sessionReturn.stateSnapshot, sessionReturn.stateSnapshot);
  // Only a session we saw running on this route walks back. Reopened results,
  // recovery and early End go straight to their existing result presentation.
  const returnKey = insideSession && ownerId && !reducedMotion && timer.isCompleted && !timer.hasOpenSession && !timer.recoveredSession
    && !timer.summaryViewed && timer.syncStatus !== "rejected" && !timer.endingSession && !timer.sessionEnded
    && openReturnKey && witnessedOpen === openReturnKey && !returnState.completed.includes(openReturnKey) ? openReturnKey : null;
  useLayoutEffect(() => {
    if (!returnKey || !sessionReturn.begin(returnKey)) return;
    const finish = () => sessionReturn.finish(returnKey);
    // Native callbacks may be interrupted by navigation or the app sleeping.
    // The result can never be stranded behind a cosmetic animation.
    const limit = setTimeout(finish, RETURN_TO_CAMP_MS + 350);
    const app = AppState?.addEventListener("change", state => { if (state !== "active") finish(); });
    if (AppState?.currentState && AppState.currentState !== "active") finish();
    return () => { clearTimeout(limit); app?.remove(); finish(); };
  }, [returnKey]);
  const ending = timer.endingSession || timer.sessionEnded;
  const terminal = timer.isCompleted || ending || !!summary;
  const rejected = terminal && timer.syncStatus === "rejected";
  const pending = terminal && !summary && !rejected && (!ending || timer.endingSession);
  const waiting = pending && online && !ending && !timer.actionError;
  const pendingKey = waiting ? timer.sessionId ?? "pending-result" : null;
  const [saving, setSaving] = useState<{ key: string | null; phase: "quiet" | "saving" | "expired" }>({ key: pendingKey, phase: "quiet" });
  if (saving.key !== pendingKey) setSaving({ key: pendingKey, phase: "quiet" });
  useEffect(() => {
    if (!pendingKey) return;
    const advance = (phase: "saving" | "expired") => () => setSaving(current => current.key === pendingKey ? { key: pendingKey, phase } : current);
    const show = setTimeout(advance("saving"), SAVING_DELAY_MS);
    const limit = setTimeout(advance("expired"), SAVING_LIMIT_MS);
    return () => { clearTimeout(show); clearTimeout(limit); };
  }, [pendingKey]);
  const expired = saving.key === pendingKey && saving.phase === "expired";
  const ready = !waiting || expired;
  const available = !!ownerId && terminal && !timer.hasOpenSession && !timer.summaryViewed && ready;
  const quest = tasks.find(item => item.id === timer.linkedTaskId);
  const area = subjects.find(item => item.id === timer.targetAttributeId);
  const suggestion = summary?.suggestion ?? (timer.linkedTaskId == null ? readSuggestedFocus(timer.notes) ?? undefined : undefined);
  const title = summary?.questTitle && summary.questTitle !== "Quest session" ? summary.questTitle
    : timer.linkedTaskId != null ? quest?.title ?? "Routine" : suggestion?.title ?? readRoutineSession(timer.notes) ?? "Free session";
  const level = timer.completedLevelUp?.newLevel ?? profile?.level ?? 1;
  const candidate: PresentedResult | null = available && ownerId ? {
    ownerId,
    accountKey,
    props: {
      sessionId: summary?.sessionId ?? timer.sessionId,
      completedAtMs: summary?.completedAtMs,
      recovered: summary?.recovered ?? timer.recoveredSession,
      pending, ending, rejected, localSaved: pending, offline: !online,
      syncError: timer.actionError, syncBusy: timer.actionBusy || timer.isRestoring,
      xpEarned: summary?.xpEarned,
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
  const [heldScope, setHeldScope] = useState(presentationScope);
  if (heldScope !== presentationScope) { setHeldScope(presentationScope); setClosing(false); setHeld(null); }
  const serialized = candidate && !closing ? JSON.stringify(candidate) : null;
  const heldSerialized = held ? JSON.stringify(held) : null;
  if (serialized && serialized !== heldSerialized) setHeld(candidate);
  const restoringHeld = !closing && timer.isRestoring && !timer.hasOpenSession && held?.accountKey === accountKey;
  // A cancellation reply removes the selected journal record. Its notice is
  // still a user-visible result until Done, even though there is no active row.
  const settledEndHeld = !closing && !terminal && !timer.hasOpenSession && !timer.summaryViewed
    && held?.accountKey === accountKey && held?.props.ending;
  const visible = !!candidate && !closing || restoringHeld || !!settledEndHeld;
  // The journal can clear synchronously on Done. Preserve this result's exact
  // identity, duration and actions while the sheet finishes its timed exit.
  const displayed = visible && candidate ? candidate : held?.accountKey === accountKey
    ? settledEndHeld && !timer.actionBusy && !timer.isRestoring
      ? { ...held, props: { ...held.props, pending: false, syncBusy: false, syncError: null } } : held : null;
  const closingOwner = displayed?.ownerId;
  const done = () => {
    sessionTrail("result done", { pending: !!displayed?.props.pending, ending: !!displayed?.props.ending, visible });
    if (!closingOwner || closingOwner !== currentOwner.current || presentationScope !== currentScope.current || closeRequested.current) return;
    const latest = currentTimer.current;
    const resultId = displayed?.props.sessionId ?? null;
    if (latest.hasOpenSession || (latest.sessionSummary?.sessionId ?? latest.sessionId ?? resultId) !== resultId) return;
    closeRequested.current = true;
    pendingDismissal.current = { ownerId: closingOwner, scope: presentationScope, sessionId: displayed?.props.sessionId ?? null };
    setClosing(true);
    // Keep the receipt until the sheet has actually faded away. Starting the
    // trail here would consume its entrance animation behind the native modal.
  };
  const retry = () => {
    sessionTrail("result retry", { pending: !!displayed?.props.pending });
    if (!closingOwner || closingOwner !== currentOwner.current || presentationScope !== currentScope.current || closeRequested.current) return;
    void (async () => {
      if (!online) await auth.retrySessionVerification();
      if (closingOwner !== currentOwner.current || presentationScope !== currentScope.current) return;
      if (ending) await timer.retryAction();
      else await timer.retryCompletion();
    })().catch(() => {});
  };
  useEffect(() => {
    if (online && summary) void reloadProfile();
  }, [online, summary, reloadProfile]);
  // Never over the launch logo: the card appears once the app has opened.
  const introDone = useSyncExternalStore(launchIntroState.subscribe, launchIntroState.isDone, launchIntroState.isDone);
  const shown = visible && introDone && !returnKey;
  const savingShown = waiting && !expired && saving.key === pendingKey && saving.phase === "saving" && !!ownerId && terminal
    && !timer.hasOpenSession && !timer.summaryViewed && introDone && !returnKey;
  return <><SessionResultSheet {...displayed?.props} visible={shown}
    saveAction={displayed?.saveCompletion && <SaveSuggestedQuest inSheet compact disabled={!shown} completion={displayed.saveCompletion} />}
    onClose={done} onDismiss={() => {
      if (closingOwner !== currentOwner.current || presentationScope !== currentScope.current) return;
      const dismissed = pendingDismissal.current;
      if (dismissed && (dismissed.scope !== presentationScope || dismissed.sessionId !== (displayed?.props.sessionId ?? null))) return;
      if (dismissed && dismissed.scope === presentationScope && dismissed.sessionId === (displayed?.props.sessionId ?? null)) {
        pendingDismissal.current = null;
        globalSessionLifecycle.dismissResult(dismissed);
        // A widget can start another session during the fade. Never acknowledge
        // or clear that replacement using an outgoing result's callback.
        const latest = currentTimer.current;
        if (!latest.hasOpenSession && (latest.sessionSummary?.sessionId ?? latest.sessionId ?? displayed?.props.sessionId ?? null) === dismissed.sessionId) {
          latest.acknowledgeSummary();
          latest.clearCompletionModal();
        }
      }
      closeRequested.current = false; setClosing(false); if (!candidate) setHeld(null);
    }} onRetry={retry} />
    <SessionSavingOverlay visible={savingShown} />
    <PostSessionCelebration insideSession={insideSession || !online} />
    {/* Inside a session the reward screens wait until it has finished. Its own return screen shows on the session screen. */}
    <RewardMoments insideSession={insideSession && (timer.hasOpenSession || timer.endingSession || timer.isRestoring || !!returnKey)} claimKey={summary?.sessionId ?? null} sessionRoute={insideSession} /></>;
}
