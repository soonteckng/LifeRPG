// Talks to the rewards functions on the server. Every call carries the
// signed-in owner, and answers are checked against the same owner, like the
// squad calls.
import { supabase } from "../../lib/supabase";
import { rewardItem, type RewardRarity } from "./rewardCatalog";
import type { RewardLabAction, RewardLabReply } from "./developerRewardLab";
import type { AdventurerLook } from "../utils/adventurerLook";

export type AvatarLook = AdventurerLook;
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
  /** What was really earned (developers own everything, but only this is celebrated). */
  earned: string[];
  avatar: SavedAvatar;
  pack: { date: string; goalReached: boolean; claimed: boolean; tier: number; daysInARow: number };
  /** Today's walk on the trail: focused seconds and finds made today. */
  today: { seconds: number; finds: number; date?: string; findsComplete?: boolean; pendingFinds?: number };
  /**
   * Today's trail: a stop with a find every `findSeconds` of focus, `stops`
   * of them; reaching the end (`complete`) gives a bonus once a day.
   */
  trail: { findSeconds: number; stops: number; complete: boolean };
  /**
   * Chosen rewards: reaching the daily goal saves a goal day; five saved days
   * earn the reward you chose. Missing from servers without the Round 82 SQL.
   */
  chosen?: ChosenRewards;
}
export interface ChosenGrant extends Gift { id: string }
export interface ChosenRewards {
  /** False on the launch day, when that day's pack still applies. */
  enabled: boolean; startsOn: string | null; requiredDays: number;
  /** Goal days saved and not yet spent. */
  balance: number; target: string | null; revision: number;
  offers: { slot: number; item: string }[];
  /** Earned and not yet shown on this account (acknowledged once seen). */
  grants: ChosenGrant[];
}
export type DevRewardAction = "stardust" | "reopen_pack" | "find" | "next_milestones" | "reearn";
export interface Gift { item: string; rarity: RewardRarity; new: boolean; stardust: number; reason?: "hours" | "streak" | "set" }
export interface SessionClaim {
  sessions: { sessionId: string; finds: Gift[]; minutesStardust: number; seconds: number; daySecondsBefore: number | null;
    daySecondsAfter: number | null; creditedDate: string | null; trailStardust: number }[];
  milestones: Gift[]; state: RewardsState;
}
/** The trail as this claim saw it, so a later refresh cannot move an earlier walk. */
export interface ClaimedTrail {
  seconds: number; fromSeconds: number; finds: number; nextFindSeconds: number;
  findSeconds: number; stops: number; complete: boolean; date?: string; pendingFinds?: number;
}
export function claimedTrail(claim: SessionClaim): ClaimedTrail {
  const { today, trail } = claim.state;
  const sessions = today.date ? claim.sessions.filter(session => session.creditedDate === today.date) : claim.sessions;
  const before = sessions.map(session => session.daySecondsBefore).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const fromSeconds = before.length ? Math.min(...before) : Math.max(0, today.seconds - sessions.reduce((sum, session) => sum + session.seconds, 0));
  return { ...trail, seconds: today.seconds, fromSeconds: Math.min(today.seconds, fromSeconds), finds: today.finds,
    nextFindSeconds: claim.state.nextFindSeconds, ...(today.date ? { date: today.date } : {}),
    ...(today.pendingFinds === undefined ? {} : { pendingFinds: today.pendingFinds }) };
}
/** Before the daily trail (Round 64 SQL), a find came every 25 minutes and the map showed 6 stops. */
export const LEGACY_TRAIL = { findSeconds: 1500, stops: 6 } as const;
export interface PackOpening { tier: number; daysInARow: number; items: Gift[]; stardust: number; milestones: Gift[]; state: RewardsState }

