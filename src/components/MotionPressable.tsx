import { useEffect, useState } from "react";
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { motion } from "../constants/motion";
import { tapHaptic, tapHapticsEnabled } from "../utils/tapHaptics";
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export default function MotionPressable({ style, disabled, onPressIn, onPressOut, onPress, onLongPress, haptic = true, ...props }: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle>; haptic?: boolean }) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced || disabled) { scale.stopAnimation(); scale.setValue(1); }
    return () => scale.stopAnimation();
  }, [disabled, reduced, scale]);
  const settle = (value: number) => {
    scale.stopAnimation();
    if (reduced || disabled) { scale.setValue(1); return; }
    Animated.spring(scale, { ...motion.press, toValue: value, useNativeDriver: true, isInteraction: false }).start();
  };
  const tick = () => { if (haptic && tapHapticsEnabled()) tapHaptic(); };
  return <AnimatedPressable {...props} disabled={disabled} style={[style, { transform: [{scale}] }]}
    onPress={onPress && (event => { onPress(event); tick(); })}
    onLongPress={onLongPress && (event => { onLongPress(event); if (haptic && tapHapticsEnabled()) tapHaptic("medium"); })}
    onPressIn={event => { settle(0.975); onPressIn?.(event); }}
    onPressOut={event => { settle(1); onPressOut?.(event); }} />;
}
