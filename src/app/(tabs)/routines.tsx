import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ContentReveal from "../../components/ContentReveal";
import { PersonalPage } from "../../components/PersonalUI";
import { Text } from "../../components/AppText";
import Pressable from "../../components/MotionPressable";
import SavedRoutinesCard from "../../components/SavedRoutinesCard";
import { colors, edge, radius } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { useQuests } from "../../context/QuestContext";
import { useTimer } from "../../context/TimerContext";
import { useUser } from "../../context/UserContext";
import { useProgressData } from "../../hooks/useProgressData";
import { setupMode } from "../../services/setupMode";
import { floatingTabInset } from "../../utils/floatingTabInset";
import { focusAreaChoices, focusAreaIcon, focusAreaTitle } from "../../utils/focusAreas";
import { areaTint, lifeAreaColor } from "../../utils/lifeAreaColor";
import { dateKey, DEFAULT_TIMEZONE, periodFor, shiftDay } from "../../utils/progressAnalytics";
import { readRoutineSession } from "../../utils/routineSession";
import { studyTime } from "../../utils/studyPlan";
import type { ProgressSession } from "../../services/progressService";
import type { Task } from "../../services/taskService";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const isRoutine = (session: ProgressSession) => !!session.task_id || !!readRoutineSession(session.notes);

/** This week's routine time by day, and focus time per category. */
export function routineWeek(sessions: ProgressSession[], start: string, timeZone: string) {
  const days = Array.from({ length: 7 }, (_, index) => shiftDay(start, index));
  const byDay = days.map(() => 0), byArea = new Map<number | null, number>();
  let total = 0, count = 0;
  for (const session of sessions) {
    if (!session.completed_at) continue;
    const index = days.indexOf(dateKey(new Date(session.completed_at), timeZone));
    if (index < 0) continue;
    byArea.set(session.subject_id, (byArea.get(session.subject_id) ?? 0) + session.duration_seconds);
    if (!isRoutine(session)) continue;
    byDay[index] += session.duration_seconds; total += session.duration_seconds; count++;
  }
  return { days, byDay, byArea, total, count };
}

/** Every routine in one place, with your week and a quick start for each category. */
export default function RoutinesScreen() {
  const router = useRouter(), insets = useSafeAreaInsets(), timer = useTimer(), { accessMode } = useAuth(), { profile } = useUser();
  const bottomInset = floatingTabInset(useBottomTabBarHeight(), insets.bottom, timer);
  const { tasks, subjects = [], refresh } = useQuests();
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const timeZone = profile?.timezone || DEFAULT_TIMEZONE;
  const [now] = useState(() => new Date());
  const period = useMemo(() => periodFor("week", dateKey(now, timeZone), timeZone, now), [now, timeZone]);
  const { data } = useProgressData(period, timeZone, timer.sessionSummary, profile?.id ?? "");
  const week = useMemo(() => routineWeek(data?.sessions ?? [], period.start, timeZone), [data, period.start, timeZone]);
  const top = Math.max(1, ...week.byDay);
  const todayIndex = week.days.indexOf(period.today);
  const available = !timer.hasOpenSession && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !(timer.isCompleted && !timer.sessionSummary);
  const openSetup = () => { timer.reviewSummary?.(); router.navigate("/session"); };
  // Old routines keep their task link; the setup screen confirms before starting.
  const openQuestSession = (task: Task) => {
    if (available) { timer.setNotes(""); timer.setLinkedTaskId(task.id); timer.setDurationInMinutes(task.target_minutes || 30); timer.setTargetAttributeId(task.subject_id ?? null); }
    setupMode.choose("routine"); openSetup();
  };
  const quickStart = (areaId: number) => {
    if (available) { timer.setNotes(""); timer.setLinkedTaskId(null); timer.setTargetAttributeId(areaId); setupMode.choose("routine"); setupMode.chooseRoutine(null); }
    openSetup();
  };
  return <PersonalPage title="Routines" subtitle="" compact bottomContentInset={bottomInset}>
    <ContentReveal><View style={s.stack}>
      <View style={s.week} accessible accessibilityLabel={`This week, ${studyTime(week.total)} of routines across ${week.count} ${week.count === 1 ? "session" : "sessions"}`} testID="routines-week">
        <View style={s.weekHead}>
          <View><Text style={s.label}>This week</Text><Text style={s.total}>{studyTime(week.total)}</Text></View>
          <Text style={s.caption}>{week.count ? `${week.count} ${week.count === 1 ? "routine" : "routines"} done` : "Your first one starts the week"}</Text>
        </View>
        <View style={s.bars}>{week.byDay.map((seconds, index) => <View key={week.days[index]} style={s.barColumn}>
          <View style={s.barTrack}><View style={[s.bar, { height: `${seconds ? Math.max(8, Math.round(100 * seconds / top)) : 0}%` }, index === todayIndex && s.barToday]} /></View>
          <Text style={[s.day, index === todayIndex && s.dayToday]}>{DAYS[index]}</Text>
        </View>)}</View>
      </View>
      <SavedRoutinesCard subjects={subjects} limit={Number.MAX_SAFE_INTEGER} active={accessMode === "online"} legacyTasks={tasks} onStartLegacy={openQuestSession} />
      <View style={s.section}>
        <Text style={s.sectionTitle} accessibilityRole="header">Quick start by category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.tiles}>
          {focusAreaChoices(subjects).map(area => {
            const tint = lifeAreaColor(area.id, area.color_code), seconds = week.byArea.get(area.id) ?? 0;
            return <Pressable key={area.id} disabled={!available} onPress={() => quickStart(area.id)} accessibilityRole="button"
              accessibilityLabel={`Focus on ${focusAreaTitle(area.title)}, ${studyTime(seconds)} this week. Set up a session`} style={s.tile}>
              <View style={[s.tileIcon, { backgroundColor: areaTint(tint) }]}><Ionicons name={focusAreaIcon(area.title)} size={16} color={tint} /></View>
              <Text style={s.tileTitle} numberOfLines={1}>{focusAreaTitle(area.title)}</Text>
              <Text style={s.caption} numberOfLines={1}>{studyTime(seconds)} this week</Text>
            </Pressable>;
          })}
        </ScrollView>
        <Text style={s.hint}>Any activity counts. Pick a category and set the time on the next screen.</Text>
      </View>
    </View></ContentReveal>
  </PersonalPage>;
}
const s = StyleSheet.create({
  stack: { gap: 24 }, section: { gap: 10 },
  week: { ...edge, padding: 16, gap: 14, borderRadius: radius.card, backgroundColor: colors.surface },
  weekHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  label: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase" },
  total: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "800", fontVariant: ["tabular-nums"] },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  bars: { flexDirection: "row", gap: 8 },
  barColumn: { flex: 1, alignItems: "center", gap: 6 },
  barTrack: { width: "100%", height: 56, justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 6, backgroundColor: "rgba(99,230,190,0.4)" }, barToday: { backgroundColor: colors.accent },
  day: { color: colors.tertiary, fontSize: 11, fontWeight: "600" }, dayToday: { color: colors.text },
  sectionTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3, paddingHorizontal: 4 },
  bleed: { marginRight: -20 }, tiles: { gap: 10, paddingRight: 20 },
  tile: { ...edge, width: 140, padding: 12, gap: 6, borderRadius: radius.tile, backgroundColor: colors.surface },
  tileIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  tileTitle: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  hint: { color: colors.tertiary, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
});
