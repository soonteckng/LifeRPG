import AsyncStorage from "@react-native-async-storage/async-storage";
import { STARTER_QUESTS, LEGACY_STARTER_NEEDS, type FocusNeed } from "../constants/guidedQuests";
export interface GuidedPreference { version: 1; enabled: boolean; invited: boolean; need: FocusNeed; templateId: string; smaller: boolean; areaId?: number | null }
export const DEFAULT_GUIDED_PREFERENCE: GuidedPreference = { version: 1, enabled: false, invited: false, need: "revision", templateId: "review-topic", smaller: false };
export function parseGuidedPreference(raw: string | null): GuidedPreference {
  try {
    const value = JSON.parse(raw ?? "null");
    const template = STARTER_QUESTS.find(task => (task.id === value?.templateId || task.need === LEGACY_STARTER_NEEDS[value?.templateId]) && task.need === value?.need);
    if (value?.version !== 1 || !template || typeof value.enabled !== "boolean" || typeof value.invited !== "boolean" || typeof value.smaller !== "boolean") return { ...DEFAULT_GUIDED_PREFERENCE };
    const area = value.areaId === null || (Number.isSafeInteger(value.areaId) && value.areaId > 0) ? { areaId: value.areaId as number | null } : {};
    return { version: 1, enabled: value.enabled, invited: value.invited, need: template.need, templateId: template.id, smaller: false, ...area };
  } catch { return { ...DEFAULT_GUIDED_PREFERENCE }; }
}
interface State { value: GuidedPreference; ready: boolean; error: boolean; busy: boolean }
const states = new Map<string, State>();
const listeners = new Map<string, Set<() => void>>();
const pending = new Map<string, Promise<void>>();
const empty: State = { value: DEFAULT_GUIDED_PREFERENCE, ready: false, error: false, busy: false };
const key = (owner: string) => `liferpg:guided:v1:${owner}`;
function publish(owner: string, state: State) { states.set(owner, state); listeners.get(owner)?.forEach(listener => listener()); }
export const guidedPreferenceStore = {
  snapshot: (owner: string): State => states.get(owner) ?? empty,
  subscribe(owner: string, listener: () => void) {
    if (!listeners.has(owner)) listeners.set(owner, new Set());
    listeners.get(owner)!.add(listener);
    return () => { listeners.get(owner)?.delete(listener); };
  },
  async load(owner: string) {
    if (!owner || states.get(owner)?.ready || pending.has(owner)) return pending.get(owner);
    const request = AsyncStorage.getItem(key(owner)).then(raw => publish(owner, { value: parseGuidedPreference(raw), ready: true, error: false, busy: false }))
      .catch(() => publish(owner, { value: DEFAULT_GUIDED_PREFERENCE, ready: false, error: true, busy: false })).finally(() => pending.delete(owner));
    pending.set(owner, request); return request;
  },
  async save(owner: string, value: GuidedPreference): Promise<boolean> {
    const before = states.get(owner) ?? empty;
    if (!owner || !before.ready || before.busy || pending.has(owner)) return false;
    const clean = parseGuidedPreference(JSON.stringify(value));
    publish(owner, { ...before, busy: true, error: false });
    try { await AsyncStorage.setItem(key(owner), JSON.stringify(clean)); publish(owner, { value: clean, ready: true, error: false, busy: false }); return true; }
    catch { publish(owner, { ...before, error: true, busy: false }); return false; }
  },
};
