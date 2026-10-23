import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useAuth } from "../context/AuthContext";
import { createRewardsClient, type SavedAvatar } from "../services/rewardsService";
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
  const act = <T,>(pick: (c: NonNullable<ReturnType<typeof client>>) => () => Promise<T>) => {
    const c = client();
    return rewardsStore.act(owner, c ? pick(c) as never : null) as Promise<{ ok: true; value: T } | { ok: false; message: string }>;
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
    stardust: snap.state?.stardust ?? 0,
    claimSessions: () => act(c => c.claimSessions),
    openPack: () => act(c => c.openPack),
    buy: (itemId: string) => act(c => () => c.buy(itemId)),
    saveAvatar: (next: Omit<SavedAvatar, "revision">) => act(c => () => c.saveAvatar(next, avatar?.revision ?? 1)),
    developer: (action: "stardust" | "reopen_pack" | "reset", amount = 0) => act(c => () => c.developer(action, amount)),
  };
}
