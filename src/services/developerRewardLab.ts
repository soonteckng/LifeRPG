import { REWARD_ITEMS } from "./rewardCatalog";
import type { Gift, PackOpening, RewardsState } from "./rewardsService";

export type RewardLabAction = "load" | "buy" | "avatar" | "find" | "pack" | "give" | "duplicate" | "stardust";
export interface RewardLabReply { state: RewardsState; gifts: Gift[]; pack?: PackOpening }
export interface RewardLabSnapshot { state: RewardsState | null; allOwned: boolean; busy: boolean; generation: number }
const EMPTY: RewardLabSnapshot = { state: null, allOwned: false, busy: false, generation: 0 };
/** Memory only. Test inventory and acknowledgements never enter real account caches. */
export function createDeveloperRewardLab() {
  const entries = new Map<string, RewardLabSnapshot>();
  const listeners = new Set<() => void>();
  const set = (scope: string, value: RewardLabSnapshot) => { entries.set(scope, value); for (const listener of listeners) listener(); };
  const snapshot = (scope: string | null) => scope ? entries.get(scope) ?? EMPTY : EMPTY;
  return {
    snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    end(scope: string) { const current = snapshot(scope); set(scope, { ...EMPTY, generation: current.generation + 1 }); },
    reset(scope: string, seed: RewardsState) { const current = snapshot(scope); if (current.state && !current.busy) set(scope, { ...EMPTY, state: seed, generation: current.generation + 1 }); },
    ownAll(scope: string, allOwned: boolean) { const current = snapshot(scope); if (current.state && !current.busy) set(scope, { ...current, allOwned }); },
    async run(scope: string, seed: RewardsState, work: (state: RewardsState) => Promise<RewardLabReply>) {
      const current = snapshot(scope);
      if (current.busy) return { ok: false as const, message: "One moment, still checking your test items." };
      const generation = current.generation;
      set(scope, { ...current, busy: true });
      try {
        const reply = await work(current.state ?? seed);
        if (snapshot(scope).generation !== generation) return { ok: false as const, message: "Your test inventory was closed." };
        set(scope, { ...current, state: reply.state, busy: false });
        return { ok: true as const, value: reply };
      } catch (cause) {
        if (snapshot(scope).generation === generation) set(scope, { ...current, busy: false });
        const message = cause instanceof Error ? cause.message : (cause as { message?: string })?.message;
        return { ok: false as const, message: /dev_reward_lab_v1|schema cache|PGRST202/.test(message ?? "")
          ? "Test inventory needs the Round 75 database update. Your real collection is unchanged."
          : /Not enough Stardust|already have|not sold|don't have|another device|Only developer/.test(message ?? "")
            ? message! : "Couldn't open test rewards. Check your connection and try again." };
      }
    },
  };
}
export const developerRewardLab = createDeveloperRewardLab();
export function emptyTestRewards(real: RewardsState): RewardsState {
  return { ...real, stardust: 500, earned: [], owned: REWARD_ITEMS.filter(item => item.free).map(item => item.id),
    avatar: { ...real.avatar, equipped: {}, frame: null, background: "bg_dusk", title: null, revision: 1 },
    pack: { ...real.pack, claimed: false, goalReached: true, daysInARow: 0, tier: 0 } };
}
