import { focusAreaTitle } from "../utils/focusAreas";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { colors } from "../constants/theme";
import { type } from "../constants/typography";
import { durationLabel } from "../utils/sessionSetup";
import { Text } from "./AppText";
import ProgressRing from "./ProgressRing";

export type CompletionData = {
  durationSeconds: number;
  xpEarned: number;
  goldEarned: number;
  creditVersion?: number;
  areaXpEarned?: number | null;
  goalReachedNow?: boolean;
};

// Presentation only: neither surface awards, resets nor dismisses a session.
export function CompletionHero({ seconds, title, levelUp = false, compact = false }: {seconds: number; title?: string; levelUp?: boolean; compact?: boolean}) {
  const {fontScale} = useWindowDimensions();
  if (compact) return <View style={s.compactHero}>
    <ProgressRing size={fontScale > 1.3 ? 56 : 72} progress={1} stroke={5}>
      <Ionicons name={levelUp ? "sparkles-outline" : "checkmark"} size={28} color={colors.accent} />
    </ProgressRing>
    <View style={s.compactHeroCopy}>
      <Text style={s.caption}>Time focused</Text>
      <Text style={s.compactTime}>{durationLabel(seconds)}</Text>
      {!!title && <Text style={s.compactQuest}>{title}</Text>}
    </View>
  </View>;
  return <View style={s.hero}>
    <ProgressRing size={fontScale > 1.3 ? 112 : 144} progress={1} stroke={8}>
      <Ionicons name={levelUp ? "sparkles-outline" : "checkmark"} size={52} color={colors.accent} />
    </ProgressRing>
    <Text style={s.caption}>Time focused</Text>
    <Text style={s.time}>{durationLabel(seconds)}</Text>
    {!!title && <Text style={s.quest} numberOfLines={2}>{title}</Text>}
  </View>;
}

export function CompletionRows({ summary, areaTitle, areaColor, level, xpRemaining, compact = false }: {
  summary: CompletionData; areaTitle?: string; areaColor?: string; level?: number; xpRemaining?: number; compact?: boolean;
}) {
  const areaXP = summary.creditVersion === 1 ? summary.areaXpEarned : areaTitle ? summary.xpEarned : null;
  const rowStyle = compact ? s.compactRow : s.row;
  return <View style={s.rows}>
    <View style={rowStyle}><Text style={s.caption}>Character XP</Text><Text style={s.value}>+{summary.xpEarned}</Text></View>
    {areaXP != null && <View style={rowStyle}>
      <Text style={[s.caption, areaColor && {color:areaColor}]}>{areaTitle ? focusAreaTitle(areaTitle) : "Focus area XP"}</Text>
      <Text style={[s.value, areaColor && {color:areaColor}]}>+{areaXP}{areaTitle ? " XP" : ""}</Text>
    </View>}
    {summary.creditVersion !== 1 && summary.goldEarned > 0 && <View style={rowStyle}><Text style={s.caption}>Historical gold</Text><Text style={s.value}>+{summary.goldEarned}</Text></View>}
    {compact ? <View style={s.continuity}>
      <Text style={s.success}>Focus day recorded ✓</Text>
      <Text style={summary.goalReachedNow ? s.success : s.caption}>{summary.goalReachedNow ? "Daily goal reached" : "Daily goal progress saved"}</Text>
    </View> : <>
      <View style={s.row}><Text style={s.caption}>Focus day</Text><Text style={s.success}>Recorded ✓</Text></View>
      <View style={s.row}><Text style={s.caption}>Daily goal</Text><Text style={summary.goalReachedNow ? s.success : s.caption}>{summary.goalReachedNow ? "Goal reached" : "Progress saved"}</Text></View>
    </>}
    {level != null && xpRemaining != null && <View style={rowStyle}><Text style={s.caption}>Level {level}</Text><Text style={s.caption}>{xpRemaining} XP to next level</Text></View>}
  </View>;
}
const s = StyleSheet.create({
  hero: {alignItems:"center", gap:12},
  compactHero: {flexDirection:"row", alignItems:"center", gap:16},
  compactHeroCopy: {flex:1, minWidth:0, gap:2},
  compactTime: {...type.hero, fontSize:32, lineHeight:40, letterSpacing:-0.5},
  compactQuest: {...type.body, marginTop:4},
  caption: {...type.secondary, flexShrink:1},
  time: {...type.hero, textAlign:"center", letterSpacing:-1},
  quest: {...type.body, textAlign:"center"},
  rows: {borderTopWidth:StyleSheet.hairlineWidth, borderTopColor:colors.line, paddingTop:12, gap:0},
  row: {minHeight:52, paddingVertical:8, flexDirection:"row", alignItems:"center", justifyContent:"space-between", gap:12},
  compactRow: {minHeight:36, paddingVertical:6, flexDirection:"row", flexWrap:"wrap", alignItems:"center", justifyContent:"space-between", gap:8},
  continuity: {paddingVertical:8, gap:4},
  value: {...type.body, fontWeight:"500"},
  success: {...type.secondary, color:colors.success, fontWeight:"500"},
});
