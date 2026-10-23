import { memo, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Text } from "../AppText";
import AdventurerWalking from "../adventurer/AdventurerBack";
import { CampScene, NightTrail } from "./TrailScenes";
import { useRewards } from "../../hooks/useRewards";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { sessionLight, trailStops, trailZone } from "../../utils/trail";

type Phase = "setup" | "running" | "paused" | "completed" | "ended";
const INTRO_MS = 2600;

/**
 * Behind a running session: you walk the trail through the night, and the
 * sky only turns to dawn and day near the end. Starting a session first
 * shows you setting off from camp (a couple of seconds; tap to skip).
 */
export default function SessionBackdrop({ phase, progress, walking, minutes, area }: {
  phase: Phase; progress: number; walking: boolean; minutes: number; area: string;
}) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const rewards = useRewards({ load: false });
  const [seen, setSeen] = useState(phase);
  const [intro, setIntro] = useState(false);
  // Only a fresh start sets off; reopening a running session goes straight to the trail.
  if (seen !== phase) {
    setSeen(phase);
    setIntro(seen === "setup" && phase === "running" && !reduced);
  }
  if (phase !== "running" && phase !== "paused") return null;
  // Small and a little way up the road, in the open space under the timer,
  // so the walk is there without crowding the words and buttons.
  const size = height < 720 ? 32 : 40;
  return <View style={StyleSheet.absoluteFill} testID="session-trail">
    <NightTrail width={width} height={height} light={sessionLight(progress)} walking={walking} />
    <View pointerEvents="none" style={[s.walker, { left: width / 2 - size / 2, top: height * 0.62 - size * 1.45 }]}>
      <AdventurerWalking look={rewards.look} equipped={rewards.equipped} size={size} walking={walking} />
    </View>
    {intro && <SettingOff width={width} height={height} look={rewards.look} equipped={rewards.equipped}
      zone={trailZone(trailStops(rewards.today.seconds)).name} minutes={minutes} area={area} onDone={() => setIntro(false)} />}
  </View>;
}

const SettingOff = memo(function SettingOff({ width, height, look, equipped, zone, minutes, area, onDone }: {
  width: number; height: number; look: ReturnType<typeof useRewards>["look"]; equipped: Partial<Record<string, string>>;
  zone: string; minutes: number; area: string; onDone: () => void;
}) {
  const walk = useSharedValue(0), fade = useSharedValue(1);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });
  useEffect(() => {
    const finish = () => done.current();
    walk.value = withTiming(1, { duration: INTRO_MS - 300, easing: Easing.inOut(Easing.quad) });
    fade.value = withDelay(INTRO_MS - 450, withTiming(0, { duration: 450 }, ok => { if (ok) runOnJS(finish)(); }));
  }, [walk, fade]);
  const size = Math.min(150, width * 0.36);
  // Up the path and smaller, as if walking away into the distance.
  const walker = useAnimatedStyle(() => ({ transform: [{ translateY: -walk.value * height * 0.3 }, { translateX: walk.value * width * 0.06 }, { scale: 1 - walk.value * 0.62 }] }));
  const overlay = useAnimatedStyle(() => ({ opacity: fade.value }));
  return <Animated.View style={[StyleSheet.absoluteFill, overlay]} testID="session-setting-off">
    <Pressable style={StyleSheet.absoluteFill} onPress={() => done.current()} accessibilityRole="button" accessibilityLabel="Skip">
      <CampScene width={width} height={height} />
      <View style={s.copy} pointerEvents="none">
        <Text style={s.eyebrow}>SETTING OFF</Text>
        <Text style={s.title} numberOfLines={2}>{`Off to the ${zone}`}</Text>
        <Text style={s.detail} numberOfLines={1}>{`${minutes} min · ${area}`}</Text>
      </View>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: width / 2 - size / 2, bottom: height * 0.08 }, walker]}>
        <AdventurerWalking look={look} equipped={equipped} size={size} />
      </Animated.View>
      <Text style={s.skip}>Tap anywhere to skip</Text>
    </Pressable>
  </Animated.View>;
});

const s = StyleSheet.create({
  walker: { position: "absolute", opacity: 0.92 },
  copy: { position: "absolute", top: "11%", left: 24, right: 24, alignItems: "center", gap: 6 },
  eyebrow: { color: "rgba(255,255,255,0.8)", fontSize: 13, letterSpacing: 2, fontWeight: "800" },
  title: { color: "#FFFFFF", fontSize: 30, lineHeight: 36, fontWeight: "800", textAlign: "center", textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 8 },
  detail: { color: "#F3F4F6", fontSize: 16, fontWeight: "600" },
  skip: { position: "absolute", bottom: 28, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 13 },
});
