import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "../context/AuthContext";
import { savedRoutineStore } from "../services/savedRoutineService";
import { sessionBackendIdentity } from "../utils/sessionBackend";
import type { RoutineDraft } from "../types/savedRoutine";

export function useSavedRoutines() {
  const auth = useAuth();
  const ownerId = auth.user?.id ?? auth.localOwner?.id ?? null;
  const backendId = auth.localOwner?.backendId ?? sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId ?? null;
  const scope = useMemo(() => ownerId && backendId ? { ownerId, backendId } : null, [ownerId, backendId]);
  const subscribe = useCallback((listener: () => void) => savedRoutineStore.subscribe(scope, listener), [scope]);
  const snapshot = useCallback(() => savedRoutineStore.snapshot(scope), [scope]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { if (scope) void savedRoutineStore.load(scope); }, [scope]);
  return { ...state, scope, online: auth.accessMode === "online",
    save: (draft: RoutineDraft, id?: string) => scope ? savedRoutineStore.save(scope, draft, id) : Promise.resolve(false),
    remove: (id: string) => scope ? savedRoutineStore.remove(scope, id) : Promise.resolve(false),
    retry: () => scope ? savedRoutineStore.load(scope) : Promise.resolve(),
    resolveConflict: (id: string, keepMine: boolean) => scope ? savedRoutineStore.resolveConflict(scope, id, keepMine) : Promise.resolve(false),
  };
}
