import { useEffect, useState } from "react";
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { motion } from "../constants/motion";
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export default function MotionPressable({ style, disabled, onPressIn, onPressOut, ...props }: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced || disabled) { scale.stopAnimation(); scale.setValue(1); }
    return () => scale.stopAnimation();
  }, [disabled, reduced, scale]);
  const settle = (value: number) => {
    scale.stopAnimation();
    if (reduced || disabled) { scale.setValue(1); return; }
    Animated.spring(scale, { ...motion.press, toValue: value, useNativeDriver: true }).start();
  };
  return <AnimatedPressable {...props} disabled={disabled} style={[style, { transform: [{scale}] }]}
    onPressIn={event => { settle(0.975); onPressIn?.(event); }}
    onPressOut={event => { settle(1); onPressOut?.(event); }} />;
}
