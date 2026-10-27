import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { useReducedMotion } from "../../hooks/useReducedMotion";

// One place for the whole session: camp at the foot of a road that runs up
// to the hills. The same drawing in three lights: dusk when you set off,
// night while you focus, morning when you're nearly done and back at camp.
// Drawn on a 390 × 844 canvas that fills any screen (edges trim on other
// shapes), so the road always meets the bottom.
const W = 390, H = 844;
const fill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };
export type TrailLight = "dusk" | "night" | "morning";

/** Where a point on the canvas lands on a screen of this size. */
export function sceneBox(width: number, height: number) {
  const s = Math.max(width / W, height / H);
  return { s, x: (width - W * s) / 2, y: (height - H * s) / 2, at: (cx: number, cy: number) => ({ left: (width - W * s) / 2 + cx * s, top: (height - H * s) / 2 + cy * s }) };
}

const PALETTES = {
  dusk: { skyTop: "#3E4C8C", skyLow: "#E9A27F", hills: "#5B5F80", ground: "#2E4A3A", road: "#6E6750", tree: "#1F3A2E", dash: "#B8AE90", tent: "#1FB89A", tentShade: "#14876F", stars: 0, foot: 0.25 },
  night: { skyTop: "#03050C", skyLow: "#0C0E22", hills: "#090B17", ground: "#050708", road: "#0F0E0C", tree: "#030605", dash: "#25231E", tent: "#0B322C", tentShade: "#082520", stars: 0.65, foot: 0.45 },
  morning: { skyTop: "#5F97CF", skyLow: "#F5D7AE", hills: "#6A82A6", ground: "#4A7A56", road: "#A38F69", tree: "#2D5A44", dash: "#F1E8D2", tent: "#22C3A3", tentShade: "#169079", stars: 0, foot: 0.2 },
} as const;
const STARS = [[34, 90, 1.4], [80, 160, 1], [130, 60, 1.6], [176, 210, 1], [222, 120, 1.2], [268, 70, 1], [320, 180, 1.5], [360, 110, 1], [58, 260, 1.1], [300, 260, 1], [200, 300, 1.2], [110, 330, 1], [350, 330, 1.2], [20, 200, 1]] as const;
const FLIES = [[70, 520], [320, 610], [150, 700], [290, 500], [40, 760], [350, 760]] as const;
/** Where the campfire burns, for its glow. */
export const FIRE = { x: 100, y: 640 };

