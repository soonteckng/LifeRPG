import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { mix } from "../../utils/trail";

// Both scenes are drawn on a 390 × 844 canvas that fills any screen (the
// edges trim on wider or taller phones), so the path always meets the bottom.
const W = 390, H = 844;
const fill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };

/** Where a point on the canvas lands on a screen of this size. */
export function sceneBox(width: number, height: number) {
  const s = Math.max(width / W, height / H);
  return { s, x: (width - W * s) / 2, y: (height - H * s) / 2, at: (cx: number, cy: number) => ({ left: (width - W * s) / 2 + cx * s, top: (height - H * s) / 2 + cy * s }) };
}

const STARS = [[34, 90, 1.4], [80, 160, 1], [130, 60, 1.6], [176, 210, 1], [222, 120, 1.2], [268, 70, 1], [320, 180, 1.5], [360, 110, 1], [58, 260, 1.1], [300, 260, 1], [200, 300, 1.2], [110, 330, 1], [350, 330, 1.2], [20, 200, 1]] as const;
const FLIES = [[70, 560], [320, 610], [110, 700], [290, 500], [40, 760], [350, 760]] as const;

/**
 * The trail during a session: a dim night road that only turns to dawn and
 * day near the end (light 0 → 1). Fireflies drift while you walk.
 */
