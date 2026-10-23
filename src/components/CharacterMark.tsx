import { View } from "react-native";
import ProfilePicture from "./adventurer/ProfilePicture";
import { useUser } from "../context/UserContext";
import { useRewards } from "../hooks/useRewards";

// Your profile picture wherever the app shows you (Home, Settings, the
// session result): the same saved look, frame and pet as everywhere else.
// The old `avatar` prop is ignored; it stays so older callers keep working.
export default function CharacterMark({ size = 52 }: { size?: number; avatar?: string }) {
  const { profile } = useUser();
  const rewards = useRewards();
  return <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
    <ProfilePicture look={rewards.look} equipped={rewards.equipped} level={profile.level ?? 1} background={rewards.background}
      frame={rewards.frame} streak={profile.streak_count ?? 0} size={size} />
  </View>;
}
