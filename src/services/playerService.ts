// Player cards and who sees your stats. Every call carries the signed-in
// owner, and answers are checked against the same owner, like squads.
import { supabase } from "../../lib/supabase";
import { parsePlayerLook } from "../utils/playerLook";
import type { PlayerLook } from "../types/squads";

export type StatsVisibility = "squads" | "private";
export interface PlayerStats { streak: number; totalSeconds: number; sessions: number; collected: number; since: string | null }
export interface PlayerCard { id: string; isYou: boolean; name: string; level: number; look: PlayerLook | null; statsShared: boolean; stats: PlayerStats | null }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export function parsePlayerCard(value: unknown): PlayerCard {
  if (!isObj(value) || typeof value.id !== "string" || typeof value.isYou !== "boolean" || typeof value.name !== "string" || !count(value.level)
    || typeof value.statsShared !== "boolean") throw new Error("Unexpected player reply");
  let stats: PlayerStats | null = null;
  if (isObj(value.stats)) {
    const t = value.stats;
    if (!count(t.streak) || !count(t.totalSeconds) || !count(t.sessions) || !count(t.collected)) throw new Error("Unexpected player reply");
    stats = { streak: t.streak as number, totalSeconds: t.totalSeconds as number, sessions: t.sessions as number, collected: t.collected as number, since: typeof t.since === "string" ? t.since : null };
  }
  return { id: value.id, isYou: value.isYou, name: value.name.slice(0, 80), level: value.level as number, look: parsePlayerLook(value.look), statsShared: value.statsShared, stats };
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
  const visibility = (r: unknown): StatsVisibility => {
    if (!isObj(r) || (r.showStats !== "squads" && r.showStats !== "private")) throw new Error("Unexpected player reply");
    return r.showStats;
  };
  return {
    card: async (playerId: string) => parsePlayerCard(await call("get_player_card_v1", { p_player: playerId })),
    statsVisibility: async () => visibility(await call("get_stats_visibility_v1")),
    setStatsVisibility: async (show: StatsVisibility) => visibility(await call("set_stats_visibility_v1", { p_show: show })),
  };
}
