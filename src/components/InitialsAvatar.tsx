import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { colors } from "../constants/theme";

/**
 * Quiet, readable tints; text stays light on every one of them. Round 86: the
 * brown and olive gave way to plum and deep lilac, so initials sit in the
 * aubergine family with a cool green and blue for telling friends apart.
 */
const TINTS = ["#3B2737", "#6E4F7A", "#3F6F5A", "#7A4F6E", "#2E5A7A", "#8A3F5E", "#5B4A8A", "#4F4A85"] as const;

/** Up to two letters from a name: "Soon Teck" → "ST", "aina" → "A". */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const letters = words.length === 1 ? [...words[0]].slice(0, 1) : [[...words[0]][0], [...words[words.length - 1]][0]];
  return letters.join("").toLocaleUpperCase();
}

/** A stable tint for a person, from their id (or name when there's no id). */
export function initialsTint(key: string | null | undefined): string {
  let hash = 0;
  for (const char of key ?? "") hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

/**
 * A person's picture: their initials on a calm circle. Used for you and for
 * everyone in your squad; there are no characters or levels any more.
 */
export default memo(function InitialsAvatar({ name, id, size = 44, focusing = false, testID }: {
  name: string | null | undefined; id?: string | null; size?: number; focusing?: boolean; testID?: string;
}) {
  return <View testID={testID} style={[s.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: initialsTint(id ?? name) },
    focusing && { borderWidth: 2, borderColor: colors.progress }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
    <Text style={[s.text, { fontSize: Math.max(11, Math.round(size * 0.38)) }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{initialsOf(name)}</Text>
  </View>;
});

const s = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  text: { color: "#F6F2EC", fontWeight: "600" },
});
