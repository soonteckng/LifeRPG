import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { colors } from "../constants/theme";

/**
 * The one ▶ for starting something from a card: routines and subjects use the
 * same round green button, so starting always looks and feels the same.
 */
export default function StartButton({ label, onPress, disabled = false, size = 40, style }: {
  label: string; onPress: () => void; disabled?: boolean; size?: number; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} hitSlop={6}
    style={[s.button, { width: size, height: size, borderRadius: size / 2 }, disabled && s.disabled, style]}>
    <Ionicons name="play" size={Math.round(size * 0.4)} color={disabled ? colors.tertiary : colors.accent} style={s.nudge} />
  </Pressable>;
}
const s = StyleSheet.create({
  button: { alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  disabled: { backgroundColor: colors.sheetCard },
  // A play triangle looks centred a hair to the right of the true centre.
  nudge: { marginLeft: 2 },
});
