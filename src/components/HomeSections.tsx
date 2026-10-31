import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Share, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import ExamRow from "./ExamRow";
import ExamsCard from "./ExamsCard";
import SectionHeader, { DoneButton, SeeAll } from "./SectionHeader";
import StudyExamSheet from "./StudyExamSheet";
import { SquadFace, SquadJoinSheet } from "./SquadSheets";
import { SquadSummary, daysLeftInWeek } from "./SquadsSection";
import { colors, edge, radius } from "../constants/theme";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { useSquads } from "../hooks/useSquads";
import { useProgressData } from "../hooks/useProgressData";
import { useQuests } from "../context/QuestContext";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { squadSelection } from "../services/squadSelection";
import { suggestedArea } from "../utils/focusAreas";
import { daysUntil, studyTime, upcomingExams } from "../utils/studyPlan";
import { circleOrder, goalProgress, squadTotal } from "../utils/squads";
import { buildProgress, dateKey, DEFAULT_TIMEZONE, durationLabel, periodFor } from "../utils/progressAnalytics";
import type { StudyExam } from "../types/studyPlan";

// Home is a summary. One rule for every section: tapping a card opens it as a
// full-width sheet; "See all" lists everything in a sheet; a title with ›
// ("My Squad ›", "This Week ›") opens that section's tab.
const WEEK = 7;

