import { memo, type ReactElement } from "react";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { tierColor } from "../../utils/adventurerLook";

// Small pictures of every reward, on a 64 × 64 canvas. Locked items are drawn
// faded so people can see what they are working towards.
const star = (x: number, y: number, r: number, fill: string) =>
  <Path d={`M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z`} fill={fill} />;

const backgrounds: Record<string, [string, string]> = {
  bg_dusk: ["#4A3366", "#B86A6A"], bg_forest: ["#24493F", "#3E6B4F"], bg_meadow: ["#6C9CC6", "#A8CC92"],
  bg_night: ["#141B3A", "#4A5AA0"], bg_library: ["#6B4A30", "#3A2416"], bg_sunset: ["#F59E6B", "#B4532A"],
};
const frames: Record<string, string> = { frame_streak_7: "#FFB020", frame_streak_30: "#60A5FA", frame_streak_100: "#A78BFA", frame_streak_365: "#FBBF24" };
const titles: Record<string, string> = { title_scholar: "#60A5FA", title_artist: "#F472B6", title_wanderer: "#86C27F" };

const ART: Record<string, () => ReactElement> = {
  glasses: () => <G>
    <Circle cx={20} cy={34} r={12} fill="#C9D8E8" opacity={0.35} /><Circle cx={44} cy={34} r={12} fill="#C9D8E8" opacity={0.35} />
    <Circle cx={20} cy={34} r={12} fill="none" stroke="#3A3A46" strokeWidth={3.5} /><Circle cx={44} cy={34} r={12} fill="none" stroke="#3A3A46" strokeWidth={3.5} />
    <Path d="M29 32 Q32 28 35 32" stroke="#3A3A46" strokeWidth={3.5} fill="none" strokeLinecap="round" />
  </G>,
  cardigan: () => <G>
    <Path d="M18 8 L28 8 L32 22 L36 8 L46 8 L58 18 L52 30 L48 26 L48 58 L16 58 L16 26 L12 30 L6 18 Z" fill="#B89C74" stroke="#7E6545" strokeWidth={2} strokeLinejoin="round" />
    <Path d="M28 8 L32 22 L36 8 Z" fill="#F2EEE6" /><Path d="M32 22 L32 58" stroke="#7E6545" strokeWidth={2} />
    <Circle cx={29} cy={32} r={1.8} fill="#5A4630" /><Circle cx={29} cy={42} r={1.8} fill="#5A4630" /><Circle cx={29} cy={52} r={1.8} fill="#5A4630" />
  </G>,
  tie: () => <G>
    <Path d="M26 6 L38 6 L36 14 L28 14 Z" fill="#7A2E2E" />
    <Path d="M28 14 L36 14 L42 46 L32 58 L22 46 Z" fill="#9B3A3A" stroke="#5E1F1F" strokeWidth={2} strokeLinejoin="round" />
    <Path d="M26 30 L39 24 M24 40 L41 33" stroke="#C9A06A" strokeWidth={2.4} />
  </G>,
  book_bag: () => <G>
    <Path d="M16 26 Q32 4 48 26" stroke="#7A4F2E" strokeWidth={4} fill="none" />
    <Rect x={10} y={24} width={44} height={32} rx={8} fill="#A0703F" />
    <Path d="M10 34 L54 34 L54 30 Q54 24 48 24 L16 24 Q10 24 10 30 Z" fill="#7A4F2E" />
    <Rect x={28} y={31} width={8} height={10} rx={2} fill="#FBBF24" />
  </G>,
  notebook: () => <G>
    <Rect x={12} y={10} width={38} height={46} rx={4} fill="#7A2E2E" stroke="#4E1C1C" strokeWidth={2} />
    <Rect x={46} y={12} width={6} height={42} rx={1} fill="#F2E8D0" /><Path d="M18 10 L18 56" stroke="#4E1C1C" strokeWidth={2} />
    <Rect x={24} y={20} width={18} height={8} rx={2} fill="#D6A84A" />
  </G>,
  overalls: () => <G>
    <Path d="M18 4 L22 4 L24 22 L40 22 L42 4 L46 4 L46 24 L48 60 L34 60 L32 44 L30 60 L16 60 L18 24 Z" fill="#4F6FA8" stroke="#33508A" strokeWidth={2} strokeLinejoin="round" />
    <Rect x={25} y={27} width={14} height={10} rx={2} fill="#5D7DB6" stroke="#33508A" strokeWidth={1.6} />
    <Circle cx={22} cy={48} r={2.6} fill="#F87171" /><Circle cx={40} cy={44} r={2} fill="#FBBF24" />
  </G>,
  beret: () => <G>
    <Ellipse cx={32} cy={38} rx={27} ry={12} fill="#DC2626" rotation={-10} origin="32, 38" />
    <Ellipse cx={26} cy={34} rx={12} ry={3.5} fill="#EF4444" rotation={-10} origin="26, 34" />
    <Rect x={30} y={18} width={5} height={10} rx={2.5} fill="#B91C1C" />
  </G>,
  tote: () => <G>
    <Path d="M22 22 Q22 6 32 6 Q42 6 42 22" stroke="#B8A67F" strokeWidth={4} fill="none" />
    <Path d="M12 22 L52 22 L48 58 L16 58 Z" fill="#E3D5B8" stroke="#B8A67F" strokeWidth={2} strokeLinejoin="round" />
    <Circle cx={26} cy={38} r={4} fill="#F87171" /><Circle cx={38} cy={44} r={3} fill="#60A5FA" /><Circle cx={34} cy={32} r={2.4} fill="#34D399" />
  </G>,
  sneakers: () => <G>
    <Path d="M6 44 Q6 30 14 28 L24 26 Q30 34 40 34 L54 38 Q60 40 60 48 L60 50 L6 50 Z" fill="#F1EDE4" stroke="#B8B2A6" strokeWidth={2} strokeLinejoin="round" />
    <Rect x={6} y={48} width={54} height={8} rx={3} fill="#C9C1B4" />
    <Path d="M22 32 L30 36 M20 38 L28 40" stroke="#F87171" strokeWidth={2.4} strokeLinecap="round" />
  </G>,
  field_jacket: () => <G>
    <Path d="M18 8 L46 8 L58 18 L52 30 L48 26 L48 58 L16 58 L16 26 L12 30 L6 18 Z" fill="#6B7550" stroke="#424A2F" strokeWidth={2} strokeLinejoin="round" />
    <Path d="M32 8 L32 58" stroke="#424A2F" strokeWidth={2} />
    <Rect x={19} y={26} width={10} height={9} rx={2} fill="#5D6744" stroke="#424A2F" strokeWidth={1.6} />
    <Rect x={35} y={26} width={10} height={9} rx={2} fill="#5D6744" stroke="#424A2F" strokeWidth={1.6} />
  </G>,
  forest_cloak: () => <G>
    <Path d="M18 8 Q32 2 46 8 L58 58 Q32 64 6 58 Z" fill="#2F5A4E" stroke="#1C3A32" strokeWidth={2} strokeLinejoin="round" />
    <Path d="M16 10 Q32 22 48 10 Q50 20 42 24 Q32 28 22 24 Q14 20 16 10 Z" fill="#3B6B5D" stroke="#1C3A32" strokeWidth={2} />
    <Circle cx={24} cy={24} r={3} fill="#D6A84A" /><Circle cx={40} cy={24} r={3} fill="#D6A84A" />
  </G>,
  walking_staff: () => <G rotation={18} origin="32, 32">
    <Path d="M32 12 L32 62" stroke="#6B4429" strokeWidth={7} strokeLinecap="round" />
    <Path d="M32 12 L32 62" stroke="#8B5E3C" strokeWidth={4} strokeLinecap="round" />
    <Circle cx={32} cy={9} r={7} fill="#C9A06A" stroke="#8A6A40" strokeWidth={2} />
    <Path d="M29 24 L35 28 M29 30 L35 34" stroke="#2F5A4E" strokeWidth={3} />
  </G>,
  trail_boots: () => <G>
    <Path d="M18 6 L36 6 L36 38 L54 42 Q60 44 60 52 L60 54 L18 54 Z" fill="#6B4429" stroke="#3E2716" strokeWidth={2} strokeLinejoin="round" />
    <Rect x={16} y={52} width={46} height={7} rx={3} fill="#3E2716" />
    <Path d="M24 14 L32 14 M24 22 L32 22 M24 30 L32 30" stroke="#C9A06A" strokeWidth={2.2} strokeLinecap="round" />
  </G>,
  pet_owl: () => <G>
    <Ellipse cx={32} cy={38} rx={19} ry={21} fill="#B08968" /><Ellipse cx={32} cy={44} rx={11} ry={13} fill="#EAD7C0" />
    <Path d="M15 22 L18 10 L25 19 Z M49 22 L46 10 L39 19 Z" fill="#9C7656" />
    <Circle cx={24} cy={30} r={7} fill="#FFFFFF" /><Circle cx={40} cy={30} r={7} fill="#FFFFFF" />
    <Circle cx={25} cy={31} r={3.5} fill="#2B2B33" /><Circle cx={39} cy={31} r={3.5} fill="#2B2B33" />
    <Path d="M29 37 L35 37 L32 42 Z" fill="#F59E0B" />
  </G>,
  pet_cat: () => <G>
    <Path d="M8 54 Q6 32 30 30 Q56 30 56 54 Z" fill="#9CA3AF" />
    <Path d="M54 50 Q64 44 60 34" stroke="#9CA3AF" strokeWidth={6} fill="none" strokeLinecap="round" />
    <Circle cx={20} cy={38} r={13} fill="#A8B0BB" />
    <Path d="M9 32 L10 18 L19 27 Z M31 32 L30 18 L21 27 Z" fill="#A8B0BB" />
    <Path d="M13 39 Q16 42 19 39 M22 39 Q25 42 28 39" stroke="#374151" strokeWidth={2} fill="none" strokeLinecap="round" />
  </G>,
  pet_fox: () => <G>
    <Path d="M42 56 Q64 50 58 28 Q54 48 38 50 Z" fill="#F97316" /><Path d="M58 28 Q62 34 60 40 Q56 36 58 28 Z" fill="#FFFFFF" />
    <Path d="M14 58 Q12 36 30 32 Q46 36 44 58 Z" fill="#F97316" /><Path d="M22 58 Q22 44 30 42 Q36 44 36 58 Z" fill="#FFF7ED" />
    <Path d="M12 22 Q30 6 48 22 L40 36 Q30 42 20 36 Z" fill="#F97316" />
    <Path d="M12 22 L10 6 L22 14 Z M48 22 L50 6 L38 14 Z" fill="#EA580C" />
    <Path d="M21 30 Q30 40 39 30 L30 38 Z" fill="#FFF7ED" />
    <Circle cx={23} cy={24} r={2.4} fill="#1F2937" /><Circle cx={37} cy={24} r={2.4} fill="#1F2937" /><Circle cx={30} cy={32} r={2.2} fill="#1F2937" />
  </G>,
  decor_signpost: () => <G>
    <Rect x={29} y={10} width={6} height={50} rx={2} fill="#7C4A2D" />
    <Path d="M10 14 L44 14 L52 21 L44 28 L10 28 Z" fill="#C9A06A" stroke="#8A6A40" strokeWidth={2} strokeLinejoin="round" />
    <Path d="M54 34 L20 34 L12 41 L20 48 L54 48 Z" fill="#B08968" stroke="#7C5A3C" strokeWidth={2} strokeLinejoin="round" />
    <Ellipse cx={32} cy={60} rx={14} ry={3} fill="#2F4A3A" />
  </G>,
  decor_crates: () => <G>
    <Rect x={6} y={32} width={26} height={26} rx={2} fill="#B07D4A" stroke="#7A4F2E" strokeWidth={2} />
    <Rect x={32} y={32} width={26} height={26} rx={2} fill="#A0703F" stroke="#7A4F2E" strokeWidth={2} />
    <Rect x={18} y={8} width={26} height={24} rx={2} fill="#C08A5B" stroke="#7A4F2E" strokeWidth={2} />
    <Path d="M6 45 H32 M32 45 H58 M18 20 H44 M19 33 L31 57 M45 33 L33 57" stroke="#7A4F2E" strokeWidth={1.6} />
  </G>,
  decor_easel: () => <G>
    <Path d="M20 58 L30 10 M44 58 L34 10 M32 40 L32 58" stroke="#8B5E3C" strokeWidth={3.5} strokeLinecap="round" />
    <Rect x={14} y={14} width={36} height={28} rx={2} fill="#F3EEE3" stroke="#C9C1B4" strokeWidth={2} />
    <Circle cx={24} cy={26} r={4} fill="#F87171" /><Path d="M28 36 Q36 22 44 32" stroke="#60A5FA" strokeWidth={3} fill="none" strokeLinecap="round" />
  </G>,
  decor_bonsai: () => <G>
    <Rect x={14} y={44} width={36} height={14} rx={4} fill="#7C4A2D" /><Rect x={12} y={42} width={40} height={5} rx={2.5} fill="#9A6440" />
    <Path d="M32 44 Q28 32 36 24" stroke="#7C4A2D" strokeWidth={4} fill="none" strokeLinecap="round" />
    <Ellipse cx={24} cy={24} rx={14} ry={9} fill="#6FA86A" /><Ellipse cx={42} cy={18} rx={13} ry={8} fill="#86C27F" /><Ellipse cx={36} cy={30} rx={9} ry={5} fill="#86C27F" />
  </G>,
  decor_herb_garden: () => <G>
    <Rect x={6} y={40} width={52} height={18} rx={4} fill="#8A5A33" stroke="#5A3A20" strokeWidth={2} />
    <Path d="M14 40 Q12 26 18 18 M18 40 Q22 28 28 24 M32 40 Q32 22 36 14 M44 40 Q40 28 46 20 M50 40 Q52 30 56 26" stroke="#4F8A4A" strokeWidth={3} fill="none" strokeLinecap="round" />
    <Circle cx={18} cy={18} r={4} fill="#86C27F" /><Circle cx={36} cy={14} r={4.5} fill="#6FA86A" /><Circle cx={46} cy={20} r={4} fill="#86C27F" /><Circle cx={28} cy={24} r={3} fill="#F9A8D4" />
  </G>,
  decor_hammock: () => <G>
    <Path d="M8 58 L8 10 M56 58 L56 10" stroke="#7C4A2D" strokeWidth={4} strokeLinecap="round" />
    <Path d="M8 22 Q32 52 56 22" stroke="#C9A06A" strokeWidth={3} fill="none" />
    <Path d="M10 24 Q32 50 54 24 Q32 40 10 24 Z" fill="#E07A5F" />
    <Path d="M18 31 Q32 42 46 31" stroke="#F2B38A" strokeWidth={2} fill="none" />
  </G>,
  decor_reading_nook: () => <G>
    <Path d="M8 58 L8 30 Q8 20 18 20 L46 20 Q56 20 56 30 L56 58 Z" fill="#5B6FA8" stroke="#3B4C74" strokeWidth={2} />
    <Rect x={14} y={36} width={36} height={14} rx={6} fill="#7C8FC8" />
    <Rect x={20} y={8} width={6} height={12} fill="#F87171" /><Rect x={27} y={10} width={5} height={10} fill="#FBBF24" /><Rect x={33} y={7} width={6} height={13} fill="#60A5FA" />
    <Circle cx={48} cy={12} r={5} fill="#FDE68A" opacity={0.8} />
  </G>,
};

