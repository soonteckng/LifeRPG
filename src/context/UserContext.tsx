import React, { createContext, useContext, useState, useEffect } from 'react';
import { getUserProfile, updateUserProfile, UserProfile } from '../../db/database';

interface UserContextType {
  profile: UserProfile | null;
  username: string;
  avatar: string;
  classTitle: string;
  updateProfile: (name: string, av: string, cls: string) => void;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  hapticsEnabled: boolean;
  setHapticsEnabled: (val: boolean) => void;
  reloadProfile: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [username, setUsernameState] = useState('Hero Player');
  const [avatar, setAvatarState] = useState('🥷');
  const [classTitle, setClassTitleState] = useState('Scholar');

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  const reloadProfile = () => {
    const user = getUserProfile();
    if (user) {
      setProfile(user);
      setUsernameState(user.username || 'Hero Player');
      setAvatarState(user.avatar || '🥷');
      setClassTitleState(user.class_title || 'Scholar');
    }
  };

  useEffect(() => {
    reloadProfile();
  }, []);

  const updateProfile = (newName: string, newAvatar: string, newClass: string) => {
    setUsernameState(newName);
    setAvatarState(newAvatar);
    setClassTitleState(newClass);
    updateUserProfile(newName, newAvatar, newClass);
    reloadProfile();
  };

  return (
    <UserContext.Provider
      value={{
        profile,
        username,
        avatar,
        classTitle,
        updateProfile,
        soundEnabled,
        setSoundEnabled,
        hapticsEnabled,
        setHapticsEnabled,
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