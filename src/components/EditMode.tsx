import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";

/**
 * Edit mode is the same everywhere: hold a subject, routine or exam and every
 * card in that list wiggles gently and shows ✎ (edit) and − (remove).
 * Tap a card or Done to finish.
 */
export function Wiggle({ active, seed, degrees, style, children }: {
  active: boolean; seed: string; degrees: number; style?: StyleProp<ViewStyle>; children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [turn] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active || reduced) { turn.stopAnimation(); turn.setValue(0); return; }
    const step = (toValue: number, duration: number) => Animated.timing(turn, { toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([step(1, 170), step(-1, 340), step(0, 170)]));
    // Each card starts at a slightly different point, so they never move in lockstep.
    const start = setTimeout(() => loop.start(), ([...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5) * 60);
    return () => { clearTimeout(start); loop.stop(); };
  }, [active, reduced, turn, seed]);
  return <Animated.View style={[style, { transform: [{ rotate: turn.interpolate({ inputRange: [-1, 1], outputRange: [`-${degrees}deg`, `${degrees}deg`] }) }] }]}>{children}</Animated.View>;
}

/** ✎ and − side by side. "corner" sits over a tile's top-right corner; "inline" takes a row's trailing place. */
export function EditBadges({ name, onEdit, onRemove, placement = "inline" }: {
  name: string; onEdit?: () => void; onRemove?: () => void; placement?: "corner" | "inline";
}) {
  return <View style={placement === "corner" ? s.corner : s.inline} testID="edit-badges">
    {onEdit && <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${name}`} hitSlop={6} style={[s.badge, placement === "corner" ? s.ring : s.large, s.edit]}>
      <Ionicons name="pencil" size={13} color={colors.text} /></Pressable>}
    {onRemove && <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${name}`} hitSlop={6} style={[s.badge, placement === "corner" ? s.ring : s.large, s.remove]}>
      <Ionicons name="remove" size={16} color={colors.primaryText} /></Pressable>}
  </View>;
}

const s = StyleSheet.create({
  corner: { position: "absolute", top: -8, right: -8, flexDirection: "row", gap: 6 },
  inline: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 8 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  // Over a tile's corner a dark ring separates the badge from the card beneath.
  ring: { borderWidth: 2, borderColor: colors.background }, large: { width: 32, height: 32, borderRadius: 16 },
  edit: { backgroundColor: colors.selection },
  remove: { backgroundColor: colors.danger },
});
