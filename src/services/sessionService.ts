import { supabase } from "../../lib/supabase";

export interface StartSessionParams {
  targetDurationSeconds: number;
  activityType?: string;
  taskId?: number | null;
  subjectId?: number | null;
  notes?: string | null;
}


export interface OpenActivitySession {
  id: string;
  task_id: number | null;
  subject_id: number | null;
  activity_type: string;
  target_duration_seconds: number;
  elapsed_seconds: number;
  status: "active" | "paused";
  notes: string | null;
  started_at: string;
  last_resumed_at: string | null;
  paused_at: string | null;
}

export interface CompletedSessionResult {
  already_completed: boolean;
  session_id: string;
  duration_seconds: number;
  minutes: number;
  xp_earned: number;
  gold_earned: number;
  level: number;
  current_xp: number;
  gold: number;
  leveled_up: boolean;
  daily_goal_minutes: number;
  daily_completed_minutes: number;
  daily_goal_completed: boolean;
  streak_count: number;
}

async function callRpc<T>(
  functionName: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(functionName, params);

  if (error) {
    console.error(`Supabase RPC ${functionName} failed:`, error);
    throw error;
  }

  return data as T;
}

export async function getOpenActivitySession(): Promise<OpenActivitySession | null> {
  const { data, error } = await supabase
    .from("activity_sessions")
    .select(
      "id, task_id, subject_id, activity_type, target_duration_seconds, elapsed_seconds, status, notes, started_at, last_resumed_at, paused_at",
    )
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to load open activity session:", error);
    throw error;
  }

  return data;
}

export async function startActivitySession({
  targetDurationSeconds,
  activityType = "general",
  taskId = null,
  subjectId = null,
  notes = null,
}: StartSessionParams): Promise<string> {
  return callRpc<string>("start_activity_session", {
    p_target_duration_seconds: targetDurationSeconds,
    p_activity_type: activityType,
    p_task_id: taskId,
    p_subject_id: subjectId,
    p_notes: notes,
  });
}

export async function pauseActivitySession(sessionId: string): Promise<void> {
  await callRpc("pause_activity_session", {
    p_session_id: sessionId,
  });
}

export async function resumeActivitySession(sessionId: string): Promise<void> {
  await callRpc("resume_activity_session", {
    p_session_id: sessionId,
  });
}

export async function cancelActivitySession(sessionId: string): Promise<void> {
  await callRpc("cancel_activity_session", {
    p_session_id: sessionId,
  });
}

export async function completeActivitySession(
  sessionId: string,
): Promise<CompletedSessionResult> {
  return callRpc<CompletedSessionResult>("complete_activity_session", {
    p_session_id: sessionId,
  });
}