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
export function CompletionHero({ seconds, title, levelUp = false }: {seconds: number; title?: string; levelUp?: boolean}) {
  const {fontScale} = useWindowDimensions();
  return <View style={s.hero}>
    <ProgressRing size={fontScale > 1.3 ? 112 : 144} progress={1} stroke={8}>
      <Ionicons name={levelUp ? "sparkles-outline" : "checkmark"} size={52} color={colors.accent} />
    </ProgressRing>
    <Text style={s.caption}>Time focused</Text>
    <Text style={s.time}>{durationLabel(seconds)}</Text>
    {!!title && <Text style={s.quest} numberOfLines={2}>{title}</Text>}
  </View>;
}

export function CompletionRows({ summary, areaTitle, areaColor, level, xpRemaining }: {
  summary: CompletionData; areaTitle?: string; areaColor?: string; level?: number; xpRemaining?: number;
}) {
  const areaXP = summary.creditVersion === 1 ? summary.areaXpEarned : areaTitle ? summary.xpEarned : null;
  return <View style={s.rows}>
    <View style={s.row}><Text style={s.caption}>Character XP</Text><Text style={s.value}>+{summary.xpEarned}</Text></View>
    {areaXP != null && <View style={s.row}>
      <Text style={[s.caption, areaColor && {color:areaColor}]}>{areaTitle || "Life area XP"}</Text>
      <Text style={[s.value, areaColor && {color:areaColor}]}>+{areaXP}{areaTitle ? " XP" : ""}</Text>
    </View>}
    {summary.creditVersion !== 1 && summary.goldEarned > 0 && <View style={s.row}><Text style={s.caption}>Historical gold</Text><Text style={s.value}>+{summary.goldEarned}</Text></View>}
    <View style={s.row}><Text style={s.caption}>Focus day</Text><Text style={s.success}>Recorded ✓</Text></View>
    <View style={s.row}><Text style={s.caption}>Daily goal</Text><Text style={summary.goalReachedNow ? s.success : s.caption}>{summary.goalReachedNow ? "Goal reached" : "Progress saved"}</Text></View>
    {level != null && xpRemaining != null && <View style={s.row}><Text style={s.caption}>Level {level}</Text><Text style={s.caption}>{xpRemaining} XP to next level</Text></View>}
  </View>;
}
const s = StyleSheet.create({
  hero: {alignItems:"center", gap:12},
  caption: {...type.secondary, flexShrink:1},
  time: {...type.hero, textAlign:"center", letterSpacing:-1},
  quest: {...type.body, textAlign:"center"},
  rows: {borderTopWidth:StyleSheet.hairlineWidth, borderTopColor:colors.line, paddingTop:12, gap:0},
  row: {minHeight:52, paddingVertical:8, flexDirection:"row", alignItems:"center", justifyContent:"space-between", gap:12},
  value: {...type.body, fontWeight:"500"},
  success: {...type.secondary, color:"#2DD4BF", fontWeight:"500"},
});
