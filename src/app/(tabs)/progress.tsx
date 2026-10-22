import { tapHaptic } from "../../utils/tapHaptics";
import { focusAreaKind, focusAreaTitle } from "../../utils/focusAreas";
import { TourScrollView } from "../../components/FeatureTour";
import { readSuggestedFocus } from "../../constants/guidedQuests";
import { readRoutineSession } from "../../utils/routineSession";
import SlidingSelection from "../../components/SlidingSelection";
import Pressable from "../../components/MotionPressable";
import { floatingTabInset } from "../../utils/floatingTabInset";
import { type } from "../../constants/typography";
import { Text } from "../../components/AppText";
import ProgressRing from "../../components/ProgressRing";
import ContentReveal from "../../components/ContentReveal";
import AppHeader from "../../components/AppHeader";
import { creditedDailySeconds } from "../../utils/progressionAccounting";
import { dailyGoalRatio } from "../../utils/dailyGoalPresentation";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import SheetButton from "../../components/SheetTouchable";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import AppSheet from "../../components/AppSheet";
import MilestonesRow from "../../components/MilestonesRow";
import { colors, radius, edge } from "../../constants/theme";
import { useTimer } from "../../context/TimerContext";
import { useUser } from "../../context/UserContext";
import { useAuth } from "../../context/AuthContext";
import { useProgressData } from "../../hooks/useProgressData";
import SubjectBreakdown from "../../components/SubjectBreakdown";
import OneTimeHint from "../../components/OneTimeHint";
import { appPreferences } from "../../services/appPreferences";
import type { ProgressSession } from "../../services/progressService";
import {
  buildProgress,
  sessionAreaSegments,
  calendarLabel,
  dateKey,
  DEFAULT_TIMEZONE,
  durationLabel,
  nextAnchor,
  periodFor,
  previousAnchor,
  progressHeroDay,
  progressPeriodMessage,
  type PeriodMode,
} from "../../utils/progressAnalytics";
import { sessionCategory } from "../../utils/sessionReporting";

type Detail =
  | { kind: "day"; key: string }
  | { kind: "area"; key: string; day?: string }
  | { kind: "period" }
  | { kind: "consistency" };
type Icon = React.ComponentProps<typeof Ionicons>["name"];
const green = colors.success;

