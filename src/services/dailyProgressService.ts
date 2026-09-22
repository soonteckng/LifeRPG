import { supabase } from "../../lib/supabase";

export interface DailyProgress {
  user_id: string;
  progress_date: string;
  goal_minutes: number;
  completed_minutes: number;
  goal_completed: boolean;
  goal_completed_at: string | null;
  created_at: string;
}

function getTodayDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
}

export async function getTodayProgress(): Promise<DailyProgress | null> {
  const today = getTodayDate();

  const { data, error } = await supabase
    .from("daily_progress")
    .select(`
      user_id,
      progress_date,
      goal_minutes,
      completed_minutes,
      goal_completed,
      goal_completed_at,
      created_at
    `)
    .eq("progress_date", today)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}