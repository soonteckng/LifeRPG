import { getDailyGoalSettings, type DailyGoalSettings } from "../services/dailyGoalService";
import { dateKey } from "./progressAnalytics";

// The last goal reading per account, shared by Home's goal sheet and
// Settings › Daily goal, so either opens with real numbers at once. A fresh
// read still follows every open; the server stays the authority.
const recent = new Map<string, { data: DailyGoalSettings; at: number }>();
const FRESH_MS = 10 * 60_000;
export const rememberDailyGoal = (data: DailyGoalSettings) => { recent.set(data.user_id, { data, at: Date.now() }); };
export const cachedDailyGoal = (owner: string) => {
  const entry = recent.get(owner), now = Date.now();
  // Even a minute-old reading can describe yesterday's scheduled target.
  return entry && now - entry.at < FRESH_MS && entry.data.local_date === dateKey(new Date(now), entry.data.timezone) ? entry.data : null;
};
export const forgetDailyGoal = (owner: string) => { recent.delete(owner); };
/** Read quietly ahead of time (for example when Settings opens), only when nothing recent is known. */
export function prefetchDailyGoal(owner: string) {
  if (!owner || cachedDailyGoal(owner)) return;
  void getDailyGoalSettings(owner).then(rememberDailyGoal, () => {});
}
