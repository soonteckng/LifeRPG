import { useEffect, useState } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { motion } from "../constants/motion";
// Decorative, measured in its own half-width; no animation of text or hit areas.
export default function SlidingSelection({index, count = 2, style, testID, settling = "standard"}: {
  index: number; count?: number; style?: StyleProp<ViewStyle>; testID?: string; settling?: "standard" | "quick";
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [position] = useState(() => new Animated.Value(index));
  useEffect(() => {
    position.stopAnimation();
    if (reduced || width === 0) { position.setValue(index); return; }
    const animation = Animated.spring(position, { ...(settling === "quick" ? motion.quickSelection : motion.selection), toValue: index, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [index, position, reduced, width, settling]);
  return <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" testID={testID}
    onLayout={event => setWidth(event.nativeEvent.layout.width)}
    style={[style, { left: width > 0 ? 0 : `${index / count * 100}%`, transform: [{translateX: position.interpolate({inputRange:[0, Math.max(1,count-1)], outputRange:[0, width * Math.max(1,count-1)]})}] }]} />;
}
