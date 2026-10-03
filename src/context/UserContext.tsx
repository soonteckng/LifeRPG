import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
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
  profileLoading: boolean;
  profileError: boolean;
  preferenceError: string | null;
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
  ) => Promise<void>;
  reloadProfile: () => Promise<boolean>;
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

  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const preferencesGeneration = useRef(0);
  const preferenceValues = useRef({ sound: true, haptics: true });
  const profileVersion = useRef(0);
  const profileRequest = useRef<Promise<boolean> | null>(null);
  const preferenceQueue = useRef(Promise.resolve());
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [soundEnabled, applySound] = useState(true);
  const [hapticsEnabled, applyHaptics] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(defaultProfile);
      return true;
    }

    const version = profileVersion.current;
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, username, avatar, class_title, level, current_xp, gold, streak_count, last_active_date, daily_goal_minutes, last_goal_completed_date, onboarding_completed, timezone",
        )
        .eq("id", user.id)
        .single();

      if (error) {
        setProfileError(true);
        return false;
      }

      if (data && version === profileVersion.current) {
        setProfile(data);
        setProfileError(false);
      }
      if (!data) setProfileError(true);
      return !!data;
    } catch (error) {
      console.error("Failed to reload cloud profile:", error);
      setProfileError(true);
      return false;
    } finally {
      setProfileLoading(false);
    }
  }, [user]);
  const reloadProfile = useCallback(() => {
    if (!profileRequest.current)
      profileRequest.current = fetchProfile().finally(() => {
        profileRequest.current = null;
      });
    return profileRequest.current;
  }, [fetchProfile]);

  useEffect(() => {
    void reloadProfile();
  }, [reloadProfile]);

  const preferenceKey = `liferpg:preferences:${user?.id ?? "guest"}`;
  useEffect(() => {
    let alive = true;
    const generation = ++preferencesGeneration.current;
    preferenceValues.current = { sound: true, haptics: true };

    void AsyncStorage.getItem(preferenceKey)
      .then((raw) => {
        if (!alive || generation !== preferencesGeneration.current || !raw)
          return;
        const stored = JSON.parse(raw);
        if (typeof stored.sound === "boolean") {
          preferenceValues.current.sound = stored.sound;
          applySound(stored.sound);
        }
        if (typeof stored.haptics === "boolean") {
          preferenceValues.current.haptics = stored.haptics;
          applyHaptics(stored.haptics);
        }
      })
      .catch(() => {
        if (alive) setPreferenceError("Couldn’t load device preferences.");
      });
    return () => {
      alive = false;
    };
  }, [preferenceKey]);
  const savePreferences = (sound: boolean, haptics: boolean) => {
    preferencesGeneration.current++;
    const key = preferenceKey;
    // Serialise writes so rapid toggles cannot persist out of order.
    preferenceQueue.current = preferenceQueue.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(key, JSON.stringify({ sound, haptics })))
      .then(() => setPreferenceError(null))
      .catch(() =>
        setPreferenceError(
          "Couldn’t save device preferences. Toggle again to retry.",
        ),
      );
  };
  const setSoundEnabled = (value: boolean) => {
    applySound(value);
    preferenceValues.current.sound = value;
    savePreferences(value, preferenceValues.current.haptics);
  };
  const setHapticsEnabled = (value: boolean) => {
    applyHaptics(value);
    preferenceValues.current.haptics = value;
    savePreferences(preferenceValues.current.sound, value);
  };
  const updateProfile = async (
    username: string,
    avatar: string,
    classTitle: string,
  ) => {
    if (!user) throw new Error("User is not authenticated.");
    const clean = username.trim();
    if (!clean || clean.length > 40)
      throw new Error("Enter a name between 1 and 40 characters.");
    const { data, error } = await supabase
      .from("profiles")
      .update({ username: clean, avatar, class_title: classTitle })
      .eq("id", user.id)
      .select("id, username, avatar, class_title")
      .single();
    if (error || !data) throw error ?? new Error("Profile could not be saved.");
    profileVersion.current++;
    setProfile((current) => ({ ...current, ...data }));
  };

  return (
    <UserContext.Provider
      value={{
        profile,
        profileLoading,
        profileError,
        preferenceError,
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
