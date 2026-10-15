export type ProtectionMode = "allow-list" | "essentials";
export interface ProtectionState { id: string | null; scope: string | null; status: string; secondsLeft: number; covers: number }
export interface ProtectionCapabilities { supported: boolean; usage: boolean; overlay: boolean; notifications: boolean }
export interface ProtectionApp { packageName: string; label: string }
export interface ProtectionModule {
  formatVersion: number;
  capabilities(): Promise<ProtectionCapabilities>;
  apps(): Promise<ProtectionApp[]>;
  state(): Promise<ProtectionState>;
  openPermission(kind: "usage" | "overlay"): Promise<void>;
  start(json: string): Promise<ProtectionState>;
  stop(id: string): Promise<ProtectionState>;
  pause?(id: string): Promise<ProtectionState>;
  networkStatus?(): Promise<NativeConnectivity>;
  addListener?(event: string, listener: (value: NativeConnectivity) => void): { remove(): void };
}
export interface NativeConnectivity { connected: boolean; validated: boolean; sequence: number }
export const idleProtection: ProtectionState = { id: null, scope: null, status: "idle", secondsLeft: 0, covers: 0 };
export function protectionPreviewEnabled() { return process.env.EXPO_PUBLIC_PROTECTION_PREVIEW === "1"; }
/** Session protection requires v2; APK10's 10-minute feasibility engine is never presented as full protection. */
export async function getSessionProtectionModule(): Promise<ProtectionModule | null> {
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS !== "android" || Number(Platform.Version) < 26) return null;
    const { isRunningInExpoGo } = await import("expo");
    if (isRunningInExpoGo()) return null;
    const { requireOptionalNativeModule } = await import("expo-modules-core");
    const native = requireOptionalNativeModule<ProtectionModule>("LifeRPGFocusProtectionSpike");
    return native?.formatVersion === 2 && [native.start, native.stop, native.pause, native.state, native.apps, native.openPermission, native.capabilities].every(fn => typeof fn === "function") ? native : null;
  } catch { return null; }
}
function checkedConnectivity(value: NativeConnectivity): NativeConnectivity | null {
  return value && typeof value.connected === "boolean" && typeof value.validated === "boolean" && Number.isSafeInteger(value.sequence) && value.sequence >= 0
    ? { connected: value.connected, validated: value.validated, sequence: value.sequence } : null;
}
export async function readNativeConnectivity(): Promise<NativeConnectivity | null> {
  try { const native = await getSessionProtectionModule(); return native?.networkStatus ? checkedConnectivity(await native.networkStatus()) : null; } catch { return null; }
}
export async function subscribeNativeConnectivity(listener: (value: NativeConnectivity) => void): Promise<{ remove(): void }> {
  try { const native = await getSessionProtectionModule(); return native?.addListener?.("onConnectivityChanged", value => { const checked = checkedConnectivity(value); if (checked) listener(checked); }) ?? { remove() {} }; }
  catch { return { remove() {} }; }
}
export async function getFocusProtectionModule(): Promise<ProtectionModule | null> {
  try {
    if (!protectionPreviewEnabled()) return null;
    const { Platform } = await import("react-native");
    if (Platform.OS !== "android" || Number(Platform.Version) < 26) return null;
    const { isRunningInExpoGo } = await import("expo");
    if (isRunningInExpoGo()) return null;
    const { requireOptionalNativeModule } = await import("expo-modules-core");
    const native = requireOptionalNativeModule<ProtectionModule>("LifeRPGFocusProtectionSpike");
    return native?.formatVersion === 1 && [native.start, native.stop, native.state, native.apps, native.openPermission, native.capabilities].every(fn => typeof fn === "function") ? native : null;
  } catch { return null; }
}
function checkedState(value: ProtectionState): ProtectionState {
  if (!value || !["idle", "starting", "active", "stopped", "finished", "permission-lost", "interrupted"].includes(value.status)
    || !Number.isInteger(value.secondsLeft) || value.secondsLeft < 0 || value.secondsLeft > 600
    || !Number.isInteger(value.covers) || value.covers < 0
    || (value.id !== null && typeof value.id !== "string") || (value.scope !== null && typeof value.scope !== "string")) throw Error("Could not check protection. Your timer is unchanged.");
  return { ...value };
}
let generation = 0, queue: Promise<unknown> = Promise.resolve();
function ordered<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.catch(() => {}).then(work); queue = result.catch(() => {}); return result;
}
/** Native cover leases are separate from session authority. No timer/SQL callbacks. */
export function createProtectionCoordinator(options: {
  scope: string; current(): boolean; newId(): string | Promise<string>; resolve?: () => Promise<ProtectionModule | null>; timeoutMs?: number;
}) {
  const ownGeneration = ++generation;
  let disposed = false, ownedId: string | null = null, revision = 0;
  const current = () => !disposed && ownGeneration === generation && options.current();
  const native = options.resolve ?? getFocusProtectionModule;
  const bounded = <T,>(promise: Promise<T>) => new Promise<T>((resolve, reject) => {
    const deadline = setTimeout(() => reject(Error("Protection is taking too long. Your timer keeps working; Stop is available in the notification.")), options.timeoutMs ?? 5000);
    promise.then(value => { clearTimeout(deadline); resolve(value); }, error => { clearTimeout(deadline); reject(error); });
  });
  const stopOwned = async (module: ProtectionModule) => { if (ownedId) { const id = ownedId; ownedId = null; await module.stop(id); } };
  return {
    async start(input: { seconds: number; title: string; mode: ProtectionMode; allowed: string[] }) {
      if (!current()) return null;
      const request = ++revision;
      if (!Number.isInteger(input.seconds) || input.seconds < 1 || input.seconds > 600 || !["allow-list", "essentials"].includes(input.mode)
        || input.allowed.length > 64 || input.allowed.some(pkg => !/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+$/.test(pkg))
        || input.mode === "essentials" && input.allowed.length) throw Error("Check your protection choices.");
      return ordered(async () => {
        const module = await native(); if (!module || !current() || revision !== request) return null;
        const id = await options.newId(); if (!current() || revision !== request) return null; ownedId = id;
        try {
          const result = checkedState(await bounded(module.start(JSON.stringify({ version: 1, id, scope: options.scope, ...input, title: input.title.slice(0, 120) || "Your session", allowed: [...input.allowed] }))));
          if (!current() || revision !== request) { await module.stop(id).catch(() => {}); if (ownedId === id) ownedId = null; return null; }
          if (result.id !== id || result.scope !== options.scope || !["starting", "active"].includes(result.status)) throw Error("Protection did not start. Your timer is unchanged.");
          return result;
        } catch (error) { await bounded(stopOwned(module)).catch(() => {}); throw error; }
      });
    },
    async read() {
      return ordered(async () => {
        const module = await native(); if (!module || disposed || ownGeneration !== generation) return idleProtection;
        const value = checkedState(await bounded(module.state()));
        if (value.id && (value.scope !== options.scope || !current())) {
          await bounded(module.stop(value.id)); return { ...idleProtection, status: "interrupted" };
        }
        ownedId = value.id;
        return value;
      });
    },
    async stop() {
      revision++;
      // A hung start reply must never hold the user's exit behind the queue.
      const id = ownedId; ownedId = null;
      const module = await native(); if (module && id) await bounded(module.stop(id));
    },
    async dispose() {
      disposed = true; revision++;
      if (generation === ownGeneration) generation++;
      const id = ownedId; ownedId = null;
      const module = await native(); if (module && id) await bounded(module.stop(id));
    },
  };
}
