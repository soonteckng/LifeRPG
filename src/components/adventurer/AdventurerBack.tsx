import { memo, useEffect } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import ItemArt from "./ItemArt";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { darken, hairColor, skinColor, type AdventurerLook } from "../../utils/adventurerLook";

type Equipped = Partial<Record<string, string>>;
type Part = "legL" | "legR" | "body";
const L = { strokeWidth: 2.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/**
 * The person seen from behind, setting off with their pack, on the same
 * 200 × 300 canvas as the front drawing. Drawn in parts so the legs can step.
 */
export const AdventurerBackArt = memo(function AdventurerBackArt({ look, equipped = {}, size, part }: { look: AdventurerLook; equipped?: Equipped; size: number; part: Part }) {
  const skin = skinColor(look.skin), skinLine = darken(skin, 0.72);
  const hair = hairColor(look.hairColor), hairLine = darken(hair, 0.6), hairHi = darken(hair, 1.8);
  const top = equipped.top;
  const back = top === "cardigan" ? "#B89C74" : top === "overalls" ? "#F1EDE4" : top === "field_jacket" ? "#6B7550" : "#D9D4CA";
  const sleeve = top === "cardigan" ? "#B89C74" : top === "field_jacket" ? "#6B7550" : back;
  const pants = top === "overalls" ? "#4F6FA8" : top === "field_jacket" ? "#5B5A45" : "#3A3F4A";
  const shoe = equipped.shoes === "sneakers" ? "#E8E4DA" : equipped.shoes === "trail_boots" ? "#6B4429" : "#4A2E1E";
  const box = { width: size, height: size * 1.5, viewBox: "0 0 200 300" };
  if (part === "legL") return <Svg {...box}><G>
    <Path d="M76 196 L78 266 L97 266 L99 204 Z" fill={pants} stroke={darken(pants, 0.7)} {...L} />
    <Path d="M74 262 L98 262 L98 280 Q98 286 92 286 L70 286 Q65 286 66 281 Q67 274 74 272 Z" fill={shoe} stroke={darken(shoe, 0.65)} {...L} />
  </G></Svg>;
  if (part === "legR") return <Svg {...box}><G>
    <Path d="M101 204 L103 266 L122 266 L124 196 Z" fill={pants} stroke={darken(pants, 0.7)} {...L} />
    <Path d="M102 262 L126 262 L126 272 Q133 274 134 281 Q135 286 130 286 L108 286 Q102 286 102 280 Z" fill={shoe} stroke={darken(shoe, 0.65)} {...L} />
  </G></Svg>;
  return <Svg {...box}>
    {equipped.back === "forest_cloak" && <Path d="M62 118 Q52 200 48 252 Q100 262 152 252 Q148 200 138 118 Q100 106 62 118 Z" fill="#2F5A4E" stroke="#1C3A32" {...L} />}
    <Path d="M66 128 Q66 118 82 116 L118 116 Q134 118 134 128 L138 200 Q100 208 62 200 Z" fill={back} stroke={darken(back, 0.7)} {...L} />
    {top === "overalls" && <Path d="M80 118 L118 190 M120 118 L82 190" stroke="#4F6FA8" strokeWidth={6} strokeLinecap="round" />}
    <Path d="M70 124 Q56 132 54 160 L52 192 L65 194 L68 162 Q70 146 76 138 Z" fill={sleeve} stroke={darken(sleeve, 0.7)} {...L} />
    <Path d="M130 124 Q144 132 146 160 L148 192 L135 194 L132 162 Q130 146 124 138 Z" fill={sleeve} stroke={darken(sleeve, 0.7)} {...L} />
    <Circle cx={58} cy={198} r={7} fill={skin} stroke={skinLine} {...L} /><Circle cx={142} cy={198} r={7} fill={skin} stroke={skinLine} {...L} />
    {equipped.held === "walking_staff" && <G><Path d="M148 136 L152 286" stroke="#6B4429" strokeWidth={7} strokeLinecap="round" /><Path d="M148 136 L152 286" stroke="#8B5E3C" strokeWidth={4} strokeLinecap="round" /></G>}
    {equipped.back === "forest_cloak" && <Path d="M70 112 Q100 100 130 112 Q138 140 122 150 Q100 156 78 150 Q62 140 70 112 Z" fill="#3B6B5D" stroke="#1C3A32" {...L} />}
    {look.hair === "long" && <Path d="M64 66 Q62 146 72 152 L128 152 Q138 146 136 66 Z" fill={hair} stroke={hairLine} {...L} />}
    {/* The expedition pack. */}
    <Rect x={68} y={112} width={64} height={15} rx={7.5} fill="#C9A06A" stroke="#8A6A40" {...L} />
    <Path d="M80 114 V125 M120 114 V125" stroke="#6B4429" strokeWidth={3} />
    <Rect x={74} y={124} width={52} height={64} rx={13} fill="#8A5A33" stroke="#5A3A20" {...L} />
    <Path d="M74 146 Q74 124 100 124 Q126 124 126 146 L126 148 L74 148 Z" fill="#6B4429" stroke="#5A3A20" {...L} />
    <Rect x={96} y={140} width={8} height={12} rx={2} fill="#D6A84A" />
    <Rect x={84} y={160} width={32} height={18} rx={5} fill="#6B4429" stroke="#5A3A20" strokeWidth={1.6} />
    <Circle cx={65} cy={76} r={7} fill={skin} stroke={skinLine} {...L} /><Circle cx={135} cy={76} r={7} fill={skin} stroke={skinLine} {...L} />
    <Path d="M88 100 Q100 106 112 100 L110 116 L90 116 Z" fill={skin} stroke={skinLine} {...L} />
    {look.hair === "coily" ? <G>
      <G fill={hair} stroke={hairLine} strokeWidth={2.2}>
        <Circle cx={64} cy={58} r={20} /><Circle cx={136} cy={58} r={20} /><Circle cx={80} cy={34} r={22} /><Circle cx={120} cy={34} r={22} />
        <Circle cx={100} cy={26} r={22} /><Circle cx={68} cy={88} r={17} /><Circle cx={132} cy={88} r={17} /><Circle cx={100} cy={96} r={18} />
      </G>
      <Circle cx={100} cy={60} r={38} fill={hair} />
    </G> : <G>
      <Ellipse cx={100} cy={68} rx={35} ry={38} fill={hair} stroke={hairLine} {...L} />
      <Path d="M80 44 Q96 36 112 40" stroke={hairHi} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.5} />
    </G>}
    {look.hair === "braids" && <G>
      <Path d="M94 100 L90 176 M106 100 L110 176" stroke={hairLine} strokeWidth={11} strokeLinecap="round" />
      <Path d="M94 100 L90 176 M106 100 L110 176" stroke={hair} strokeWidth={7} strokeLinecap="round" strokeDasharray="5 3" />
    </G>}
    {look.hair === "bun" && <Circle cx={100} cy={30} r={15} fill={hair} stroke={hairLine} {...L} />}
    {equipped.head === "beret" && <Ellipse cx={100} cy={36} rx={38} ry={12} fill="#C2453A" stroke="#8E2C24" {...L} />}
  </Svg>;
});

