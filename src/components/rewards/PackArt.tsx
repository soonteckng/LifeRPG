import { memo } from "react";
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from "react-native-svg";

// The four supply packs: a canvas sack, a leather satchel, a brass-bound
// case and a crystal chest. Each grows from the one before it.
const LOOKS = [
  { body: "#D9C9A3", line: "#9C8A62", flap: "#C9B78C", trim: "#8A6A40", gem: null },
  { body: "#9A643A", line: "#5A3A20", flap: "#7E5130", trim: "#C9A06A", gem: null },
  { body: "#7E5130", line: "#4A2E1A", flap: "#6B4429", trim: "#E2B44C", gem: "#FDE68A" },
  { body: "#3B2F6B", line: "#211A44", flap: "#4C3D86", trim: "#C4B5FD", gem: "#A78BFA" },
] as const;
export const PACK_COLORS = ["#D9C9A3", "#C98A55", "#E2B44C", "#A78BFA"] as const;

export default memo(function PackArt({ tier, size, open = false }: { tier: number; size: number; open?: boolean }) {
  const t = LOOKS[Math.max(0, Math.min(3, tier))];
  return <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Defs><RadialGradient id={`pack-glow-${tier}`} cx="50%" cy="55%" r="50%"><Stop offset="0" stopColor={PACK_COLORS[tier] ?? "#FFFFFF"} stopOpacity={0.45} /><Stop offset="1" stopColor={PACK_COLORS[tier] ?? "#FFFFFF"} stopOpacity={0} /></RadialGradient></Defs>
    <Circle cx={60} cy={66} r={58} fill={`url(#pack-glow-${tier})`} />
    <Ellipse cx={60} cy={108} rx={36} ry={5} fill="#000000" opacity={0.3} />
    {/* Strap. */}
    <Path d="M32 52 Q60 8 88 52" stroke={t.trim} strokeWidth={5} fill="none" strokeLinecap="round" />
    <Rect x={22} y={46} width={76} height={60} rx={14} fill={t.body} stroke={t.line} strokeWidth={2.4} />
    {tier >= 2 && <G><Rect x={22} y={70} width={76} height={6} fill={t.trim} opacity={0.9} /><Path d="M34 46 V106 M86 46 V106" stroke={t.trim} strokeWidth={3} /></G>}
    {open
      ? <Path d="M22 58 Q60 28 98 58 L98 52 Q60 22 22 52 Z" fill={t.flap} stroke={t.line} strokeWidth={2.4} strokeLinejoin="round" />
      : <Path d="M22 60 Q22 46 36 46 L84 46 Q98 46 98 60 L98 72 Q60 84 22 72 Z" fill={t.flap} stroke={t.line} strokeWidth={2.4} strokeLinejoin="round" />}
    {!open && <G>
      <Rect x={52} y={68} width={16} height={14} rx={3} fill={t.trim} stroke={t.line} strokeWidth={1.6} />
      <Circle cx={60} cy={75} r={2.2} fill={t.line} />
    </G>}
    {!!t.gem && !open && <Path d="M60 50 L66 57 L60 64 L54 57 Z" fill={t.gem} stroke="#FFFFFF" strokeWidth={1.2} />}
    {tier === 0 && <Path d="M34 92 Q46 96 58 92 M62 96 Q74 100 86 96" stroke={t.line} strokeWidth={1.6} fill="none" opacity={0.6} />}
    {open && <G>
      <Circle cx={60} cy={44} r={20} fill="#FFFFFF" opacity={0.18} />
      <Path d="M60 18 L63 34 L78 36 L63 39 L60 54 L57 39 L42 36 L57 34 Z" fill="#FFFFFF" opacity={0.9} />
    </G>}
  </Svg>;
});
