import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { createPlayerClient, type PlayerCard } from "../services/playerService";

function usePlayerClient() {
  const auth = useAuth();
  const owner = auth.user?.id ?? null;
  const online = auth.accessMode === "online" && !!owner;
  const verifier = useRef(auth.verifyCurrentOwner);
  useLayoutEffect(() => { verifier.current = auth.verifyCurrentOwner; }, [auth.verifyCurrentOwner]);
  return useCallback(() => owner && online ? createPlayerClient(owner, async () => (await verifier.current())?.id ?? null) : null, [owner, online]);
}

// The last card seen for each player, so reopening one shows it at once.
const cards = new Map<string, PlayerCard>();
/** How long the card sheet takes to rise; loading waits for it, so it never stutters. */
export const CARD_SETTLE_MS = 320;

/** Someone's player card, loaded once the sheet has opened. Offline it shows what was last seen. */
export function usePlayerCard(playerId: string | null) {
  const client = usePlayerClient();
  const [state, setState] = useState<{ id: string | null; card: PlayerCard | null; failed: boolean }>({ id: null, card: null, failed: false });
  useEffect(() => {
    const c = client();
    if (!playerId || !c) return;
    let live = true;
    const later = setTimeout(() => {
      c.card(playerId).then(card => { cards.set(playerId, card); if (live) setState({ id: playerId, card, failed: false }); },
        () => { if (live) setState({ id: playerId, card: null, failed: true }); });
    }, CARD_SETTLE_MS);
    return () => { live = false; clearTimeout(later); };
  }, [playerId, client]);
  const mine = state.id === playerId;
  const card = mine && state.card ? state.card : playerId ? cards.get(playerId) ?? null : null;
  return { card, loading: !!playerId && !!client() && !mine, failed: mine && state.failed && !card, online: !!client() };
}
