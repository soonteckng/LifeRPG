import { useState } from "react";
import { Pressable, View } from "react-native";
import CharacterArt from "./CharacterArt";
import { characterLook } from "../utils/characterAppearance";
import { useCharacterMotion } from "../hooks/useCharacterMotion";

export default function CharacterPortrait({ avatar, level = 1, developed = 0, size = 176, animate = true, interactive = true }: {
  avatar: string; level?: number; developed?: number; size?: number; animate?: boolean; interactive?: boolean;
}) {
  const motion = useCharacterMotion(animate), look = characterLook(avatar);
  const [expression, setExpression] = useState(0);
  const art = <CharacterArt avatar={avatar} size={size} expression={expression} bodyStyle={motion.bodyStyle} eyeStyle={motion.eyeStyle} armStyle={motion.armStyle} />;
  if (!interactive) return <View style={{ width: size, height: size, alignSelf: "center" }} importantForAccessibility="no-hide-descendants">{art}</View>;
  return <Pressable style={({ pressed }) => [{ width: size, height: size, alignSelf: "center" }, pressed && { opacity: 0.9 }]}
    accessibilityRole="button" accessibilityLabel={`${look.title}, your companion. Level ${level}. ${developed} focus areas developed.`}
    accessibilityHint="Your companion breathes and blinks. Tap for a little greeting."
    onPress={() => { setExpression(value => (value + 1) % 3); motion.greet(); }}>{art}</Pressable>;
}
