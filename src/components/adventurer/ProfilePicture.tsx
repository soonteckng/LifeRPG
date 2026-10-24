import { memo } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from "react-native-svg";
import AdventurerArt from "./AdventurerArt";
import ItemArt from "./ItemArt";
import { Text } from "../AppText";
import { tierColor, type AdventurerLook } from "../../utils/adventurerLook";

const BACKGROUNDS: Record<string, [string, string]> = {
  bg_dusk: ["#4A3366", "#B86A6A"], bg_forest: ["#24493F", "#3E6B4F"], bg_meadow: ["#6C9CC6", "#A8CC92"],
  bg_night: ["#141B3A", "#4A5AA0"], bg_library: ["#6B4A30", "#3A2416"], bg_sunset: ["#F59E6B", "#B4532A"],
};
type Ornaments = { ring: string; double: boolean; metal: [string, string]; studs: boolean; gems: boolean; laurel: boolean; crown: boolean; flame: boolean };
// Each streak frame has its own shape, not just its own colour, and each one
// keeps what the one before it had.
const STREAK_FRAMES: Record<string, Ornaments> = {
  frame_streak_7: { ring: "#FFB020", double: false, metal: ["#FFD68A", "#B45309"], studs: false, gems: false, laurel: false, crown: false, flame: true },
  frame_streak_30: { ring: "#60A5FA", double: true, metal: ["#BFDBFE", "#1D4ED8"], studs: true, gems: false, laurel: false, crown: false, flame: true },
  frame_streak_60: { ring: "#34D399", double: true, metal: ["#A7F3D0", "#047857"], studs: true, gems: true, laurel: false, crown: false, flame: true },
  frame_streak_100: { ring: "#A78BFA", double: true, metal: ["#DDD6FE", "#6D28D9"], studs: false, gems: false, laurel: true, crown: false, flame: true },
  frame_streak_180: { ring: "#F472B6", double: true, metal: ["#FBCFE8", "#BE185D"], studs: false, gems: true, laurel: true, crown: false, flame: true },
  frame_streak_365: { ring: "#FBBF24", double: true, metal: ["#FDE68A", "#B45309"], studs: false, gems: true, laurel: true, crown: true, flame: true },
};
/** The frame's look: a chosen streak frame, or the one your level gives you. */
export function frameOrnaments(level: number, frame: string | null): Ornaments {
  if (frame && STREAK_FRAMES[frame]) return STREAK_FRAMES[frame];
  const metal: [string, string] = level >= 55 ? ["#F3E3AE", "#B8994E"] : level >= 21 ? ["#D6A84A", "#8F6A22"] : ["#D3DAE5", "#8E98A8"];
  return { ring: tierColor(level), double: level >= 10, metal, studs: level >= 21 && level < 55, gems: false, laurel: level >= 55, crown: level >= 100, flame: false };
}

// The frame is drawn in a slightly larger box than the ring, so the flame,
// crown and leaves always fit inside the picture (Android cuts off anything
// drawn outside an image's box).
const VIEW = 112, OX = 6, OY = 11, PHOTO = 43;

/**
 * The profile picture: the person from the shoulders up, in a frame that
 * grows with their level, or the highest streak frame they've earned, with
 * their level at the bottom, their pet peeking out and a flame for streaks of
 * 7+ days on larger sizes.
 */
