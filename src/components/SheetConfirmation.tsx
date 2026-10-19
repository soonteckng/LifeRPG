import { useEffect, useState } from "react";
import { Animated, Easing, Modal, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors, edge, radius } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";

export interface SheetConfirmationProps {
  destructive?: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** On a screen with the floating tab bar, rise above it (and its dim covers it) like a sheet does. */
  elevated?: boolean;
}

/**
 * Every "are you sure?" in the app is the same small card that rises from the
 * bottom, like removing a routine or an exam: removing a subject, discarding
 * changes and ending a session all look and behave alike, online or offline.
 * Inside a sheet it renders in place; on a screen with the tab bar it is
 * `elevated` into its own layer, so it and its dim sit above the tab bar.
 */
export default function SheetConfirmation(props: SheetConfirmationProps) {
  const insets = useSafeAreaInsets(), reduced = useReducedMotion();
  const [rise] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) { rise.setValue(1); return; }
    const animation = Animated.timing(rise, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduced, rise]);
  const destructive = props.destructive !== false;
  const card = (
    <View style={styles.overlay} accessibilityViewIsModal onAccessibilityEscape={props.onCancel}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: rise }]}>
        <Pressable style={styles.scrim} onPress={props.onCancel} accessibilityLabel={props.cancelLabel} accessibilityRole="button" />
      </Animated.View>
      <Animated.View testID="confirmation-card" style={[styles.card, { marginBottom: Math.max(insets.bottom, 8) + 8, opacity: rise,
        transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) }] }]}>
        <View style={styles.handle} />
        <Text style={styles.title} accessibilityRole="header">{props.title}</Text>
        <Text style={styles.message}>{props.message}</Text>
        <Pressable style={[styles.confirm, !destructive && styles.confirmCalm]} onPress={props.onConfirm} accessibilityRole="button">
          <Text style={[styles.confirmText, !destructive && styles.confirmCalmText]}>{props.confirmLabel}</Text>
        </Pressable>
        <Pressable style={styles.cancel} onPress={props.onCancel} accessibilityRole="button">
          <Text style={styles.cancelText}>{props.cancelLabel}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
  return props.elevated
    ? <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={props.onCancel}>{card}</Modal>
    : card;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 20, justifyContent: "flex-end", paddingHorizontal: 8 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)" },
  // The same floating card as a remove sheet: rounded all round, inside the screen.
  card: { ...edge, borderRadius: radius.sheet, backgroundColor: colors.surfaceRaised, paddingHorizontal: 16, paddingBottom: 12 },
  handle: { alignSelf: "center", width: 36, height: 5, borderRadius: 2, marginTop: 11, marginBottom: 12, backgroundColor: "rgba(255,255,255,0.24)" },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.4, paddingHorizontal: 4 },
  message: { color: colors.secondary, fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18, paddingHorizontal: 4 },
  confirm: { minHeight: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.16)" },
  confirmText: { color: colors.danger, fontSize: 17, fontWeight: "600" },
  confirmCalm: { backgroundColor: colors.accentSoft }, confirmCalmText: { color: colors.accent },
  cancel: { minHeight: 50, marginTop: 4, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.text, fontSize: 16, fontWeight: "500" },
});
