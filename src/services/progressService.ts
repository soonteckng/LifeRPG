import { supabase } from "../../lib/supabase";
import { dateKey, shiftDay } from "../utils/progressAnalytics";
import type { Subject } from "./taskService";
import { focusDay } from "../utils/focusDays";

export interface ProgressSession {
  id: string;
  subject_id: number | null;
  task_id?: number | null;
  activity_type: string;
  notes?: string | null;
  duration_seconds: number;
  xp_earned: number;
  gold_earned: number;
  completed_at: string | null;
  credit_version?: number | null;
  credit_result?: { area_xp_earned?: number | null; character_remainder_seconds?: number; area_remainder_seconds?: number | null; credited_date?: string } | null;
}
export interface ProgressGoal {
  progress_date: string;
  goal_minutes: number;
  completed_minutes: number;
  completed_seconds?: number | null;
  credit_version?: number | null;
  goal_completed: boolean;
}
// Includes optional saved receipts without requesting absent legacy columns.
const FIELDS = "*";
const PAGE_SIZE = 500;

export async function getCompletedSessions(
  sinceDate: string,
  untilDate?: string,
): Promise<ProgressSession[]> {
  const rows: ProgressSession[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from("activity_sessions")
      .select(FIELDS)
      .eq("status", "completed")
      .gte("completed_at", sinceDate);
    if (untilDate) query = query.lt("completed_at", untilDate);
    const { data, error } = await query
      .order("completed_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
export async function getProgressGoals(
  start: string,
  end: string,
): Promise<ProgressGoal[]> {
  const rows: ProgressGoal[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("daily_progress")
      .select("*")
      .gte("progress_date", start)
      .lte("progress_date", end)
      .order("progress_date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
export async function getProgressSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, title, level, current_xp, color_code")
    .order("id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
export async function getSessionHistory(
  offset: number,
  before: string,
): Promise<{ sessions: ProgressSession[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from("activity_sessions")
    .select(FIELDS)
    .eq("status", "completed")
    .lte("completed_at", before)
    .order("completed_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 49);
  if (error) throw error;
  return { sessions: data ?? [], hasMore: data?.length === 50 };
}

// Count completed-session days, separately from the backend's daily-goal streak.
// Yesterday keeps the streak alive until the user has had a chance to focus today.
export async function getFocusStreak(
  timeZone: string,
  now = new Date(),
): Promise<number> {
  const today = dateKey(now, timeZone);
  let expected = today,
    streak = 0;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("activity_sessions")
      .select("completed_at, id, duration_seconds")
      .eq("status", "completed")
      .gt("duration_seconds", 0)
      .lte("completed_at", now.toISOString())
      .order("completed_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const key = focusDay(row, timeZone, now);
      if (!key) continue;
      if (streak === 0 && key === shiftDay(today, -1)) expected = key;
      if (key === expected) {
        streak++;
        expected = shiftDay(expected, -1);
      } else if (key < expected) return streak;
    }
    if (!data || data.length < PAGE_SIZE) return streak;
  }
}

// A bounded, owner-filtered lookup, separate from Progress's paginated history.
// RLS still applies; never reuse one account's choice for another account.
export type QuickStartSession = Pick<ProgressSession, "id" | "task_id" | "subject_id" | "duration_seconds" | "completed_at">;

export async function getLastFreeSession(userId: string, now = new Date()): Promise<QuickStartSession | null> {
  const { data, error } = await supabase.from("activity_sessions")
    .select("id, task_id, subject_id, activity_type, duration_seconds, completed_at")
    .eq("user_id", userId).eq("status", "completed").is("task_id", null)
    .gte("duration_seconds", 300).lte("duration_seconds", 480 * 60)
    .lte("completed_at", now.toISOString())
    .order("completed_at", { ascending: false }).order("id", { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}
