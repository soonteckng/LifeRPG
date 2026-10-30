import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";

const FADE_MS = 180;

/**
 * While a finished session is being saved: the screen dims and one calm
 * message sits in the middle, so nothing behind it seems to jump. The result
 * card opens over it once the save is confirmed.
 */
export default function SessionSavingOverlay({ visible }: { visible: boolean }) {
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const [opacity] = useState(() => new Animated.Value(visible ? 1 : 0));
  if (visible && !mounted) setMounted(true);
  useEffect(() => {
    if (!mounted) return;
    const animation = Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: reducedMotion ? 0 : FADE_MS, useNativeDriver: true });
    animation.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => animation.stop();
  }, [visible, mounted, opacity, reducedMotion]);
  if (!mounted) return null;
  return <Animated.View testID="session-saving" pointerEvents={visible ? "auto" : "none"} style={[styles.scrim, { opacity }]}
    accessibilityViewIsModal accessibilityLiveRegion="polite">
    <View style={styles.panel} accessible accessibilityRole="progressbar" accessibilityLabel="Saving your session">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.title}>Saving your session</Text>
      <Text style={styles.detail}>Just a moment</Text>
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  // The portal is already above the stack. Elevating its full-screen, fading
  // scrim creates a rectangular Android shadow surface behind the panel.
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, backgroundColor: colors.scrim, alignItems: "center", justifyContent: "center", padding: 32 },
  panel: { minWidth: 220, alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 32, borderRadius: 24, backgroundColor: colors.sheetCard },
  title: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "700", marginTop: 6, textAlign: "center" },
  detail: { color: colors.secondary, fontSize: 14, lineHeight: 20, textAlign: "center" },
});