function Section({
  title,
  subtitle,
  action,
  onPress,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={s.sectionHeading}>
      <View style={s.flex}>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle && <Text style={s.caption}>{subtitle}</Text>}
      </View>
      {action && (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={action}
          style={s.sectionAction}
        >
          <Text style={s.link}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accent} />
        </Pressable>
      )}
    </View>
  );
}
function Empty({
  icon,
  title,
  body,
}: {
  icon: Icon;
  title: string;
  body: string;
}) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={26} color={colors.accent} />
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyBody}>{body}</Text>
    </View>
  );
}
function SessionRow({
  session,
  areas,
  timeZone,
  inSheet = false,
  last = false,
  showDate = true,
  onPress,
}: {
  session: ProgressSession;
  areas: { id: number; title: string }[];
  timeZone: string;
  inSheet?: boolean;
  last?: boolean;
  /** Under a date heading the row shows only its time. */
  showDate?: boolean;
  onPress: () => void;
}) {
  const Button = inSheet ? SheetButton : Pressable;
  const key = dateKey(new Date(session.completed_at!), timeZone);
  const time = new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(session.completed_at!));
  const title = readSuggestedFocus(session.notes)?.title ?? readRoutineSession(session.notes) ?? sessionCategory(session, areas);
  return (
    <Button
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${durationLabel(session.duration_seconds)}, ${calendarLabel(key)}, ${time}. View session`}
      style={[s.sessionRow, last && s.lastRow]}
    >
      <View style={s.sessionIcon}>
        <Ionicons name="checkmark" size={18} color={green} />
      </View>
      <View style={s.flex}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.caption}>
          {readSuggestedFocus(session.notes) || readRoutineSession(session.notes) ? `${sessionCategory(session, areas)} · ` : ""}{showDate ? `${calendarLabel(key)} · ` : ""}{time}
        </Text>
      </View>
      <Text style={s.rowValue}>{durationLabel(session.duration_seconds)}</Text>
      <Ionicons name="chevron-forward" size={15} color={colors.muted} />
    </Button>
  );
}

/**
 * Sessions under their day: "Sun 19 Oct · 2 sessions · 45m", then each session
 * with its time. Newest day first.
 */
function SessionsByDay({ sessions, areas, timeZone, inSheet = false, onPress }: {
  sessions: ProgressSession[]; areas: { id: number; title: string }[]; timeZone: string; inSheet?: boolean; onPress: (session: ProgressSession) => void;
}) {
  const days: { key: string; sessions: ProgressSession[] }[] = [];
  [...sessions].sort((a, b) => Date.parse(b.completed_at!) - Date.parse(a.completed_at!)).forEach(session => {
    const key = dateKey(new Date(session.completed_at!), timeZone), last = days.at(-1);
    if (last?.key === key) last.sessions.push(session); else days.push({ key, sessions: [session] });
  });
  return <View style={s.dayGroups} testID="sessions-by-day">{days.map(day => {
    const total = day.sessions.reduce((sum, item) => sum + item.duration_seconds, 0);
    return <View key={day.key} style={s.dayGroup}>
      <Text style={s.dayHeading} accessibilityRole="header">{calendarLabel(day.key, { weekday: "short", day: "numeric", month: "short" })} · {day.sessions.length} {day.sessions.length === 1 ? "session" : "sessions"} · {durationLabel(total)}</Text>
      <View style={inSheet ? s.sheetGroup : s.sessionsCard}>{day.sessions.map((session, index) => <SessionRow key={session.id} session={session} areas={areas} timeZone={timeZone}
        inSheet={inSheet} showDate={false} last={index === day.sessions.length - 1} onPress={() => onPress(session)} />)}</View>
    </View>;
  })}</View>;
}

export default function ProgressScreen() {
  const timer = useTimer({ live: false });
  const { profile, hapticsEnabled } = useUser();
  const { sessionSummary } = timer;
  const timeZone = profile?.timezone || DEFAULT_TIMEZONE;
  const insets = useSafeAreaInsets();
  const tabBarHeight = floatingTabInset(useBottomTabBarHeight(), insets.bottom, timer);

  const [clock, setClock] = useState(() => new Date());
  const today = dateKey(clock, timeZone);
  const [mode, setMode] = useState<PeriodMode>("week");
  const [anchor, setAnchor] = useState<string | null>(null);
  const period = useMemo(
    () => periodFor(mode, anchor ?? today, timeZone, clock),
    [mode, anchor, today, timeZone, clock],
  );
  const offline = useAuth().accessMode === "local-only";
  const { data, error, loading, refresh } = useProgressData(
    period,
    timeZone,
    sessionSummary,
    profile?.id ?? "",
  );
  const analytics = useMemo(
    () =>
      data
        ? buildProgress(period, data.sessions, data.goals, timeZone, data.areas)
        : null,
    [data, period, timeZone],
  );
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [sessionScope, setSessionScope] = useState<"day" | "period">("day");
  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedSession, setSelectedSession] =
    useState<ProgressSession | null>(null);
  const sheetScroll =
    useRef<React.ElementRef<typeof BottomSheetScrollView>>(null);
  useEffect(() => {
    const update = () => setClock(new Date());
    update();
    const interval = setInterval(update, 60000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [timeZone]);
  useEffect(() => {
    sheetScroll.current?.scrollTo({ y: 0, animated: false });
  }, [detail, selectedSession]);
  const tick = () => {
    if (hapticsEnabled) tapHaptic();
  };
  const open = (next: Detail) => {
    tick();
    if (next.kind === "day") setSelectedDayKey(next.key);
    setSelectedSession(null);
    setDetail(next);
    setSheetVisible(true);
  };
  const currentPeriod = period.end >= today;
  const range = `${calendarLabel(period.start)} – ${calendarLabel(period.end, { month: "short", day: "numeric", year: "numeric" })}`;
  const peak = Math.max(1, ...(analytics?.days.map((d) => d.seconds) ?? []));
  const chartHeight = (analytics?.days.filter(day => day.seconds > 0).length ?? 0) <= 1 ? 64 : 88;
  const activeDay =
    detail?.kind === "day"
      ? analytics?.days.find((d) => d.key === detail.key)
      : null;
  const activeArea =
    detail?.kind === "area"
      ? analytics?.areas.find((a) => a.key === detail.key)
      : null;
  const onDay = (session: ProgressSession, day: string) => dateKey(new Date(session.completed_at!), timeZone) === day;
  const detailSessions =
    detail?.kind === "period" ? analytics?.sessions ?? []
      : activeDay?.sessions ?? (activeArea ? detail?.kind === "area" && detail.day ? activeArea.sessions.filter(item => onDay(item, detail.day!)) : activeArea.sessions : []);
  const detailTitle = selectedSession
    ? "Session details"
    : detail?.kind === "period" ? `Sessions · ${mode === "week" ? "Week" : "Month"}`
    : detail?.kind === "consistency"
        ? "Your consistency"
        : activeDay
          ? calendarLabel(activeDay.key, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })
          : (activeArea?.title ?? "Details");
  const heroDay = analytics ? progressHeroDay(analytics, period, selectedDayKey) : undefined;
  // By category reads either the chosen day or the whole week or month.
  const scopedAreas = !analytics ? [] : sessionScope === "period" || !heroDay ? analytics.areas
    : analytics.areas.map(area => { const sessions = area.sessions.filter(item => onDay(item, heroDay.key));
      return { ...area, sessions, seconds: sessions.reduce((sum, item) => sum + item.duration_seconds, 0) }; })
      .filter(area => area.seconds > 0).sort((a, b) => b.seconds - a.seconds);
  const scopedSeconds = scopedAreas.reduce((sum, area) => sum + area.seconds, 0);
  const selectDay = (key: string) => {
    setSessionScope("day");
    if (key === heroDay?.key) { open({ kind: "day", key }); void appPreferences.retireHint("progress-day"); }
    else {
      tick();
      setSelectedDayKey(key);
    }
  };
  const dayLabel = heroDay?.key === today ? "Today’s effort"
    : heroDay ? `${calendarLabel(heroDay.key, { weekday: "short", month: "short", day: "numeric" })} · recorded effort` : "Recorded effort";
  const finishedSessions = heroDay?.sessions.length ?? 0;
  const dayMessage = finishedSessions
    ? `${finishedSessions} ${finishedSessions === 1 ? "session" : "sessions"} finished${heroDay?.goal?.goal_completed ? " · daily goal reached" : ""}.`
    : heroDay?.future ? "Time ahead for what matters." : "Complete a session to record your effort here.";
  const comparisonLabel = analytics ? progressPeriodMessage(analytics, period) : "";
  // A current period with nothing yet gets one welcoming card, not a page of empty sections.
  const freshPeriod = !!analytics && currentPeriod && !analytics.sessions.length;
  const leadArea = analytics && analytics.areas.length > 1 ? analytics.areas[0] : undefined;

  return (
    <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
      <AppHeader title="Progress" />
      <TourScrollView
        contentContainerStyle={[s.page, { paddingBottom: tabBarHeight + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={loading && !!data}
            onRefresh={() => void refresh()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={s.periodToolbar}>
        <View style={s.segment} accessibilityRole="tablist">
          <View pointerEvents="none" testID="period-track" style={s.segmentTrack}>
            <SlidingSelection testID="period-selection" index={mode === "week" ? 0 : 1} style={s.segmentSelected} />
          </View>
          {(["week", "month"] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => {
                tick();
                setSelectedDayKey(null);
                setSessionScope("day");
                setMode(value);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === value }}
              accessibilityLabel={value === "week" ? "Week view" : "Month view"}
              style={s.segmentButton}
            >
              <Text style={[s.segmentText, mode === value && s.segmentActive]}>
                {value === "week" ? "Week" : "Month"}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.periodNav}>
          <Pressable
            style={s.navButton}
            onPress={() => {
              tick();
              setSelectedDayKey(null);
              setSessionScope("day");
              setAnchor(previousAnchor(period));
            }}
            accessibilityRole="button"
            accessibilityLabel={`Previous ${mode}`}
          >
            <Ionicons name="chevron-back" color={colors.text} size={20} />
          </Pressable>
          <Pressable
            style={s.periodCenter}
            onPress={() => {
              tick();
              setSelectedDayKey(null);
              setSessionScope("day");
              setAnchor(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Showing ${range}. Return to this ${mode}`}
          >
            <Text style={s.periodTitle} numberOfLines={1}>
              {mode === "month" ? calendarLabel(period.start, { month: "short", year: "numeric" }) : `${calendarLabel(period.start)} – ${calendarLabel(period.end)}`}
            </Text>

          </Pressable>
          <Pressable
            style={s.navButton}
            disabled={currentPeriod}
            onPress={() => {
              tick();
              setSelectedDayKey(null);
              setSessionScope("day");
              setAnchor(nextAnchor(period));
            }}
            accessibilityRole="button"
            accessibilityLabel={`Next ${mode}`}
            accessibilityState={{ disabled: currentPeriod }}
          >
            <Ionicons
              name="chevron-forward"
              color={currentPeriod ? colors.muted : colors.text}
              size={20}
            />
          </Pressable>
        </View>
        </View>
        {(error || offline && !data) && (
          <View style={s.error} testID="progress-status">
            <Ionicons
              name="cloud-offline-outline"
              size={20}
              color={colors.secondary}
            />
            <View style={s.flex}>
              <Text style={s.rowTitle}>{offline ? "Offline" : "Couldn’t refresh Progress"}</Text>
              <Text style={s.caption}>
                {offline
                  ? data ? "Showing your progress as last loaded. New sessions count once you’re online." : "Progress loads when you’re online. Your sessions are saved."
                  : data ? "Showing your last loaded data." : "Your progress is safe. Try again."}
              </Text>
            </View>
            {!offline && <Pressable
              onPress={() => void refresh()}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Retry Progress"
              style={s.retry}
            >
              <Text style={s.link}>{loading ? "Retrying…" : "Retry"}</Text>
            </Pressable>}
          </View>
        )}
        {!data ? (
          <View style={s.loading}>
            {!error && !offline && (
              <>
                <ActivityIndicator color={colors.accent} />
                <Text style={s.caption}>Gathering your progress…</Text>
              </>
            )}
          </View>
        ) : (
          analytics && (
            <ContentReveal>
              <View style={s.card}>
                {/* The period's story leads; the chart and the chosen day follow in one card. */}
                <View style={s.story} testID="progress-period-summary">
                  <Text style={s.storyLabel}>{mode === "week" ? "Week total" : "Month total"}</Text>
                  {freshPeriod ? <>
                    <Text style={s.storyTitle}>{mode === "week" ? "A fresh week" : "A fresh month"}</Text>
                    <Text style={s.storyLine}>Your first session starts this {mode}’s story. Even 15 minutes counts.</Text>
                    {analytics.previousSeconds > 0 && <Text style={s.caption}>Last {mode}: {durationLabel(analytics.previousSeconds)}</Text>}
                  </> : <>
                    <Text style={s.storyValue} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>{durationLabel(analytics.seconds)}</Text>
                    <Text style={s.storyLine}>{comparisonLabel}{leadArea ? <Text style={s.storyAside}> {focusAreaTitle(leadArea.title)} led the way.</Text> : null}</Text>
                  </>}
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[
                    s.chart,
                    mode === "week" && s.weekChart,
                  ]}
                >
                  {analytics.days.map((day) => (
                    <Pressable
                      key={day.key}
                      onPress={() => selectDay(day.key)}
                      testID={`progress-day-${day.key}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: day.key === heroDay?.key }}
                      accessibilityHint={day.key === heroDay?.key ? "Open this day’s sessions" : "Select this day. Tap again to open its sessions"}
                      accessibilityLabel={`${calendarLabel(day.key, { weekday: "long", month: "short", day: "numeric" })}, ${day.future ? "upcoming" : `${durationLabel(day.seconds)}, ${day.sessions.length ? `${day.sessions.length} sessions` : "no sessions"}${day.goal?.goal_completed ? ", daily goal reached" : ""}`}`}
                      style={[s.chartDay, mode === "week" && s.weekDay]}
                    >
                      <View style={[s.barTrack, {height: chartHeight + 4}]}>
                        <View testID={`focus-bar-${day.key}`} style={[s.bar, {
                          height: day.seconds ? Math.max(6, (day.seconds / peak) * chartHeight) : 3,
                          backgroundColor: day.future || !day.seconds ? colors.line : colors.selection,
                        }]}>
                          {sessionAreaSegments(day.sessions, data.areas).map(segment => (
                            <View key={segment.key} testID={`focus-segment-${day.key}-${segment.key}`}
                              style={{ flex: segment.seconds, backgroundColor: segment.color }} />
                          ))}
                        </View>
                      </View>
                      <Text
                        style={[s.dayLabel, day.key === heroDay?.key && s.todayLabel]}
                      >
                        {calendarLabel(
                          day.key,
                          mode === "week"
                            ? { weekday: "narrow" }
                            : { day: "numeric" },
                        )}
                      </Text>
                      <View style={s.dayStatus}>
                        {day.goal?.goal_completed && <View style={s.goalCheck}><Ionicons name="checkmark" size={12} color={colors.background} /></View>}
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={s.legend}>
                  <View style={s.legendItem}>
                    <View style={[s.goalCheck, s.goalCheckSmall]}><Ionicons name="checkmark" size={9} color={colors.background} /></View>
                    <Text style={s.caption}>Goal reached</Text>
                  </View>
                  {mode === "month" && <Text style={s.caption}>Swipe for more →</Text>}
                </View>
                <View style={s.dayDetail} testID="progress-day-hero">
                  <View style={s.dayDetailHeading}>
                    <Text style={s.dayDetailTitle}>{dayLabel}</Text>
                    <Text style={s.dayDetailValue}>{durationLabel(heroDay?.seconds ?? 0)}</Text>
                  </View>
                  <Text style={s.caption}>{dayMessage}</Text>
                  <OneTimeHint id="progress-day" text="Tap a day to see it here. Tap it again for its sessions." />
                </View>
              </View>
              {mode === "month" && <View style={[s.card, s.calendarCard]}>
                <View style={s.calendarWeekdays}>
                  {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
                    <Text key={index} style={s.weekdayLabel}>
                      {label}
                    </Text>
                  ))}
                </View>
                <View style={s.calendar}>
                  {Array.from(
                    {
                      length:
                        (new Date(`${period.start}T12:00:00Z`).getUTCDay() +
                          6) %
                        7,
                    },
                    (_, index) => (
                      <View
                        key={`blank:${index}`}
                        style={[s.calendarDay, s.calendarBlank]}
                      />
                    ),
                  )}
                  {analytics.days.map((day) => (
                    <Pressable
                      key={day.key}
                      onPress={() => selectDay(day.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: day.key === heroDay?.key }}
                      accessibilityHint={day.key === heroDay?.key ? "Open this day’s sessions" : "Select this day. Tap again to open its sessions"}
                      accessibilityLabel={`${calendarLabel(day.key)}, ${day.future ? "upcoming" : day.sessions.length ? "active day" : "no sessions"}${day.goal?.goal_completed ? ", goal reached" : ""}`}
                      style={[
                        s.calendarDay,
                        day.sessions.length > 0 && s.calendarActive,
                        day.future && s.calendarFuture,
                        day.key === today && s.calendarToday,
                      ]}
                    >
                      <Text
                        style={[s.calendarNumber, day.future && s.futureText]}
                      >
                        {Number(day.key.slice(-2))}
                      </Text>
                      {day.goal?.goal_completed && (
                        <View style={s.calendarGoal} />
                      )}
                    </Pressable>
                  ))}
                </View>
                <View style={s.legend}>
                  <Text style={s.caption}>Filled · active day</Text>
                  <Text style={s.caption}>Green dot · goal reached</Text>
                </View>
              </View>}
              {!freshPeriod && <>
              <Section title="By category" subtitle={sessionScope === "day" && heroDay ? `${calendarLabel(heroDay.key, { weekday: "long", month: "short", day: "numeric" })} · tap a day above to change` : `Your whole ${mode}`} />
              <View style={s.segment} accessibilityRole="tablist" accessibilityLabel="Category range">
                <View pointerEvents="none" style={s.segmentTrack}>
                  <SlidingSelection index={sessionScope === "day" ? 0 : 1} style={s.segmentSelected} />
                </View>
                {(["day", "period"] as const).map(scope => <Pressable key={scope}
                  onPress={() => { tick(); setSessionScope(scope); }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: sessionScope === scope }}
                  accessibilityLabel={scope === "day" ? "Categories for selected day" : `Categories for selected ${mode}`}
                  style={s.segmentButton}>
                  <Text style={[s.segmentText, sessionScope === scope && s.segmentActive]}>
                    {scope === "day" ? "Selected day" : `Whole ${mode}`}
                  </Text>
                </Pressable>)}
              </View>
              {scopedAreas.length ? <View style={s.categoryStack} testID="progress-categories">
                {/* Each ring is that category's share of the time shown; tap for its sessions, by day. */}
                {scopedAreas.map(area => { const share = area.seconds / Math.max(1, scopedSeconds);
                  return <Pressable key={area.key}
                  onPress={() => open({ kind: "area", key: area.key, day: sessionScope === "day" ? heroDay?.key : undefined })} accessibilityRole="button"
                  accessibilityLabel={`${focusAreaTitle(area.title)}, ${durationLabel(area.seconds)}. View sessions`} style={s.categoryCard}>
                  <View style={s.categoryTop}>
                    <ProgressRing size={56} stroke={5} progress={share} color={area.color} track={colors.accentSoft}>
                      <Text style={s.categoryShare}>{Math.round(share * 100)}%</Text>
                    </ProgressRing>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </View>
                  <Text style={s.categoryName} numberOfLines={2}>{area.title}</Text>
                  <Text style={s.categoryTime}>{durationLabel(area.seconds)}</Text>
                  <Text style={s.caption}>{area.sessions.length} {area.sessions.length === 1 ? "session" : "sessions"}</Text>
                </Pressable>; })}
              </View> : <View style={s.card}>
                <Empty
                  icon="leaf-outline"
                  title={sessionScope === "day" ? heroDay?.future ? "Time ahead of you" : "Nothing on this day" : "Room to grow"}
                  body={sessionScope === "day" ? "Tap another day in the chart above, or see your whole " + mode + "." : "Your completed sessions will show where you’re investing your time."}
                />
              </View>}
              </>}
              <Section
                title="Consistency"
                action="How it works"
                onPress={() => open({ kind: "consistency" })}
              />
              <Pressable
                onPress={() => open({ kind: "consistency" })}
                accessibilityRole="button"
                accessibilityLabel={`${data.streak}-day streak. Learn about completed sessions and daily goals`}
                style={s.consistency}
              >
                <View style={s.streakIcon}>
                  <Ionicons
                    name="flame-outline"
                    size={27}
                    color={colors.accent}
                  />
                </View>
                <View style={s.flex}>
                  <Text style={s.streakNumber}>
                    {data.streak > 0
                      ? `${data.streak}-day streak`
                      : "Your next day starts here"}
                  </Text>
                  <Text style={s.caption}>
                    {data.streak
                      ? "A little time, day after day."
                      : "Complete any session to begin."}
                  </Text>
                  <Text style={s.caption}>Longest streak: {data.longestStreak ?? 0} days</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
              <Section title="My Milestones" />
              <MilestonesRow />
            </ContentReveal>
          )
        )}
      </TourScrollView>
      <AppSheet
        visible={sheetVisible}
        onRequestClose={() => setSheetVisible(false)}
        onDismiss={() => {
          setDetail(null);
          setSelectedSession(null);
        }}
        label="progress details"
        compact
        attached
        motionMode="timed"
        maxHeightRatio={0.86}
        header={
          <View style={s.sheetHeader}>
            {selectedSession && (
              <SheetButton
                onPress={() => setSelectedSession(null)}
                accessibilityRole="button"
                accessibilityLabel="Back to sessions"
                style={s.sheetBack}
              >
                <Ionicons name="chevron-back" color={colors.accent} size={20} />
                <Text style={s.link}>Back</Text>
              </SheetButton>
            )}
            <Text style={s.sheetTitle}>{detailTitle}</Text>
            {detail?.kind !== "consistency" &&
              !selectedSession && <Text style={s.caption}>{range}</Text>}
          </View>
        }
      >
        <BottomSheetScrollView
          ref={sheetScroll}
          contentContainerStyle={[
            s.sheetContent,
            { paddingBottom: insets.bottom + 32 },
          ]}
        >
          {selectedSession ? (
            <>
              <View style={s.summary}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={36}
                  color={green}
                />
                <Text style={s.summaryValue}>
                  {durationLabel(selectedSession.duration_seconds)}
                </Text>
                <Text style={s.rowTitle}>{readSuggestedFocus(selectedSession.notes)?.title ?? readRoutineSession(selectedSession.notes) ?? "Time well spent"}</Text>
                <Text style={s.emptyBody}>
                  {sessionCategory(selectedSession, data?.areas ?? [])}
                </Text>
              </View>
              <View style={s.sheetGroup}>
              <View style={[s.detailRow, s.firstRow]}>
                <Text style={s.caption}>Completed</Text>
                <Text style={[s.rowTitle, s.detailValue]}>
                  {new Intl.DateTimeFormat(undefined, {
                    timeZone,
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(selectedSession.completed_at!))}
                </Text>
              </View>
              <View style={s.detailRow}>
                <Text style={s.caption}>Rewards earned</Text>
                <Text style={s.rowTitle}>
                  +{selectedSession.xp_earned ?? 0} character XP
                  {selectedSession.credit_version === 1 && selectedSession.credit_result?.area_xp_earned != null ? ` · +${selectedSession.credit_result.area_xp_earned} Focus area XP` : ""}
                </Text>
              </View>
              </View>
              <Text style={s.footnote}>
                This session is already saved. Viewing it doesn’t award rewards
                again.
              </Text>
            </>
          ) : detail?.kind === "consistency" ? (
            <>
              <View style={s.summary}>
                <Ionicons
                  name="flame-outline"
                  size={36}
                  color={colors.accent}
                />
                <Text style={s.summaryValue}>{data?.streak ?? 0} days</Text>
                <Text style={s.rowTitle}>Current streak</Text>
              </View>
              <View style={s.sheetGroup}>
              <View style={[s.detailRow, s.firstRow]}><Text style={s.caption}>Longest streak</Text><Text style={s.rowTitle}>{data?.longestStreak ?? 0} days</Text></View>
              <View style={s.detailRow}><Text style={s.caption}>Sessions</Text><Text style={s.rowTitle}>{analytics?.sessions.length ?? 0}</Text></View>
              <View style={s.detailRow}><Text style={s.caption}>Active days this {mode}</Text><Text style={s.rowTitle}>{analytics?.activeDays ?? 0}</Text></View>
              <View style={s.detailRow}><Text style={s.caption}>Goal days this {mode}</Text><Text style={s.rowTitle}>{analytics?.goalDays ?? 0}</Text></View>
              </View>
              <Text style={s.explainTitle}>Showing up counts</Text>
              <Text style={s.explain}>
                Complete any session to mark an active day. A 30-second session
                counts just as a longer one does for consistency. Paused or
                cancelled sessions don’t count.
              </Text>
              <Text style={s.explainTitle}>Keep your rhythm</Text>
              <Text style={s.explain}>
                Your streak continues across consecutive active days. If you
                haven’t completed a session today, yesterday’s streak stays visible until
                today ends. Dates use your account’s time zone ({timeZone}).
              </Text>
              <Text style={s.explainTitle}>Daily goals are a separate win</Text>
              <Text style={s.explain}>
                A green dot marks a saved daily-goal achievement. Recorded effort includes every completed second.
                Goal credit follows the saved daily record. Older sessions used whole minutes;
                sessions credited by the new system count seconds and carry leftover seconds toward XP.
                Historical rewards and achievements stay unchanged.
              </Text>
            </>
          ) : (
            <>
              {detail?.kind !== "period" && (
                <>
                  <Text style={s.detailTotal}>
                    {durationLabel(
                      activeDay?.seconds ?? activeArea?.seconds ?? 0,
                    )}
                  </Text>
                  <Text style={s.caption}>
                    {detailSessions.length} completed{" "}
                    {detailSessions.length === 1 ? "session" : "sessions"}
                    {activeDay?.future ? " · Upcoming day" : ""}
                  </Text>
                  {activeDay?.goal && (
                    <View style={s.goalStatus}>
                      <Ionicons
                        name={
                          activeDay.goal.goal_completed
                            ? "checkmark-circle-outline"
                            : "flag-outline"
                        }
                        size={19}
                        color={
                          activeDay.goal.goal_completed
                            ? green
                            : colors.secondary
                        }
                      />
                      <Text style={s.goalStatusText}>
                        {activeDay.goal.goal_completed
                          ? "Daily goal reached"
                          : `${dailyGoalRatio(creditedDailySeconds(activeDay.goal), activeDay.goal.goal_minutes)} credited`}
                      </Text>
                    </View>
                  )}
                </>
              )}
              {activeArea && ["learning", "revision"].includes(focusAreaKind(activeArea.title) ?? "") && <SubjectBreakdown owner={profile?.id ?? ""} sessions={detailSessions} />}
              {!!detailSessions.length && <SessionsByDay sessions={detailSessions} areas={data?.areas ?? []} timeZone={timeZone} inSheet onPress={setSelectedSession} />}
              {!detailSessions.length && (
                  <Empty
                    icon="time-outline"
                    title={
                      activeDay?.future
                        ? "Time ahead of you"
                        : "No completed sessions"
                    }
                    body={
                      activeDay?.future
                        ? "Your next completed sessions will appear here."
                        : "Each completed session will become part of your story."
                    }
                  />
                )}
            </>
          )}
        </BottomSheetScrollView>
      </AppSheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  periodToolbar: { flexDirection: "column", alignItems: "stretch" },
  dayGroups: { gap: 14 }, dayGroup: { gap: 8 },
  dayHeading: { color: colors.secondary, fontSize: 14, lineHeight: 19, fontWeight: "600", paddingHorizontal: 4 },
  categoryStack: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  categoryCard: { ...edge, flexBasis: "45%", flexGrow: 1, maxWidth: "50%", minHeight: 160, gap: 4, padding: 14, borderRadius: 20, backgroundColor: colors.surface },
  categoryTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 },
  categoryShare: { color: colors.text, fontSize: 13, lineHeight: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
  categoryName: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  categoryTime: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", fontVariant: ["tabular-nums"] },
  historyEntrance: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 50 },
  page: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 24 },
  flex: { flex: 1, minWidth: 0 },
  segment: {
    position: "relative",
    minHeight: 44,
    flexDirection: "row",
    padding: 0,
    alignItems: "stretch",
    marginBottom: 8,
    alignSelf: "stretch",
    minWidth: 126,
  },
  segmentButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    position: "relative",
  },
  segmentTrack: { position: "absolute", left: 0, right: 0, top: 4, height: 36, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface },
  segmentSelected: { position: "absolute", width: "50%", top: 0, bottom: 0, borderRadius: 9, backgroundColor: colors.selection, borderWidth: 3, borderColor: colors.surface },
  segmentText: { width: "100%", textAlign: "center", margin: 0, padding: 0, includeFontPadding: false, textAlignVertical: "center", lineHeight: 20, color: colors.secondary, fontSize: 14, fontWeight: "500" },
  segmentActive: { color: colors.accent },
  periodNav: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0, width: "100%",
  },
  navButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  periodCenter: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
    minHeight: 44,
    justifyContent: "center",
  },
  periodTitle: { color: colors.secondary, fontWeight: "500", fontSize: 15 },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 32,
    marginBottom: 12,
  },
  sectionTitle: {
    ...type.section,
    color: colors.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
    letterSpacing: -0.3,
    marginBottom: 0,
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 44,
  },
  link: { color: colors.accent, fontSize: 15, fontWeight: "500" },
  card: { ...edge,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  chart: { flexDirection: "row", gap: 4, paddingTop: 8 },
  weekChart: { flexGrow: 1 },
  chartDay: { width: 38, alignItems: "center", paddingHorizontal: 5 },
  weekDay: { flex: 1, minWidth: 30 },
  barTrack: {
    height: 92,
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 4,
  },
  // Rounded tops and flat bottoms, so bars stand on the baseline.
  bar: {
    overflow: "hidden", flexDirection: "column-reverse", width: "100%", maxWidth: 30, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  dayLabel: { color: colors.secondary, fontSize: 14 },
  todayLabel: { color: colors.accent, fontWeight: "500" },
  dayStatus: { height: 24, justifyContent: "center", alignItems: "center", marginTop: 4 },
  goalCheck: { width: 18, height: 18, borderRadius: 9, justifyContent: "center", alignItems: "center", backgroundColor: colors.success },
  goalCheckSmall: { width: 14, height: 14, borderRadius: 7 },
  legend: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  story: { paddingTop: 8, paddingBottom: 4, gap: 2 },
  storyLabel: { ...type.label },
  storyValue: { color: colors.text, fontSize: 40, lineHeight: 46, fontWeight: "700", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  storyTitle: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: -0.6, marginTop: 2 },
  storyLine: { color: colors.text, fontSize: 15, lineHeight: 20 },
  storyAside: { color: colors.secondary },
  dayDetail: { marginTop: 10, paddingTop: 12, paddingBottom: 6, gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  dayDetailHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  dayDetailTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600", flexShrink: 1 },
  dayDetailValue: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600", fontVariant: ["tabular-nums"] },
  consistency: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...edge,
  },
  streakIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  streakNumber: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  calendarCard: { marginTop: 10 },
  calendar: { flexDirection: "row", flexWrap: "wrap", rowGap: 7 },
  calendarDay: {
    width: "13%",
    marginHorizontal: "0.64%",
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  calendarWeekdays: { flexDirection: "row", marginBottom: 8 },
  weekdayLabel: {
    width: "14.285%",
    textAlign: "center",
    fontSize: 14,
    color: colors.muted,
  },
  calendarBlank: { backgroundColor: "transparent" },
  calendarActive: { backgroundColor: colors.selection },
  calendarFuture: { backgroundColor: "transparent", borderColor: colors.line },
  calendarToday: { borderColor: colors.accent },
  calendarNumber: {
    color: colors.text,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  futureText: { color: colors.muted },
  calendarGoal: {
    width: 4,
    height: 4,
    backgroundColor: green,
    borderRadius: 2,
    position: "absolute",
    bottom: 4,
  },
  areaDot: { height: 10, width: 10, borderRadius: 5 },
  rowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 21,
  },
  rowValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  sessionRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    minHeight: 70,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  sessionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "rgba(48,209,88,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { paddingVertical: 20, alignItems: "center", gap: 10 },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  emptyBody: {
    color: colors.secondary,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 290,
  },
  footnote: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 18,
    textAlign: "center",
  },
  error: {
    ...edge,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    marginBottom: 16,
  },
  retry: { minHeight: 44, justifyContent: "center" },
  loading: { paddingVertical: 60, alignItems: "center", gap: 14 },
  sheetHeader: { paddingHorizontal: 20, paddingBottom: 16 },
  sheetTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
    letterSpacing: -0.5,
    marginBottom: 5,
  },
  sheetBack: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    marginBottom: 4,
  },
  sheetContent: { paddingHorizontal: 16, gap: 12 },
  // Lists and details inside the sheet sit on bordered cards, like every other sheet.
  sheetGroup: { ...edge, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.sheetCard, overflow: "hidden" },
  lastRow: { borderBottomWidth: 0 }, firstRow: { borderTopWidth: 0 },
  summary: { alignItems: "center", gap: 10, paddingVertical: 24 },
  summaryValue: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "500",
    letterSpacing: -1,
  },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  detailValue: { flexShrink: 1 },
  detailTotal: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "500",
    marginBottom: 5,
  },
  goalStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  goalStatusText: { color: colors.secondary, fontSize: 15, flex: 1 },
  explainTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "500",
    marginTop: 20,
    marginBottom: 8,
  },
  explain: { color: colors.secondary, fontSize: 14, lineHeight: 20 },

  areaRowValue: { color: colors.secondary, fontSize: 15, lineHeight: 20, fontVariant: ["tabular-nums"] },
  sessionsCard: { ...edge, marginTop: 12, paddingHorizontal: 14, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
});
