import { supabase } from "../../lib/supabase";

export interface Reward {
  id: string;
  user_id: string;
  title: string;
  cost_gold: number;
  created_at: string;
}

export interface RewardChest {
  id: string;
  user_id: string;
  progress_date: string;
  reward_gold: number;
  opened_at: string | null;
  created_at: string;
}

export interface ExclusiveReward {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlock_type: "streak" | "level" | "sessions" | "minutes";
  unlock_value: number;
  created_at: string;
}

export async function getRewards(): Promise<Reward[]> {
  const { data, error } = await supabase
    .from("rewards")
    .select(
      "id, user_id, title, cost_gold, created_at",
    )
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createReward(
  title: string,
  costGold: number,
): Promise<Reward> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(
      "User is not authenticated.",
    );
  }

  const { data, error } = await supabase
    .from("rewards")
    .insert({
      user_id: user.id,
      title,
      cost_gold: costGold,
    })
    .select(
      "id, user_id, title, cost_gold, created_at",
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteReward(
  rewardId: string,
): Promise<void> {
  const { error } = await supabase
    .from("rewards")
    .delete()
    .eq("id", rewardId);

  if (error) {
    throw error;
  }
}

export async function redeemReward(
  rewardId: string,
) {
  const { data, error } =
    await supabase.rpc(
      "redeem_reward",
      {
        p_reward_id: rewardId,
      },
    );

  if (error) {
    throw error;
  }

  return data as {
    success: boolean;
    reason?: string;
    reward_id?: string;
    reward_title?: string;
    cost_gold?: number;
    remaining_gold?: number;
  };
}

/* -------------------- REWARD CHEST -------------------- */

export async function getTodayRewardChest(): Promise<RewardChest | null> {
  const today = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Kuala_Lumpur",
    },
  ).format(new Date());

  const { data, error } = await supabase
    .from("reward_chests")
    .select(
      "id, user_id, progress_date, reward_gold, opened_at, created_at",
    )
    .eq("progress_date", today)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function openDailyRewardChest() {
  const { data, error } =
    await supabase.rpc(
      "open_daily_reward_chest",
    );

  if (error) {
    throw error;
  }

  return data as {
    success: boolean;
    reason?: string;
    reward_gold?: number;
    remaining_gold?: number;
    opened_at?: string;
  };
}

/* ---------------- EXCLUSIVE REWARDS ---------------- */

export async function getExclusiveRewards(): Promise<
  ExclusiveReward[]
> {
  const { data, error } = await supabase
    .from("exclusive_rewards")
    .select(
      `
        id,
        title,
        description,
        icon,
        unlock_type,
        unlock_value,
        created_at
      `,
    )
    .order("unlock_value", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data ?? [];
}