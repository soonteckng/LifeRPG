// Player cards: you, or a squad mate. Stats are part of being in a squad.
// Every call carries the signed-in owner, and answers are checked against the
// same owner, like squads.
import { supabase } from "../../lib/supabase";

export interface PlayerStats {
  streak: number; totalSeconds: number; sessions: number; since: string | null;
  longestSeconds: number; daysFocused: number;
  /** Seconds focused on each of the last seven days, oldest first, today last. */
  last7: number[];
}
/** The server may still send a level, a look and collected items; the app shows none of them. */
export interface PlayerCard { id: string; isYou: boolean; name: string; statsShared: boolean; stats: PlayerStats | null }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export function parsePlayerCard(value: unknown): PlayerCard {
  if (!isObj(value) || typeof value.id !== "string" || typeof value.isYou !== "boolean" || typeof value.name !== "string"
    || typeof value.statsShared !== "boolean") throw new Error("Unexpected player reply");
  let stats: PlayerStats | null = null;
  if (isObj(value.stats)) {
    const t = value.stats;
    if (!count(t.streak) || !count(t.totalSeconds) || !count(t.sessions)) throw new Error("Unexpected player reply");
    const n = (v: unknown) => (count(v) ? v as number : 0);
    stats = { streak: t.streak as number, totalSeconds: t.totalSeconds as number, sessions: t.sessions as number, since: typeof t.since === "string" ? t.since : null,
      longestSeconds: n(t.longestSeconds), daysFocused: n(t.daysFocused),
      last7: Array.isArray(t.last7) && t.last7.length === 7 ? t.last7.map(n) : [0, 0, 0, 0, 0, 0, 0] };
  }
  return { id: value.id, isYou: value.isYou, name: value.name.slice(0, 80), statsShared: value.statsShared, stats };
}

export function createPlayerClient(ownerId: string, verifyOwner: () => Promise<string | null>) {
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    if (await verifyOwner() !== ownerId) throw new Error("Account changed");
    const request = supabase.rpc(name, { ...args, p_expected_owner: ownerId });
    const { data, error } = await new Promise<Awaited<typeof request>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Connection timed out")), 8000);
      Promise.resolve(request).then(v => { clearTimeout(timeout); resolve(v); }, e => { clearTimeout(timeout); reject(e); });
    });
    if (error) throw error;
    if (await verifyOwner() !== ownerId) throw new Error("Account changed");
    return data as unknown;
  };
  return {
    card: async (playerId: string) => parsePlayerCard(await call("get_player_card_v1", { p_player: playerId })),
  };
}
