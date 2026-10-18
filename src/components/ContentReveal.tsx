import { useEffect, useState, type ReactNode } from "react";
import { Animated } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";

// Content remains mounted and readable while motion preference resolves.
export default function ContentReveal({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) { opacity.setValue(1); return; }
    opacity.setValue(0.94);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true, isInteraction: false });
    animation.start();
    return () => animation.stop();
  }, [opacity, reduced]);
  return <Animated.View style={[{ opacity }, fill && { flexGrow: 1 }]}>{children}</Animated.View>;
}
