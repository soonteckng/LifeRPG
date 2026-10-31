import type React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../constants/theme";
import { durationLabel } from "../utils/sessionSetup";
import { totalLabel } from "../utils/progressAnalytics";
import { Text } from "./AppText";

// Round 87: the old hero and rows (and the camp banner) are gone; the
// finished card is CompletionCard below, with its tiles.

const s = StyleSheet.create({
  card: {borderRadius:28, backgroundColor:colors.focusSurface, paddingHorizontal:24, paddingTop:22, paddingBottom:22, gap:10},
  cardLabel: {color:colors.neutral, fontSize:13, lineHeight:18, fontWeight:"600", letterSpacing:1.3},
  bigRow: {flexDirection:"row", alignItems:"flex-end", flexWrap:"wrap", columnGap:10},
  big: {color:colors.text, fontFamily:"display", fontWeight:"400", fontSize:72, lineHeight:80, letterSpacing:-1.5},
  bigUnit: {color:colors.text, fontSize:20, lineHeight:28, fontWeight:"600", paddingBottom:12},
  cardLine: {color:colors.neutral, fontSize:15, lineHeight:21},
  cardDivider: {height:1, backgroundColor:colors.focusBorder, marginVertical:6},
  goal: {gap:12},
  goalRow: {flexDirection:"row", flexWrap:"wrap", alignItems:"center", justifyContent:"space-between", gap:8},
  goalLabel: {color:colors.text, fontSize:17, lineHeight:22},
  goalValue: {color:colors.text, fontSize:17, lineHeight:22, fontWeight:"700"},
  goalTrack: {height:8, borderRadius:4, backgroundColor:colors.track, overflow:"hidden"},
  goalFill: {height:8, borderRadius:4, backgroundColor:colors.primary},
  waitingWarm: {opacity:0.7},
  tiles: {flexDirection:"row", gap:12},
  tile: {flex:1, minWidth:0, borderRadius:24, backgroundColor:colors.surface, paddingHorizontal:18, paddingVertical:16, gap:2},
  tileValue: {color:colors.text, fontSize:24, lineHeight:30, fontWeight:"700", letterSpacing:-0.3},
  tileLabel: {color:colors.secondary, fontSize:14, lineHeight:20},
});

/** Minutes for the big number; a session under a minute shows its seconds. */
export function focusedAmount(seconds: number) {
  const safe = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  if (safe < 60) return { value: String(safe), unit: "sec focused" };
  // Short sessions keep their seconds, so the card never rounds time up.
  if (safe < 600 && safe % 60) return { value: String(Math.floor(safe / 60)), unit: `min ${safe % 60} sec focused` };
  return { value: String(Math.round(safe / 60)), unit: "min focused" };
}

/**
 * Mockup 07: the lilac card (Round 86: lilac like Up next, so the app keeps one accent) with the time you just finished, and, once the
 * server has confirmed it, today's total against your daily goal.
 */
export function CompletionCard({ seconds, label, line, todaySeconds, goalMinutes, goalReachedNow, loading = false, held = false, sync = false, children }: {
  seconds: number; label: string; line?: string; todaySeconds?: number; goalMinutes?: number;
  goalReachedNow?: boolean; loading?: boolean;
  /** Saved on this phone, or not accepted: the time only, with no goal line. */
  held?: boolean;
  /** Several offline sessions together: the time only. */
  sync?: boolean; children?: React.ReactNode;
}) {
  const amount = focusedAmount(seconds);
  const goalKnown = !loading && typeof todaySeconds === "number" && Number.isFinite(todaySeconds) && typeof goalMinutes === "number" && goalMinutes > 0;
  const todayMinutes = goalKnown ? Math.floor(Math.max(0, todaySeconds!) / 60) : 0;
  const share = goalKnown ? Math.min(1, Math.max(0, todaySeconds!) / (goalMinutes! * 60)) : 0;
  const met = goalKnown ? share >= 1 || goalReachedNow === true : goalReachedNow === true;
  const left = goalKnown ? Math.max(1, goalMinutes! - todayMinutes) : 0;
  return <View style={s.card} testID="session-result-card">
    <Text style={s.cardLabel} numberOfLines={2}>{label.toUpperCase()}</Text>
    <View style={s.bigRow} accessible accessibilityLabel={`${durationLabel(Math.max(0, seconds))} focused`}>
      <Text style={s.big}>{amount.value}</Text><Text style={s.bigUnit}>{amount.unit}</Text>
    </View>
    {!!line && <Text style={s.cardLine} numberOfLines={3}>{line}</Text>}
    {children}
    {!held && !sync && <View style={s.cardDivider} />}
    {held || sync ? null : goalKnown ? <View style={s.goal} testID="session-result-goal">
      <View style={s.goalRow}><Text style={s.goalLabel}>Your total today</Text><Text style={s.goalValue}>{todayMinutes} / {goalMinutes} min</Text></View>
      <View style={s.goalTrack} accessible accessibilityRole="progressbar" accessibilityLabel="Your total today"
        accessibilityValue={{ min: 0, max: goalMinutes! * 60, now: Math.min(goalMinutes! * 60, Math.max(0, todaySeconds!)) }}>
        <View style={[s.goalFill, { width: `${Math.round(share * 100)}%` }]} />
      </View>
      <Text style={s.cardLine}>{met ? "Your daily goal is met." : `${left} min more to reach your daily goal.`}</Text>
    </View> : <Text style={[s.cardLine, loading && s.waitingWarm]} accessibilityLiveRegion="polite">
      {loading ? "Adding this to your day…" : met ? "Focus day recorded. Your daily goal is met." : "Focus day recorded."}</Text>}
  </View>;
}

/** The two small tiles under the card. Each appears only once its number is known. */
export function CompletionTiles({ streakDays, weekSeconds, weekLabel }: { streakDays?: number; weekSeconds?: number; weekLabel: string }) {
  const streak = typeof streakDays === "number" && streakDays > 0 ? streakDays : null;
  const week = typeof weekSeconds === "number" && weekSeconds > 0 ? weekSeconds : null;
  if (streak === null && week === null) return null;
  return <View style={s.tiles} testID="session-result-tiles">
    {streak !== null && <View style={s.tile} accessible accessibilityLabel={`${streak} ${streak === 1 ? "day" : "days"} focus streak`}>
      <Text style={s.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{streak} {streak === 1 ? "day" : "days"}</Text><Text style={s.tileLabel}>focus streak</Text>
    </View>}
    {week !== null && <View style={s.tile} accessible accessibilityLabel={`${durationLabel(week)} ${weekLabel}`}>
      <Text style={s.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{totalLabel(week)}</Text><Text style={s.tileLabel}>{weekLabel}</Text>
    </View>}
  </View>;
}
