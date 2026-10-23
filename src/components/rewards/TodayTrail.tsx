import { memo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";
import { Text } from "../AppText";
import ProfilePicture from "../adventurer/ProfilePicture";
import { colors, edge, radius } from "../../constants/theme";
import { TRAIL_ZONES, trailStops, trailZone, walked } from "../../utils/trail";
import type { AdventurerLook } from "../../utils/adventurerLook";

const VW = 320, VH = 300;

/** Points of a winding trail from camp (bottom) upwards, one per stop. */
function points(count: number) {
  return Array.from({ length: count + 1 }, (_, i) => ({ x: i === 0 ? 160 : i % 2 ? 210 + (i % 3) * 18 : 104 - (i % 3) * 14, y: VH - 26 - i * ((VH - 56) / count) }));
}
function along(pts: { x: number; y: number }[], at: number) {
  const i = Math.min(pts.length - 2, Math.floor(at)), f = Math.min(1, at - i);
  return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
}

/**
 * Today's trail: how far you've walked, the finds along the way, and how far
 * to the next one. The trail starts at camp each morning; finds stay yours.
 */
export default memo(function TodayTrail({ seconds, finds, nextFindSeconds, look, equipped, level, background, frame }: {
  seconds: number; finds: number; nextFindSeconds: number;
  look: AdventurerLook; equipped: Partial<Record<string, string>>; level: number; background: string; frame: string | null;
}) {
  const [width, setWidth] = useState(VW);
  const stops = trailStops(seconds), count = Math.max(4, Math.floor(stops) + 2), pts = points(count);
  const here = along(pts, Math.min(stops, count - 0.2)), scale = width / VW, next = Math.floor(stops) + 1;
  const walkedPath = [pts[0], ...pts.slice(1, Math.floor(stops) + 1), here].map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const ahead = [here, ...pts.slice(Math.floor(stops) + 1)].map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const zone = trailZone(stops);
  return <View style={s.card} testID="today-trail">
    <View style={s.stats}>
      <View style={s.stat}><Text style={s.value}>{walked(seconds)}</Text><Text style={s.label}>walked today</Text></View>
      <View style={s.stat}><Text style={[s.value, { color: colors.level }]}>{finds}</Text><Text style={s.label}>{finds === 1 ? "find" : "finds"}</Text></View>
      <View style={s.stat}><Text style={s.value}>{`${Math.max(1, Math.ceil(nextFindSeconds / 60))} min`}</Text><Text style={s.label}>to next find</Text></View>
    </View>
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={s.map} accessible accessibilityLabel={`Today's trail. You're in ${zone.name}, ${walked(seconds)} walked, ${finds} finds today.`}>
      <Svg width={width} height={VH * scale} viewBox={`0 0 ${VW} ${VH}`}>
        {TRAIL_ZONES.map((z, i) => {
          const top = pts[Math.min(count, TRAIL_ZONES[i + 1]?.from ?? count)]?.y ?? 0, bottom = i === 0 ? VH : pts[Math.min(count, z.from)].y;
          return bottom > top ? <G key={z.name}>
            <Rect x={0} y={top} width={VW} height={bottom - top} fill={z.color} opacity={0.07 + i * 0.015} />
            <SvgText x={14} y={bottom - 10} fill={z.color} fontSize={11} fontWeight="700" letterSpacing={1.2}>{z.name.toUpperCase()}</SvgText>
          </G> : null;
        })}
        <Path d={ahead} stroke="rgba(255,255,255,0.35)" strokeWidth={3} strokeDasharray="2 7" strokeLinecap="round" fill="none" />
        <Path d={walkedPath} stroke={colors.level} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {pts.slice(1).map((p, i) => i + 1 <= Math.floor(stops)
          ? <G key={i}><Circle cx={p.x} cy={p.y} r={12} fill="#1E2436" stroke={colors.level} strokeWidth={2.5} /><Path d={`M${p.x} ${p.y - 6} L${p.x + 1.8} ${p.y - 1.8} L${p.x + 6} ${p.y} L${p.x + 1.8} ${p.y + 1.8} L${p.x} ${p.y + 6} L${p.x - 1.8} ${p.y + 1.8} L${p.x - 6} ${p.y} L${p.x - 1.8} ${p.y - 1.8} Z`} fill="#C4B5FD" /></G>
          : i + 1 === next ? <G key={i}><Circle cx={p.x} cy={p.y} r={9} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2} strokeDasharray="3 3" />
            <SvgText x={p.x + 14} y={p.y + 4} fill="rgba(255,255,255,0.75)" fontSize={11}>Next find</SvgText></G>
          : <Circle key={i} cx={p.x} cy={p.y} r={4} fill="rgba(255,255,255,0.25)" />)}
        <Rect x={pts[0].x - 24} y={pts[0].y - 10} width={48} height={22} rx={8} fill="#14B8A6" />
        <SvgText x={pts[0].x} y={pts[0].y + 5} fill="#04211D" fontSize={10} fontWeight="800" textAnchor="middle">CAMP</SvgText>
      </Svg>
      <View pointerEvents="none" style={{ position: "absolute", left: here.x * scale - 22, top: here.y * scale - 22 }}>
        <ProfilePicture look={look} equipped={equipped} level={level} background={background} frame={frame} size={44} />
      </View>
    </View>
    <Text style={s.note}>Every 25 focused minutes takes you one stop further and brings a find. The trail starts again each morning; your finds stay.</Text>
  </View>;
});

const s = StyleSheet.create({
  card: { ...edge, gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: "#121827" },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, gap: 2, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)" },
  value: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "800", fontVariant: ["tabular-nums"] },
  label: { color: colors.secondary, fontSize: 12, lineHeight: 16 },
  map: { borderRadius: 16, overflow: "hidden", backgroundColor: "#0D1220" },
  note: { color: colors.secondary, fontSize: 13, lineHeight: 18, textAlign: "center" },
});
