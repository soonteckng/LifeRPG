import { getSessionProtectionModule, idleProtection, type ProtectionMode, type ProtectionModule, type ProtectionState } from "./nativeFocusProtection";

export interface ProtectionSelection { mode: "normal" | ProtectionMode; allowed: string[] }
export const normalProtection: ProtectionSelection = { mode: "normal", allowed: [] };
export function readProtectionSelection(raw: unknown): ProtectionSelection {
  if (!raw || typeof raw !== "object") return { ...normalProtection };
  const value = raw as Partial<ProtectionSelection>;
  if (!["normal", "allow-list", "essentials"].includes(value.mode ?? "") || !Array.isArray(value.allowed)
    || value.allowed.length > 64 || value.allowed.some(pkg => typeof pkg !== "string" || !/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+$/.test(pkg))) return { ...normalProtection };
  return { mode: value.mode!, allowed: value.mode === "allow-list" ? [...new Set(value.allowed)] : [] };
}
export interface ProtectionSessionProjection {
  ownerKey: string | null; sessionKey: string | null; restoring: boolean; running: boolean;
  breakEndsAtMs?: number | null; ending: boolean; seconds: number; title: string; selection: ProtectionSelection;
}
interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
const bindingKey = (owner: string) => `liferpg:session-protection:binding:v2:${owner}`;
function checked(value: ProtectionState) {
  if (!value || !["idle", "starting", "active", "paused", "stopped", "finished", "interrupted", "permission-lost"].includes(value.status)
    || !Number.isInteger(value.secondsLeft) || value.secondsLeft < 0 || value.secondsLeft > 28800
    || (value.id !== null && typeof value.id !== "string") || (value.scope !== null && typeof value.scope !== "string")) throw Error("Could not check app protection.");
  return value;
}
/** Serialized native projection; session/reward authority always stays in the existing journal. */
export function createSessionProtectionController(options: { storage: Storage; newId(): string; resolve?: () => Promise<ProtectionModule | null>; publish(state: ProtectionState, error: string): void }) {
  let latest: ProtectionSessionProjection | null = null, disposed = false, revision = 0;
  let bound: { ownerKey: string; sessionKey: string; selection: ProtectionSelection } | null = null;
  const breakLeases = new Set<string>();
  let suppressed = "", explicitlyEnabled = "", ownedId: string | null = null, working = false, dirty = false;
  const native = options.resolve ?? getSessionProtectionModule;
  const same = (value: ProtectionSessionProjection) => !disposed && latest?.ownerKey === value.ownerKey && latest?.sessionKey === value.sessionKey;
  const canRun = (value: ProtectionSessionProjection) => same(value) && (!!latest?.running || !!latest?.breakEndsAtMs && latest.breakEndsAtMs > Date.now()) && !latest.ending && !latest.restoring && latest.seconds > 0;
  const bounded = <T,>(promise: Promise<T>) => new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error("App protection is taking longer than expected. Your timer still works.")), 5000);
    promise.then(value => { clearTimeout(timeout); resolve(value); }, error => { clearTimeout(timeout); reject(error); });
  });
  const release = async (module: ProtectionModule, id: string, paused = false) => {
    breakLeases.delete(id);
    if (ownedId === id) ownedId = null;
    return bounded(paused && module.pause ? module.pause(id) : module.stop(id));
  };
  const pass = async () => {
    const input = latest; if (!input || disposed) return;
    const nativeModule = await native(); if (!nativeModule || !same(input)) return;
    let state = checked(await bounded(nativeModule.state()));
    if (!same(input)) return;
    ownedId = state.id;
    // Wait for the existing journal to restore before judging its saved native lease.
    if (input.restoring && input.ownerKey) {
      let savedOwner: unknown;
      try { savedOwner = state.scope ? JSON.parse(state.scope)[0] : null; } catch { savedOwner = null; }
      if (state.id && savedOwner !== input.ownerKey) state = checked(await release(nativeModule, state.id));
      if (same(input)) options.publish(state, ""); return;
    }
    const scope = input.ownerKey && input.sessionKey ? JSON.stringify([input.ownerKey, input.sessionKey]) : null;
    if (state.id && (state.scope !== scope || !input.running && !input.breakEndsAtMs || input.ending || input.seconds <= 0)) {
      state = checked(await release(nativeModule, state.id, state.scope === scope && !input.ending && input.seconds > 0));
      if (!same(input)) return;
    }
    if (!scope || !input.ownerKey || !input.sessionKey || input.ending || input.seconds <= 0) { bound = null; options.publish(state, ""); return; }
    if (bound?.ownerKey !== input.ownerKey || bound.sessionKey !== input.sessionKey) {
      let saved: typeof bound = null;
      try { const raw = await options.storage.getItem(bindingKey(input.ownerKey)); saved = raw ? JSON.parse(raw) : null; } catch { /* A malformed local preference must never block normal sessions. */ }
      if (!same(input)) return;
      bound = { ownerKey: input.ownerKey, sessionKey: input.sessionKey,
        selection: readProtectionSelection(saved?.ownerKey === input.ownerKey && saved.sessionKey === input.sessionKey ? saved.selection : input.selection) };
      await options.storage.setItem(bindingKey(input.ownerKey), JSON.stringify(bound));
      if (!same(input)) return;
    }
    if (state.scope === scope && explicitlyEnabled !== scope && ["stopped", "interrupted", "permission-lost"].includes(state.status)) suppressed = scope;
    if ((!input.running && !input.breakEndsAtMs) || suppressed === scope || bound.selection.mode === "normal") {
      options.publish(state, suppressed === scope ? state.status === "permission-lost" ? "App protection stopped because a permission changed. Your timer is still available." : "App protection is off for this session. You can enable it again when you return." : ""); return;
    }
    if (state.id && state.scope === scope) {
      if (input.breakEndsAtMs && input.breakEndsAtMs > Date.now() && nativeModule.takeBreak && !breakLeases.has(state.id)) { await bounded(nativeModule.takeBreak(state.id, Math.max(1, Math.min(300000, input.breakEndsAtMs - Date.now())))); breakLeases.add(state.id); }
      else if ((!input.breakEndsAtMs || input.breakEndsAtMs <= Date.now()) && nativeModule.endBreak) await bounded(nativeModule.endBreak(state.id));
      options.publish(state, ""); return;
    }
    const request = revision, caps = await bounded(nativeModule.capabilities());
    if (!canRun(input) || request !== revision) return;
    if (!caps.supported || !caps.usage || !caps.overlay || !caps.notifications) {
      suppressed = scope; options.publish({ ...idleProtection, scope, status: "permission-lost" }, "Allow the optional protection permissions to protect this session."); return;
    }
    const id = options.newId(); ownedId = id;
    const seconds = Math.max(1, Math.min(28800, Math.floor(latest!.seconds)));
    try {
      state = checked(await bounded(nativeModule.start(JSON.stringify({ version: 2, id, scope, title: input.title.slice(0, 120) || "Your session", seconds, mode: bound.selection.mode, allowed: [...bound.selection.allowed] }))));
      if (!canRun(input) || request !== revision) { await release(nativeModule, id); return; }
      if (state.id !== id || state.scope !== scope || !["starting", "active"].includes(state.status)) throw Error("App protection could not start. Your timer is still running.");
      if (input.breakEndsAtMs && input.breakEndsAtMs > Date.now() && nativeModule.takeBreak) { await bounded(nativeModule.takeBreak(id, Math.max(1, Math.min(300000, input.breakEndsAtMs - Date.now())))); breakLeases.add(id); }
      explicitlyEnabled = ""; options.publish(state, "");
    } catch (error) { await release(nativeModule, id).catch(() => {}); if (same(input)) { suppressed = scope; options.publish({ ...idleProtection, scope, status: "interrupted" }, error instanceof Error ? error.message : "App protection could not start."); } }
  };
  const flush = async () => {
    if (working || disposed) return;
    working = true;
    try { while (dirty && !disposed) { dirty = false; try { await pass(); } catch (error) { if (!disposed) options.publish(idleProtection, error instanceof Error ? error.message : "Could not check app protection."); } } }
    finally { working = false; }
  };
  return {
    update(input: ProtectionSessionProjection) {
      if (latest?.ownerKey !== input.ownerKey || latest.sessionKey !== input.sessionKey || latest.running !== input.running || latest.ending !== input.ending) revision++;
      latest = { ...input, selection: readProtectionSelection(input.selection) }; dirty = true; return flush();
    },
    async enable(selection: ProtectionSelection) {
      const input = latest; if (!input?.ownerKey || !input.sessionKey) return;
      revision++; suppressed = ""; explicitlyEnabled = JSON.stringify([input.ownerKey, input.sessionKey]);
      bound = { ownerKey: input.ownerKey, sessionKey: input.sessionKey, selection: readProtectionSelection(selection) };
      await options.storage.setItem(bindingKey(input.ownerKey), JSON.stringify(bound));
      // Clear an explicit native stop marker by starting a fresh lease on this choice.
      if (same(input)) { suppressed = ""; dirty = true; return flush(); }
    },
    async stop() {
      revision++; explicitlyEnabled = "";
      if (latest?.ownerKey && latest.sessionKey) suppressed = JSON.stringify([latest.ownerKey, latest.sessionKey]);
      const id = ownedId, module = await native(); if (id && module) { const state = checked(await release(module, id)); if (!disposed) options.publish(state, "App protection is off. Your timer continues."); }
    },
    async dispose() { disposed = true; revision++; const id = ownedId, module = await native(); if (id && module) await release(module, id).catch(() => {}); },
  };
}
