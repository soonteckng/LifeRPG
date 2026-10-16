import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { uuid } from "expo-modules-core";
import { useAuth } from "./AuthContext";
import { useTimer } from "./TimerContext";
import { sessionBackendIdentity } from "../utils/sessionBackend";
import { readSuggestedFocus } from "../constants/guidedQuests";
import { readRoutineSession } from "../utils/routineSession";
import { getSessionProtectionModule, idleProtection, type ProtectionApp, type ProtectionCapabilities, type ProtectionState } from "../services/nativeFocusProtection";
import { createSessionProtectionController, normalProtection, readProtectionSelection, type ProtectionSelection } from "../services/sessionProtection";

export type { ProtectionSelection } from "../services/sessionProtection";
export interface SessionProtectionValue {
  supported: boolean; loaded: boolean; busy: boolean; selection: ProtectionSelection;
  state: ProtectionState; active: boolean; error: string; capabilities: ProtectionCapabilities | null; apps: ProtectionApp[];
  choose(mode: ProtectionSelection["mode"], allowed?: string[]): Promise<boolean>;
  refresh(): Promise<void>; openPermission(kind: "usage" | "overlay"): Promise<void>; stop(): Promise<void>;
}
const fallback: SessionProtectionValue = { supported: false, loaded: true, busy: false, selection: normalProtection,
  state: idleProtection, active: false, error: "", capabilities: null, apps: [], choose: async () => false, refresh: async () => {}, openPermission: async () => {}, stop: async () => {} };
