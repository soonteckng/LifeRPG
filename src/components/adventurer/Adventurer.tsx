import { memo, useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import AdventurerArt from "./AdventurerArt";
import ItemArt from "./ItemArt";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import type { AdventurerLook } from "../../utils/adventurerLook";

const BLINK_EVERY = 4800, BLINK_FOR = 140;

/**
 * The person standing, with a slow breath and a blink every few seconds, and
 * their pet beside them. Motion stops when `animate` is off or the phone asks
 * for reduced motion.
 */
export default memo(function Adventurer({ look, equipped = {}, size, animate = true, lanternLevel = 0 }: {
  look: AdventurerLook; equipped?: Partial<Record<string, string>>; size: number; animate?: boolean; lanternLevel?: number;
}) {
  const reduced = useReducedMotion();
  const moving = animate && !reduced;
  const breath = useSharedValue(0);
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (!moving) { cancelAnimation(breath); breath.value = 0; return; }
    breath.value = withRepeat(withSequence(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.sin) })), -1);
    return () => cancelAnimation(breath);
  }, [moving, breath]);
  useEffect(() => {
    if (!moving) { setBlink(false); return; }
    let close: ReturnType<typeof setTimeout> | undefined;
    const every = setInterval(() => { setBlink(true); close = setTimeout(() => setBlink(false), BLINK_FOR); }, BLINK_EVERY);
    return () => { clearInterval(every); if (close) clearTimeout(close); };
  }, [moving]);
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: -breath.value * size * 0.009 }] }));
  const pet = equipped.pet;
  return <View style={{ width: size, height: size * 1.5 }} importantForAccessibility="no-hide-descendants">
    <Animated.View style={body}><AdventurerArt look={look} equipped={equipped} size={size} eyesClosed={blink} lanternLevel={lanternLevel} /></Animated.View>
    {!!pet && <View style={{ position: "absolute", left: size * 0.74, top: size * 1.24 }}><ItemArt id={pet} size={size * 0.22} /></View>}
  </View>;
});