/**
 * Walking away up the trail: legs step and the body bobs. Still when the
 * session is paused or the phone asks for less motion.
 */
export default memo(function AdventurerWalking({ look, equipped = {}, size, walking = true }: { look: AdventurerLook; equipped?: Equipped; size: number; walking?: boolean }) {
  const reduced = useReducedMotion();
  const step = useSharedValue(0);
  const moving = walking && !reduced;
  useEffect(() => {
    if (!moving) { cancelAnimation(step); step.value = 0; return; }
    step.value = withRepeat(withTiming(1, { duration: 760, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(step);
  }, [moving, step]);
  const lift = size * 0.03;
  // Each leg lifts on its half of the stride; the body rises a touch twice a stride.
  const left = useAnimatedStyle(() => ({ transform: [{ translateY: step.value < 0.5 ? -Math.sin(step.value * 2 * Math.PI) * lift : 0 }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ translateY: step.value >= 0.5 ? Math.sin(step.value * 2 * Math.PI) * lift : 0 }] }));
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.abs(Math.sin(step.value * 2 * Math.PI)) * lift * 0.45 }] }));
  const pet = equipped.pet;
  const layer = { position: "absolute" as const, left: 0, top: 0 };
  return <View style={{ width: size, height: size * 1.5 }} importantForAccessibility="no-hide-descendants">
    <Svg width={size} height={size * 1.5} viewBox="0 0 200 300" style={layer}><Ellipse cx={100} cy={288} rx={52} ry={7} fill="#000000" opacity={0.32} /></Svg>
    <Animated.View style={[layer, left]}><AdventurerBackArt look={look} equipped={equipped} size={size} part="legL" /></Animated.View>
    <Animated.View style={[layer, right]}><AdventurerBackArt look={look} equipped={equipped} size={size} part="legR" /></Animated.View>
    <Animated.View style={[layer, body]}><AdventurerBackArt look={look} equipped={equipped} size={size} part="body" /></Animated.View>
    {!!pet && <Animated.View style={[{ position: "absolute", left: size * 0.86, top: size * 1.2 }, body]}><ItemArt id={pet} size={size * 0.24} /></Animated.View>}
  </View>;
});