export const NightTrail = memo(function NightTrail({ width, height, light, walking }: { width: number; height: number; light: number; walking: boolean }) {
  const reduced = useReducedMotion();
  const glow = useSharedValue(0.5);
  const moving = walking && !reduced && light < 0.9;
  useEffect(() => {
    if (!moving) { cancelAnimation(glow); glow.value = 0.5; return; }
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), withTiming(0.2, { duration: 1800, easing: Easing.inOut(Easing.sin) })), -1);
    return () => cancelAnimation(glow);
  }, [moving, glow]);
  const flies = useAnimatedStyle(() => ({ opacity: glow.value }));
  const skyTop = light < 0.5 ? mix("#0B1030", "#3B4A8A", light * 2) : mix("#3B4A8A", "#5A8CC8", (light - 0.5) * 2);
  const skyLow = light < 0.5 ? mix("#2A2352", "#E9A27F", light * 2) : mix("#E9A27F", "#B9D8EE", (light - 0.5) * 2);
  const ground = mix("#10181C", "#3B6A4C", light), road = mix("#26241F", "#8B7B5E", light), hills = mix("#1B1E3A", "#5B6E8F", light);
  const tree = mix("#0B1512", "#24493A", light), dash = mix("#5A5444", "#E8DFC8", light);
  const box = sceneBox(width, height);
  return <View style={[fill, { overflow: "hidden" }]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
    <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={`trail-sky-${Math.round(light * 50)}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={skyTop} /><Stop offset="1" stopColor={skyLow} /></LinearGradient>
        <LinearGradient id="trail-shade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#000000" stopOpacity={0.5} /><Stop offset="1" stopColor="#000000" stopOpacity={0} /></LinearGradient>
        <LinearGradient id="trail-foot" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#000000" stopOpacity={0} /><Stop offset="1" stopColor="#000000" stopOpacity={0.35} /></LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={440} fill={`url(#trail-sky-${Math.round(light * 50)})`} />
      <G opacity={1 - light}>{STARS.map(([x, y, r], i) => <Circle key={i} cx={x} cy={y} r={r} fill="#FFFFFF" opacity={0.75} />)}</G>
      {/* Moon and sun keep to the top corner, clear of the timer. */}
      {light < 1 && <Path d="M336 74 A20 20 0 1 0 356 100 A16 16 0 1 1 336 74 Z" fill="#F1EDE0" opacity={1 - light} />}
      {light > 0.3 && <G opacity={(light - 0.3) / 0.7}><Circle cx={350} cy={440 - light * 360} r={36} fill="#FFE6A8" opacity={0.25} /><Circle cx={350} cy={440 - light * 360} r={22} fill="#FFD27A" /></G>}
      <Path d="M0 420 Q70 372 140 398 Q205 366 262 392 Q330 368 390 396 L390 446 L0 446 Z" fill={hills} />
      <Rect x={0} y={436} width={W} height={H - 436} fill={ground} />
      <Path d="M182 436 L208 436 L330 844 L60 844 Z" fill={road} />
      {[0, 1, 2, 3, 4, 5, 6].map(i => {
        const t = i / 7, y = 452 + 392 * t * t, h = 6 + 30 * t, w = 1.6 + 4 * t;
        return <Rect key={i} x={195 - w / 2} y={y} width={w} height={h} rx={w / 2} fill={dash} opacity={0.55} />;
      })}
      {[[60, 470, 0.5], [340, 480, 0.6], [24, 560, 0.9], [366, 600, 1], [8, 720, 1.3]].map(([x, y, k], i) =>
        <Path key={i} d={`M${x} ${y - 70 * k} L${x + 22 * k} ${y} L${x - 22 * k} ${y} Z`} fill={tree} />)}
      {/* As day breaks, the top darkens a little so the timer stays easy to read. */}
      {light > 0 && <Rect x={0} y={0} width={W} height={560} fill="url(#trail-shade)" opacity={light} />}
      <Rect x={0} y={H - 320} width={W} height={320} fill="url(#trail-foot)" />
    </Svg>
    {light < 0.9 && <Animated.View style={[fill, flies]}>{FLIES.map(([x, y], i) => {
      const p = box.at(x, y);
      return <View key={i} style={{ position: "absolute", left: p.left, top: p.top, width: 4, height: 4, borderRadius: 2, backgroundColor: "#F5E27A" }} />;
    })}</Animated.View>}
  </View>;
});

/**
 * Camp at dusk: the tent, the campfire and the path out. Where you set off
 * from, and where you come back to.
 */
export const CampScene = memo(function CampScene({ width, height }: { width: number; height: number }) {
  const reduced = useReducedMotion();
  const flicker = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    flicker.value = withRepeat(withSequence(withTiming(0.75, { duration: 420 }), withTiming(1, { duration: 520 }), withTiming(0.85, { duration: 380 })), -1);
    return () => cancelAnimation(flicker);
  }, [reduced, flicker]);
  const fire = useAnimatedStyle(() => ({ opacity: flicker.value, transform: [{ scale: 0.94 + flicker.value * 0.06 }] }));
  const box = sceneBox(width, height), glow = box.at(115, 640), r = 90 * box.s;
  return <View style={[fill, { overflow: "hidden" }]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
    <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
      <Defs><LinearGradient id="camp-sky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#3E4C8C" /><Stop offset="1" stopColor="#E9A27F" /></LinearGradient></Defs>
      <Rect x={0} y={0} width={W} height={420} fill="url(#camp-sky)" />
      <Path d="M0 400 Q60 340 130 362 Q200 330 270 352 Q330 332 390 356 L390 420 L0 420 Z" fill="#5B5F80" />
      <Path d="M40 330 L70 392 L10 392 Z M340 320 L372 392 L308 392 Z M372 344 L392 392 L352 392 Z" fill="#1F3A2E" />
      <Rect x={0} y={386} width={W} height={H - 386} fill="#2E4A3A" />
      <Path d="M148 844 Q166 600 214 386 L236 386 Q250 600 300 844 Z" fill="#6E6750" opacity={0.85} />
      <G>
        <Path d="M20 610 L60 528 L100 610 Z" fill="#1FB89A" />
        <Path d="M60 528 L74 610 L46 610 Z" fill="#14876F" />
      </G>
      <G>
        <Path d="M96 652 L134 640 M98 640 L132 654" stroke="#6B4429" strokeWidth={6} strokeLinecap="round" />
        <Path d="M115 600 Q130 622 124 638 Q118 648 115 648 Q104 646 104 634 Q104 622 112 614 Q112 626 116 628 Q122 618 115 600 Z" fill="#F97316" />
        <Path d="M115 620 Q122 632 117 642 Q110 640 110 634 Q112 628 115 620 Z" fill="#FDE68A" />
      </G>
      {[[330, 640, "#F9A8D4"], [342, 650, "#FDE68A"], [30, 720, "#FFFFFF"], [300, 780, "#F9A8D4"]].map(([x, y, c], i) =>
        <Circle key={i} cx={x as number} cy={y as number} r={4} fill={c as string} />)}
      <Ellipse cx={195} cy={860} rx={260} ry={60} fill="#000000" opacity={0.15} />
    </Svg>
    <Animated.View style={[{ position: "absolute", left: glow.left - r, top: glow.top - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: "rgba(249,115,22,0.18)" }, fire]} />
  </View>;
});

export const sceneStyles = StyleSheet.create({ fill });
