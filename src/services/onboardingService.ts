import { supabase } from "../../lib/supabase";

export async function saveOnboardingProfile(
  username: string,
  avatar: string,
  classTitle: string,
  dailyGoalMinutes: number,
) {
  const { data, error } =
    await supabase.rpc(
      "complete_onboarding",
      {
        p_username: username,
        p_avatar: avatar,
        p_class_title: classTitle,
        p_daily_goal_minutes:
          dailyGoalMinutes,
      },
    );

  if (error) {
    throw error;
  }

  return data;
}

export async function finishOnboarding() {
  const { data, error } =
    await supabase.rpc(
      "finish_onboarding",
    );

  if (error) {
    throw error;
  }

  return data;
}