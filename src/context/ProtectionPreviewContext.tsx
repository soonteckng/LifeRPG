import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useAuth } from "./AuthContext";
import { useTimer } from "./TimerContext";
import { useUser } from "./UserContext";
import { sessionBackendIdentity } from "../utils/sessionBackend";
import { createProtectionCoordinator, idleProtection, protectionPreviewEnabled, type ProtectionMode, type ProtectionState } from "../services/nativeFocusProtection";

interface ProtectionPreviewValue {
  enabled: boolean; state: ProtectionState; available: boolean; busy: boolean; error: string;
  start(mode: ProtectionMode, allowed: string[]): Promise<boolean>; stop(): Promise<void>;
}
const PreviewContext = createContext<ProtectionPreviewValue | null>(null);
export function ProtectionPreviewProvider({ children }: { children: ReactNode }) {
  return protectionPreviewEnabled() ? <EnabledProtectionProvider>{children}</EnabledProtectionProvider> : <>{children}</>;
}
function EnabledProtectionProvider({ children }: { children: ReactNode }) {
  const auth = useAuth(), timer = useTimer(), { profile } = useUser();
  const enabled = protectionPreviewEnabled();
  const owner = auth.user?.id ?? auth.localOwner?.id ?? profile.id;
  const backend = auth.localOwner?.backendId ?? sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId;
  const scope = JSON.stringify([backend, owner, auth.admissionEpoch, timer.sessionId]);
  const available = !!(owner && backend && timer.sessionId && timer.hasOpenSession && timer.isRunning && timer.timeLeft > 0
    && !timer.isRestoring && !timer.restoreError && !timer.actionBusy && !timer.endingSession && !timer.awaitingStart && !timer.isCompleted);
  const latest = useRef({ scope, available, seconds: timer.timeLeft });
  useLayoutEffect(() => { latest.current = { scope, available, seconds: timer.timeLeft }; }, [scope, available, timer.timeLeft]);
  const coordinator = useRef<ReturnType<typeof createProtectionCoordinator> | null>(null);
  const lock = useRef(false);
  const [snapshot, setSnapshot] = useState<{ scope: string; value: ProtectionState }>({ scope: "", value: idleProtection });
  const [operation, setOperation] = useState<{ scope: string; busy: boolean; error: string }>({ scope: "", busy: false, error: "" });
  useEffect(() => {
    if (!enabled) return;
    let live = true, reading = false;
    const current = createProtectionCoordinator({ scope, current: () => latest.current.scope === scope && latest.current.available,
      newId: async () => { const { uuid } = await import("expo-modules-core"); return uuid.v4().toLowerCase(); } });
    coordinator.current = current;
    const read = async () => {
      if (!live || reading || AppState.currentState !== "active") return;
      reading = true;
      try { const value = await current.read(); if (live) setSnapshot({ scope, value }); }
      catch { if (live) setOperation({ scope, busy: false, error: "Could not check protection. Your timer is unchanged." }); }
      finally { reading = false; }
    };
    void read();
    const tick = setInterval(() => void read(), 1000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") void read(); });
    return () => { live = false; clearInterval(tick); listener.remove(); if (coordinator.current === current) coordinator.current = null; void current.dispose().catch(() => {}); };
  }, [scope, enabled]);
  useEffect(() => {
    if (enabled && !available) void coordinator.current?.read().then(value => {
      if (latest.current.scope === scope) setSnapshot({ scope, value });
    }).catch(() => {});
  }, [available, enabled, scope]);
  const start = async (mode: ProtectionMode, allowed: string[]) => {
    if (!enabled || !available || lock.current || !coordinator.current || AppState.currentState !== "active") return false;
    const current = coordinator.current, expected = scope;
    lock.current = true; setOperation({ scope, busy: true, error: "" });
    try {
      const value = await current.start({ seconds: Math.min(600, Math.max(1, Math.floor(latest.current.seconds))), title: "Your running session", mode, allowed });
      if (latest.current.scope !== expected) return false;
      if (!value) { setOperation({ scope, busy: false, error: "Protection is unavailable in this build. Your timer keeps working." }); return false; }
      setSnapshot({ scope, value }); return true;
    } catch (error) {
      if (latest.current.scope === expected) setOperation({ scope, busy: false, error: error instanceof Error ? error.message : "Protection did not start. Your timer keeps working." });
      return false;
    } finally { lock.current = false; setOperation(previous => previous.scope === expected ? { ...previous, busy: false } : previous); }
  };
  const stop = async () => {
    // Stop is always reachable, including while a start request is resolving.
    const current = coordinator.current; if (!current) return;
    try { await current.stop(); const value = await current.read(); if (latest.current.scope === scope) setSnapshot({ scope, value }); }
    catch { if (latest.current.scope === scope) setOperation({ scope, busy: false, error: "Use Stop protection in the notification if this control is unavailable." }); }
  };
  return <PreviewContext.Provider value={{ enabled, available, state: snapshot.scope === scope ? snapshot.value : idleProtection,
    busy: operation.scope === scope && operation.busy, error: operation.scope === scope ? operation.error : "", start, stop }}>{children}</PreviewContext.Provider>;
}
export function useProtectionPreview() { return useContext(PreviewContext); }
