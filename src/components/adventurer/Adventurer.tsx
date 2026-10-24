import { memo, useContext, useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { NavigationContext } from "expo-router/react-navigation";
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
  const reduced = useReducedMotion(), navigation = useContext(NavigationContext);
  const moving = animate && !reduced;
  const breath = useSharedValue(0);
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let foreground = !AppState.currentState || AppState.currentState === "active";
    let every: ReturnType<typeof setInterval> | undefined;
    let close: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (every !== undefined) clearInterval(every);
      if (close !== undefined) clearTimeout(close);
      every = undefined; close = undefined;
      cancelAnimation(breath); breath.value = 0; setBlink(false);
    };
    const start = () => {
      stop();
      if (!moving || !foreground || (navigation && !navigation.isFocused())) return;
      breath.value = withRepeat(withSequence(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.sin) })), -1);
      every = setInterval(() => { setBlink(true); close = setTimeout(() => setBlink(false), BLINK_FOR); }, BLINK_EVERY);
    };
    start();
    if (!moving) return stop;
    // Routes remain mounted behind Outfits and other pages. Cancel directly on
    // blur, even if navigation freezes React rendering for that hidden route.
    const focus = navigation?.addListener("focus", start), blur = navigation?.addListener("blur", stop);
    const app = AppState.addEventListener("change", state => { foreground = state === "active"; if (foreground) start(); else stop(); });
    return () => { focus?.(); blur?.(); app.remove(); stop(); };
  }, [moving, navigation, breath]);
  // A slow stretch from the feet: the head rises a little, the feet and lantern stay put.
  const body = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + breath.value * 0.022 }] }));
  const pet = equipped.pet;
  return <View style={{ width: size, height: size * 1.5 }} importantForAccessibility="no-hide-descendants">
    <Animated.View style={[{ transformOrigin: "50% 96%" }, body]}><AdventurerArt look={look} equipped={equipped} size={size} eyesClosed={blink} lanternLevel={lanternLevel} /></Animated.View>
    {!!pet && <View style={{ position: "absolute", left: size * 0.74, top: size * 1.24 }}><ItemArt id={pet} size={size * 0.22} /></View>}
  </View>;
});
