import { View } from "react-native";
import CharacterPortrait from "./CharacterPortrait";

// Home shares the full saved look and quiet idle motion, without a tap target.
export default function CharacterMark({ size = 52, avatar = "🌱" }: { size?: number; avatar?: string }) {
  return <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants"><CharacterPortrait avatar={avatar} size={size} interactive={false} /></View>;
}