const RARITIES = new Set(["common", "uncommon", "rare", "epic", "legendary"]);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);
const day = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/** Reads the chosen-reward part of a reply. Anything unexpected hides the feature rather than breaking rewards. */
export function parseChosen(value: unknown): ChosenRewards | undefined {
  if (!isObj(value) || typeof value.enabled !== "boolean" || count(value.balance) === null || count(value.revision) === null
    || count(value.requiredDays) === null || !Array.isArray(value.offers) || !Array.isArray(value.grants)) return undefined;
  const offers = value.offers.flatMap(o => isObj(o) && count(o.slot) !== null && typeof o.item === "string" && rewardItem(o.item)
    ? [{ slot: o.slot as number, item: o.item }] : []);
  const grants = value.grants.flatMap(g => isObj(g) && typeof g.id === "string" && typeof g.item === "string" && rewardItem(g.item) && RARITIES.has(String(g.rarity))
    ? [{ id: g.id, item: g.item, rarity: g.rarity as RewardRarity, new: true, stardust: 0 }] : []);
  return { enabled: value.enabled, startsOn: day(value.startsOn), requiredDays: Math.max(1, value.requiredDays as number),
    balance: value.balance as number, target: typeof value.target === "string" && rewardItem(value.target) ? value.target : null,
    revision: value.revision as number, offers, grants };
}

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
  // The wire reply has top-level rules; the private phone cache contains this
  // parser's nested `trail`. Preserve both, including the completion flag.
  const savedTrail = isObj(value.trail) ? value.trail : null;
  const validRules = (find: unknown, stopCount: unknown) => {
    const interval = count(find), stops = count(stopCount);
    return interval !== null && stops !== null && interval > 0 && stops > 0 && stops <= 24 && interval * stops <= 86400;
  };
  const wireFind = count(value.findSeconds), wireLength = count(value.trailSeconds);
  const wireStops = wireFind && wireLength ? wireLength / wireFind : null;
  const wireRulesValid = validRules(wireFind, wireStops), savedRulesValid = validRules(savedTrail?.findSeconds, savedTrail?.stops);
  const rules = wireRulesValid ? { findSeconds: wireFind!, stops: wireStops! }
    : savedRulesValid ? { findSeconds: savedTrail!.findSeconds as number, stops: savedTrail!.stops as number }
      : LEGACY_TRAIL;
  const { findSeconds, stops } = rules;
  if (!isObj(look) || !isObj(a.equipped) || typeof a.background !== "string" || count(a.revision) === null
    || typeof p.date !== "string" || typeof p.goalReached !== "boolean" || typeof p.claimed !== "boolean" || count(p.tier) === null || count(p.daysInARow) === null)
    throw new Error("Unexpected rewards reply");
  return {
    stardust: value.stardust as number,
    nextFindSeconds: value.nextFindSeconds as number,
    // Items the app doesn't know yet (from a newer server) are left out rather than breaking the screen.
    owned: value.owned.filter((id): id is string => typeof id === "string" && !!rewardItem(id)),
    earned: (Array.isArray(value.earned) ? value.earned : value.owned).filter((id): id is string => typeof id === "string" && !!rewardItem(id)),
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
    // Older servers leave today out; nothing walked yet is the safe reading.
    today: isObj(value.today) && count(value.today.seconds) !== null && count(value.today.finds) !== null
      ? { seconds: value.today.seconds as number, finds: value.today.finds as number,
        ...(day(value.today.date) ? { date: value.today.date as string } : {}),
        ...(typeof value.today.findsComplete === "boolean" ? { findsComplete: value.today.findsComplete } : {}),
        ...(count(value.today.pendingFinds) === null ? {} : { pendingFinds: value.today.pendingFinds as number }) } : { seconds: 0, finds: 0 },
    trail: {
      findSeconds, stops,
      complete: (wireRulesValid || savedRulesValid) && (isObj(value.today) && typeof value.today.trailComplete === "boolean" ? value.today.trailComplete : savedTrail?.complete === true),
    },
    ...(() => { const chosen = parseChosen(value.chosen); return chosen ? { chosen } : {}; })(),
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
    /** Allowlisted developers only. Server executes the real reward RPCs and rolls back their writes. */
    lab: async (action: RewardLabAction, state: RewardsState, item: string | null = null, amount = 0, avatar: Omit<SavedAvatar, "revision" | "frame"> | null = null): Promise<RewardLabReply> => {
      const r = await call("dev_reward_lab_v1", { p_action: action, p_snapshot: state, p_item: item, p_amount: amount, p_avatar: avatar });
      if (!isObj(r)) throw new Error("Unexpected rewards reply");
      const next = parseRewardsState(r.state);
      const pack = isObj(r.pack) && count(r.pack.tier) !== null && count(r.pack.daysInARow) !== null && count(r.pack.stardust) !== null
        ? { tier: r.pack.tier as number, daysInARow: r.pack.daysInARow as number, stardust: r.pack.stardust as number,
          items: gifts(r.pack.items), milestones: gifts(r.pack.milestones), state: next } : undefined;
      return { state: next, gifts: gifts(r.gifts), ...(pack ? { pack } : {}) };
    },
    load: async () => parseRewardsState(await call("get_rewards_v1")),
    claimSessions: async (): Promise<SessionClaim> => {
      const r = await call("claim_session_rewards_v1");
      if (!isObj(r) || !Array.isArray(r.sessions)) throw new Error("Unexpected rewards reply");
      return {
        sessions: r.sessions.map(s => {
          if (!isObj(s) || typeof s.sessionId !== "string" || count(s.minutesStardust) === null) throw new Error("Unexpected rewards reply");
          return { sessionId: s.sessionId, finds: gifts(s.finds), minutesStardust: s.minutesStardust as number,
            seconds: count(s.seconds) ?? (s.minutesStardust as number) * 300,
            daySecondsBefore: count(s.daySecondsBefore), daySecondsAfter: count(s.daySecondsAfter),
            creditedDate: day(s.creditedDate), trailStardust: count(s.trailStardust) ?? 0 };
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
    /** Choose (or, with null, stop choosing) the reward to work toward. Granted at once if enough days are saved. */
    chooseReward: async (item: string | null, expectedRevision: number, requestId: string) =>
      parseRewardsState(await call("choose_reward_v1", { p_item: item, p_expected_revision: expectedRevision, p_request_id: requestId })),
    /** Marks earned chosen rewards as shown, so they are celebrated once. */
    acknowledgeChosen: async (grantIds: string[]) =>
      parseRewardsState(await call("acknowledge_chosen_rewards_v1", { p_grants: grantIds })),
    /** Developers only: the real chosen-reward rules on test days and test items, rolled back on the server. */
    chosenLab: async (action: "load" | "day" | "select", snapshot: { earned: string[]; chosen?: Omit<ChosenRewards, "grants" | "enabled" | "startsOn" | "requiredDays"> }, item: string | null = null) =>
      parseRewardsState(await call("dev_chosen_reward_lab_v1", { p_action: action, p_snapshot: snapshot, p_item: item })),
    /** The frame isn't saved: it follows the highest streak frame earned. */
    saveAvatar: async (avatar: Omit<SavedAvatar, "revision" | "frame">, expectedRevision: number) =>
      parseRewardsState(await call("save_avatar_v1", { p_avatar: { look: avatar.look, equipped: avatar.equipped, background: avatar.background, title: avatar.title }, p_expected_revision: expectedRevision })),
    /** Developer accounts only; the server refuses everyone else. Test finds and milestones come back as gifts. */
    developer: async (action: DevRewardAction, amount = 0) => {
      const r = await call("dev_rewards_v1", { p_action: action, p_amount: amount });
      return { state: parseRewardsState(r), gifts: isObj(r) && Array.isArray(r.gifts) ? gifts(r.gifts) : [] };
    },
  };
}
