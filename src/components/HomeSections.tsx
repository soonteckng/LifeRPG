import { useMemo, useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import ExamRow from "./ExamRow";
import ExamsCard from "./ExamsCard";
import SectionHeader, { SeeAll } from "./SectionHeader";
import MilestonesRow from "./MilestonesRow";
import StudyExamSheet from "./StudyExamSheet";
import { SquadFace, SquadJoinSheet } from "./SquadSheets";
import { SquadSummary } from "./SquadsSection";
import { colors, edge, radius } from "../constants/theme";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { useStudyLauncher } from "../hooks/useStudyLauncher";
import { useSquads } from "../hooks/useSquads";
import { useProgressData } from "../hooks/useProgressData";
import { useQuests } from "../context/QuestContext";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { squadSelection } from "../services/squadSelection";
import { suggestedArea } from "../utils/focusAreas";
import { daysUntil, studyTime, upcomingExams } from "../utils/studyPlan";
import { ranked, squadTotal } from "../utils/squads";
import { buildProgress, dateKey, DEFAULT_TIMEZONE, durationLabel, periodFor } from "../utils/progressAnalytics";
import type { StudyExam } from "../types/studyPlan";

// Home is a summary: each section shows what matters now as its own small
// cards, and a quiet "See all ›" opens the section in full.
const WEEK = 7;

/** Exams within the next week (up to three), or the next one if none are that close. Tapping one starts studying it. */
export function HomeExams() {
  const router = useRouter(), plan = useStudyPlan(), launcher = useStudyLauncher(plan.exams), { subjects = [] } = useQuests();
  const [sheet, setSheet] = useState<"all" | "add" | null>(null);
  const [editing, setEditing] = useState<StudyExam | null>(null);
  const coming = upcomingExams(plan.exams), soon = coming.filter(exam => daysUntil(exam.examDate) <= WEEK);
  const shown = soon.length ? soon.slice(0, 3) : coming.slice(0, 1);
  const courseFor = (id: string | null) => plan.courses.find(item => item.id === id) ?? null;
  // Same as Study and routines: tap to edit, Study to start, hold for more.
  const edit = (exam: StudyExam) => { setEditing(exam); setSheet("add"); };
  const learning = suggestedArea(subjects, "learning")?.id ?? null;
  const subtitle = soon.length ? `${soon.length} in the next 7 days${soon.length > 3 ? " · nearest 3" : ""}` : coming.length ? `Next one in ${daysUntil(coming[0].examDate)} days` : "Nothing scheduled";
  const add = () => { setEditing(null); setSheet("add"); };
  return <View style={s.section} testID="home-exams">
    <SectionHeader title="Upcoming Exams" subtitle={subtitle}
      right={coming.length ? <SeeAll label={coming.length > shown.length ? `See all ${coming.length}` : "See all"} accessibilityLabel={`See all ${coming.length} exams`} onPress={() => setSheet("all")} /> : undefined} />
    {shown.length ? <ExamsCard exams={shown} courses={plan.courses} onEdit={edit} onStudy={launcher.study} onRemove={id => plan.remove("exam", id)} />
      : <Pressable onPress={add} accessibilityRole="button" accessibilityLabel="Add an exam" style={[s.card, s.row]}>
        <View style={[s.icon, s.examIcon]}><Ionicons name="calendar-outline" size={20} color={colors.danger} /></View>
        <View style={s.flex}><Text style={s.name}>Got an exam coming up?</Text><Text style={s.caption}>Add it and the days count down here.</Text></View>
        <Ionicons name="add-circle" size={24} color={colors.accent} />
      </Pressable>}
    <AppSheet visible={sheet === "all"} onRequestClose={() => setSheet(null)} floating compact maxHeightRatio={0.86} label="all exams" motionMode="timed"
      header={<SheetHeader title="My Exams" subtitle="Tap one to edit it, or Study to start." onClose={() => setSheet(null)} />}>
      <BottomSheetScrollView contentContainerStyle={s.sheetBody} showsVerticalScrollIndicator={false}>
        <View style={[s.group, s.sheetGroup]}>{coming.map((exam, index) => { const course = courseFor(exam.courseId);
          return <ExamRow key={exam.id} exam={exam} course={course} first={index === 0} inSheet label="Edit exam"
            onPress={() => { setSheet(null); setTimeout(() => edit(exam), 250); }} onStudy={course ? () => { setSheet(null); setTimeout(() => launcher.study(course), 250); } : undefined} />; })}</View>
        <Pressable onPress={() => { setSheet(null); setTimeout(add, 250); }} accessibilityRole="button" accessibilityLabel="Add an exam" style={s.secondary}>
          <Ionicons name="add" size={18} color={colors.accent} /><Text style={s.secondaryText}>Add an exam</Text></Pressable>
        <Pressable onPress={() => { setSheet(null); setTimeout(() => router.navigate("/study"), 220); }} accessibilityRole="button" accessibilityLabel="Open Study" style={s.quiet}>
          <Text style={s.quietText}>Open Study</Text></Pressable>
      </BottomSheetScrollView>
    </AppSheet>
    <StudyExamSheet visible={sheet === "add"} exam={editing} courses={plan.courses} initialCourseId={editing?.courseId ?? null}
      onSave={plan.saveExam} onEnsureSubject={name => plan.ensureCourse(name, learning)} onRemove={id => plan.remove("exam", id)}
      onClose={() => setSheet(null)} onDismiss={() => setEditing(null)} />
  </View>;
}

/** Your squad's week. Tapping it peeks at the leaderboard; the Squads tab has the whole squad. */
export function HomeSquad() {
  const router = useRouter(), squads = useSquads();
  const chosen = squadSelection.get();
  const squad = squads.squads.find(item => item.id === chosen) ?? squads.squads[0];
  const [peek, setPeek] = useState(false), [joining, setJoining] = useState(false);
  // Offline the last saved squad stays readable; joining or starting needs the server.
  const [wasOnline, setWasOnline] = useState(squads.online);
  if (wasOnline !== squads.online) { setWasOnline(squads.online); if (!squads.online) setJoining(false); }
  const openSquads = () => { if (squad) squadSelection.choose(squad.id); router.navigate("/squads"); };
  const share = () => { if (squad) void Share.share({ message: `Join my squad "${squad.name}" with the code ${squad.code}.` }).catch(() => {}); };
  const top = squad ? ranked(squad).slice(0, 3) : [];
  return <View style={s.section} testID="home-squad-section">
    <SectionHeader title="My Squad" subtitle={!squads.online ? squad ? "Offline · last saved" : undefined : squad && squads.squads.length > 1 ? `${squads.squads.length} squads · showing ${squad.name}` : undefined}
      right={squad ? <SeeAll onPress={openSquads} accessibilityLabel="My Squad. Open Squads" /> : undefined} />
    {squad ? <Pressable onPress={() => setPeek(true)} accessibilityRole="button" testID="home-squad"
      accessibilityLabel={`${squad.name}, ${studyTime(squadTotal(squad))} together this week${squad.goalMinutes ? ` of ${squad.goalMinutes / 60} hours` : ""}. Show leaderboard`} style={s.card}>
      <SquadSummary squad={squad} />
    </Pressable> : <Pressable disabled={!squads.online} onPress={() => setJoining(true)} accessibilityRole="button" accessibilityState={{ disabled: !squads.online }}
      accessibilityLabel={squads.online ? "Focus with friends. Join or start a squad" : "Focus with friends. Needs internet"} testID="home-squad-empty" style={[s.card, s.row]}>
      <View style={[s.icon, { backgroundColor: colors.accentSoft }]}><Ionicons name="people-outline" size={20} color={colors.accent} /></View>
      <View style={s.flex}><Text style={s.name}>Focus with friends</Text><Text style={s.caption}>{squads.online ? "Start a squad and keep each other going." : "Needs internet to start or join a squad."}</Text></View>
      {squads.online && <Ionicons name="add-circle" size={24} color={colors.accent} />}
    </Pressable>}
    {squad && <AppSheet visible={peek} onRequestClose={() => setPeek(false)} floating compact label="squad peek" motionMode="timed"
      header={<SheetHeader title={squad.name} subtitle="This week’s leaderboard" onClose={() => setPeek(false)} />}>
      <BottomSheetScrollView contentContainerStyle={s.sheetBody}>
        <View style={[s.card, s.sheetCard]}><SquadSummary squad={squad} /></View>
        <View style={[s.group, s.sheetGroup]}>{top.map((member, index) => <View key={member.id} style={[s.rankRow, index > 0 && s.line]} accessible
          accessibilityLabel={`${index + 1}. ${member.name}${member.isYou ? ", you" : ""}, ${studyTime(member.weekSeconds)}`}>
          <Text style={[s.rank, index === 0 && member.weekSeconds > 0 && { color: colors.level }]}>{index + 1}</Text>
          <SquadFace member={member} size={32} ring={colors.sheetCard} />
          <Text style={[s.name, s.flex]} numberOfLines={1}>{member.isYou ? "You" : member.name}</Text>
          <Text style={s.time}>{studyTime(member.weekSeconds)}</Text>
        </View>)}</View>
        <Pressable onPress={() => { setPeek(false); setTimeout(openSquads, 220); }} accessibilityRole="button" accessibilityLabel="See the whole squad" style={s.primary}>
          <Text style={s.primaryText}>See the whole squad</Text><Ionicons name="arrow-forward" size={17} color={colors.primaryText} /></Pressable>
        <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share invite" style={s.quiet}>
          <Ionicons name="share-outline" size={16} color={colors.accent} /><Text style={s.quietText}>Share invite</Text></Pressable>
      </BottomSheetScrollView>
    </AppSheet>}
    <SquadJoinSheet visible={squads.online && joining} online={squads.online} leading={squads.squads.find(item => item.ownerIsYou)?.name ?? null} memberships={squads.squads.length}
      onClose={() => setJoining(false)} onJoin={squads.join} onCreate={squads.create} />
  </View>;
}

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
/** This week's progress, shared by the week card and Today's card. */
export function useWeekProgress() {
  const { profile } = useUser(), { sessionSummary } = useTimer();
  const timeZone = profile?.timezone || DEFAULT_TIMEZONE;
  const [now] = useState(() => new Date());
  const period = useMemo(() => periodFor("week", dateKey(now, timeZone), timeZone, now), [now, timeZone]);
  const { data } = useProgressData(period, timeZone, sessionSummary, profile?.id ?? "");
  const week = useMemo(() => data ? buildProgress(period, data.sessions, data.goals, timeZone, data.areas, now) : null, [data, period, timeZone, now]);
  return { week, period };
}
export function WeekBars({ height = 44, wide = false }: { height?: number; wide?: boolean }) {
  const { week, period } = useWeekProgress();
  const top = Math.max(1, ...(week?.days.map(day => day.seconds) ?? [0]));
  return <View style={[s.bars, wide && s.barsWide]} importantForAccessibility="no-hide-descendants">{(week?.days ?? DAYS.map(() => ({ seconds: 0, key: "", goal: undefined }))).map((day, index) =>
    <View key={index} style={[s.barColumn, wide && s.barColumnWide]}>
      <View style={[s.barTrack, wide && s.barTrackWide, { height }]}><View style={[s.bar, wide && s.barWide, { height: `${day.seconds ? Math.max(10, Math.round(100 * day.seconds / top)) : 0}%` }, day.key === period.today && s.barToday]} /></View>
      <Text style={[s.day, day.key === period.today && s.dayToday]}>{DAYS[index]}</Text>
      {wide && <View style={[s.goalDot, day.goal?.goal_completed && s.goalDotOn]} />}
    </View>)}</View>;
}

/** This week in one line and seven small bars. Tapping it opens the week by category. */
export function HomeWeek() {
  const router = useRouter(), { week } = useWeekProgress();
  const [open, setOpen] = useState(false);
  const change = week && week.previousSeconds >= 300 ? week.comparisonSeconds - week.previousSeconds : null;
  const top = Math.max(1, ...(week?.areas.map(area => area.seconds) ?? [0]));
  return <View style={s.section} testID="home-week">
    <SectionHeader title="This Week" subtitle={`${week?.activeDays ?? 0} of 7 days with focus`} right={<SeeAll onPress={() => router.navigate("/progress")} accessibilityLabel="This Week. Open Progress" />} />
    <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`This week, ${durationLabel(week?.seconds ?? 0)}. Show by category`} style={[s.card, s.week]}>
      <View style={s.flex}>
        <Text style={s.total}>{durationLabel(week?.seconds ?? 0)}</Text>
        <Text style={[s.caption, change !== null && change > 0 && { color: colors.success }]} numberOfLines={1}>
          {!week?.seconds ? "Your first session starts the chart" : change === null ? "Your week so far" : change >= 0 ? `${durationLabel(change)} more than last week` : `${durationLabel(-change)} behind last week`}</Text>
      </View>
      <WeekBars />
    </Pressable>
    <AppSheet visible={open} onRequestClose={() => setOpen(false)} floating compact maxHeightRatio={0.86} label="this week" motionMode="timed"
      header={<SheetHeader title="This Week" subtitle={`${durationLabel(week?.seconds ?? 0)} · ${week?.sessions.length ?? 0} sessions`} onClose={() => setOpen(false)} />}>
      <BottomSheetScrollView contentContainerStyle={s.sheetBody} showsVerticalScrollIndicator={false}>
        <View style={[s.card, s.sheetCard]}><WeekBars height={72} wide /><Text style={s.caption}>A green dot marks a day you reached your goal.</Text></View>
        <View style={[s.group, s.sheetGroup]}>{week?.areas.length ? week.areas.map((area, index) => <View key={area.key} style={[s.areaRow, index > 0 && s.line]} accessible accessibilityLabel={`${area.title}, ${durationLabel(area.seconds)}`}>
          <View style={[s.dot, { backgroundColor: area.color }]} />
          <Text style={s.areaName} numberOfLines={1}>{area.title}</Text>
          <View style={s.areaTrack}><View style={[s.areaFill, { width: `${Math.max(4, Math.round(100 * area.seconds / top))}%`, backgroundColor: area.color }]} /></View>
          <Text style={s.time}>{durationLabel(area.seconds)}</Text>
        </View>) : <Text style={[s.caption, s.pad]}>Finish a session and your categories show here.</Text>}</View>
        <Pressable onPress={() => { setOpen(false); setTimeout(() => router.navigate("/progress"), 220); }} accessibilityRole="button" accessibilityLabel="Open Progress" style={s.primary}>
          <Text style={s.primaryText}>Open Progress</Text><Ionicons name="arrow-forward" size={17} color={colors.primaryText} /></Pressable>
      </BottomSheetScrollView>
    </AppSheet>
  </View>;
}

