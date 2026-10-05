import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, type ComponentProps } from "react";
import { Animated } from "react-native";
import { motion } from "../constants/motion";
import { useReducedMotion } from "../hooks/useReducedMotion";
export default function TabIcon({name, color, size, focused}: {name: ComponentProps<typeof Ionicons>["name"]; color: ComponentProps<typeof Ionicons>["color"]; size: number; focused: boolean}) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    scale.stopAnimation();
    if (reduced) {scale.setValue(1); return;}
    const animation = Animated.spring(scale, {...motion.selection, toValue:focused ? 1.08 : 1, useNativeDriver:true});
    animation.start();
    return () => animation.stop();
  }, [focused, reduced, scale]);
  return <Animated.View accessible={false} style={{transform:[{scale}]}}><Ionicons name={name} color={color} size={size} /></Animated.View>;
}
