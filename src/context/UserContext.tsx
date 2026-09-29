import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "./AuthContext";

export interface UserProfile {
  id: string;
  username: string;
  avatar: string;
  class_title: string;
  level: number;
  current_xp: number;
  gold: number;
  streak_count: number;
  last_active_date: string | null;
  daily_goal_minutes: number;
  last_goal_completed_date: string | null;
  onboarding_completed: boolean;
  timezone: string;
}

interface UserContextType {
  profile: UserProfile;
  username: string;
  avatar: string;
  classTitle: string;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  setHapticsEnabled: (val: boolean) => void;
  updateProfile: (
    username: string,
    avatar: string,
    classTitle: string,
  ) => void;
  reloadProfile: () => void;
}

const defaultProfile: UserProfile = {
  id: "",
  username: "Hero",
  avatar: "🧙‍♂️",
  class_title: "Scholar",
  level: 1,
  current_xp: 0,
  gold: 0,
  streak_count: 1,
  last_active_date: new Date().toISOString().split("T")[0],
  daily_goal_minutes: 60,
  last_goal_completed_date: null,
  onboarding_completed: false,
  timezone: "Asia/Kuala_Lumpur",
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  const reloadProfile = useCallback(async () => {
    if (!user) {
      setProfile(defaultProfile);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, username, avatar, class_title, level, current_xp, gold, streak_count, last_active_date, daily_goal_minutes, last_goal_completed_date, onboarding_completed, timezone",
        )
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Failed to reload cloud profile:", error);
        return;
      }

      if (data) {
        setProfile(data);
      }
    } catch (error) {
      console.error("Failed to reload cloud profile:", error);
    }
  }, [user]);

  useEffect(() => {
    reloadProfile();
  }, [reloadProfile]);

  const updateProfile = async (
    username: string,
    avatar: string,
    classTitle: string,
  ) => {
    if (!user) {
      console.error("Cannot update profile: no authenticated user.");
      return;
    }

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username,
          avatar,
          class_title: classTitle,
        })
        .eq("id", user.id);

      if (error) {
        console.error("Failed to update cloud profile:", error);
        return;
      }

      await reloadProfile();
    } catch (error) {
      console.error("Failed to update cloud profile:", error);
    }
  };

  return (
    <UserContext.Provider
      value={{
        profile,
        username: profile.username || "Hero",
        avatar: profile.avatar || "🧙‍♂️",
        classTitle: profile.class_title || "Scholar",
        soundEnabled,
        hapticsEnabled,
        setSoundEnabled,
        setHapticsEnabled,
        updateProfile,
        reloadProfile,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }

  return context;
}