import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { Easing, interpolate, runOnJS, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../AppText";
import ProfilePicture from "../adventurer/ProfilePicture";
import { StardustArt } from "../adventurer/ItemArt";
import { colors, edge, radius } from "../../constants/theme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { TRAIL_ZONES, trailZone, walked } from "../../utils/trail";
import { tapHaptic } from "../../utils/tapHaptics";
import type { AdventurerLook } from "../../utils/adventurerLook";

const STEP = 104, PAD_TOP = 84, PAD_BOTTOM = 64, SAMPLES = 20, AVATAR = 44;
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The stops, winding up from camp at the bottom to the trail's end at the top. */
function points(count: number, width: number) {
  const height = PAD_TOP + PAD_BOTTOM + count * STEP;
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: i === 0 || i === count ? width * 0.5 : width * (i % 2 ? 0.7 : 0.3) + (i % 3 - 1) * width * 0.04,
    y: height - PAD_BOTTOM - i * STEP,
  }));
}
const controls = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  [{ x: a.x, y: a.y - STEP * 0.45 }, { x: b.x, y: b.y + STEP * 0.45 }] as const;
const curve = (pts: { x: number; y: number }[]) => pts.map((p, i) => {
  if (!i) return `M${p.x} ${p.y}`;
  const [c1, c2] = controls(pts[i - 1], p);
  return `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p.x} ${p.y}`;
}).join(" ");
/** Points along the whole trail, by stop (0 = camp), for walking along it. */
function sample(pts: { x: number; y: number }[]) {
  const ts: number[] = [], xs: number[] = [], ys: number[] = [], lens: number[] = [];
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], [c1, c2] = controls(a, b);
    for (let k = i === 0 ? 0 : 1; k <= SAMPLES; k++) {
      const t = k / SAMPLES, u = 1 - t;
      const x = u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x;
      const y = u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y;
      if (xs.length) length += Math.hypot(x - xs[xs.length - 1], y - ys[ys.length - 1]);
      ts.push(i + t); xs.push(x); ys.push(y); lens.push(length);
    }
  }
  return { ts, xs, ys, lens, length };
}

/**
 * Today's trail: camp at the bottom, a stop with a find every few focused
 * minutes, and the trail's end at the top. You stand where today's focus has
 * taken you; given `fromSeconds`, you walk there from where you were. Past
 * the end you wait at the end; it starts again tomorrow.
 */