/** Exams within the next week (up to three), or the next one if none are that close. Tapping one edits it. */
export function HomeExams() {
  const router = useRouter(), plan = useStudyPlan(), { subjects = [] } = useQuests(), insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<"all" | "add" | null>(null);
  const [editing, setEditing] = useState<StudyExam | null>(null), [arranging, setArranging] = useState(false);
  const coming = upcomingExams(plan.exams), soon = coming.filter(exam => daysUntil(exam.examDate) <= WEEK);
  if (arranging && !coming.length) setArranging(false);
  const shown = soon.length ? soon.slice(0, 3) : coming.slice(0, 1);
  const courseFor = (id: string | null) => plan.courses.find(item => item.id === id) ?? null;
  // Same as Study: tap to edit, hold to edit or remove. Studying starts from a subject.
  const edit = (exam: StudyExam) => { setEditing(exam); setSheet("add"); };
  const learning = suggestedArea(subjects, "learning")?.id ?? null;
  const subtitle = soon.length ? `${soon.length} in the next 7 days${soon.length > 3 ? " · nearest 3" : ""}` : coming.length ? `Next one in ${daysUntil(coming[0].examDate)} days` : "Nothing scheduled";
  const add = () => { setEditing(null); setSheet("add"); };
  return <View style={s.section} testID="home-exams">
    <SectionHeader title="Upcoming Exams" subtitle={arranging ? "Tap ✎ to edit or − to remove." : subtitle}
      right={arranging ? <DoneButton label="Done editing exams" onPress={() => setArranging(false)} />
        : coming.length ? <SeeAll count={coming.length > shown.length ? coming.length : undefined} accessibilityLabel={`See all ${coming.length} exams`} onPress={() => setSheet("all")} /> : undefined} />
    {shown.length ? <ExamsCard exams={shown} courses={plan.courses} onEdit={edit} onRemove={id => plan.remove("exam", id)} editing={arranging} onEditingChange={setArranging} />
      : <Pressable onPress={add} accessibilityRole="button" accessibilityLabel="Add an exam" style={[s.card, s.row]}>
        <View style={[s.icon, s.examIcon]}><Ionicons name="calendar-outline" size={20} color={colors.danger} /></View>
        <View style={s.flex}><Text style={s.name}>Got an exam coming up?</Text><Text style={s.caption}>Add it and the days count down here.</Text></View>
        <Ionicons name="add-circle" size={24} color={colors.accent} />
      </Pressable>}
    <AppSheet visible={sheet === "all"} onRequestClose={() => setSheet(null)} attached compact maxHeightRatio={0.86} label="all exams" motionMode="timed"
      header={<SheetHeader title="My Exams" subtitle="Tap one to edit it." onClose={() => setSheet(null)} />}>
      <BottomSheetScrollView contentContainerStyle={[s.sheetBody, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} showsVerticalScrollIndicator={false}>
        <View style={[s.group, s.sheetGroup]}>{coming.map((exam, index) => { const course = courseFor(exam.courseId);
          return <ExamRow key={exam.id} exam={exam} course={course} first={index === 0} inSheet label="Edit exam"
            onPress={() => { setSheet(null); setTimeout(() => edit(exam), 250); }} />; })}</View>
        {/* Two equal actions side by side under the list. */}
        <View style={s.actions}>
          <Pressable onPress={() => { setSheet(null); setTimeout(add, 250); }} accessibilityRole="button" accessibilityLabel="Add an exam" style={[s.secondary, s.half]}>
            <Ionicons name="add" size={18} color={colors.accent} /><Text style={s.secondaryText}>Add exam</Text></Pressable>
          <Pressable onPress={() => { setSheet(null); setTimeout(() => router.navigate("/study"), 220); }} accessibilityRole="button" accessibilityLabel="Open Study" style={[s.secondary, s.half]}>
            <Ionicons name="school-outline" size={17} color={colors.text} /><Text style={s.secondaryPlain}>Open Study</Text></Pressable>
        </View>
      </BottomSheetScrollView>
    </AppSheet>
    <StudyExamSheet visible={sheet === "add"} exam={editing} courses={plan.courses} initialCourseId={editing?.courseId ?? null}
      onSave={plan.saveExam} onEnsureSubject={name => plan.ensureCourse(name, learning)} onRemove={id => plan.remove("exam", id)}
      onClose={() => setSheet(null)} onDismiss={() => setEditing(null)} />
  </View>;
}

/** Your squad's week. Tapping it peeks at who's in it; the Squads tab has the whole squad. */
/** Who's focusing, in plain words: "Aina and Jun are focusing". */
export function focusingLine(names: string[]): string {
  if (!names.length) return "";
  if (names.length === 1) return `${names[0]} is focusing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are focusing`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more are focusing`;
}

/**
 * Today's circle card (mockup 01): your circle's faces and who is focusing
 * now, one tap from the whole squad. Without a squad, an invitation to start one.
 */
export function HomeCircle() {
  const squads = useSquads(), router = useRouter();
  const chosen = squadSelection.get();
  const squad = squads.squads.find(item => item.id === chosen) ?? squads.squads[0];
  const open = () => { if (squad) squadSelection.choose(squad.id); router.navigate("/squads"); };
  if (!squads.ready && !squad) return null;
  const members = squad ? circleOrder(squad) : [];
  const focusing = members.filter(member => member.focusingNow && !member.isYou).map(member => member.name);
  const caption = !squad ? squads.online ? "Start a circle or join a friend’s" : "Needs internet to start or join a circle"
    : focusing.length ? focusingLine(focusing) : `${squad.members.length} ${squad.members.length === 1 ? "person" : "people"} · ${studyTime(squadTotal(squad))} together this week`;
  return <Pressable onPress={open} disabled={!squad && !squads.online} accessibilityRole="button" testID={squad ? "home-circle" : "home-squad-empty"}
    accessibilityLabel={squad ? `Your circle, ${squad.name}. ${caption}` : `Focus with friends. ${caption}`} style={s.circle}>
    {squad ? <View style={s.circleFaces}>{members.slice(0, 3).map((member, index) => <View key={member.id} style={[s.circleFace, index > 0 && { marginLeft: -10 }]}>
      <SquadFace member={member} size={34} ring={colors.surface} /></View>)}</View>
      : <View style={s.circleIcon}><Ionicons name="people-outline" size={19} color={colors.accent} /></View>}
    <View style={s.flex}>
      <Text style={s.circleTitle} numberOfLines={1}>{squad ? "Your circle" : "Focus with friends"}</Text>
      <Text style={s.caption} numberOfLines={2}>{caption}</Text>
    </View>
    <Ionicons name="arrow-up-outline" size={18} color={colors.accent} style={s.northEast} />
  </Pressable>;
}

export function HomeSquad({ tile = false }: { tile?: boolean } = {}) {
  const router = useRouter(), squads = useSquads(), insets = useSafeAreaInsets();
  const chosen = squadSelection.get();
  const squad = squads.squads.find(item => item.id === chosen) ?? squads.squads[0];
  const [peek, setPeek] = useState(false), [joining, setJoining] = useState(false);
  // Offline the last saved squad stays readable; joining or starting needs the server.
  const [wasOnline, setWasOnline] = useState(squads.online);
  if (wasOnline !== squads.online) { setWasOnline(squads.online); if (!squads.online) setJoining(false); }
  const openSquads = () => { if (squad) squadSelection.choose(squad.id); router.navigate("/squads"); };
  // The whole squad rises from the bottom, once the peek has slid away.
  // In one squad, the Squads tab already is that squad, so go there rather than
  // opening a second copy of it.
  const openSquad = () => { setPeek(false); setTimeout(() => { if (squad) { squadSelection.choose(squad.id); router.navigate(squads.squads.length === 1 ? "/squads" : "/squad"); } }, 220); };
  const share = () => { if (squad) void Share.share({ message: `Join my squad "${squad.name}" with the code ${squad.code}.` }).catch(() => {}); };
  const top = squad ? circleOrder(squad).slice(0, 4) : [];
  // On Home the squad sits beside This week as a small tile.
  const progress = squad ? goalProgress(squad) : null, left = tile ? daysLeftInWeek() : 0;
  const live = squad ? squad.members.filter(member => member.focusingNow).length : 0;
  // The whole tile is one tap target: its contents never take the touch.
  const tileCard = squad ? <View style={[s.card, s.tile]}>
    <View style={s.tileFill} importantForAccessibility="no-hide-descendants">
    <View style={s.tileHead}><Text style={s.tileLabel}>Squad</Text><Text style={s.tileMeta} numberOfLines={1}>{!squads.online ? "Offline" : progress !== null && progress >= 1 ? "Goal reached" : `${left} ${left === 1 ? "day" : "days"} left`}</Text></View>
    <Text style={s.tileName} numberOfLines={1}>{squad.name}</Text>
    {/* Who's in it, so the tile feels like your people rather than a number. */}
    <View style={s.tileFaces}>
      {squad.members.slice(0, 4).map((member, index) => <View key={member.id} style={[s.tileFace, index > 0 && { marginLeft: -8 }]}><SquadFace member={member} size={30} ring={colors.surface} /></View>)}
      <Text style={[s.caption, s.flex]} numberOfLines={1}>{live ? `${live} focusing now` : `${squad.members.length} ${squad.members.length === 1 ? "member" : "members"}`}</Text>
    </View>
    <View style={s.tileFoot}>
      <Text style={s.caption} numberOfLines={1}><Text style={s.tileStrong}>{studyTime(squadTotal(squad))}</Text>{squad.goalMinutes ? ` / ${squad.goalMinutes / 60}h` : " together"}</Text>
      {progress !== null && <View style={s.tileTrack}><View style={[s.tileFillBar, { width: `${Math.max(progress > 0 ? 4 : 0, Math.round(progress * 100))}%` }, progress >= 1 && { backgroundColor: colors.success }]} /></View>}
      <Text style={s.caption} numberOfLines={1}>{progress === null ? "Together this week" : progress >= 1 ? "Squad goal reached" : `${Math.round(progress * 100)}% of the squad goal`}</Text>
    </View>
    </View>
    {/* One clear layer over the whole card takes every tap, wherever it lands. */}
    <Pressable onPress={() => setPeek(true)} accessibilityRole="button" testID="home-squad" style={s.tileTap}
      accessibilityLabel={`${squad.name}, ${studyTime(squadTotal(squad))} together this week${squad.goalMinutes ? ` of ${squad.goalMinutes / 60} hours` : ""}. Show who's in it`} />
  </View> : <Pressable disabled={!squads.online} onPress={() => setJoining(true)} accessibilityRole="button" accessibilityState={{ disabled: !squads.online }}
    accessibilityLabel={squads.online ? "Focus with friends. Join or start a squad" : "Focus with friends. Needs internet"} testID="home-squad-empty" style={[s.card, s.tile]}>
    <View style={s.tileHead}><Text style={s.tileLabel}>Squad</Text>{squads.online && <Ionicons name="add-circle" size={22} color={colors.accent} />}</View>
    <Text style={s.tileName} numberOfLines={2}>Focus with friends</Text>
    <Text style={s.caption} numberOfLines={3}>{squads.online ? "Start a squad and keep each other going." : "Needs internet to start or join a squad."}</Text>
  </Pressable>;
  return <View style={tile ? s.tileSection : s.section} testID="home-squad-section">
    {tile ? tileCard : <><SectionHeader title="My Squad" subtitle={!squads.online ? squad ? "Offline · last saved" : undefined : squad && squads.squads.length > 1 ? `${squads.squads.length} squads · showing ${squad.name}` : undefined}
      onPress={squad ? openSquads : undefined} pressLabel="My Squad. Open Squads" />
    {squad ? <Pressable onPress={() => setPeek(true)} accessibilityRole="button" testID="home-squad"
      accessibilityLabel={`${squad.name}, ${studyTime(squadTotal(squad))} together this week${squad.goalMinutes ? ` of ${squad.goalMinutes / 60} hours` : ""}. Show who's in it`} style={s.card}>
      <SquadSummary squad={squad} />
    </Pressable> : <Pressable disabled={!squads.online} onPress={() => setJoining(true)} accessibilityRole="button" accessibilityState={{ disabled: !squads.online }}
      accessibilityLabel={squads.online ? "Focus with friends. Join or start a squad" : "Focus with friends. Needs internet"} testID="home-squad-empty" style={[s.card, s.row]}>
      <View style={[s.icon, { backgroundColor: colors.accentSoft }]}><Ionicons name="people-outline" size={20} color={colors.accent} /></View>
      <View style={s.flex}><Text style={s.name}>Focus with friends</Text><Text style={s.caption}>{squads.online ? "Start a squad and keep each other going." : "Needs internet to start or join a squad."}</Text></View>
      {squads.online && <Ionicons name="add-circle" size={24} color={colors.accent} />}
    </Pressable>}</>}
    {squad && <AppSheet visible={peek} onRequestClose={() => setPeek(false)} attached compact maxHeightRatio={0.86} label="squad peek" motionMode="timed"
      header={<SheetHeader title={squad.name} subtitle="Your circle this week" onClose={() => setPeek(false)} />}>
      <BottomSheetScrollView contentContainerStyle={[s.sheetBody, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <Pressable onPress={openSquad} accessibilityRole="button" accessibilityLabel={`${squad.name}. Open squad`} testID="home-squad-open" style={[s.card, s.sheetCard]}><SquadSummary squad={squad} /></Pressable>
        <View style={[s.group, s.sheetGroup]}>{top.map((member, index) => <View key={member.id} style={[s.rankRow, index > 0 && s.line]} accessible
          accessibilityLabel={`${member.name}${member.isYou ? ", you" : ""}, ${member.focusingNow ? "focusing now" : member.weekSeconds > 0 ? `${studyTime(member.weekSeconds)} this week` : "not started this week"}`}>
          <SquadFace member={member} size={32} ring={colors.sheetCard} />
          <Text style={[s.name, s.flex]} numberOfLines={1}>{member.isYou ? "You" : member.name}</Text>
          <Text style={[s.time, member.focusingNow && { color: colors.success }]}>{member.focusingNow ? "Focusing" : member.weekSeconds > 0 ? studyTime(member.weekSeconds) : "–"}</Text>
        </View>)}</View>
        <Pressable onPress={openSquad} accessibilityRole="button" accessibilityLabel="See the whole squad" style={s.primary}>
          <Text style={s.primaryText}>See the whole squad</Text><Ionicons name="arrow-forward" size={17} color={colors.primaryText} /></Pressable>
        <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share invite" style={s.quiet}>
          <Ionicons name="share-outline" size={16} color={colors.accent} /><Text style={s.quietText}>Share invite</Text></Pressable>
      </BottomSheetScrollView>
    </AppSheet>}
    <SquadJoinSheet visible={squads.online && joining} online={squads.online} leading={squads.squads.find(item => item.ownerIsYou)?.name ?? null} memberships={squads.squads.length} leadCount={squads.squads.filter(item => item.ownerIsYou).length} limits={squads.limits}
      onClose={() => setJoining(false)} onJoin={squads.join} onCreate={squads.create} />
  </View>;
}

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
/** This week's progress, shared by the week card and Today's card. */
export function useWeekProgress() {
  const { profile } = useUser(), { sessionSummary, cloudSaveVersion = 0 } = useTimer({ live: false });
  const timeZone = profile?.timezone || DEFAULT_TIMEZONE;
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => { setNow(new Date()); }, []));
  useEffect(() => {
    // This only advances the calendar. The existing data hook decides when a
    // changed day needs a read; there is no minute-by-minute network polling.
    const tick = () => setNow(new Date());
    const clock = setInterval(tick, 60_000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") tick(); });
    return () => { clearInterval(clock); listener.remove(); };
  }, []);
  const period = useMemo(() => periodFor("week", dateKey(now, timeZone), timeZone, now), [now, timeZone]);
  const { data } = useProgressData(period, timeZone, sessionSummary, profile?.id ?? "", cloudSaveVersion);
  // A response can contain a session completed after this screen mounted.
  // Validate it against the current clock, never the original mount time.
  const week = useMemo(() => data ? buildProgress(period, data.sessions, data.goals, timeZone, data.areas, new Date()) : null, [data, period, timeZone]);
  return { week, period };
}
/** The bars are neutral (today brightest); only the dot under a day is green. */
export const WEEK_LEGEND = "Today is the brightest bar. A green dot under a day means you reached your goal.";
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
export function HomeWeek({ tile = false }: { tile?: boolean } = {}) {
  const router = useRouter(), { week } = useWeekProgress(), insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const change = week && week.previousSeconds >= 300 ? week.comparisonSeconds - week.previousSeconds : null;
  const top = Math.max(1, ...(week?.areas.map(area => area.seconds) ?? [0]));
  const changeLine = !week ? "Checking your week…" : !week.seconds ? "Your first session starts the chart" : change === null ? "Your week so far" : change >= 0 ? `${durationLabel(change)} more than last week` : `${durationLabel(-change)} behind last week`;
  // The Home tile keeps to one short line each: hours and minutes, and the change.
  const tileChange = !week ? "Checking your week…" : !week.seconds ? "Start your week" : change === null ? "Your week so far" : change >= 0 ? `+${studyTime(change)} on last week` : `${studyTime(-change)} behind last week`;
  const weekLabel = week ? `This week, ${durationLabel(week.seconds)}. Show by category` : "This week is loading. Show by category";
  return <View style={tile ? s.tileSection : s.section} testID="home-week">
    {tile ? <View style={[s.card, s.tile]}>
      <View style={s.tileFill} importantForAccessibility="no-hide-descendants">
      <Text style={s.tileLabel}>This week</Text>
      <Text style={s.tileTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{week ? studyTime(week.seconds) : "–"}</Text>
      <Text style={[s.caption, change !== null && change > 0 && { color: colors.success }]} numberOfLines={1}>{tileChange}</Text>
      <View style={s.tileFoot}>
        <Text style={s.caption} numberOfLines={1}>{week ? `Focus on ${week.activeDays} of 7 days` : "Checking active days…"}</Text>
        <WeekBars height={30} />
      </View>
      </View>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={weekLabel} style={s.tileTap} />
    </View> : <>
    <SectionHeader title="This Week" subtitle={week ? `${week.activeDays} of 7 days with focus` : "Checking your week…"} onPress={() => router.navigate("/progress")} pressLabel="This Week. Open Progress" />
    <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={weekLabel} style={[s.card, s.week]}>
      <View style={s.flex}>
        <Text style={s.total}>{week ? durationLabel(week.seconds) : "–"}</Text>
        <Text style={[s.caption, change !== null && change > 0 && { color: colors.success }]} numberOfLines={1}>{changeLine}</Text>
      </View>
      <WeekBars />
    </Pressable></>}
    <AppSheet visible={open} onRequestClose={() => setOpen(false)} attached compact maxHeightRatio={0.86} label="this week" motionMode="timed"
      header={<SheetHeader title="This Week" subtitle={week ? `${durationLabel(week.seconds)} · ${week.sessions.length} sessions` : "Checking your week…"} onClose={() => setOpen(false)} />}>
      <BottomSheetScrollView contentContainerStyle={[s.sheetBody, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} showsVerticalScrollIndicator={false}>
        <View style={[s.card, s.sheetCard]}><WeekBars height={72} wide /><Text style={s.caption}>{WEEK_LEGEND}</Text></View>
        <View style={[s.group, s.sheetGroup]}>{week?.areas.length ? week.areas.map((area, index) => <View key={area.key} style={[s.areaRow, index > 0 && s.line]} accessible accessibilityLabel={`${area.title}, ${durationLabel(area.seconds)}`}>
          <View style={[s.dot, { backgroundColor: area.color }]} />
          <Text style={s.areaName} numberOfLines={1}>{area.title}</Text>
          <View style={s.areaTrack}><View style={[s.areaFill, { width: `${Math.max(4, Math.round(100 * area.seconds / top))}%`, backgroundColor: area.color }]} /></View>
          <Text style={s.time}>{durationLabel(area.seconds)}</Text>
        </View>) : <Text style={[s.caption, s.pad]}>{week ? "Finish a session and your categories show here." : "Checking your categories…"}</Text>}</View>
        <Pressable onPress={() => { setOpen(false); setTimeout(() => router.navigate("/progress"), 220); }} accessibilityRole="button" accessibilityLabel="Open your rhythm" style={s.primary}>
          <Text style={s.primaryText}>Open your rhythm</Text><Ionicons name="arrow-forward" size={17} color={colors.primaryText} /></Pressable>
      </BottomSheetScrollView>
    </AppSheet>
  </View>;
}

const s = StyleSheet.create({
  circle: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.surface },
  circleFaces: { flexDirection: "row", alignItems: "center" },
  circleFace: { borderRadius: 19, borderWidth: 2, borderColor: colors.surface },
  circleIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  circleTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  northEast: { transform: [{ rotate: "45deg" }] },
  section: { gap: 10 }, flex: { flex: 1, minWidth: 0, gap: 2 },
  // Home's half-width tiles: a small label, the number, and a footer.
  tileSection: { flex: 1, minWidth: 0 },
  tile: { flex: 1 },
  tileFill: { flex: 1, gap: 4 },
  tileTap: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 2, borderRadius: radius.card },
  tileFaces: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  tileFace: { borderRadius: 17, borderWidth: 2, borderColor: colors.surface },
  tileHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  tileLabel: { color: colors.secondary, fontSize: 14, lineHeight: 19, fontWeight: "600" },
  tileMeta: { flexShrink: 1, color: colors.secondary, fontSize: 13, lineHeight: 18 },
  tileName: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "700", marginTop: 2 },
  tileTotal: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  tileFoot: { marginTop: "auto", paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  tileStrong: { color: colors.text, fontWeight: "700" },
  tileTrack: { height: 6, borderRadius: 3, backgroundColor: colors.selection, overflow: "hidden" },
  tileFillBar: { height: 6, borderRadius: 3, backgroundColor: colors.progress },
  group: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
  sheetGroup: { ...edge, backgroundColor: colors.sheetCard, borderRadius: 20 },
  card: { ...edge, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface },
  sheetCard: { ...edge, backgroundColor: colors.sheetCard, borderRadius: 20, gap: 10 },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  examIcon: { backgroundColor: colors.dangerSoft },
  name: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 }, pad: { padding: 14 },
  week: { flexDirection: "row", alignItems: "center", gap: 16 },
  total: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  bars: { flexDirection: "row", gap: 5, alignItems: "flex-end" }, barsWide: { justifyContent: "space-between", gap: 0 },
  barColumn: { width: 12, alignItems: "center", gap: 4 }, barColumnWide: { width: 28 },
  barTrack: { width: 12, justifyContent: "flex-end", borderRadius: 4, backgroundColor: colors.track }, barTrackWide: { width: 22, borderRadius: 6 },
  bar: { width: 12, borderRadius: 4, backgroundColor: "rgba(205,176,222,0.35)" }, barWide: { width: 22, borderRadius: 6 }, barToday: { backgroundColor: colors.progress },
  day: { color: colors.tertiary, fontSize: 10, fontWeight: "600" }, dayToday: { color: colors.text },
  goalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "transparent" }, goalDotOn: { backgroundColor: colors.success },
  rankRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  time: { color: colors.secondary, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"], minWidth: 52, textAlign: "right" },
  areaRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  areaName: { width: "32%", color: colors.text, fontSize: 15, fontWeight: "500" },
  areaTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.selection, overflow: "hidden" }, areaFill: { height: 6, borderRadius: 3 },
  primary: { minHeight: 52, flexDirection: "row", gap: 8, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  primaryText: { color: colors.primaryText, fontSize: 16, fontWeight: "600" },
  secondary: { ...edge, minHeight: 50, flexDirection: "row", gap: 6, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  secondaryText: { color: colors.accent, fontSize: 16, fontWeight: "600" }, secondaryPlain: { color: colors.text, fontSize: 16, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 }, half: { flex: 1 },
  quiet: { minHeight: 44, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  quietText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
});
