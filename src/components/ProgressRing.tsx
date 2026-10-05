import { useEffect, useState, type ReactNode } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export default function ProgressRing({size, progress, color = colors.accent, children, stroke = 10}: {
  size: number; progress: number; color?: string; children?: ReactNode; stroke?: number;
}) {
  const fraction = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const reduced = useReducedMotion();
  const [value] = useState(() => new Animated.Value(fraction));
  useEffect(() => {
    value.stopAnimation();
    if (reduced) { value.setValue(fraction); return; }
    // Reuse the app's 220 ms content-update rhythm; never animate route motion.
    // SVG dash offset is not a native transform/opacity property.
    const animation = Animated.timing(value, {toValue:fraction, duration:220, useNativeDriver:false});
    animation.start();
    return () => animation.stop();
  }, [fraction, reduced, value]);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return <View style={{width:size,height:size,alignItems:"center",justifyContent:"center"}}>
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
      style={{position:"absolute",width:size,height:size}}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={colors.line} strokeWidth={stroke} />
        <AnimatedCircle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color}
          strokeWidth={stroke} strokeLinecap="round" rotation={-90} origin={`${size/2},${size/2}`}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={value.interpolate({inputRange:[0,1],outputRange:[circumference,0]})}
          opacity={value.interpolate({inputRange:[0,0.00001],outputRange:[0,1],extrapolate:"clamp"})} />
      </Svg>
    </View>
    {children}
  </View>;
}
