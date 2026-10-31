import { useEffect, useState, type ReactNode } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";

// Content remains mounted and readable while motion preference resolves.
export default function ContentReveal({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) { opacity.setValue(1); return; }
    opacity.setValue(0.94);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true, isInteraction: false });
    animation.start();
    return () => animation.stop();
  }, [opacity, reduced]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}
