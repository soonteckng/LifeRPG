import { memo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import AdventurerArt from "./adventurer/AdventurerArt";
import { useRewards } from "../hooks/useRewards";
import { durationLabel } from "../utils/sessionSetup";

const H = 132;

/**
 * The top of the session card: you, back at camp in the morning light, with
 * the time you recorded. The same place and light as the session itself.
 */
export default memo(function ArrivalBanner({ seconds, title, levelUp = false }: { seconds: number; title?: string; levelUp?: boolean }) {
  const rewards = useRewards({ load: false });
  // The banner grows with large text, and the scene grows with it.
  const [box, setBox] = useState({ w: 340, h: H });
  const w = box.w, H2 = box.h;
  return <View style={s.banner} onLayout={e => {
    const width = e.nativeEvent.layout.width, height = Math.max(H, e.nativeEvent.layout.height);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || box.w === width && box.h === height) return;
    // The sheet reports the same layout while its footer and body settle.
    // Keep that native measurement from scheduling another scene commit.
    setBox(current => current.w === width && current.h === height ? current : {w:width, h:height});
  }} testID="session-arrival">
    <Svg width={w} height={H2} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="arrival-sky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#5F97CF" /><Stop offset="1" stopColor="#F5D7AE" /></LinearGradient>
        <LinearGradient id="arrival-shade" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#0B1220" stopOpacity={0.78} /><Stop offset="0.62" stopColor="#0B1220" stopOpacity={0.2} /><Stop offset="1" stopColor="#0B1220" stopOpacity={0} /></LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={H2} fill="url(#arrival-sky)" />
      <Circle cx={w - 46} cy={28} r={22} fill="#FFE6A8" opacity={0.35} /><Circle cx={w - 46} cy={28} r={13} fill="#FFD27A" />
      <Path d={`M0 ${H2 * 0.62} Q${w * 0.2} ${H2 * 0.48} ${w * 0.42} ${H2 * 0.58} Q${w * 0.66} ${H2 * 0.46} ${w} ${H2 * 0.6} L${w} ${H2} L0 ${H2} Z`} fill="#6A82A6" />
      <Rect x={0} y={H2 * 0.68} width={w} height={H2 * 0.32} fill="#4A7A56" />
      <Path d={`M${w * 0.74} ${H2 * 0.68} L${w * 0.79} ${H2 * 0.68} L${w * 0.95} ${H2} L${w * 0.6} ${H2} Z`} fill="#A38F69" />
      <Path d={`M${w * 0.5} ${H2 * 0.9} L${w * 0.54} ${H2 * 0.72} L${w * 0.58} ${H2 * 0.9} Z`} fill="#22C3A3" />
      <Rect x={0} y={0} width={w} height={H2} fill="url(#arrival-shade)" />
    </Svg>
    <View style={s.person} pointerEvents="none"><AdventurerArt look={rewards.look} equipped={rewards.equipped} size={58} /></View>
    <View style={s.copy}>
      {levelUp ? <View style={s.chip}><Ionicons name="sparkles" size={12} color="#2B2200" /><Text style={s.chipText}>Level up</Text></View>
        : <Text style={s.caption}>Time recorded</Text>}
      <Text style={s.time}>{durationLabel(seconds)}</Text>
      {!!title && <Text style={s.title} numberOfLines={1}>{title}</Text>}
    </View>
  </View>;
});

const s = StyleSheet.create({
  banner: { minHeight: H, paddingVertical: 14, borderRadius: 22, overflow: "hidden", backgroundColor: "#5F97CF", justifyContent: "center" },
  person: { position: "absolute", right: "17%", bottom: -4 },
  copy: { paddingHorizontal: 18, gap: 2, maxWidth: "64%" },
  caption: { color: "rgba(255,255,255,0.82)", fontSize: 13, fontWeight: "600" },
  chip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, minHeight: 22, borderRadius: 11, backgroundColor: "#FBBF24" },
  chipText: { color: "#2B2200", fontSize: 12, fontWeight: "800" },
  time: { color: "#FFFFFF", fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -0.6 },
  title: { color: "rgba(255,255,255,0.86)", fontSize: 15, fontWeight: "600" },
});
