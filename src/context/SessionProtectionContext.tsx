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
import { createSessionProtectionController, normalProtection, readProtectionSelection, type ProtectionBinding, type ProtectionSelection, type ProtectionSessionProjection } from "../services/sessionProtection";

export type { ProtectionSelection } from "../services/sessionProtection";
export interface SessionProtectionValue {
  supported: boolean; loaded: boolean; busy: boolean; selection: ProtectionSelection;
  sessionSelection: ProtectionSelection | null;
  state: ProtectionState; active: boolean; error: string; capabilities: ProtectionCapabilities | null; apps: ProtectionApp[];
  choose(mode: ProtectionSelection["mode"], allowed?: string[]): Promise<boolean>;
  refresh(): Promise<void>; openPermission(kind: "usage" | "overlay"): Promise<void>; stop(): Promise<void>;
}
const fallback: SessionProtectionValue = { supported: false, loaded: true, busy: false, selection: normalProtection, sessionSelection: null,
  state: idleProtection, active: false, error: "", capabilities: null, apps: [], choose: async () => false, refresh: async () => {}, openPermission: async () => {}, stop: async () => {} };
const blockAppsSelection: ProtectionSelection = { mode: "essentials", allowed: [] };
const sameCapabilities = (left: ProtectionCapabilities | null, right: ProtectionCapabilities | null) => left === right || !!left && !!right
  && left.supported === right.supported && left.usage === right.usage && left.overlay === right.overlay && left.notifications === right.notifications;