export default memo(function TodayTrail({ seconds, fromSeconds, findSeconds, stops, finds, complete, bonus = 0, nextFindSeconds,
  look, equipped, level, background, frame, fill = false, delay = 450 }: {
  seconds: number; fromSeconds?: number; findSeconds: number; stops: number; finds: number; complete: boolean; bonus?: number; nextFindSeconds: number;
  look: AdventurerLook; equipped: Partial<Record<string, string>>; level: number; background: string; frame: string | null;
  /** Grow to fill the space it's given (the map scrolls inside). */
  fill?: boolean; delay?: number;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(320), [viewport, setViewport] = useState(0);
  const count = Math.max(1, stops), height = PAD_TOP + PAD_BOTTOM + count * STEP;
  const pts = useMemo(() => points(count, width), [count, width]);
  const path = useMemo(() => sample(pts), [pts]);
  const at = (s: number) => Math.min(count, Math.max(0, s / Math.max(1, findSeconds)));
  const to = at(seconds), from = fromSeconds === undefined ? to : Math.min(to, at(fromSeconds));
  const ended = to >= count, crossed = ended && from < count;
  const minutesPerStop = Math.round(findSeconds / 60);
  const zone = trailZone(Math.floor(to));
  // Walk from where you were to where you are now, after a moment.
  const walk = useSharedValue(reduced ? to : from);
  const [arrived, setArrived] = useState(reduced || from >= to);
  useEffect(() => {
    if (reduced || from >= to) { walk.value = to; return; }
    walk.value = from;
    walk.value = withDelay(delay, withTiming(to, { duration: Math.min(2600, 900 + (to - from) * 520), easing: Easing.inOut(Easing.cubic) }, done => {
      if (done) runOnJS(setArrived)(true);
    }));
  }, [walk, from, to, delay, reduced]);
  // A small buzz at each stop you pass.
  useAnimatedReaction(() => Math.floor(walk.value + 1e-6), (now, before) => {
    if (before !== null && now > before) runOnJS(tapHaptic)("light");
  });
  const ts = path.ts, xs = path.xs, ys = path.ys, lens = path.lens, total = path.length;
  const you = useAnimatedStyle(() => ({ transform: [
    { translateX: interpolate(walk.value, ts, xs) - AVATAR / 2 }, { translateY: interpolate(walk.value, ts, ys) - AVATAR / 2 }] }));
  const walkedLine = useAnimatedProps(() => ({ strokeDashoffset: total - interpolate(walk.value, ts, lens) }));
  // Open on where you'll be, with where you set off from in view too.
  const map = useRef<ScrollView>(null);
  const focusY = interpolate(to, path.ts, path.ys);
  useEffect(() => {
    if (!viewport) return;
    const y = Math.max(0, Math.min(height - viewport, focusY - viewport * 0.4));
    const t = setTimeout(() => map.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(t);
  }, [viewport, height, focusY]);
  // Reaching the end on this walk: the trail's own reward.
  const party = useSharedValue(0);
  const celebrate = crossed && arrived;
  useEffect(() => {
    if (!celebrate) return;
    tapHaptic("success");
    party.value = reduced ? 1 : withSpring(1, { damping: 12, stiffness: 140 });
  }, [celebrate, party, reduced]);
  const partyStyle = useAnimatedStyle(() => ({ opacity: party.value, transform: [{ scale: 0.8 + party.value * 0.2 }, { translateY: (1 - party.value) * 20 }] }));
  const bands = TRAIL_ZONES.map((z, i) => {
    const start = Math.min(count, z.from), end = Math.min(count, TRAIL_ZONES[i + 1]?.from ?? count + 1);
    const bottom = i === 0 ? height : pts[start].y + STEP / 2, top = end >= count ? 0 : pts[end].y + STEP / 2;
    return { ...z, top, bottom };
  }).filter(b => b.bottom > b.top + 1);
  const next = Math.floor(to) + 1, toNext = Math.max(1, Math.ceil(nextFindSeconds / 60));
  const label = ended || complete ? "Trail complete for today" : `${toNext} min to your next find`;
  return <View style={[s.card, fill && s.fill]} testID="today-trail">
    <View style={s.stats}>
      <View style={s.stat}><Text style={s.value}>{walked(seconds)}</Text><Text style={s.label}>walked today</Text></View>
      <View style={s.stat}><Text style={[s.value, { color: colors.level }]}>{`${Math.min(finds, count)} of ${count}`}</Text><Text style={s.label}>finds today</Text></View>
      <View style={s.stat}>{ended || complete ? <><Ionicons name="flag" size={18} color="#C4B5FD" /><Text style={s.label}>trail complete</Text></>
        : <><Text style={s.value}>{`${toNext} min`}</Text><Text style={s.label}>to next find</Text></>}</View>
    </View>
    <View style={[s.map, fill ? s.fill : { height: 360 }]} onLayout={e => { setWidth(e.nativeEvent.layout.width); setViewport(e.nativeEvent.layout.height); }}
      accessible accessibilityLabel={`Today's trail, ${count * minutesPerStop} minutes long, a find every ${minutesPerStop} minutes. You're in ${zone.name}, ${walked(seconds)} walked, ${Math.min(finds, count)} of ${count} finds. ${label}.`}>
      <ScrollView ref={map} showsVerticalScrollIndicator={false} nestedScrollEnabled testID="today-trail-map">
        <View style={{ width, height }}>
          <Svg width={width} height={height}>
            <Defs>{bands.map(b => <LinearGradient key={b.name} id={`band-${b.from}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={b.color} stopOpacity={0.03} /><Stop offset="1" stopColor={b.color} stopOpacity={0.14} /></LinearGradient>)}</Defs>
            {bands.map(b => <G key={b.name}>
              <Rect x={0} y={b.top} width={width} height={b.bottom - b.top} fill={`url(#band-${b.from})`} />
              <SvgText x={16} y={b.bottom - 14} fill={b.color} fontSize={11} fontWeight="800" letterSpacing={1.4}>{b.name.toUpperCase()}</SvgText>
            </G>)}
            {/* A little landmark for each place. */}
            {bands.some(b => b.from === 2) && (() => { const b = bands.find(x => x.from === 2)!; return <Ellipse cx={width * 0.18} cy={(b.top + b.bottom) / 2} rx={34} ry={12} fill="#93C5FD" opacity={0.25} />; })()}
            {bands.some(b => b.from === 4) && (() => { const b = bands.find(x => x.from === 4)!, y = (b.top + b.bottom) / 2; return <Path d={`M${width * 0.84} ${y + 14} L${width * 0.88} ${y - 12} L${width * 0.92} ${y + 14} Z M${width * 0.9} ${y + 14} L${width * 0.93} ${y - 2} L${width * 0.96} ${y + 14} Z`} fill="#FDBA74" opacity={0.35} />; })()}
            <Path d={curve(pts)} stroke="rgba(255,255,255,0.28)" strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" fill="none" />
            <AnimatedPath d={curve(pts)} stroke={colors.level} strokeWidth={5} strokeLinecap="round" fill="none" strokeDasharray={[total, total]} animatedProps={walkedLine} />
            {pts.slice(1).map((p, i) => {
              const n = i + 1, reached = n <= Math.floor(to + 1e-6), last = n === count, left = p.x < width / 2;
              const mins = n * minutesPerStop;
              return <G key={n}>
                {last ? <G>
                  <Circle cx={p.x} cy={p.y} r={18} fill={reached ? "#2A2140" : "#151B2B"} stroke={reached ? "#C4B5FD" : "rgba(255,255,255,0.35)"} strokeWidth={2.5} />
                  <Path d={`M${p.x - 5} ${p.y + 9} L${p.x - 5} ${p.y - 9} L${p.x + 8} ${p.y - 5} L${p.x - 5} ${p.y - 1}`} stroke={reached ? "#C4B5FD" : "rgba(255,255,255,0.6)"} strokeWidth={2.2} strokeLinejoin="round" fill={reached ? "#C4B5FD" : "none"} />
                </G> : reached ? <G><Circle cx={p.x} cy={p.y} r={13} fill="#1E2436" stroke={colors.level} strokeWidth={2.5} />
                  <Path d={`M${p.x} ${p.y - 6} L${p.x + 1.8} ${p.y - 1.8} L${p.x + 6} ${p.y} L${p.x + 1.8} ${p.y + 1.8} L${p.x} ${p.y + 6} L${p.x - 1.8} ${p.y + 1.8} L${p.x - 6} ${p.y} L${p.x - 1.8} ${p.y - 1.8} Z`} fill="#C4B5FD" /></G>
                  : n === next ? <Circle cx={p.x} cy={p.y} r={11} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={2} strokeDasharray="3 3" />
                  : <Circle cx={p.x} cy={p.y} r={5} fill="rgba(255,255,255,0.22)" />}
                {last ? <SvgText x={p.x} y={p.y - 28} fill={reached ? "#E9E3FF" : "rgba(255,255,255,0.6)"} fontSize={12} fontWeight="800" textAnchor="middle">
                  {`Trail's end · ${mins} min`}</SvgText>
                  : <SvgText x={left ? p.x + 20 : p.x - 20} y={p.y + 4} fill={reached ? "#E5E7EB" : "rgba(255,255,255,0.5)"} fontSize={11} fontWeight="600" textAnchor={left ? "start" : "end"}>
                  {n === next && !ended ? `Next find · ${mins} min` : `${mins} min`}</SvgText>}
              </G>;
            })}
            <Rect x={pts[0].x - 26} y={pts[0].y - 11} width={52} height={22} rx={8} fill="#14B8A6" />
            <SvgText x={pts[0].x} y={pts[0].y + 4} fill="#04211D" fontSize={10} fontWeight="800" textAnchor="middle">CAMP</SvgText>
          </Svg>
          <Animated.View pointerEvents="none" style={[s.you, you]}>
            <ProfilePicture look={look} equipped={equipped} level={level} background={background} frame={frame} size={AVATAR} showLevel={false} />
          </Animated.View>
        </View>
      </ScrollView>
      {celebrate && <Animated.View style={[s.party, partyStyle]} testID="trail-complete" accessible accessibilityLiveRegion="polite"
        accessibilityLabel={`Trail complete. ${bonus ? `${bonus} Stardust.` : ""} It starts again tomorrow.`}>
        <Ionicons name="flag" size={22} color="#C4B5FD" />
        <View style={s.partyCopy}>
          <Text style={s.partyTitle}>Trail complete</Text>
          <Text style={s.partyBody}>{`You walked all ${count * minutesPerStop} minutes today. It starts again tomorrow.`}</Text>
        </View>
        {bonus > 0 && <View style={s.partyDust}><StardustArt size={14} /><Text style={s.partyDustText}>{`+${bonus}`}</Text></View>}
      </Animated.View>}
    </View>
  </View>;
});

const s = StyleSheet.create({
  card: { ...edge, gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: "#121827" },
  fill: { flex: 1, minHeight: 0 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, gap: 2, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)", justifyContent: "center" },
  value: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "800", fontVariant: ["tabular-nums"] },
  label: { color: colors.secondary, fontSize: 12, lineHeight: 16 },
  map: { borderRadius: 16, overflow: "hidden", backgroundColor: "#0D1220", minHeight: 220 },
  you: { position: "absolute", left: 0, top: 0, width: AVATAR, height: AVATAR },
  party: { position: "absolute", left: 10, right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18,
    backgroundColor: "#211B38", borderWidth: 1, borderColor: "rgba(196,181,253,0.45)" },
  partyCopy: { flex: 1, minWidth: 0, gap: 2 },
  partyTitle: { color: "#F5F3FF", fontSize: 16, lineHeight: 21, fontWeight: "800" },
  partyBody: { color: "#C9C2E8", fontSize: 13, lineHeight: 18 },
  partyDust: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, minHeight: 28, borderRadius: 14, backgroundColor: "rgba(167,139,250,0.22)" },
  partyDustText: { color: "#EDE9FE", fontSize: 14, fontWeight: "800" },
});
