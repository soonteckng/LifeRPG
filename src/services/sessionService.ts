import { supabase } from "../../lib/supabase";

export interface StartSessionParams {
  targetDurationSeconds: number;
  activityType?: string;
  taskId?: number | null;
  subjectId?: number | null;
  notes?: string | null;
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