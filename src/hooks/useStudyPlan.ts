import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "../context/AuthContext";
import { studyPlanStore } from "../services/studyPlanService";
import { sessionBackendIdentity } from "../utils/sessionBackend";
import type { StudyCourseDraft, StudyExamDraft } from "../types/studyPlan";

export function useStudyPlan() {
  const auth = useAuth();
  const ownerId = auth.user?.id ?? auth.localOwner?.id ?? null;
  const backendId = auth.localOwner?.backendId ?? sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId ?? null;
  const scope = useMemo(() => ownerId && backendId ? { ownerId, backendId } : null, [ownerId, backendId]);
  const subscribe = useCallback((listener: () => void) => studyPlanStore.subscribe(scope, listener), [scope]);
  const snapshot = useCallback(() => studyPlanStore.snapshot(scope), [scope]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { if (scope) void studyPlanStore.load(scope); }, [scope]);
  return { ...state, scope, online: auth.accessMode === "online",
    saveCourse: (draft: StudyCourseDraft, id?: string) => scope ? studyPlanStore.saveCourse(scope, draft, id) : Promise.resolve(false),
    saveExam: (draft: StudyExamDraft, id?: string) => scope ? studyPlanStore.saveExam(scope, draft, id) : Promise.resolve(false),
    remove: (kind: "course" | "exam", id: string) => scope ? studyPlanStore.remove(scope, kind, id) : Promise.resolve(false),
  };
}
