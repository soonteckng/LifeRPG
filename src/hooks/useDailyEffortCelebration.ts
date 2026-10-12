import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createDailyEffortClaims, dailyGoalEvidence, firstDailyEffortEvidence, type DailyAchievementDisplay, type DailyEffortEvidence } from "../services/dailyEffortCelebrationService";
import { sessionBackendIdentity } from "../utils/sessionBackend";

const claims = createDailyEffortClaims(AsyncStorage, sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId ?? "local");

const emptyDisplay: DailyAchievementDisplay = {firstSession:false, dailyGoal:false};

export function useDailyEffortCelebration(evidence: DailyEffortEvidence): DailyAchievementDisplay {
  const firstSession = firstDailyEffortEvidence(evidence);
  const dailyGoal = dailyGoalEvidence(evidence);
  const eligible = firstSession || dailyGoal;
  const identity = eligible ? JSON.stringify([evidence.ownerId, evidence.sessionId, evidence.creditedDate, firstSession, dailyGoal]) : "";
  const current = useRef(identity), [display, setDisplay] = useState({identity, ...emptyDisplay});
  // A different result or a hidden result cannot inherit the previous banner.
  if (display.identity !== identity) setDisplay({identity, ...emptyDisplay});
  useLayoutEffect(() => { current.current = identity; }, [identity]);
  useEffect(() => {
    if (!eligible || !evidence.ownerId || !evidence.creditedDate) return;
    let active = true;
    const isCurrent = () => active && current.current === identity;
    // Both achievements publish together, avoiding two successive sheet jumps.
    void Promise.all([
      firstSession ? claims.claim(evidence.ownerId, evidence.creditedDate, isCurrent) : false,
      dailyGoal ? claims.claim(evidence.ownerId, evidence.creditedDate, isCurrent, "daily-goal") : false,
    ]).then(([showFirst, showGoal]) => {
      if (isCurrent()) setDisplay({identity, firstSession:showFirst, dailyGoal:showGoal});
    });
    return () => { active = false; };
  }, [eligible, firstSession, dailyGoal, identity, evidence.ownerId, evidence.creditedDate]);
  return eligible && display.identity === identity ? {firstSession:display.firstSession, dailyGoal:display.dailyGoal} : emptyDisplay;
}
