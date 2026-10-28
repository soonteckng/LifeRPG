import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useAuth } from "../context/AuthContext";
import { claimedTrail, createRewardsClient, LEGACY_TRAIL, type DevRewardAction, type SavedAvatar } from "../services/rewardsService";
import { createRewardsStore } from "../services/rewardsStore";
import { normalizeLook } from "../utils/adventurerLook";
import { sessionTrail } from "../services/sessionTrail";
import { developerRewardLab, emptyTestRewards, type RewardLabAction } from "../services/developerRewardLab";
import { REWARD_ITEMS } from "../services/rewardCatalog";
import { offlineSyncPresentation } from "../services/offlineSyncPresentation";
import { sessionBackendIdentity } from "../utils/sessionBackend";
import { isJournalUuid } from "../utils/sessionJournalSchema";

export const rewardsStore = createRewardsStore(AsyncStorage);

/**
 * The signed-in person's rewards and saved look. Every screen shares one copy;
 * the last copy shows offline, and changes need internet.
 */
export function useRewards({ load = true, developerLab = false }: { load?: boolean; developerLab?: boolean } = {}) {
  const auth = useAuth();
  const owner = auth.user?.id ?? auth.localOwner?.id ?? null;
  const backendId = auth.localOwner?.backendId ?? sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId ?? null;
  const online = auth.accessMode === "online" && !!auth.user?.id;
  const verifier = useRef(auth.verifyCurrentOwner);
  useLayoutEffect(() => { verifier.current = auth.verifyCurrentOwner; }, [auth.verifyCurrentOwner]);
  const client = useCallback(() => owner && online ? createRewardsClient(owner, async () => (await verifier.current())?.id ?? null) : null, [owner, online]);
  const subscribe = useCallback((listener: () => void) => rewardsStore.subscribe(owner, listener), [owner]);
  const snapshot = useCallback(() => rewardsStore.snapshot(owner), [owner]);
  const snap = useSyncExternalStore(subscribe, snapshot, snapshot);
  // Only Outfits and Developer tools opt in. Home, sessions, claims, stats and
  // squad portraits always read the real inventory and never the test wallet.
  const labScope = owner ? JSON.stringify([owner, auth.admissionEpoch]) : null;
  const labSnapshot = useCallback(() => developerRewardLab.snapshot(developerLab ? labScope : null), [developerLab, labScope]);
  const labState = useSyncExternalStore(developerRewardLab.subscribe, labSnapshot, labSnapshot);
  const labActive = developerLab && !!labState.state;
  const runLab = async (action: RewardLabAction, item: string | null = null, amount = 0, avatar: Omit<SavedAvatar, "revision" | "frame"> | null = null) => {
    const c = client();
    if (!developerLab || !labScope || !c || !snap.state) return { ok: false as const, message: "Connect and load your rewards to use test inventory." };
    return developerRewardLab.run(labScope, emptyTestRewards(snap.state), state => c.lab(action,
      labState.allOwned ? { ...state, owned: REWARD_ITEMS.map(reward => reward.id) } : state, item, amount, avatar));
  };
  const refresh = useCallback(() => rewardsStore.load(owner, client()), [owner, client]);
  useEffect(() => { if (load) void refresh(); }, [load, refresh]);
  const act = <T,>(pick: (c: NonNullable<ReturnType<typeof client>>) => () => Promise<T>, quiet: string[] = []) => {
    const c = client();
    return rewardsStore.act(owner, c ? pick(c) as never : null, quiet) as Promise<{ ok: true; value: T } | { ok: false; message: string }>;
  };
  const displayState = labActive ? labState.state : snap.state;
  const avatar = displayState?.avatar;
  // Stable objects, so screens that follow the saved look don't redraw for nothing.
  const look = useMemo(() => normalizeLook(avatar?.look), [avatar?.look]);
  const equipped = useMemo(() => avatar?.equipped ?? {}, [avatar?.equipped]);
  const owned = useMemo(() => labActive && labState.allOwned ? REWARD_ITEMS.map(item => item.id) : displayState?.owned ?? [], [labActive, labState.allOwned, displayState?.owned]);
  return {
    ...snap,
    state: displayState,
    busy: snap.busy || labState.busy,
    lab: {
      active: labActive, allOwned: labState.allOwned, generation: labState.generation,
      start: () => runLab("load"),
      end: () => { if (labScope) developerRewardLab.end(labScope); },
      reset: () => { if (labScope && snap.state) developerRewardLab.reset(labScope, emptyTestRewards(snap.state)); },
      ownAll: (value: boolean) => { if (labScope) developerRewardLab.ownAll(labScope, value); },
      run: runLab,
    },
    owner,
    backendId,
    admissionEpoch: auth.admissionEpoch,
    online,
    refresh,
    look,
    equipped,
    background: avatar?.background ?? "bg_dusk",
    frame: avatar?.frame ?? null,
    title: avatar?.title ?? null,
    owned,
    earned: displayState?.earned ?? [],
    dismissMoment: (id: string) => rewardsStore.dismissMoment(owner, id),
    stardust: displayState?.stardust ?? 0,
    // Coming back from sessions with something to show opens the return screen.
    claimSessions: async (options?: { offlineBatchId?: string }) => {
      const scope = isJournalUuid(owner) && backendId ? { ownerId: owner, backendId } : null;
      const syncing = offlineSyncPresentation.snapshot(scope);
      if (!syncing.ready || syncing.busy || syncing.batch && syncing.batch.id !== options?.offlineBatchId)
        return { ok: false as const, message: "Your offline sessions are syncing. Try again in a moment." };
      const r = await act(c => c.claimSessions);
      // Kept in the private session record (Settings), so a missing return screen can be traced.
      sessionTrail("rewards claim", r.ok ? { sessions: r.value.sessions.length, finds: r.value.sessions.reduce((n, x) => n + x.finds.length, 0) } : { error: r.message });
      if (r.ok && r.value.sessions.length) {
        // Every session claimed together shows on one card: all their finds at once.
        const finds = r.value.sessions.flatMap(x => x.finds), seconds = r.value.sessions.reduce((n, x) => n + x.seconds, 0);
        const trailStardust = r.value.sessions.reduce((n, x) => n + x.trailStardust, 0);
        const todayTrailStardust = r.value.state.today.date ? r.value.sessions.filter(x => x.creditedDate === r.value.state.today.date).reduce((n, x) => n + x.trailStardust, 0) : trailStardust;
        const trail = claimedTrail(r.value);
        const alreadyWalked = !!scope && r.value.sessions.every(session => offlineSyncPresentation.hasAcknowledgedReceipt(scope, session.sessionId));
        if (!alreadyWalked || finds.length) rewardsStore.addReveal(owner, { id: `return:${r.value.sessions.map(x => x.sessionId).join(",")}`, kind: "expedition",
          seconds, finds, trailStardust: todayTrailStardust, fromSeconds: trail.fromSeconds, trail,
          sessions: r.value.sessions, ...(alreadyWalked ? { skipTrail: true } : {}),
          stardust: r.value.sessions.reduce((n, x) => n + x.minutesStardust, 0) + finds.reduce((n, g) => n + g.stardust, 0) + trailStardust });
      }
      return r;
    },
    openPack: async () => {
      const r = await act(c => c.openPack);
      if (r.ok) rewardsStore.addReveal(owner, { id: `pack:${r.value.state.pack.date}:${r.value.daysInARow}`, kind: "pack", tier: r.value.tier, daysInARow: r.value.daysInARow,
        items: r.value.items, stardust: r.value.stardust + r.value.items.reduce((n, g) => n + g.stardust, 0) });
      return r;
    },
    // Something you just bought gets no pop-up; you chose it.
    buy: (itemId: string) => labActive ? runLab("buy", itemId) : act(c => () => c.buy(itemId), [itemId]),
    saveAvatar: (next: Omit<SavedAvatar, "revision" | "frame">) => labActive ? runLab("avatar", null, 0, next) : act(c => () => c.saveAvatar(next, avatar?.revision ?? 1)),
    // A test find comes back through the same return screen as a real one;
    // `walkSeconds` shows it as the walk the current server's find interval takes.
    developer: async (action: DevRewardAction, amount = 0, walkSeconds: number | null = null) => {
      const r = await act(c => () => c.developer(action, amount));
      if (r.ok && action === "find" && r.value.gifts.length)
        rewardsStore.addReveal(owner, { id: `find:${Date.now()}`, kind: "expedition", seconds: walkSeconds, finds: r.value.gifts, stardust: r.value.gifts.reduce((n, g) => n + g.stardust, 0) });
      return r;
    },
    // Developer preview: the return screen after a short session that found
    // nothing yet. It's the real screen with nothing given.
    showEmptyReturn: (seconds: number) => rewardsStore.addReveal(owner, { id: `empty:${Date.now()}`, kind: "expedition", seconds, finds: [], stardust: 0 }),
    dismissReveal: (id: string) => rewardsStore.dismissReveal(owner, id),
    today: snap.state?.today ?? { seconds: 0, finds: 0 },
    nextFindSeconds: snap.state?.nextFindSeconds ?? LEGACY_TRAIL.findSeconds,
    trail: snap.state?.trail ?? { ...LEGACY_TRAIL, complete: false },
    pack: snap.state?.pack ?? null,
  };
}
