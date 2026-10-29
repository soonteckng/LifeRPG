import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import Pressable from "./MotionPressable";
import ProgressRing from "./ProgressRing";
import MoreMenu from "./MoreMenu";
import { Text } from "./AppText";
import { useWeekProgress, WEEK_LEGEND, WeekBars } from "./HomeSections";
import { colors, edge } from "../constants/theme";
import { durationLabel } from "../utils/progressAnalytics";

/**
 * Today's goal up close: how far along you are, your streak and this week's
 * rhythm. The goal itself is changed from the ••• menu, not by tapping here.
 */
export default function TodaySheet({ visible, onClose, completedSeconds, goalMinutes, streak, restDays = 0, restedYesterday = false, complete, onChangeGoal, onOpenProgress, canChangeGoal = true, goalKnown = true, todayKnown = true, streakKnown = todayKnown }: {
  visible: boolean; onClose: () => void; completedSeconds: number; goalMinutes: number; streak: number; complete: boolean;
  /** Rest days ready to cover a missed day, and whether one covered yesterday. */
  restDays?: number; restedYesterday?: boolean;
  onChangeGoal: () => void; onOpenProgress: () => void; canChangeGoal?: boolean; goalKnown?: boolean; todayKnown?: boolean; streakKnown?: boolean;
}) {
  const { week } = useWeekProgress(), insets = useSafeAreaInsets();
  const goal = goalMinutes * 60, left = Math.max(0, goal - completedSeconds), share = Math.min(1, completedSeconds / Math.max(1, goal));
  const after = (work: () => void) => { onClose(); setTimeout(work, 240); };
  return <AppSheet visible={visible} onRequestClose={onClose} attached compact maxHeightRatio={0.9} label="today" motionMode="timed"
    header={<View style={s.header}>
      <View style={s.flex}><Text style={s.title} accessibilityRole="header">Today</Text><Text style={s.caption}>{!goalKnown ? "Today’s goal is not available yet" : !todayKnown ? "Checking today’s progress…" : complete ? "Goal reached" : `${Math.ceil(left / 60)} min to your goal`}</Text></View>
      {visible && <MoreMenu label="Goal options" options={[
        { label: canChangeGoal ? "Change daily goal" : "Change goal · needs internet", icon: "flag-outline", onPress: () => after(onChangeGoal), disabled: !canChangeGoal },
        { label: "Open Progress", icon: "stats-chart-outline", onPress: () => after(onOpenProgress) },
      ]} />}
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={s.close}><Ionicons name="close" size={18} color={colors.secondary} /></Pressable>
    </View>}>
    <BottomSheetScrollView contentContainerStyle={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} showsVerticalScrollIndicator={false}>
      <View style={[s.card, s.hero]} accessible accessibilityLabel={goalKnown && todayKnown ? `${Math.floor(completedSeconds / 60)} of ${goalMinutes} minutes today` : "Today’s progress is not available yet"}>
        <ProgressRing size={148} stroke={14} progress={goalKnown ? share : 0} color={complete ? colors.success : colors.progress} track={colors.accentSoft}>
          <Text style={s.ringValue}>{todayKnown ? Math.floor(completedSeconds / 60) : "–"}</Text><Text style={s.caption}>{goalKnown ? `of ${goalMinutes} min` : "Goal unavailable"}</Text>
        </ProgressRing>
        <Text style={s.headline}>{!todayKnown ? "Checking today’s progress…" : complete ? "Nicely done today" : completedSeconds ? "Keep it going" : "A fresh start"}</Text>
      </View>
      <View style={s.stats}>
        <Stat icon="flame" tint={colors.streak} value={streakKnown ? `${streak}` : "–"} label="day streak" />
        <Stat icon="time-outline" tint="#64D2FF" value={week ? durationLabel(week.seconds) : "–"} label="this week" />
        <Stat icon="checkmark-circle-outline" tint={colors.success} value={week ? `${week.goalDays}/7` : "–"} label="goal days" />
      </View>
      {streakKnown && <View style={[s.card, s.rest]} testID="today-rest-days" accessible
        accessibilityLabel={`${restDays} rest ${restDays === 1 ? "day" : "days"} ready. ${restedYesterday ? "Yesterday was a rest day. " : ""}Every 7 days in your streak earns one, and you can keep 2. Miss a day and one is used for you, so your streak carries on.`}>
        <Ionicons name="moon-outline" size={20} color="#A5B4FC" />
        <View style={s.flex}>
          <Text style={s.restTitle}>{restDays === 0 ? "No rest days yet" : restDays === 1 ? "1 rest day ready" : `${restDays} rest days ready`}{restedYesterday ? " · yesterday was a rest day" : ""}</Text>
          <Text style={s.caption}>{"Every 7 days in your streak earns one (keep up to 2). Miss a day and one is used for you, so your streak carries on."}</Text>
        </View>
      </View>}
      <View style={s.card}><Text style={s.label}>This week</Text><WeekBars height={64} wide /><Text style={s.caption}>{WEEK_LEGEND}</Text></View>
      <Text style={s.note}>A new goal starts tomorrow, so today’s target and your streak never shift under you.</Text>
    </BottomSheetScrollView>
  </AppSheet>;
}
function Stat({ icon, tint, value, label }: { icon: React.ComponentProps<typeof Ionicons>["name"]; tint: string; value: string; label: string }) {
  return <View style={[s.card, s.stat]} accessible accessibilityLabel={`${value} ${label}`}>
    <Ionicons name={icon} size={18} color={tint} /><Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={s.caption} numberOfLines={1}>{label}</Text>
  </View>;
}
const s = StyleSheet.create({
  rest: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  restTitle: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingBottom: 12 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.4 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  body: { paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
  card: { ...edge, padding: 14, gap: 10, borderRadius: 20, backgroundColor: colors.sheetCard },
  hero: { alignItems: "center", paddingVertical: 20, gap: 14 },
  ringValue: { color: colors.text, fontSize: 40, lineHeight: 44, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: -1 },
  headline: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "700" },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, gap: 4, paddingVertical: 12 },
  statValue: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: "800", fontVariant: ["tabular-nums"] },
  label: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase" },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  note: { color: colors.tertiary, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
});
