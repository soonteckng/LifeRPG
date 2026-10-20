import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The category last picked for a routine, per account, kept on this phone.
 * A new routine starts there instead of always on Everyday focus. It is read
 * once ahead of time, so the editor opens with it already in place.
 */
const key = (owner: string) => `liferpg:last-routine-area:v1:${owner}`;
const known = new Map<string, number | null>();
const loading = new Map<string, Promise<void>>();
export const lastRoutineArea = {
  get: (owner: string): number | null => known.get(owner) ?? null,
  load(owner: string) {
    if (!owner || known.has(owner)) return Promise.resolve();
    const existing = loading.get(owner);
    if (existing) return existing;
    const request = AsyncStorage.getItem(key(owner)).then(raw => {
      const value = raw === null ? null : Number(raw);
      if (!known.has(owner)) known.set(owner, Number.isSafeInteger(value) && value! > 0 ? value : null);
    }).catch(() => {}).finally(() => loading.delete(owner));
    loading.set(owner, request);
    return request;
  },
  remember(owner: string, areaId: number | null) {
    if (!owner) return;
    known.set(owner, areaId);
    void (areaId === null ? AsyncStorage.removeItem(key(owner)) : AsyncStorage.setItem(key(owner), String(areaId))).catch(() => {});
  },
};
