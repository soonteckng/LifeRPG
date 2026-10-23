import { profileNameError } from "../constants/profile";
import { supabase } from "../../lib/supabase";
import { validateDailyGoal } from "../utils/dailyGoal";

export async function saveOnboardingProfile(
  username: string,
  avatar: string,
  dailyGoalMinutes: number,
) {
  const nameError = profileNameError(username);
  if (nameError) throw new Error(nameError);
  const validation = validateDailyGoal(dailyGoalMinutes);
  if (validation) throw new Error(validation);
  const { data, error } =
    await supabase.rpc(
      "complete_onboarding",
      {
        p_username: username.trim(),
        p_avatar: avatar,
        // The server ignores this now; older app versions still send one.
        p_class_title: null,
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

/** The intro's name step: is this name free? Old servers without the check say yes. */
export async function usernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("username_available_v1", { p_username: username.trim() });
  if (error) {
    if ((error as { code?: string }).code === "PGRST202") return true;
    throw error;
  }
  return data !== false;
}
