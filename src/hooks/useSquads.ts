import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
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
  useLiveRefresh(refresh, online);
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

// How often a squad on screen checks who is focusing now.
const LIVE_EVERY = 30_000;

/**
 * Keeps a squad on screen current: it reloads when the screen comes into view,
 * when the app comes back to the front, every half minute while shown, and
 * right after your own session starts or ends, so "focusing now" is never stale.
 */
function useLiveRefresh(refresh: () => Promise<void>, online: boolean) {
  const shown = useRef(false), latest = useRef(refresh);
  useLayoutEffect(() => { latest.current = refresh; }, [refresh]);
  useFocusEffect(useCallback(() => {
    shown.current = true;
    void latest.current();
    const poll = online ? setInterval(() => { if (AppState.currentState === "active") void latest.current(); }, LIVE_EVERY) : null;
    const app = AppState.addEventListener("change", state => { if (state === "active") void latest.current(); });
    return () => { shown.current = false; if (poll) clearInterval(poll); app.remove(); };
  }, [online]));
  const timer = useTimer({ live: false });
  const yours = `${timer.sessionId ?? ""}|${timer.hasOpenSession}|${timer.isRunning}|${timer.sessionEnded}|${timer.sessionSummary ? 1 : 0}`;
  const previous = useRef(yours);
  useEffect(() => {
    if (previous.current === yours) return;
    previous.current = yours;
    // A moment for the server to record the change, then read it back.
    const soon = setTimeout(() => { void latest.current(); }, 800);
    return () => clearTimeout(soon);
  }, [yours]);
}
