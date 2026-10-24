import { View } from "react-native";
import ProfilePicture from "./adventurer/ProfilePicture";
import { useUser } from "../context/UserContext";
import { useRewards } from "../hooks/useRewards";
import { useShownLevel } from "../services/levelPreview";

// Your profile picture wherever the app shows you (Home, Settings, the
// session result): the same saved look, frame and pet as everywhere else.
// The old `avatar` prop is ignored; it stays so older callers keep working.
export default function CharacterMark({ size = 52, showLevel = true }: { size?: number; avatar?: string; showLevel?: boolean }) {
  const { profile } = useUser();
  const rewards = useRewards();
  const { level } = useShownLevel(profile.id, profile.level);
  // Its level pill adds a little height below the picture.
  return <View style={{ width: size }} importantForAccessibility="no-hide-descendants">
    <ProfilePicture look={rewards.look} equipped={rewards.equipped} level={level} background={rewards.background}
      frame={rewards.frame} streak={profile.streak_count ?? 0} size={size} showLevel={showLevel} />
  </View>;
}
