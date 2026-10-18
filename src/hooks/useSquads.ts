import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useAuth } from "../context/AuthContext";
import { createSquadTransport, squadStore } from "../services/squadService";
import { sessionBackendIdentity } from "../utils/sessionBackend";

export function useSquads() {
  const auth = useAuth();
  const ownerId = auth.user?.id ?? auth.localOwner?.id ?? null;
  const backendId = auth.localOwner?.backendId ?? sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId ?? null;
  const scope = useMemo(() => ownerId && backendId ? { ownerId, backendId } : null, [ownerId, backendId]);
  const online = auth.accessMode === "online";
  const verifier = useRef(auth.verifyCurrentOwner);
  useLayoutEffect(() => { verifier.current = auth.verifyCurrentOwner; }, [auth.verifyCurrentOwner]);
  // Built when used, never during render, so the verifier ref is read only then.
  const transport = useCallback(() => scope && online ? createSquadTransport(scope, async () => {
    const owner = await verifier.current();
    return owner?.backendId === scope.backendId ? owner.id : null;
  }) : null, [scope, online]);
  const subscribe = useCallback((listener: () => void) => squadStore.subscribe(scope, listener), [scope]);
  const snapshot = useCallback(() => squadStore.snapshot(scope), [scope]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  const refresh = useCallback(() => scope ? squadStore.load(scope, transport()) : Promise.resolve(), [scope, transport]);
  useEffect(() => { void refresh(); }, [refresh]);
  const offline = "Connect to the internet to use squads.";
  const run = <T,>(work: (s: NonNullable<typeof scope>, t: NonNullable<ReturnType<typeof transport>>) => Promise<T>, fallback: T) => {
    const live = transport(); return scope && live ? work(scope, live) : Promise.resolve(fallback);
  };
  return { ...state, online: !!scope && online, refresh,
    create: (name: string) => run((s, t) => squadStore.create(s, t, name), offline as string | null),
    join: (code: string) => run((s, t) => squadStore.join(s, t, code), offline as string | null),
    leave: (id: string) => run((s, t) => squadStore.leave(s, t, id), offline as string | null),
    remove: (id: string, member: string) => run((s, t) => squadStore.remove(s, t, id, member), offline as string | null),
    update: (id: string, change: { name: string; goalMinutes: number | null } | "code") => run((s, t) => squadStore.update(s, t, id, change), offline as string | null),
  };
}
