// Talks to the rewards functions on the server. Every call carries the
// signed-in owner, and answers are checked against the same owner, like the
// squad calls. Screens use this in the next rounds.
import { supabase } from "../../lib/supabase";
import { rewardItem, type RewardRarity } from "./rewardCatalog";

export interface AvatarLook { skin: string; hair: string; hairColor: string; glasses: boolean }
export interface SavedAvatar {
  look: AvatarLook;
  equipped: Partial<Record<string, string>>;
  frame: string | null;
  background: string;
  title: string | null;
  revision: number;
}
export interface RewardsState {
  stardust: number;
  nextFindSeconds: number;
  owned: string[];
  avatar: SavedAvatar;
  pack: { date: string; goalReached: boolean; claimed: boolean; tier: number; daysInARow: number };
}
export interface Gift { item: string; rarity: RewardRarity; new: boolean; stardust: number; reason?: "hours" | "streak" | "set" }
export interface SessionClaim { sessions: { sessionId: string; finds: Gift[]; minutesStardust: number }[]; milestones: Gift[]; state: RewardsState }
export interface PackOpening { tier: number; daysInARow: number; items: Gift[]; stardust: number; milestones: Gift[]; state: RewardsState }

const RARITIES = new Set(["common", "uncommon", "rare", "epic", "legendary"]);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

function gifts(value: unknown): Gift[] {
  if (!Array.isArray(value)) throw new Error("Unexpected rewards reply");
  return value.map(g => {
    if (!isObj(g) || typeof g.item !== "string" || !rewardItem(g.item) || !RARITIES.has(String(g.rarity)) || typeof g.new !== "boolean" || count(g.stardust) === null)
      throw new Error("Unexpected rewards reply");
    return { item: g.item, rarity: g.rarity as RewardRarity, new: g.new, stardust: g.stardust as number, ...(typeof g.reason === "string" ? { reason: g.reason as Gift["reason"] } : {}) };
  });
}

export function parseRewardsState(value: unknown): RewardsState {
  if (!isObj(value) || count(value.stardust) === null || count(value.nextFindSeconds) === null || !Array.isArray(value.owned)
    || !isObj(value.avatar) || !isObj(value.pack)) throw new Error("Unexpected rewards reply");
  const a = value.avatar, p = value.pack, look = a.look;
  if (!isObj(look) || !isObj(a.equipped) || typeof a.background !== "string" || count(a.revision) === null
    || typeof p.date !== "string" || typeof p.goalReached !== "boolean" || typeof p.claimed !== "boolean" || count(p.tier) === null || count(p.daysInARow) === null)
    throw new Error("Unexpected rewards reply");
  return {
    stardust: value.stardust as number,
    nextFindSeconds: value.nextFindSeconds as number,
    // Items the app doesn't know yet (from a newer server) are left out rather than breaking the screen.
    owned: value.owned.filter((id): id is string => typeof id === "string" && !!rewardItem(id)),
    avatar: {
      look: {
        skin: typeof look.skin === "string" ? look.skin : "3",
        hair: typeof look.hair === "string" ? look.hair : "short",
        hairColor: typeof look.hairColor === "string" ? look.hairColor : "darkbrown",
        glasses: look.glasses === true,
      },
      equipped: Object.fromEntries(Object.entries(a.equipped).filter(([, id]) => typeof id === "string" && !!rewardItem(id))) as Record<string, string>,
      frame: typeof a.frame === "string" ? a.frame : null,
      background: a.background,
      title: typeof a.title === "string" ? a.title : null,
      revision: a.revision as number,
    },
    pack: { date: p.date, goalReached: p.goalReached, claimed: p.claimed, tier: p.tier as number, daysInARow: p.daysInARow as number },
  };
}

export function createRewardsClient(ownerId: string, verifyOwner: () => Promise<string | null>) {
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    if (await verifyOwner() !== ownerId) throw new Error("Account changed");
    const request = supabase.rpc(name, { ...args, p_expected_owner: ownerId });
    const { data, error } = await new Promise<Awaited<typeof request>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Rewards connection timed out")), 10000);
      Promise.resolve(request).then(v => { clearTimeout(timeout); resolve(v); }, e => { clearTimeout(timeout); reject(e); });
    });
    if (error) throw error;
    if (await verifyOwner() !== ownerId) throw new Error("Account changed");
    return data as unknown;
  };
  return {
    load: async () => parseRewardsState(await call("get_rewards_v1")),
    claimSessions: async (): Promise<SessionClaim> => {
      const r = await call("claim_session_rewards_v1");
      if (!isObj(r) || !Array.isArray(r.sessions)) throw new Error("Unexpected rewards reply");
      return {
        sessions: r.sessions.map(s => {
          if (!isObj(s) || typeof s.sessionId !== "string" || count(s.minutesStardust) === null) throw new Error("Unexpected rewards reply");
          return { sessionId: s.sessionId, finds: gifts(s.finds), minutesStardust: s.minutesStardust as number };
        }),
        milestones: gifts(r.milestones),
        state: parseRewardsState(r.state),
      };
    },
    openPack: async (): Promise<PackOpening> => {
      const r = await call("open_daily_pack_v1");
      if (!isObj(r) || count(r.tier) === null || count(r.daysInARow) === null || count(r.stardust) === null) throw new Error("Unexpected rewards reply");
      return { tier: r.tier as number, daysInARow: r.daysInARow as number, items: gifts(r.items), stardust: r.stardust as number, milestones: gifts(r.milestones), state: parseRewardsState(r.state) };
    },
    buy: async (itemId: string) => {
      const r = await call("buy_reward_item_v1", { p_item: itemId });
      if (!isObj(r)) throw new Error("Unexpected rewards reply");
      return { milestones: gifts(r.milestones), state: parseRewardsState(r.state) };
    },
    saveAvatar: async (avatar: Omit<SavedAvatar, "revision">, expectedRevision: number) =>
      parseRewardsState(await call("save_avatar_v1", { p_avatar: avatar, p_expected_revision: expectedRevision })),
  };
}
