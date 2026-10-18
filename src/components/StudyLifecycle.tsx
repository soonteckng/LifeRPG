import { useEffect, useLayoutEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { createStudyTransport, studyPlanStore } from "../services/studyPlanService";
import { studySelection } from "../services/studySelection";

let latestSync: (() => void) | null = null;
/** Asks the mounted lifecycle to sync now, e.g. when the Study tab gains focus. */
export function requestStudySync() { latestSync?.(); }

/** Keeps exams and subjects in sync and counts sessions toward the picked subject. */
export default function StudyLifecycle() {
  const auth = useAuth();
  const { verifyCurrentOwner } = auth;
  const { scope, ready, pendingCount } = useStudyPlan();
  const { protectionSessionId, isCompleted } = useTimer();
  const ownerVerifier = useRef(verifyCurrentOwner);
  useLayoutEffect(() => { ownerVerifier.current = verifyCurrentOwner; }, [verifyCurrentOwner]);
  const syncNow = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!scope || !ready || auth.accessMode !== "online") return;
    let active = true;
    const transport = createStudyTransport(scope, async () => {
      const owner = await ownerVerifier.current();
      return owner?.backendId === scope.backendId ? owner.id : null;
    });
    const sync = () => { if (active && AppState.currentState === "active") void studyPlanStore.sync(scope, transport, () => active); };
    syncNow.current = sync; latestSync = sync; sync();
    const interval = setInterval(() => { if (studyPlanStore.snapshot(scope).pendingCount) sync(); }, 15000);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") sync(); });
    return () => { active = false; if (syncNow.current === sync) syncNow.current = null; if (latestSync === sync) latestSync = null; clearInterval(interval); foreground.remove(); };
  }, [scope, ready, auth.accessMode, auth.admissionEpoch]);
  useEffect(() => { if (pendingCount) syncNow.current?.(); }, [pendingCount]);
  // A finished session changes subject totals; refresh once it is recorded.
  useEffect(() => { if (isCompleted) syncNow.current?.(); }, [isCompleted]);
  useEffect(() => {
    const courseId = studySelection.take(protectionSessionId);
    if (courseId && scope && protectionSessionId) void studyPlanStore.tagSession(scope, protectionSessionId, courseId);
  }, [protectionSessionId, scope]);
  return null;
}