// The timer owns its countdown. Protection consumers only display lease identity,
// status and errors, so native seconds must not invalidate the entire UI each tick.
const sameProtectionState = (left: ProtectionState, right: ProtectionState) => left.id === right.id && left.scope === right.scope
  && left.status === right.status && left.covers === right.covers;
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
  const [result, setResult] = useState<{ ownerKey: string | null; state: ProtectionState; error: string; binding?: ProtectionBinding | null }>({ ownerKey: null, state: idleProtection, error: "" });
  const [busy, setBusy] = useState(false);
  const latest = useRef({ ownerKey, preferenceKey, viewScope, hasOpenSession: timer.hasOpenSession });
  const savedSelection = preferences.key === preferenceKey ? preferences.selection : normalProtection;
  const currentSelection = useMemo(() => timer.protectedSession && savedSelection.mode === "normal" ? blockAppsSelection : savedSelection, [timer.protectedSession, savedSelection]);
  const sessionSelection = result.binding?.ownerKey === ownerKey && result.binding.sessionKey === (timer.protectionSessionId ?? timer.sessionId)
    ? result.binding.selection : null;
  const loaded = preferences.key === preferenceKey && preferences.loaded;
  const controller = useRef<ReturnType<typeof createSessionProtectionController> | null>(null);
  const operation = useRef(0), read = useRef(0), choiceRevision = useRef(0), writes = useRef<Promise<unknown>>(Promise.resolve());
  const deviceLifetime = useRef({ active: true });
  const appScan = useRef<Promise<ProtectionApp[]> | null>(null);
  useLayoutEffect(() => { latest.current = { ownerKey, preferenceKey, viewScope, hasOpenSession: timer.hasOpenSession }; }, [ownerKey, preferenceKey, viewScope, timer.hasOpenSession]);
  const readDevice = useCallback(async (includeApps: boolean) => {
    const request = ++read.current;
    const lifetime = deviceLifetime.current;
    const native = await getSessionProtectionModule();
    if (!native) { if (lifetime.active && request === read.current) setDevice(current => current.caps === null && !current.apps.length ? current : { caps: null, apps: [] }); return; }
    try {
      // App inventory can be expensive on phones with many apps. Only the
      // explicit chooser refresh needs labels; foreground checks need permissions.
      const permissions = native.capabilities().then(caps => {
        if (lifetime.active && request === read.current) setDevice(current => sameCapabilities(current.caps, caps) ? current : { ...current, caps });
      });
      let apps: Promise<void> | undefined;
      if (includeApps) {
        if (!appScan.current) appScan.current = native.apps().finally(() => { appScan.current = null; });
        apps = appScan.current.then(items => {
          if (lifetime.active) setDevice(current => current.apps === items ? current : { ...current, apps: items });
        });
      }
      await Promise.all([permissions, apps]);
    } catch { if (lifetime.active && request === read.current) setResult(current => ({ ...(current.ownerKey === latest.current.ownerKey ? current : { ownerKey: latest.current.ownerKey, state: idleProtection, binding: null }), error: "Could not read app protection settings. Your timer is still available." })); }
  }, []);
  const refresh = useCallback(() => readDevice(true), [readDevice]);
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
      publish: (state, error, binding) => setResult(current => current.ownerKey === latest.current.ownerKey && current.error === error && sameProtectionState(current.state, state)
        && JSON.stringify(current.binding ?? null) === JSON.stringify(binding)
        ? current : { ownerKey: latest.current.ownerKey, state, error, binding }) });
    controller.current = instance;
    return () => { if (controller.current === instance) controller.current = null; void instance.dispose(); };
  }, []);
  const projection = useRef<ProtectionSessionProjection>({ ownerKey, sessionKey: timer.protectionSessionId ?? timer.sessionId, restoring: timer.isRestoring || !loaded,
    running: timer.isRunning, breakEndsAtMs: timer.breakEndsAtMs, ending: timer.endingSession || timer.isCompleted || timer.sessionEnded, seconds: timer.timeLeft,
    title: readSuggestedFocus(timer.notes)?.title ?? readRoutineSession(timer.notes) ?? "Your session", selection: currentSelection });
  useLayoutEffect(() => {
    projection.current = { ownerKey, sessionKey: timer.protectionSessionId ?? timer.sessionId, restoring: timer.isRestoring || !loaded,
      running: timer.isRunning, breakEndsAtMs: timer.breakEndsAtMs, ending: timer.endingSession || timer.isCompleted || timer.sessionEnded, seconds: timer.timeLeft,
      title: readSuggestedFocus(timer.notes)?.title ?? readRoutineSession(timer.notes) ?? "Your session", selection: timer.protectedSession && currentSelection.mode === "normal" ? { mode: "essentials" as const, allowed: [] } : currentSelection,
      capturedAtMs: Date.now() };
  });
  const expired = timer.timeLeft <= 0;
  // Immediate session transitions drive commands. The single poll below reads
  // native interruption status; timer numerals do not also trigger bridge reads.
  useEffect(() => { void controller.current?.update(projection.current); }, [ownerKey, loaded, currentSelection, timer.protectionSessionId, timer.sessionId, timer.isRestoring, timer.isRunning, timer.endingSession, timer.isCompleted, timer.sessionEnded, expired, timer.breakEndsAtMs, timer.protectedSession]);
  useEffect(() => {
    const lifetime = { active: true }; deviceLifetime.current = lifetime;
    const initialRead = setTimeout(() => void readDevice(false), 0);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") { void readDevice(false); void controller.current?.update(projection.current); } });
    const poll = setInterval(() => { if (AppState.currentState === "active" && projection.current.sessionKey) void controller.current?.update(projection.current); }, 1000);
    return () => { lifetime.active = false; clearTimeout(initialRead); foreground.remove(); clearInterval(poll); };
  }, [readDevice]);
  const choose = useCallback(async (mode: ProtectionSelection["mode"], allowed: string[] = []) => {
    const expected = latest.current.preferenceKey, expectedOwner = latest.current.ownerKey;
    if (!expected || latest.current.viewScope !== viewScope || busy && mode !== "normal"
      || (mode !== "normal" && !!result.state.id && result.ownerKey === expectedOwner)
      || (latest.current.hasOpenSession && (!sessionSelection || mode === "normal" || mode !== sessionSelection.mode
        || JSON.stringify([...new Set(allowed)].sort()) !== JSON.stringify([...sessionSelection.allowed].sort())))) return false;
    const request = ++operation.current; setBusy(true);
    const selection = readProtectionSelection({ mode, allowed });
    try {
      if (mode !== "normal") {
        const native = await getSessionProtectionModule(), caps = native ? await native.capabilities() : null;
        if (latest.current.preferenceKey !== expected || latest.current.viewScope !== viewScope || operation.current !== request) return false;
        if (!caps?.supported || !caps.usage || !caps.overlay || !caps.notifications) { setResult(current => ({ ...current, ownerKey: expectedOwner, error: "Allow the protection permissions below before starting a new session." })); return false; }
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
    } catch { if (latest.current.preferenceKey === expected) setResult(current => ({ ...current, ownerKey: expectedOwner, error: "Could not save that choice. Your timer is unchanged." })); return false; }
    finally { if (operation.current === request) setBusy(false); }
  }, [busy, sessionSelection, result.ownerKey, result.state, viewScope]);
  const openPermission = useCallback(async (kind: "usage" | "overlay") => {
    try { const native = await getSessionProtectionModule(); if (native) await native.openPermission(kind); }
    catch { setResult(current => current.ownerKey === ownerKey ? { ...current, error: "Couldn’t open Android Settings. Open LifeRPG’s app info to review this permission." } : current); }
  }, [ownerKey]);
  const stop = useCallback(async () => { await choose("normal"); }, [choose]);
  const state = result.ownerKey === ownerKey ? result.state : idleProtection;
  const error = result.ownerKey === ownerKey ? result.error : "";
  const value = useMemo<SessionProtectionValue>(() => ({ supported: !!device.caps?.supported, loaded, busy, selection: currentSelection, sessionSelection,
    state, active: !!state.id && ["starting", "active"].includes(state.status), error,
    capabilities: device.caps, apps: device.apps, choose, refresh, openPermission, stop }), [device, loaded, busy, currentSelection, sessionSelection, state, error, choose, refresh, openPermission, stop]);
  return <ProtectionContext.Provider value={value}>{children}</ProtectionContext.Provider>;
}
