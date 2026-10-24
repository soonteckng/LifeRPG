import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useAuth } from "../context/AuthContext";
import { createRewardsClient, type DevRewardAction, type SavedAvatar } from "../services/rewardsService";
import { createRewardsStore } from "../services/rewardsStore";
import { normalizeLook } from "../utils/adventurerLook";

export const rewardsStore = createRewardsStore(AsyncStorage);

/**
 * The signed-in person's rewards and saved look. Every screen shares one copy;
 * the last copy shows offline, and changes need internet.
 */
export function useRewards({ load = true }: { load?: boolean } = {}) {
  const auth = useAuth();
  const owner = auth.user?.id ?? auth.localOwner?.id ?? null;
  const online = auth.accessMode === "online" && !!auth.user?.id;
  const verifier = useRef(auth.verifyCurrentOwner);
  useLayoutEffect(() => { verifier.current = auth.verifyCurrentOwner; }, [auth.verifyCurrentOwner]);
  const client = useCallback(() => owner && online ? createRewardsClient(owner, async () => (await verifier.current())?.id ?? null) : null, [owner, online]);
  const subscribe = useCallback((listener: () => void) => rewardsStore.subscribe(owner, listener), [owner]);
  const snapshot = useCallback(() => rewardsStore.snapshot(owner), [owner]);
  const snap = useSyncExternalStore(subscribe, snapshot, snapshot);
  const refresh = useCallback(() => rewardsStore.load(owner, client()), [owner, client]);
  useEffect(() => { if (load) void refresh(); }, [load, refresh]);
  const act = <T,>(pick: (c: NonNullable<ReturnType<typeof client>>) => () => Promise<T>, quiet: string[] = []) => {
    const c = client();
    return rewardsStore.act(owner, c ? pick(c) as never : null, quiet) as Promise<{ ok: true; value: T } | { ok: false; message: string }>;
  };
  const avatar = snap.state?.avatar;
  // Stable objects, so screens that follow the saved look don't redraw for nothing.
  const look = useMemo(() => normalizeLook(avatar?.look), [avatar?.look]);
  const equipped = useMemo(() => avatar?.equipped ?? {}, [avatar?.equipped]);
  const owned = useMemo(() => snap.state?.owned ?? [], [snap.state?.owned]);
  return {
    ...snap,
    online,
    refresh,
    look,
    equipped,
    background: avatar?.background ?? "bg_dusk",
    frame: avatar?.frame ?? null,
    title: avatar?.title ?? null,
    owned,
    earned: snap.state?.earned ?? [],
    dismissMoment: (id: string) => rewardsStore.dismissMoment(owner, id),
    stardust: snap.state?.stardust ?? 0,
    // Coming back from sessions with something to show opens the return screen.
    claimSessions: async () => {
      const r = await act(c => c.claimSessions);
      if (r.ok && r.value.sessions.length) {
        const finds = r.value.sessions.flatMap(x => x.finds);
        rewardsStore.addReveal(owner, { id: `return:${r.value.sessions.map(x => x.sessionId).join(",")}`, kind: "expedition",
          seconds: r.value.sessions.reduce((n, x) => n + x.seconds, 0), finds,
          stardust: r.value.sessions.reduce((n, x) => n + x.minutesStardust, 0) + finds.reduce((n, g) => n + g.stardust, 0) });
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
    buy: (itemId: string) => act(c => () => c.buy(itemId), [itemId]),
    saveAvatar: (next: Omit<SavedAvatar, "revision" | "frame">) => act(c => () => c.saveAvatar(next, avatar?.revision ?? 1)),
    // A test find comes back through the same return screen as a real one;
    // `walkSeconds` shows it as the walk a find takes (25 minutes).
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
    nextFindSeconds: snap.state?.nextFindSeconds ?? 1500,
    pack: snap.state?.pack ?? null,
  };
}