/** Your nearest milestone; the whole collection opens as a card. */
export function HomeMilestones() {
  const [open, setOpen] = useState(false);
  return <View style={s.section} testID="home-milestones">
    <SectionHeader title="My Milestones" right={<SeeAll onPress={() => setOpen(true)} accessibilityLabel="My Milestones. See all milestones" />} />
    <MilestonesRow open={open} onOpenChange={setOpen} />
  </View>;
}

const s = StyleSheet.create({
  section: { gap: 10 }, flex: { flex: 1, minWidth: 0, gap: 2 },
  group: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
  sheetGroup: { ...edge, backgroundColor: colors.sheetCard, borderRadius: 20 },
  card: { ...edge, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface },
  sheetCard: { ...edge, backgroundColor: colors.sheetCard, borderRadius: 20, gap: 10 },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  examIcon: { backgroundColor: "rgba(255,105,97,0.14)" },
  name: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 }, pad: { padding: 14 },
  week: { flexDirection: "row", alignItems: "center", gap: 16 },
  total: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  bars: { flexDirection: "row", gap: 5, alignItems: "flex-end" }, barsWide: { justifyContent: "space-between", gap: 0 },
  barColumn: { width: 12, alignItems: "center", gap: 4 }, barColumnWide: { width: 28 },
  barTrack: { width: 12, justifyContent: "flex-end", borderRadius: 4, backgroundColor: "rgba(255,255,255,0.05)" }, barTrackWide: { width: 22, borderRadius: 6 },
  bar: { width: 12, borderRadius: 4, backgroundColor: "rgba(99,230,190,0.45)" }, barWide: { width: 22, borderRadius: 6 }, barToday: { backgroundColor: colors.accent },
  day: { color: colors.tertiary, fontSize: 10, fontWeight: "600" }, dayToday: { color: colors.text },
  goalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "transparent" }, goalDotOn: { backgroundColor: colors.success },
  rankRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rank: { width: 16, textAlign: "center", color: colors.secondary, fontSize: 15, fontWeight: "700" },
  time: { color: colors.secondary, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"], minWidth: 52, textAlign: "right" },
  areaRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  areaName: { width: "32%", color: colors.text, fontSize: 15, fontWeight: "500" },
  areaTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.selection, overflow: "hidden" }, areaFill: { height: 6, borderRadius: 3 },
  primary: { minHeight: 52, flexDirection: "row", gap: 8, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  primaryText: { color: colors.primaryText, fontSize: 16, fontWeight: "600" },
  secondary: { ...edge, minHeight: 50, flexDirection: "row", gap: 6, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  secondaryText: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  quiet: { minHeight: 44, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  quietText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
});
