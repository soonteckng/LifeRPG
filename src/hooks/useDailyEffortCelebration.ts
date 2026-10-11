import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createDailyEffortClaims, firstDailyEffortEvidence, type DailyEffortEvidence } from "../services/dailyEffortCelebrationService";
import { sessionBackendIdentity } from "../utils/sessionBackend";

const claims = createDailyEffortClaims(AsyncStorage, sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId ?? "local");

export function useDailyEffortCelebration(evidence: DailyEffortEvidence): boolean {
  const eligible = firstDailyEffortEvidence(evidence);
  const identity = eligible ? JSON.stringify([evidence.ownerId, evidence.sessionId, evidence.creditedDate]) : "";
  const current = useRef(identity), [display, setDisplay] = useState({identity, claimed:false});
  // A different result or a hidden result cannot inherit the previous banner.
  if (display.identity !== identity) setDisplay({identity, claimed:false});
  useLayoutEffect(() => { current.current = identity; }, [identity]);
  useEffect(() => {
    if (!eligible || !evidence.ownerId || !evidence.creditedDate) return;
    let active = true;
    const isCurrent = () => active && current.current === identity;
    void claims.claim(evidence.ownerId, evidence.creditedDate, isCurrent).then(show => {
      if (show && isCurrent()) setDisplay({identity, claimed:true});
    });
    return () => { active = false; };
  }, [eligible, identity, evidence.ownerId, evidence.creditedDate]);
  return eligible && display.identity === identity && display.claimed;
}
