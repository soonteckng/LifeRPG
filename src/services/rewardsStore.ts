import type { Gift, RewardsState, createRewardsClient } from "./rewardsService";
import { parseRewardsState } from "./rewardsService";
import { STREAK_FRAMES } from "./rewardCatalog";

// One copy of each account's rewards for every screen, so Home, Profile,
// Outfits and the squads all show the same look. The last copy is kept on the
// phone (per account) so the character still shows offline.

type Client = ReturnType<typeof createRewardsClient>;
/**
 * A screen that shows several rewards at once: coming back from a session
 * (the finds and Stardust it brought) or opening today's supply pack.
 */
export type Reveal =
  | { id: string; kind: "expedition"; seconds: number | null; finds: Gift[]; stardust: number;
      /** Where today's trail stood before these sessions, and the trail bonus they reached. */
      fromSeconds?: number; trailStardust?: number }
  | { id: string; kind: "pack"; tier: number; daysInARow: number; items: Gift[]; stardust: number };
/** The items a reveal shows; their single pop-ups wait for it and then count as seen. */
export const revealItems = (reveal: Reveal) => (reveal.kind === "pack" ? reveal.items : reveal.finds).filter(g => g.new).map(g => g.item);
/** moments: things just earned, waiting for their pop-up, oldest first. reveals show before them. */
export interface RewardsSnapshot { state: RewardsState | null; loading: boolean; busy: boolean; error: string | null; moments: string[]; reveals: Reveal[] }
interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }

const EMPTY: RewardsSnapshot = { state: null, loading: false, busy: false, error: null, moments: [], reveals: [] };
export const rewardsCacheKey = (ownerId: string) => `liferpg.rewards.v1.${ownerId}`;
export const rewardsSeenKey = (ownerId: string) => `liferpg.rewards.seen.v1.${ownerId}`;
const frameRank = (id: string) => STREAK_FRAMES.findIndex(f => f.id === id);

