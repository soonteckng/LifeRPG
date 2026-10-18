import { useEffect, useRef, useState } from "react";
import { Animated, Modal, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";

export type MoreOption = { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; danger?: boolean; disabled?: boolean };
const WIDTH = 236, ROW = 48;

/**
 * The ••• button used across the app. Its options grow out of the button like
 * an iOS context menu; tapping outside closes it. An option runs after the
 * menu has closed, so sheets it opens never fight the menu for the screen.
 */
export default function MoreMenu({ options, label = "More options", size = 32, onOpen, testID }: {
  options: MoreOption[]; label?: string; size?: number; onOpen?: () => void; testID?: string;
}) {
  const button = useRef<View>(null), { width, height } = useWindowDimensions();
  const [place, setPlace] = useState<{ top: number; right: number; up: boolean } | null>(null);
  const open = () => {
    onOpen?.();
    const fallback = { top: 120, right: 20, up: false };
    if (!button.current?.measureInWindow) { setPlace(fallback); return; }
    button.current.measureInWindow((x, y, w, h) => {
      if (![x, y, w, h].every(Number.isFinite)) { setPlace(fallback); return; }
      const menuHeight = options.length * ROW + 2, up = y + h + 8 + menuHeight > height - 24;
      setPlace({ top: up ? Math.max(24, y - 8 - menuHeight) : y + h + 8, right: Math.max(12, width - (x + w)), up });
    });
  };
  const choose = (option: MoreOption) => { setPlace(null); setTimeout(option.onPress, 120); };
  return <>
    <View ref={button} collapsable={false}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: !!place }} hitSlop={8} testID={testID}
        style={[s.button, { width: size, height: size, borderRadius: size / 2 }]}>
        <Ionicons name="ellipsis-horizontal" size={size * 0.56} color={colors.accent} />
      </Pressable>
    </View>
    <Modal visible={!!place} transparent animationType="none" statusBarTranslucent onRequestClose={() => setPlace(null)}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setPlace(null)} accessibilityRole="button" accessibilityLabel="Close menu" haptic={false} />
      {place && <Popover top={place.top} right={place.right} up={place.up}>
        {options.map((option, index) => <Pressable key={option.label} disabled={option.disabled} onPress={() => choose(option)} accessibilityRole="menuitem" accessibilityLabel={option.label}
          accessibilityState={{ disabled: !!option.disabled }} style={[s.option, index > 0 && s.line, option.disabled && s.disabled]}>
          <Text style={[s.optionText, option.danger && { color: colors.danger }]} numberOfLines={1}>{option.label}</Text>
          <Ionicons name={option.icon} size={18} color={option.danger ? colors.danger : colors.text} />
        </Pressable>)}
      </Popover>}
    </Modal>
  </>;
}
function Popover({ top, right, up, children }: { top: number; right: number; up: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [shown] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => { if (!reduced) Animated.spring(shown, { toValue: 1, damping: 22, stiffness: 320, mass: 0.8, useNativeDriver: true }).start(); }, [reduced, shown]);
  return <Animated.View style={[s.popover, { top, right, opacity: shown, transformOrigin: up ? "bottom right" : "top right",
    transform: [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }]}>{children}</Animated.View>;
}
const s = StyleSheet.create({
  button: { ...edge, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  popover: { ...edge, position: "absolute", width: WIDTH, borderRadius: 16, backgroundColor: colors.sheetCard, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 16 },
  option: { minHeight: ROW, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  optionText: { flex: 1, color: colors.text, fontSize: 16 }, disabled: { opacity: 0.4 },
});
