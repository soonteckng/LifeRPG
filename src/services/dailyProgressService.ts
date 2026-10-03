import { supabase } from "../../lib/supabase";
import { getDailyGoalSettings, missingGoalAPI } from "./dailyGoalService";
import { dateKey } from "../utils/progressAnalytics";

export interface DailyProgress {
  user_id: string;
  progress_date: string;
  goal_minutes: number;
  completed_minutes: number;
  goal_completed: boolean;
  goal_completed_at: string | null;
  created_at: string;
  // A read-only target snapshot is not a saved daily achievement.
  is_snapshot?: boolean;
}

function getTodayDate(timeZone: string): string {
  return dateKey(new Date(), timeZone);
}

export async function getTodayProgress(
  timeZone = "Asia/Kuala_Lumpur",
): Promise<DailyProgress | null> {
  const today = getTodayDate(timeZone);

  const { data, error } = await supabase
    .from("daily_progress")
    .select(
      `
      user_id,
      progress_date,
      goal_minutes,
      completed_minutes,
      goal_completed,
      goal_completed_at,
      created_at
    `,
    )
    .eq("progress_date", today)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) return data;
  try {
    const goal = await getDailyGoalSettings();
    return { user_id: goal.user_id, progress_date: goal.local_date, goal_minutes: goal.today_goal_minutes,
      completed_minutes: 0, goal_completed: false, goal_completed_at: null, created_at: "", is_snapshot: true };
  } catch (error) {
    // Projects without the optional goal API cannot have scheduled goals yet.
    if (missingGoalAPI(error)) return null;
    throw error;
  }
}