// Messages the server sends that are fine to show as they are.
const FRIENDLY = [/Not enough Stardust/, /already have/, /not sold/, /Reach your daily goal/, /already opened/, /another device/, /don't have that/, /Only developer/];
export function rewardsErrorMessage(cause: unknown) {
  const text = cause instanceof Error ? cause.message : typeof (cause as { message?: unknown })?.message === "string" ? (cause as { message: string }).message : "";
  if (/Account changed/.test(text)) return "Your account changed. Reopen the app and try again.";
  if (FRIENDLY.some(r => r.test(text))) return text.replace(/\.$/, "") + ".";
  return "Couldn't reach your rewards. Check your connection and try again.";
}

export function createRewardsStore(storage: Storage) {
  const snapshots = new Map<string, RewardsSnapshot>();
  const listeners = new Map<string, Set<() => void>>();
  const loaded = new Set<string>();
  // A refresh that began before a claim/purchase/save may return an older
  // wallet and look. It must never roll back that newer result or its cache.
  const mutationVersion = new Map<string, number>();
  const set = (owner: string, next: Partial<RewardsSnapshot>) => {
    snapshots.set(owner, { ...(snapshots.get(owner) ?? EMPTY), ...next });
    listeners.get(owner)?.forEach(l => l());
  };
  // What each account has already celebrated, kept on the phone. A pop-up is
  // only marked as seen once it's closed, so nothing is lost if the app closes.
  const seen = new Map<string, Promise<Set<string> | null>>();
  const queue = new Map<string, Promise<void>>();
  const readSeen = (owner: string) => {
    if (!seen.has(owner)) seen.set(owner, storage.getItem(rewardsSeenKey(owner)).then(raw => {
      const list: unknown = raw ? JSON.parse(raw) : null;
      return Array.isArray(list) ? new Set(list.filter((id): id is string => typeof id === "string")) : null;
    }).catch(() => null));
    return seen.get(owner)!;
  };
  const writeSeen = (owner: string, ids: Set<string>) => {
    seen.set(owner, Promise.resolve(ids));
    void storage.setItem(rewardsSeenKey(owner), JSON.stringify([...ids])).catch(() => {});
  };
  const notice = (owner: string, earned: string[], quiet: string[]) => {
    const run = (queue.get(owner) ?? Promise.resolve()).then(async () => {
      const known = await readSeen(owner);
      // The first time on this phone, everything already earned counts as seen.
      if (!known) { writeSeen(owner, new Set(earned)); return; }
      const have = new Set(earned);
      const next = new Set([...known, ...quiet].filter(id => have.has(id)));
      const waiting = (snapshots.get(owner)?.moments ?? []).filter(id => have.has(id) && !next.has(id));
      let fresh = earned.filter(id => !next.has(id) && !waiting.includes(id));
      // Several streak frames at once (a long streak on a first check): only the highest one gets a pop-up.
      const frames = [...waiting, ...fresh].filter(id => frameRank(id) >= 0).sort((x, y) => frameRank(y) - frameRank(x));
      for (const older of frames.slice(1)) next.add(older);
      fresh = fresh.filter(id => !next.has(id));
      writeSeen(owner, next);
      set(owner, { moments: [...waiting.filter(id => !next.has(id)), ...fresh] });
    }).catch(() => {});
    queue.set(owner, run);
    return run;
  };
  const dismiss = (owner: string | null, id: string | string[]) => {
    if (!owner) return;
    const ids = Array.isArray(id) ? id : [id];
    set(owner, { moments: (snapshots.get(owner)?.moments ?? []).filter(m => !ids.includes(m)) });
    const run = (queue.get(owner) ?? Promise.resolve()).then(async () => {
      writeSeen(owner, new Set([...((await readSeen(owner)) ?? []), ...ids]));
    }).catch(() => {});
    queue.set(owner, run);
  };
  const keep = (owner: string, state: RewardsState, quiet: string[] = []) => {
    set(owner, { state, error: null });
    void storage.setItem(rewardsCacheKey(owner), JSON.stringify(state)).catch(() => {});
    return notice(owner, state.earned, quiet);
  };
  const readCache = async (owner: string) => {
    if (loaded.has(owner)) return;
    loaded.add(owner);
    try {
      const raw = await storage.getItem(rewardsCacheKey(owner));
      if (raw && !snapshots.get(owner)?.state) set(owner, { state: parseRewardsState(JSON.parse(raw)) });
    } catch { /* A damaged copy is ignored; the server copy replaces it. */ }
  };
  return {
    snapshot: (owner: string | null) => (owner && snapshots.get(owner)) || EMPTY,
    subscribe(owner: string | null, listener: () => void) {
      if (!owner) return () => {};
      if (!listeners.has(owner)) listeners.set(owner, new Set());
      listeners.get(owner)!.add(listener);
      void readCache(owner);
      return () => { listeners.get(owner)?.delete(listener); };
    },
    async load(owner: string | null, client: Client | null) {
      if (!owner) return;
      await readCache(owner);
      if (!client || snapshots.get(owner)?.loading || snapshots.get(owner)?.busy) return;
      const version = mutationVersion.get(owner) ?? 0;
      set(owner, { loading: true });
      try {
        const value = await client.load();
        if (version === (mutationVersion.get(owner) ?? 0)) await keep(owner, value);
      }
      catch (cause) { if (version === (mutationVersion.get(owner) ?? 0)) set(owner, { error: rewardsErrorMessage(cause) }); }
      finally { set(owner, { loading: false }); }
    },
    /** Marks pop-ups as seen. */
    dismissMoment: (owner: string | null, id: string | string[]) => dismiss(owner, id),
    /** Queues a return or pack screen. One per id. */
    addReveal(owner: string | null, reveal: Reveal) {
      if (!owner) return;
      const reveals = snapshots.get(owner)?.reveals ?? [];
      if (!reveals.some(r => r.id === reveal.id)) set(owner, { reveals: [...reveals, reveal] });
    },
    /** Closes a return or pack screen; what it showed counts as seen. */
    dismissReveal(owner: string | null, id: string) {
      if (!owner) return;
      const reveal = (snapshots.get(owner)?.reveals ?? []).find(r => r.id === id);
      set(owner, { reveals: (snapshots.get(owner)?.reveals ?? []).filter(r => r.id !== id) });
      if (reveal) dismiss(owner, revealItems(reveal));
    },
    /** Runs one change at a time per account; returns an error message or the result. Items in quiet (a purchase) get no pop-up. */
    async act<T extends { state: RewardsState } | RewardsState>(owner: string | null, work: (() => Promise<T>) | null, quiet: string[] = []): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
      if (!owner || !work) return { ok: false, message: "Connect to the internet to use rewards." };
      if (snapshots.get(owner)?.busy) return { ok: false, message: "One moment, still saving." };
      set(owner, { busy: true });
      try {
        const value = await work();
        mutationVersion.set(owner, (mutationVersion.get(owner) ?? 0) + 1);
        await keep(owner, "state" in value ? value.state : value, quiet);
        return { ok: true, value };
      } catch (cause) { return { ok: false, message: rewardsErrorMessage(cause) }; }
      finally { set(owner, { busy: false }); }
    },
  };
}
