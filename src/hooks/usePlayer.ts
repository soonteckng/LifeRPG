import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { createPlayerClient, type PlayerCard, type StatsVisibility } from "../services/playerService";

function usePlayerClient() {
  const auth = useAuth();
  const owner = auth.user?.id ?? null;
  const online = auth.accessMode === "online" && !!owner;
  const verifier = useRef(auth.verifyCurrentOwner);
  useLayoutEffect(() => { verifier.current = auth.verifyCurrentOwner; }, [auth.verifyCurrentOwner]);
  return useCallback(() => owner && online ? createPlayerClient(owner, async () => (await verifier.current())?.id ?? null) : null, [owner, online]);
}

/** Someone's player card, loaded when it opens. Offline it simply stays empty. */
export function usePlayerCard(playerId: string | null) {
  const client = usePlayerClient();
  const [state, setState] = useState<{ id: string | null; card: PlayerCard | null; failed: boolean }>({ id: null, card: null, failed: false });
  useEffect(() => {
    const c = client();
    if (!playerId || !c) return;
    let live = true;
    c.card(playerId).then(card => { if (live) setState({ id: playerId, card, failed: false }); },
      () => { if (live) setState({ id: playerId, card: null, failed: true }); });
    return () => { live = false; };
  }, [playerId, client]);
  const mine = state.id === playerId;
  return { card: mine ? state.card : null, loading: !!playerId && !!client() && !mine, failed: mine && state.failed, online: !!client() };
}

/** Who sees your focus stats on your player card: your squads (the default) or only you. */
export function useStatsVisibility() {
  const client = usePlayerClient();
  const [value, setValue] = useState<StatsVisibility | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const c = client();
    if (!c) return;
    let live = true;
    c.statsVisibility().then(v => { if (live) setValue(v); }, () => {});
    return () => { live = false; };
  }, [client]);
  const set = async (next: StatsVisibility) => {
    const c = client();
    if (!c || busy) return;
    const before = value;
    setBusy(true); setError(""); setValue(next);
    try { setValue(await c.setStatsVisibility(next)); }
    catch { setValue(before); setError("Couldn't save that. Check your connection and try again."); }
    finally { setBusy(false); }
  };
  return { value, busy, error, online: !!client(), set };
}
