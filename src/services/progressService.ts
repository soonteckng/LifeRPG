import { supabase } from "../../lib/supabase";

export interface ProgressSession {
  id: string;
  subject_id: number | null;
  activity_type: string;
  duration_seconds: number;
  xp_earned: number;
  gold_earned: number;
  completed_at: string | null;
}

export async function getCompletedSessions(
  sinceDate: string,
): Promise<ProgressSession[]> {
  const { data, error } = await supabase
    .from("activity_sessions")
    .select(
      `
        id,
        subject_id,
        activity_type,
        duration_seconds,
        xp_earned,
        gold_earned,
        completed_at
      `,
    )
    .eq("status", "completed")
    .gte("completed_at", sinceDate)
    .order("completed_at", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getProgressSubjects() {
  const { data, error } = await supabase
    .from("subjects")
    .select(
      "id, title, level, current_xp, color_code",
    )
    .order("id", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data ?? [];
}