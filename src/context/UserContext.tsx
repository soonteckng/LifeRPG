import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getUserProfile, updateUserProfile, UserProfile } from '../../db/database';

interface UserContextType {
  profile: UserProfile;
  username: string;
  avatar: string;
  classTitle: string;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  setHapticsEnabled: (val: boolean) => void;
  updateProfile: (username: string, avatar: string, classTitle: string) => void;
  reloadProfile: () => void;
}

const defaultProfile: UserProfile = {
  id: 1,
  username: 'Hero',
  avatar: '🧙‍♂️',
  class_title: 'Scholar',
  level: 1,
  current_xp: 0,
  streak_count: 1,
  last_active_date: new Date().toISOString().split('T')[0],
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  const reloadProfile = useCallback(() => {
    try {
      const user = getUserProfile();
      if (user) {
        setProfile({ ...user });
      }
    } catch (error) {
      console.error('Failed to reload profile in UserContext:', error);
    }
  }, []);

  useEffect(() => {
    reloadProfile();
  }, [reloadProfile]);

  const updateProfile = (username: string, avatar: string, classTitle: string) => {
    updateUserProfile(username, avatar, classTitle);
    reloadProfile();
  };

  return (
    <UserContext.Provider
      value={{
        profile,
        username: profile.username || 'Hero',
        avatar: profile.avatar || '🧙‍♂️',
        classTitle: profile.class_title || 'Scholar',
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
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
}