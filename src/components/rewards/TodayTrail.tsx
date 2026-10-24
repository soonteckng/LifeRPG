import { memo, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { Text } from "../AppText";
import ProfilePicture from "../adventurer/ProfilePicture";
import { colors, edge, radius } from "../../constants/theme";
import { TRAIL_ZONES, trailStops, trailZone, walked } from "../../utils/trail";
import type { AdventurerLook } from "../../utils/adventurerLook";

const STEP = 104, PAD_TOP = 70, PAD_BOTTOM = 64;

/** One stop every 25 minutes, winding up from camp at the bottom. */
function points(count: number, width: number) {
  const height = PAD_TOP + PAD_BOTTOM + count * STEP;
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: i === 0 ? width * 0.5 : width * (i % 2 ? 0.7 : 0.3) + (i % 3 - 1) * width * 0.04,
    y: height - PAD_BOTTOM - i * STEP,
  }));
}
function along(pts: { x: number; y: number }[], at: number) {
  const i = Math.min(pts.length - 2, Math.floor(at)), f = Math.min(1, at - i);
  return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
}
const curve = (pts: { x: number; y: number }[]) => pts.map((p, i) => {
  if (!i) return `M${p.x} ${p.y}`;
  const a = pts[i - 1];
  return `C${a.x} ${a.y - STEP * 0.45} ${p.x} ${p.y + STEP * 0.45} ${p.x} ${p.y}`;
}).join(" ");

/**
 * Today's trail, as a map you can scroll: camp at the bottom, a stop every
 * 25 focused minutes (each brings a find), and the places the trail passes.
 * It opens on where you are. The trail starts again each morning; finds stay.
 */
