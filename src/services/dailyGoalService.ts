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
}
export function missingGoalAPI(error: unknown) {
  const code = (error as { code?: string })?.code;
  return code === "PGRST202" || code === "42883";
}
function goalSettings(data: unknown): DailyGoalSettings {
  const row = data as DailyGoalSettings;
  if (!row || typeof row.user_id !== "string" || !row.user_id || typeof row.pending !== "boolean" || validateDailyGoal(row.today_goal_minutes) || validateDailyGoal(row.next_goal_minutes)
    || !/^\d{4}-\d{2}-\d{2}$/.test(row.local_date)
    || !/^\d{4}-\d{2}-\d{2}$/.test(row.next_effective_date) || typeof row.timezone !== "string")
    throw new Error("Could not read your daily goal. Please try again.");
  if (row.next_effective_date !== shiftDay(row.local_date, 1))
    throw new Error("Could not verify the effective date of your goal. Please try again.");
  return row;
}
export async function getDailyGoalSettings() {
  const { data, error } = await supabase.rpc("get_daily_goal_settings");
  if (error) throw error;
  return goalSettings(data);
}
export async function scheduleDailyGoal(minutes: number) {
  const validation = validateDailyGoal(minutes);
  if (validation) throw new Error(validation);
  const { data, error } = await supabase.rpc("schedule_daily_goal", { p_goal_minutes: minutes });
  if (error) throw error;
  return goalSettings(data);
}