export default memo(function ProfilePicture({ look, equipped = {}, level, background = "bg_dusk", frame = null, streak = 0, size, showLevel = true }: {
  look: AdventurerLook; equipped?: Partial<Record<string, string>>; level: number; background?: string; frame?: string | null; streak?: number; size: number;
  /** The level sits on the picture like the pet and streak, from 56 pt up. */
  showLevel?: boolean;
}) {
  const u = size / VIEW, inner = PHOTO * 2 * u, left = (50 + OX - PHOTO) * u, top = (50 + OY - PHOTO) * u;
  const o = frameOrnaments(level, frame), ring = o.ring, metal = o.metal;
  const [a, b] = BACKGROUNDS[background] ?? BACKGROUNDS.bg_dusk;
  const pet = equipped.pet, petBox = Math.round(size * 0.36);
  const leaves: { x: number; y: number; r: number }[] = [];
  if (o.laurel) for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
    const ang = ((side < 0 ? 205 + i * 16 : 335 - i * 16) * Math.PI) / 180;
    leaves.push({ x: 50 + 48 * Math.cos(ang), y: 50 - 48 * Math.sin(ang), r: (-ang * 180) / Math.PI + (side < 0 ? 90 : -90) });
  }
  return <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
    <View style={{ position: "absolute", left, top, width: inner, height: inner, borderRadius: inner / 2, overflow: "hidden" }}>
      <Svg width={inner} height={inner} style={{ position: "absolute" }}><Defs><LinearGradient id={`pp-${background}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={a} /><Stop offset="1" stopColor={b} /></LinearGradient></Defs>
        <Circle cx={inner / 2} cy={inner / 2} r={inner / 2} fill={`url(#pp-${background})`} /></Svg>
      <AdventurerArt look={look} equipped={equipped} size={inner} crop="portrait" />
    </View>
    <Svg width={size} height={size} viewBox={`${-OX} ${-OY} ${VIEW} ${VIEW}`} style={{ position: "absolute" }}>
      <Circle cx={50} cy={50} r={o.double ? 47.5 : 48} fill="none" stroke={ring} strokeWidth={o.double ? 4 : 3} />
      {o.double && <Circle cx={50} cy={50} r={44.2} fill="none" stroke={metal[0]} strokeWidth={1.2} opacity={0.9} />}
      {o.studs && <G>
        <Circle cx={50} cy={2.5} r={3.4} fill={metal[0]} stroke={metal[1]} strokeWidth={0.8} />
        <Circle cx={97.5} cy={50} r={3} fill={metal[0]} stroke={metal[1]} strokeWidth={0.8} />
        <Circle cx={2.5} cy={50} r={3} fill={metal[0]} stroke={metal[1]} strokeWidth={0.8} />
        <Circle cx={50} cy={97.5} r={3} fill={metal[0]} stroke={metal[1]} strokeWidth={0.8} />
      </G>}
      {leaves.map((leaf, i) => <G key={i} rotation={leaf.r} origin={`${leaf.x}, ${leaf.y}`}>
        <Path d={`M${leaf.x - 5} ${leaf.y} Q${leaf.x} ${leaf.y - 2.6} ${leaf.x + 5} ${leaf.y} Q${leaf.x} ${leaf.y + 2.6} ${leaf.x - 5} ${leaf.y} Z`} fill={metal[0]} stroke={metal[1]} strokeWidth={0.8} />
      </G>)}
      {o.gems && [45, 135, 225, 315].map(deg => {
        const r = (deg * Math.PI) / 180, x = 50 + 48 * Math.cos(r), y = 50 - 48 * Math.sin(r);
        return <Path key={deg} d={`M${x} ${y - 4.2} L${x + 3} ${y} L${x} ${y + 4.2} L${x - 3} ${y} Z`} fill="#FFFFFF" stroke={o.metal[1]} strokeWidth={0.9} />;
      })}
      {o.flame && !o.crown && <G><Circle cx={50} cy={3} r={7} fill="#1E2436" stroke={ring} strokeWidth={1.6} />
        <Path d="M50 -2 Q54.5 2.5 53.8 6 Q53 9.4 50 9.8 Q46.6 9.4 46.4 6.2 Q46.2 3.6 48.6 1.8 Q48.6 4.4 50 5 Q51.4 2.6 50 -2 Z" fill={ring} /></G>}
      {o.crown && <G><Path d="M36 6 L37 -6 L43.5 0 L50 -9 L56.5 0 L63 -6 L64 6 Z" fill="#F3E3AE" stroke="#B8994E" strokeWidth={1.2} strokeLinejoin="round" /><Circle cx={50} cy={-1} r={2.2} fill={ring} /></G>}
    </Svg>
    {!!pet && size >= 40 && <View style={{ position: "absolute", right: 0, bottom: 0, width: petBox, height: petBox, borderRadius: petBox / 2, backgroundColor: "#131826", borderWidth: size >= 80 ? 2 : 1.5, borderColor: ring, alignItems: "center", justifyContent: "center" }}>
      <ItemArt id={pet} size={Math.round(petBox * 0.72)} />
    </View>}
    {/* With a pet beside it, the level moves a little left so the two never touch. */}
    {showLevel && size >= 56 && <View style={{ position: "absolute", left: size * (pet ? 0.43 : 0.5) - Math.round(size * 0.17), width: Math.round(size * 0.34), bottom: size * 0.005, height: Math.round(size * 0.19),
      borderRadius: size * 0.1, backgroundColor: tierColor(level), borderWidth: size >= 100 ? 2 : 1.5, borderColor: "#131826", alignItems: "center", justifyContent: "center" }}
      testID="picture-level">
      <Text style={{ color: "#131826", fontSize: Math.max(10, Math.round(size * 0.115)), fontWeight: "900" }} maxFontSizeMultiplier={1.15} numberOfLines={1}>{level}</Text>
    </View>}
    {/* The streak sits top left, clear of the level and the pet below. */}
    {streak >= 7 && size >= 72 && <View style={{ position: "absolute", left: 0, top: size * 0.04, height: Math.round(size * 0.2), paddingHorizontal: Math.round(size * 0.05), borderRadius: size * 0.1, backgroundColor: "#1E2436", borderWidth: 1.5, borderColor: "#FFB020", flexDirection: "row", alignItems: "center", gap: 2 }}>
      <Svg width={size * 0.12} height={size * 0.12} viewBox="0 0 24 24"><Path d="M12 2 Q18 8 17 14 Q16 21 12 22 Q7 21 6.5 15 Q6 10 10 7 Q10 11 12 12 Q14 8 12 2 Z" fill="#FFB020" /></Svg>
      <Text style={{ color: "#FFD68A", fontSize: Math.round(size * 0.11), fontWeight: "800" }} maxFontSizeMultiplier={1.2}>{streak}</Text>
    </View>}
  </View>;
});