export default memo(function TodayTrail({ seconds, finds, nextFindSeconds, look, equipped, level, background, frame, fill = false }: {
  seconds: number; finds: number; nextFindSeconds: number;
  look: AdventurerLook; equipped: Partial<Record<string, string>>; level: number; background: string; frame: string | null;
  /** Grow to fill the space it's given (the map scrolls inside). */
  fill?: boolean;
}) {
  const [width, setWidth] = useState(320), [viewport, setViewport] = useState(0);
  const stops = trailStops(seconds), count = Math.max(6, Math.floor(stops) + 3), height = PAD_TOP + PAD_BOTTOM + count * STEP;
  const pts = points(count, width), here = along(pts, Math.min(stops, count - 0.2)), next = Math.floor(stops) + 1;
  const walkedPts = [...pts.slice(0, Math.floor(stops) + 1), here], aheadPts = [here, ...pts.slice(Math.floor(stops) + 1)];
  const zone = trailZone(stops);
  // Open on where you are.
  const map = useRef<ScrollView>(null);
  useEffect(() => {
    if (!viewport) return;
    const y = Math.max(0, Math.min(height - viewport, here.y - viewport * 0.6));
    const t = setTimeout(() => map.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(t);
  }, [viewport, height, here.y]);
  const bands = TRAIL_ZONES.map((z, i) => {
    const from = Math.min(count, z.from), to = Math.min(count, TRAIL_ZONES[i + 1]?.from ?? count + 1);
    const bottom = i === 0 ? height : pts[from].y + STEP / 2, top = i === TRAIL_ZONES.length - 1 || to >= count ? 0 : pts[to].y + STEP / 2;
    return { ...z, top, bottom };
  }).filter(b => b.bottom > b.top);
  return <View style={[s.card, fill && s.fill]} testID="today-trail">
    <View style={s.stats}>
      <View style={s.stat}><Text style={s.value}>{walked(seconds)}</Text><Text style={s.label}>walked today</Text></View>
      <View style={s.stat}><Text style={[s.value, { color: colors.level }]}>{finds}</Text><Text style={s.label}>{finds === 1 ? "find today" : "finds today"}</Text></View>
      <View style={s.stat}><Text style={s.value}>{`${Math.max(1, Math.ceil(nextFindSeconds / 60))} min`}</Text><Text style={s.label}>to next find</Text></View>
    </View>
    <View style={[s.map, fill ? s.fill : { height: 300 }]} onLayout={e => { setWidth(e.nativeEvent.layout.width); setViewport(e.nativeEvent.layout.height); }}
      accessible accessibilityLabel={`Today's trail. You're in ${zone.name}, ${walked(seconds)} walked, ${finds} finds today. Scroll to see the trail.`}>
      <ScrollView ref={map} showsVerticalScrollIndicator={false} nestedScrollEnabled testID="today-trail-map">
        <View style={{ width, height }}>
          <Svg width={width} height={height}>
            <Defs>{bands.map(b => <LinearGradient key={b.name} id={`band-${b.from}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={b.color} stopOpacity={0.03} /><Stop offset="1" stopColor={b.color} stopOpacity={0.13} /></LinearGradient>)}</Defs>
            {bands.map(b => <G key={b.name}>
              <Rect x={0} y={b.top} width={width} height={b.bottom - b.top} fill={`url(#band-${b.from})`} />
              <SvgText x={16} y={b.bottom - 14} fill={b.color} fontSize={11} fontWeight="800" letterSpacing={1.4}>{b.name.toUpperCase()}</SvgText>
            </G>)}
            {/* A little landmark for each place. */}
            {bands.some(b => b.from === 2) && (() => { const b = bands.find(x => x.from === 2)!; return <Ellipse cx={width * 0.18} cy={(b.top + b.bottom) / 2} rx={34} ry={12} fill="#93C5FD" opacity={0.25} />; })()}
            {bands.some(b => b.from === 4) && (() => { const b = bands.find(x => x.from === 4)!, y = (b.top + b.bottom) / 2; return <Path d={`M${width * 0.84} ${y + 14} L${width * 0.88} ${y - 12} L${width * 0.92} ${y + 14} Z M${width * 0.9} ${y + 14} L${width * 0.93} ${y - 2} L${width * 0.96} ${y + 14} Z`} fill="#FDBA74" opacity={0.35} />; })()}
            {bands.some(b => b.from === 6) && (() => { const b = bands.find(x => x.from === 6)!, y = (b.top + b.bottom) / 2; return <G opacity={0.5}>{[[0.15, -10], [0.22, 6], [0.82, -4]].map(([fx, dy], i) => <Circle key={i} cx={width * fx} cy={y + dy} r={2} fill="#C4B5FD" />)}</G>; })()}
            <Path d={curve(aheadPts)} stroke="rgba(255,255,255,0.3)" strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" fill="none" />
            <Path d={curve(walkedPts)} stroke={colors.level} strokeWidth={5} strokeLinecap="round" fill="none" />
            {pts.slice(1).map((p, i) => {
              const n = i + 1, reached = n <= Math.floor(stops), left = p.x < width / 2;
              return <G key={n}>
                {reached ? <G><Circle cx={p.x} cy={p.y} r={13} fill="#1E2436" stroke={colors.level} strokeWidth={2.5} />
                  <Path d={`M${p.x} ${p.y - 6} L${p.x + 1.8} ${p.y - 1.8} L${p.x + 6} ${p.y} L${p.x + 1.8} ${p.y + 1.8} L${p.x} ${p.y + 6} L${p.x - 1.8} ${p.y + 1.8} L${p.x - 6} ${p.y} L${p.x - 1.8} ${p.y - 1.8} Z`} fill="#C4B5FD" /></G>
                  : n === next ? <Circle cx={p.x} cy={p.y} r={11} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={2} strokeDasharray="3 3" />
                  : <Circle cx={p.x} cy={p.y} r={5} fill="rgba(255,255,255,0.22)" />}
                <SvgText x={left ? p.x + 20 : p.x - 20} y={p.y + 4} fill={reached ? "#E5E7EB" : "rgba(255,255,255,0.5)"} fontSize={11} fontWeight="600" textAnchor={left ? "start" : "end"}>
                  {n === next ? `Next find · ${n * 25} min` : `${n * 25} min`}</SvgText>
              </G>;
            })}
            <Rect x={pts[0].x - 26} y={pts[0].y - 11} width={52} height={22} rx={8} fill="#14B8A6" />
            <SvgText x={pts[0].x} y={pts[0].y + 4} fill="#04211D" fontSize={10} fontWeight="800" textAnchor="middle">CAMP</SvgText>
          </Svg>
          <View pointerEvents="none" style={{ position: "absolute", left: here.x - 24, top: here.y - 24 }}>
            <ProfilePicture look={look} equipped={equipped} level={level} background={background} frame={frame} size={48} />
          </View>
        </View>
      </ScrollView>
    </View>
    {!fill && <Text style={s.note}>Every 25 focused minutes is one stop and brings a find. The trail starts again each morning; your finds stay.</Text>}
  </View>;
});

const s = StyleSheet.create({
  card: { ...edge, gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: "#121827" },
  fill: { flex: 1, minHeight: 0 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, gap: 2, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)" },
  value: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "800", fontVariant: ["tabular-nums"] },
  label: { color: colors.secondary, fontSize: 12, lineHeight: 16 },
  map: { borderRadius: 16, overflow: "hidden", backgroundColor: "#0D1220", minHeight: 200 },
  note: { color: colors.secondary, fontSize: 12, lineHeight: 17, textAlign: "center" },
});