const blockAppsSelection: ProtectionSelection = { mode: "essentials", allowed: [] };
const ProtectionContext = createContext<SessionProtectionValue>(fallback);
export function useSessionProtection() { return useContext(ProtectionContext); }
export function SessionProtectionProvider({ children }: { children: ReactNode }) {
  const auth = useAuth(), timer = useTimer();
  const owner = auth.user?.id ?? auth.localOwner?.id;
  const backend = auth.localOwner?.backendId ?? sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId;
  const ownerKey = owner && backend ? JSON.stringify([backend, owner]) : null;
  const preferenceKey = ownerKey ? `liferpg:session-protection:choice:v2:${ownerKey}` : null;
  const viewScope = JSON.stringify([ownerKey, auth.admissionEpoch, timer.protectionSessionId ?? timer.sessionId, timer.hasOpenSession]);
  const [preferences, setPreferences] = useState<{ key: string | null; loaded: boolean; selection: ProtectionSelection }>({ key: null, loaded: false, selection: normalProtection });
  const [device, setDevice] = useState<{ caps: ProtectionCapabilities | null; apps: ProtectionApp[] }>({ caps: null, apps: [] });
  const [result, setResult] = useState<{ ownerKey: string | null; state: ProtectionState; error: string }>({ ownerKey: null, state: idleProtection, error: "" });
  const [busy, setBusy] = useState(false);
  const latest = useRef({ ownerKey, preferenceKey, viewScope, hasOpenSession: timer.hasOpenSession });
  const savedSelection = preferences.key === preferenceKey ? preferences.selection : normalProtection;
  const currentSelection = useMemo(() => timer.protectedSession && savedSelection.mode === "normal" ? blockAppsSelection : savedSelection, [timer.protectedSession, savedSelection]);
  const loaded = preferences.key === preferenceKey && preferences.loaded;
  const controller = useRef<ReturnType<typeof createSessionProtectionController> | null>(null);
  const operation = useRef(0), read = useRef(0), choiceRevision = useRef(0), writes = useRef<Promise<unknown>>(Promise.resolve());
  const deviceLifetime = useRef({ active: true });
  useLayoutEffect(() => { latest.current = { ownerKey, preferenceKey, viewScope, hasOpenSession: timer.hasOpenSession }; }, [ownerKey, preferenceKey, viewScope, timer.hasOpenSession]);
  const refresh = useCallback(async () => {
    const request = ++read.current;
    const lifetime = deviceLifetime.current;
    const native = await getSessionProtectionModule();
    if (!native) { if (lifetime.active && request === read.current) setDevice({ caps: null, apps: [] }); return; }
    try {
      const [caps, apps] = await Promise.all([native.capabilities(), native.apps()]);
      if (lifetime.active && request === read.current) setDevice({ caps, apps });
    } catch { if (lifetime.active && request === read.current) setResult({ ownerKey: latest.current.ownerKey, state: idleProtection, error: "Could not read app protection settings. Your timer is still available." }); }
  }, []);
  useEffect(() => {
    let live = true;
    const revision = choiceRevision.current;
    void (async () => {
      let selection: ProtectionSelection = { mode: "essentials", allowed: [] };
      try { const raw = preferenceKey ? await AsyncStorage.getItem(preferenceKey) : null; selection = raw ? readProtectionSelection(JSON.parse(raw)) : selection; } catch { /* Default to normal when the optional preference is unreadable. */ }
      if (live && revision === choiceRevision.current) setPreferences({ key: preferenceKey, loaded: true, selection });
    })();
    return () => { live = false; };
  }, [preferenceKey]);
  useEffect(() => {
    const instance = createSessionProtectionController({ storage: AsyncStorage, newId: () => uuid.v4().toLowerCase(),
      publish: (state, error) => setResult({ ownerKey: latest.current.ownerKey, state, error }) });
    controller.current = instance;
    return () => { if (controller.current === instance) controller.current = null; void instance.dispose(); };
  }, []);
  const projection = useRef({ ownerKey, sessionKey: timer.protectionSessionId ?? timer.sessionId, restoring: timer.isRestoring || !loaded,
    running: timer.isRunning, breakEndsAtMs: timer.breakEndsAtMs, ending: timer.endingSession || timer.isCompleted || timer.sessionEnded, seconds: timer.timeLeft,
    title: readSuggestedFocus(timer.notes)?.title ?? readRoutineSession(timer.notes) ?? "Your session", selection: currentSelection });
  useLayoutEffect(() => {
    projection.current = { ownerKey, sessionKey: timer.protectionSessionId ?? timer.sessionId, restoring: timer.isRestoring || !loaded,
      running: timer.isRunning, breakEndsAtMs: timer.breakEndsAtMs, ending: timer.endingSession || timer.isCompleted || timer.sessionEnded, seconds: timer.timeLeft,
      title: readSuggestedFocus(timer.notes)?.title ?? readRoutineSession(timer.notes) ?? "Your session", selection: timer.protectedSession && currentSelection.mode === "normal" ? { mode: "essentials" as const, allowed: [] } : currentSelection };
  });
  useEffect(() => { void controller.current?.update(projection.current); }, [ownerKey, loaded, currentSelection, timer.protectionSessionId, timer.sessionId, timer.isRestoring, timer.isRunning, timer.endingSession, timer.isCompleted, timer.sessionEnded, timer.timeLeft, timer.breakEndsAtMs, timer.protectedSession]);
  useEffect(() => {
    const lifetime = { active: true }; deviceLifetime.current = lifetime;
    const initialRead = setTimeout(() => void refresh(), 0);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") { void refresh(); void controller.current?.update(projection.current); } });
    const poll = setInterval(() => { if (AppState.currentState === "active") void controller.current?.update(projection.current); }, 1000);
    return () => { lifetime.active = false; clearTimeout(initialRead); foreground.remove(); clearInterval(poll); };
  }, [refresh]);
  const choose = async (mode: ProtectionSelection["mode"], allowed: string[] = []) => {
    const expected = latest.current.preferenceKey, expectedOwner = latest.current.ownerKey;
    if (!expected || latest.current.viewScope !== viewScope || busy && mode !== "normal"
      || (mode !== "normal" && !!result.state.id && result.ownerKey === expectedOwner)
      || (mode !== "normal" && latest.current.hasOpenSession && mode !== currentSelection.mode)) return false;
    const request = ++operation.current; setBusy(true);
    const selection = readProtectionSelection({ mode, allowed });
    try {
      if (mode !== "normal") {
        const native = await getSessionProtectionModule(), caps = native ? await native.capabilities() : null;
        if (latest.current.preferenceKey !== expected || latest.current.viewScope !== viewScope || operation.current !== request) return false;
        if (!caps?.supported || !caps.usage || !caps.overlay || !caps.notifications) { setResult({ ownerKey: expectedOwner, state: result.state, error: "Allow the optional permissions below, or choose Normal to use the timer." }); return false; }
      }
      if (latest.current.preferenceKey !== expected || latest.current.viewScope !== viewScope || operation.current !== request) return false;
      choiceRevision.current++;
      writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(expected, JSON.stringify(selection)));
      await writes.current;
      if (latest.current.preferenceKey !== expected || latest.current.viewScope !== viewScope || operation.current !== request) return false;
      setPreferences({ key: expected, loaded: true, selection });
      if (selection.mode === "normal") await controller.current?.stop();
      else if (latest.current.hasOpenSession) await controller.current?.enable(selection);
      return true;
    } catch { if (latest.current.preferenceKey === expected) setResult({ ownerKey: expectedOwner, state: result.state, error: "Could not save that choice. Your timer is unchanged." }); return false; }
    finally { if (operation.current === request) setBusy(false); }
  };
  const openPermission = async (kind: "usage" | "overlay") => {
    try { const native = await getSessionProtectionModule(); if (native) await native.openPermission(kind); }
    catch { setResult({ ownerKey, state: result.state, error: "You can change this permission in Android Settings." }); }
  };
  const state = result.ownerKey === ownerKey ? result.state : idleProtection;
  return <ProtectionContext.Provider value={{ supported: !!device.caps?.supported, loaded, busy, selection: currentSelection,
    state, active: !!state.id && ["starting", "active"].includes(state.status), error: result.ownerKey === ownerKey ? result.error : "",
    capabilities: device.caps, apps: device.apps, choose, refresh, openPermission, stop: async () => { await choose("normal"); } }}>{children}</ProtectionContext.Provider>;
}
