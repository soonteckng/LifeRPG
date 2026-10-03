import { supabase } from "../../lib/supabase";
import { validateDailyGoal } from "../utils/dailyGoal";

export async function saveOnboardingProfile(
  username: string,
  avatar: string,
  classTitle: string,
  dailyGoalMinutes: number,
) {
  const validation = validateDailyGoal(dailyGoalMinutes);
  if (validation) throw new Error(validation);
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