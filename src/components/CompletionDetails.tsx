import { focusAreaTitle } from "../utils/focusAreas";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { colors, edge } from "../constants/theme";
import { type } from "../constants/typography";
import { durationLabel } from "../utils/sessionSetup";
import { Text } from "./AppText";
import ProgressRing from "./ProgressRing";
import ArrivalBanner from "./ArrivalBanner";

export type CompletionData = {
  durationSeconds: number;
  xpEarned: number;
  creditVersion?: number;
  areaXpEarned?: number | null;
  goalReachedNow?: boolean;
};

// Presentation only: neither surface awards, resets nor dismisses a session.
export function CompletionHero({ seconds, title, levelUp = false, compact = false }: {seconds: number; title?: string; levelUp?: boolean; compact?: boolean}) {
  const {fontScale} = useWindowDimensions();
  // The session card: you back at camp in the morning, with the time recorded.
  if (compact) return <ArrivalBanner seconds={seconds} title={title} levelUp={levelUp} />;
  return <View style={s.hero}>
    <ProgressRing size={fontScale > 1.3 ? 112 : 144} progress={1} stroke={8}>
      <Ionicons name={levelUp ? "sparkles-outline" : "checkmark"} size={52} color={colors.accent} />
    </ProgressRing>
    <Text style={s.caption}>Time recorded</Text>
    <Text style={s.time}>{durationLabel(seconds)}</Text>
    {!!title && <Text style={s.quest} numberOfLines={2}>{title}</Text>}
  </View>;
}

/**
 * `loading` keeps every row in place while the server confirms the numbers,
 * so the card opens complete-looking at once and never changes size after.
 */
export function CompletionRows({ summary, areaTitle, areaColor, level, xpRemaining, compact = false, loading = false }: {
  summary: CompletionData; areaTitle?: string; areaColor?: string; level?: number; xpRemaining?: number; compact?: boolean; loading?: boolean;
}) {
  const areaXP = summary.creditVersion === 1 ? summary.areaXpEarned : areaTitle ? summary.xpEarned : null;
  const rowStyle = compact ? s.compactRow : s.row;
  const wait = "…";
  return <View style={s.rows}>
    <View style={rowStyle}><Text style={s.caption}>Character XP</Text><Text style={[s.value, s.xp, loading && s.waiting]}>{loading ? wait : `+${summary.xpEarned}`}</Text></View>
    {(loading ? !!areaTitle : areaXP != null) && <View style={rowStyle}>
      <Text style={[s.caption, areaColor && {color:areaColor}]}>{areaTitle ? focusAreaTitle(areaTitle) : "Focus area XP"}</Text>
      <Text style={[s.value, areaColor && {color:areaColor}, loading && s.waiting]}>{loading ? wait : `+${areaXP}${areaTitle ? " XP" : ""}`}</Text>
    </View>}
    {compact ? <View style={s.continuity}>
      {loading ? <><Text style={s.caption}>Recording your focus day…</Text><Text style={s.caption}>Updating your daily goal</Text></> : <>
      <Text style={s.success}>Focus day recorded ✓</Text>
      <Text style={summary.goalReachedNow ? s.success : s.caption}>{summary.goalReachedNow ? "Daily goal reached" : "Daily goal progress saved"}</Text></>}
    </View> : <>
      <View style={s.row}><Text style={s.caption}>Focus day</Text><Text style={s.success}>Recorded ✓</Text></View>
      <View style={s.row}><Text style={s.caption}>Daily goal</Text><Text style={summary.goalReachedNow ? s.success : s.caption}>{summary.goalReachedNow ? "Goal reached" : "Progress saved"}</Text></View>
    </>}
    {level != null && (loading || xpRemaining != null) && <View style={rowStyle}><Text style={s.caption}>Level {level}</Text><Text style={s.caption}>{loading ? wait : `${xpRemaining} XP to next level`}</Text></View>}
  </View>;
}
const s = StyleSheet.create({
  hero: {alignItems:"center", gap:12},
  compactHero: {flexDirection:"row", alignItems:"center", gap:16, paddingVertical:4, paddingHorizontal:4},
  badge: {width:56, height:56, borderRadius:28, alignItems:"center", justifyContent:"center", backgroundColor:colors.accentSoft},
  badgeSmall: {width:48, height:48, borderRadius:24},
  xp: {color:colors.level, fontWeight:"700"},
  compactHeroCopy: {flex:1, minWidth:0, gap:4},
  compactTime: {...type.hero, fontSize:32, lineHeight:38, fontWeight:"700", letterSpacing:-0.6},
  compactQuest: {...type.body, color:colors.secondary},
  caption: {...type.secondary, flexShrink:1},
  time: {...type.hero, textAlign:"center", letterSpacing:-1},
  quest: {...type.body, textAlign:"center"},
  rows: { ...edge,paddingHorizontal:16, paddingVertical:6, borderRadius:20, backgroundColor:colors.sheetCard, gap:0},
  row: {minHeight:52, paddingVertical:8, flexDirection:"row", alignItems:"center", justifyContent:"space-between", gap:12},
  compactRow: {minHeight:40, paddingVertical:8, flexDirection:"row", flexWrap:"wrap", alignItems:"center", justifyContent:"space-between", gap:8},
  continuity: {paddingVertical:8, gap:4},
  value: {...type.body, fontWeight:"500"},
  success: {...type.secondary, color:colors.success, fontWeight:"500"},
  waiting: {color:colors.tertiary},
});