/** The scene in one light. Static, so it only draws once; the lights fade over one another. */
export const TrailScene = memo(function TrailScene({ width, height, light }: { width: number; height: number; light: TrailLight }) {
  const p = PALETTES[light];
  return <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" style={fill}>
    <Defs>
      <LinearGradient id={`sky-${light}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={p.skyTop} /><Stop offset="1" stopColor={p.skyLow} /></LinearGradient>
      <LinearGradient id={`foot-${light}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#000000" stopOpacity={0} /><Stop offset="1" stopColor="#000000" stopOpacity={p.foot} /></LinearGradient>
      {light === "morning" && <LinearGradient id="morning-top" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#000000" stopOpacity={0.4} /><Stop offset="1" stopColor="#000000" stopOpacity={0} /></LinearGradient>}
    </Defs>
    <Rect x={0} y={0} width={W} height={440} fill={`url(#sky-${light})`} />
    {p.stars > 0 && <G opacity={p.stars}>{STARS.map(([x, y, r], i) => <Circle key={i} cx={x} cy={y} r={r} fill="#FFFFFF" />)}</G>}
    {/* Moon, sinking sun and morning sun keep to the top corner, clear of the timer. */}
    {light === "night" && <Path d="M336 74 A20 20 0 1 0 356 100 A16 16 0 1 1 336 74 Z" fill="#CFCBC0" opacity={0.7} />}
    {light === "dusk" && <G><Circle cx={318} cy={404} r={44} fill="#FDBA74" opacity={0.25} /><Circle cx={318} cy={404} r={26} fill="#FDBA74" /></G>}
    {light === "morning" && <G><Circle cx={340} cy={96} r={38} fill="#FFE6A8" opacity={0.3} /><Circle cx={340} cy={96} r={22} fill="#FFD27A" /></G>}
    <Path d="M0 420 Q70 372 140 398 Q205 366 262 392 Q330 368 390 396 L390 446 L0 446 Z" fill={p.hills} />
    <Rect x={0} y={436} width={W} height={H - 436} fill={p.ground} />
    <Path d="M182 436 L208 436 L330 844 L60 844 Z" fill={p.road} />
    {[0, 1, 2, 3, 4, 5, 6].map(i => {
      const t = i / 7, y = 452 + 392 * t * t, h = 6 + 30 * t, w = 1.6 + 4 * t;
      return <Rect key={i} x={195 - w / 2} y={y} width={w} height={h} rx={w / 2} fill={p.dash} opacity={0.55} />;
    })}
    {[[60, 470, 0.5], [340, 480, 0.6], [366, 600, 1], [376, 760, 1.4]].map(([x, y, k], i) =>
      <Path key={i} d={`M${x} ${y - 70 * k} L${x + 22 * k} ${y} L${x - 22 * k} ${y} Z`} fill={p.tree} />)}
    {/* Camp, at the foot of the road. */}
    <Path d="M2 616 L44 530 L86 616 Z" fill={p.tent} />
    <Path d="M44 530 L58 616 L30 616 Z" fill={p.tentShade} />
    <Path d="M82 654 L118 642 M84 642 L116 656" stroke="#5A3A20" strokeWidth={6} strokeLinecap="round" />
    <Path d="M100 600 Q115 622 109 638 Q103 648 100 648 Q89 646 89 634 Q89 622 97 614 Q97 626 101 628 Q107 618 100 600 Z" fill="#F97316" />
    <Path d="M100 620 Q107 632 102 642 Q95 640 95 634 Q97 628 100 620 Z" fill="#FDE68A" />
    {light !== "night" && [[300, 650, "#F9A8D4"], [312, 660, "#FDE68A"], [24, 740, "#FFFFFF"], [290, 790, "#F9A8D4"]].map(([x, y, c], i) =>
      <Circle key={i} cx={x as number} cy={y as number} r={4} fill={c as string} />)}
    {light === "morning" && <Rect x={0} y={0} width={W} height={520} fill="url(#morning-top)" />}
    <Rect x={0} y={H - 320} width={W} height={320} fill={`url(#foot-${light})`} />
  </Svg>;
});

/** The campfire's glow, flickering; brighter against the night. */
export const FireGlow = memo(function FireGlow({ width, height, night, active = true }: { width: number; height: number; night?: SharedValue<number>; active?: boolean }) {
  const reduced = useReducedMotion();
  const flicker = useSharedValue(1);
  useEffect(() => {
    if (reduced || !active) { cancelAnimation(flicker); return; }
    flicker.value = withRepeat(withSequence(withTiming(0.75, { duration: 420 }), withTiming(1, { duration: 520 }), withTiming(0.85, { duration: 380 })), -1);
    return () => cancelAnimation(flicker);
  }, [reduced, flicker, active]);
  const box = sceneBox(width, height), at = box.at(FIRE.x, FIRE.y), r = 90 * box.s;
  const glow = useAnimatedStyle(() => ({ opacity: flicker.value * (0.75 + (night ? night.value * 0.25 : 0)), transform: [{ scale: 0.94 + flicker.value * 0.06 }] }));
  // A soft glow that fades out at its edge, not a disc.
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", left: at.left - r, top: at.top - r, width: r * 2, height: r * 2 }, glow]}>
    <Svg width={r * 2} height={r * 2}>
      <Defs><RadialGradient id="fire-glow" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#F97316" stopOpacity={0.42} /><Stop offset="0.45" stopColor="#F97316" stopOpacity={0.16} /><Stop offset="1" stopColor="#F97316" stopOpacity={0} />
      </RadialGradient></Defs>
      <Circle cx={r} cy={r} r={r} fill="url(#fire-glow)" />
    </Svg>
  </Animated.View>;
});

/** Fireflies that drift on and off while you walk at night. */
export const Fireflies = memo(function Fireflies({ width, height, active, opacity }: { width: number; height: number; active: boolean; opacity?: SharedValue<number> }) {
  const reduced = useReducedMotion();
  const glow = useSharedValue(0.5);
  const moving = active && !reduced;
  useEffect(() => {
    if (!moving) { cancelAnimation(glow); glow.value = 0.5; return; }
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), withTiming(0.2, { duration: 1800, easing: Easing.inOut(Easing.sin) })), -1);
    return () => cancelAnimation(glow);
  }, [moving, glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value * (opacity ? opacity.value : 1) }));
  const box = sceneBox(width, height);
  return <Animated.View pointerEvents="none" style={[fill, style]}>{FLIES.map(([x, y], i) => {
    const p = box.at(x, y);
    return <View key={i} style={{ position: "absolute", left: p.left, top: p.top, width: 4, height: 4, borderRadius: 2, backgroundColor: "#F5E27A" }} />;
  })}</Animated.View>;
});

export const sceneStyles = StyleSheet.create({ fill });