export default memo(function ItemArt({ id, size, locked = false }: { id: string; size: number; locked?: boolean }) {
  let art: ReactElement | null = ART[id]?.() ?? null;
  if (!art && backgrounds[id]) {
    const [a, b] = backgrounds[id];
    art = <G><Defs><LinearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={a} /><Stop offset="1" stopColor={b} /></LinearGradient></Defs>
      <Circle cx={32} cy={32} r={26} fill={`url(#g-${id})`} stroke="rgba(255,255,255,0.25)" strokeWidth={2} /></G>;
  }
  if (!art && frames[id]) {
    const c = frames[id];
    art = <G><Circle cx={32} cy={32} r={22} fill="none" stroke={c} strokeWidth={6} /><Circle cx={32} cy={32} r={16} fill="#1E2436" />
      <Path d="M32 22 Q38 28 37 33 Q36 40 32 41 Q27 40 27 34 Q27 30 30 27 Q30 31 32 32 Q34 28 32 22 Z" fill={c} />
      {id === "frame_streak_365" && <Path d="M22 12 L24 4 L28 9 L32 2 L36 9 L40 4 L42 12 Z" fill={c} />}</G>;
  }
  if (!art && titles[id]) {
    const c = titles[id];
    art = <G><Path d="M20 34 L14 58 L22 54 L26 60 L30 38 Z M44 34 L50 58 L42 54 L38 60 L34 38 Z" fill={c} opacity={0.7} />
      <Circle cx={32} cy={26} r={18} fill={c} /><Circle cx={32} cy={26} r={12} fill="none" stroke="#FFFFFF" strokeWidth={1.6} opacity={0.6} />{star(32, 26, 7, "#FFFFFF")}</G>;
  }
  if (!art) art = <G><Circle cx={32} cy={32} r={20} fill={tierColor(1)} opacity={0.3} />{star(32, 32, 10, "#C4B5FD")}</G>;
  return <Svg width={size} height={size} viewBox="0 0 64 64" opacity={locked ? 0.32 : 1} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{art}</Svg>;
});

/** The Stardust spark used on chips and prices. */
export const StardustArt = memo(function StardustArt({ size }: { size: number }) {
  return <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path d="M32 6 L37 27 L58 32 L37 37 L32 58 L27 37 L6 32 L27 27 Z" fill="#A78BFA" />
    <Path d="M32 18 L34.5 29.5 L46 32 L34.5 34.5 L32 46 L29.5 34.5 L18 32 L29.5 29.5 Z" fill="#DDD6FE" />
  </Svg>;
});
