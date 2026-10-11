import { supabase } from "../../lib/supabase";
import { validateDailyGoal } from "../utils/dailyGoal";
import { shiftDay } from "../utils/progressAnalytics";
export interface DailyGoalSettings {
  user_id: string;
  local_date: string;
  timezone: string;
  today_goal_minutes: number;
  next_goal_minutes: number;
  next_effective_date: string;
  pending: boolean;
  scheduling_available: boolean;
  weekly_limit_available: boolean;
  can_change_goal: boolean;
  next_change_at: string | null;
}
export function missingGoalAPI(error: unknown) {
  const code = (error as { code?: string })?.code;
  return code === "PGRST202" || code === "42883";
}
function goalSettings(data: unknown): DailyGoalSettings {
  const row = data as DailyGoalSettings;
  // Existing historical targets below the new minimum must remain readable.
  const validStoredGoal = (value: number) => Number.isInteger(value) && value >= 15 && value <= 480;
  if (!row || typeof row.user_id !== "string" || !row.user_id || typeof row.pending !== "boolean" || !validStoredGoal(row.today_goal_minutes) || !validStoredGoal(row.next_goal_minutes)
    || !/^\d{4}-\d{2}-\d{2}$/.test(row.local_date)
    || !/^\d{4}-\d{2}-\d{2}$/.test(row.next_effective_date) || typeof row.timezone !== "string")
    throw new Error("Could not read your daily goal. Please try again.");
  if (row.next_effective_date !== shiftDay(row.local_date, 1))
    throw new Error("Could not verify the effective date of your goal. Please try again.");
  // Older/read-only APIs are not evidence that the scheduling RPC exists.
  const weekly = row.weekly_limit_available === true && typeof row.can_change_goal === "boolean"
    && (row.next_change_at === null || (typeof row.next_change_at === "string" && Number.isFinite(Date.parse(row.next_change_at))));
  return { ...row, scheduling_available: row.scheduling_available === true,
    weekly_limit_available: weekly, can_change_goal: weekly && row.can_change_goal === true,
    next_change_at: weekly ? row.next_change_at : null };
}
function verifyGoalOwner(row: DailyGoalSettings, expectedOwnerId?: string) {
  if (expectedOwnerId && row.user_id !== expectedOwnerId) throw new Error("Your account changed. Open your goal again.");
  return row;
}
function goalDeadline<T>(work: (signal: AbortSignal) => PromiseLike<T>, milliseconds: number, message: string): Promise<T> {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true; clearTimeout(timer); callback();
    };
    const timer = setTimeout(() => finish(() => {
      controller.abort(); reject(new Error(message));
    }), milliseconds);
    Promise.resolve().then(() => work(controller.signal)).then(
      value => finish(() => resolve(value)), failure => finish(() => reject(failure)),
    );
  });
}
export async function getDailyGoalSettings(expectedOwnerId?: string) {
  return goalDeadline(async signal => {
    const request = supabase.rpc("get_daily_goal_settings");
    const { data, error } = await (typeof request.abortSignal === "function" ? request.abortSignal(signal) : request);
    if (error) throw error;
    return verifyGoalOwner(goalSettings(data), expectedOwnerId);
  }, 8_000, "Could not check your goal in time. Reconnect and check again.");
}
export async function scheduleDailyGoal(minutes: number, expectedOwnerId?: string) {
  const validation = validateDailyGoal(minutes);
  if (validation) throw new Error(validation);
  return goalDeadline(async signal => {
    if (expectedOwnerId) {
      const { data, error } = await goalDeadline(() => supabase.auth.getUser(), 8_000, "Confirm your account before changing your goal.");
      if (error || data.user?.id !== expectedOwnerId) throw new Error("Confirm your account before changing your goal.");
    }
    if (signal.aborted) throw new Error("Could not confirm your goal change.");
    const request = supabase.rpc("schedule_daily_goal", { p_goal_minutes: minutes });
    const { data, error } = await (typeof request.abortSignal === "function" ? request.abortSignal(signal) : request);
    if (error) throw error;
    return verifyGoalOwner(goalSettings(data), expectedOwnerId);
  }, 20_000, "Could not confirm your goal change in time. Check its current schedule before trying again.");
}
