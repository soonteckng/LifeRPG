import { focusAreaTitle } from "../../utils/focusAreas";
import { TourScrollView } from "../../components/FeatureTour";
import { readSuggestedFocus } from "../../constants/guidedQuests";
import SlidingSelection from "../../components/SlidingSelection";
import Pressable from "../../components/MotionPressable";
import { floatingTabInset } from "../../utils/floatingTabInset";
import { type } from "../../constants/typography";
import { Text } from "../../components/AppText";
import ContentReveal from "../../components/ContentReveal";
import AppHeader from "../../components/AppHeader";
import { creditedDailySeconds } from "../../utils/progressionAccounting";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetScrollView,
  TouchableOpacity as SheetButton,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import AppSheet from "../../components/AppSheet";
import { colors } from "../../constants/theme";
import { useTimer } from "../../context/TimerContext";
import { useUser } from "../../context/UserContext";
import { useProgressData } from "../../hooks/useProgressData";
import {
  getSessionHistory,
  type ProgressSession,
} from "../../services/progressService";
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
  type PeriodMode,
} from "../../utils/progressAnalytics";
import { sessionCategory } from "../../utils/sessionReporting";

type Detail =
  | { kind: "day"; key: string }
  | { kind: "area"; key: string }
  | { kind: "history" }
  | { kind: "period" }
  | { kind: "consistency" };
type Icon = React.ComponentProps<typeof Ionicons>["name"];
const green = "#8FD8B6";

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
  onPress,
}: {
  session: ProgressSession;
  areas: { id: number; title: string }[];
  timeZone: string;
  inSheet?: boolean;
  onPress: () => void;
}) {
  const Button = inSheet ? SheetButton : Pressable;
  const key = dateKey(new Date(session.completed_at!), timeZone);
  const time = new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(session.completed_at!));
  const title = readSuggestedFocus(session.notes)?.title ?? sessionCategory(session, areas);
  return (
    <Button
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${durationLabel(session.duration_seconds)}, ${calendarLabel(key)}, ${time}. View session`}
      style={s.sessionRow}
    >
      <View style={s.sessionIcon}>
        <Ionicons name="checkmark" size={18} color={green} />
      </View>
      <View style={s.flex}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.caption}>
          {readSuggestedFocus(session.notes) ? `${sessionCategory(session, areas)} · ` : ""}{calendarLabel(key)} · {time}
        </Text>
      </View>
      <Text style={s.rowValue}>{durationLabel(session.duration_seconds)}</Text>
      <Ionicons name="chevron-forward" size={15} color={colors.muted} />
    </Button>
  );
}

export default function ProgressScreen() {
  const timer = useTimer();
  const { profile, hapticsEnabled } = useUser();
  const { sessionSummary } = timer;
  const timeZone = profile?.timezone || DEFAULT_TIMEZONE;
  const insets = useSafeAreaInsets();
  const tabBarHeight = floatingTabInset(useBottomTabBarHeight(), insets.bottom, timer);

  const [today, setToday] = useState(() => dateKey(new Date(), timeZone));
  const [mode, setMode] = useState<PeriodMode>("week");
  const [anchor, setAnchor] = useState<string | null>(null);
  const period = useMemo(
    () => periodFor(mode, anchor ?? today, timeZone),
    [mode, anchor, today, timeZone],
  );
  const { data, error, loading, refresh } = useProgressData(
    period,
    timeZone,
    sessionSummary,
  );
  const analytics = useMemo(
    () =>
      data
        ? buildProgress(period, data.sessions, data.goals, timeZone, data.areas)
        : null,
    [data, period, timeZone],
  );
  const [detail, setDetail] = useState<Detail | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedSession, setSelectedSession] =
    useState<ProgressSession | null>(null);
  const [history, setHistory] = useState<ProgressSession[]>([]);
  const [historyMore, setHistoryMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const historyOffset = useRef(0),
    historyBefore = useRef(""),
    historyRequest = useRef(0),
    historyBusy = useRef(false);
  const sheetScroll =
    useRef<React.ElementRef<typeof BottomSheetScrollView>>(null);
  useEffect(() => {
    const update = () => setToday(dateKey(new Date(), timeZone));
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
  useEffect(
    () => () => {
      historyRequest.current++;
    },
    [],
  );
  useEffect(() => {
    sheetScroll.current?.scrollTo({ y: 0, animated: false });
  }, [detail, selectedSession]);
  const tick = () => {
    if (hapticsEnabled) void Haptics.selectionAsync();
  };
  const open = (next: Detail) => {
    tick();
    setSelectedSession(null);
    setDetail(next);
    setSheetVisible(true);
  };
  const loadHistory = async (reset = false) => {
    if (historyBusy.current && !reset) return;
    const request = ++historyRequest.current;
    historyBusy.current = true;
    if (reset) {
      historyOffset.current = 0;
      historyBefore.current = new Date().toISOString();
      setHistory([]);
      setHistoryMore(false);
    }
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const page = await getSessionHistory(
        historyOffset.current,
        historyBefore.current,
      );
      if (historyRequest.current !== request) return;
      historyOffset.current += page.sessions.length;
      setHistory((old) => [
        ...old,
        ...page.sessions.filter((item) => !old.some((s) => s.id === item.id)),
      ]);
      setHistoryMore(page.hasMore);
    } catch {
      if (historyRequest.current === request) setHistoryError(true);
    } finally {
      if (historyRequest.current === request) {
        historyBusy.current = false;
        setHistoryLoading(false);
      }
    }
  };
  const openHistory = () => open({ kind: "period" });
  const openAllHistory = () => { open({ kind: "history" }); void loadHistory(true); };
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
  const detailSessions =
    detail?.kind === "history"
      ? history
      : detail?.kind === "period" ? analytics?.sessions ?? []
      : (activeDay?.sessions ?? activeArea?.sessions ?? []);
  const detailTitle = selectedSession
    ? "Session details"
    : detail?.kind === "period" ? `Sessions · ${mode === "week" ? "Week" : "Month"}`
    : detail?.kind === "history"
      ? "All session history"
      : detail?.kind === "consistency"
        ? "Your consistency"
        : activeDay
          ? calendarLabel(activeDay.key, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })
          : (activeArea?.title ?? "Details");
  const comparison =
    analytics && analytics.previousSeconds > 0
      ? Math.round(
          ((analytics.comparisonSeconds - analytics.previousSeconds) /
            analytics.previousSeconds) *
            100,
        )
      : null;
  const comparisonLabel =
    comparison === null
      ? "Your time adds up, one session at a time."
      : comparison === 0
        ? "Matching your previous pace."
        : `${Math.abs(comparison)}% ${comparison > 0 ? "more" : "less"} focus time versus the same days of the previous ${mode}.`;

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
        {error && (
          <View style={s.error}>
            <Ionicons
              name="cloud-offline-outline"
              size={20}
              color={colors.secondary}
            />
            <View style={s.flex}>
              <Text style={s.rowTitle}>Couldn’t refresh Progress</Text>
              <Text style={s.caption}>
                {data
                  ? "Showing your last loaded data."
                  : "Your progress is safe. Try again."}
              </Text>
            </View>
            <Pressable
              onPress={() => void refresh()}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Retry Progress"
              style={s.retry}
            >
              <Text style={s.link}>{loading ? "Retrying…" : "Retry"}</Text>
            </Pressable>
          </View>
        )}
        {!data ? (
          <View style={s.loading}>
            {!error && (
              <>
                <ActivityIndicator color={colors.accent} />
                <Text style={s.caption}>Gathering your progress…</Text>
              </>
            )}
          </View>
        ) : (
          analytics && (
            <ContentReveal>
              <View style={s.hero}>
                <Text
                  style={s.focusValue}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  numberOfLines={1}
                >
                  {durationLabel(analytics.seconds)}
                </Text>
                <Text style={s.heroDescription} accessibilityLabel={`${comparisonLabel}${analytics.previousSeconds > 0 ? ` First ${analytics.comparisonDays} days compared; ${durationLabel(analytics.previousSeconds)} previously.` : ""}`}>
                  {analytics.sessions.length
                    ? comparisonLabel
                    : "Make a little space for what matters."}
                </Text>
              </View>
              <View style={s.card}>
                <View style={s.chartHeader}>
                  <Text style={s.caption}>
                    {analytics.seconds
                      ? `Peak day · ${durationLabel(peak)}`
                      : "A little time makes a difference"}
                  </Text>
                  {mode === "month" && (
                    <Text style={s.caption}>Swipe for more →</Text>
                  )}
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
                      onPress={() => open({ kind: "day", key: day.key })}
                      accessibilityRole="button"
                      accessibilityLabel={`${calendarLabel(day.key, { weekday: "long", month: "short", day: "numeric" })}, ${day.future ? "upcoming" : `${durationLabel(day.seconds)}, ${day.sessions.length ? `${day.sessions.length} sessions` : "no sessions"}${day.goal?.goal_completed ? ", daily goal reached" : ""}`}`}
                      style={[s.chartDay, mode === "week" && s.weekDay]}
                    >
                      <View style={[s.barTrack, {height: chartHeight + 4}]}>
                        <View testID={`focus-bar-${day.key}`} style={[s.bar, {
                          height: day.seconds ? Math.max(5, (day.seconds / peak) * chartHeight) : 3,
                          backgroundColor: day.future ? colors.surfaceRaised : colors.selection,
                        }]}>
                          {sessionAreaSegments(day.sessions, data.areas).map(segment => (
                            <View key={segment.key} testID={`focus-segment-${day.key}-${segment.key}`}
                              style={{ flex: segment.seconds, backgroundColor: segment.color }} />
                          ))}
                        </View>
                      </View>
                      <Text
                        style={[s.dayLabel, day.key === today && s.todayLabel]}
                      >
                        {calendarLabel(
                          day.key,
                          mode === "week"
                            ? { weekday: "narrow" }
                            : { day: "numeric" },
                        )}
                      </Text>
                      <View style={s.dayStatus}>
                        {day.goal?.goal_completed ? <View style={s.goalCheck}><Ionicons name="checkmark" size={12} color={colors.background} /></View>
                          : <View style={[s.goalDot, { backgroundColor: day.sessions.length ? colors.accent : colors.line }]} />}
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={s.legend}>
                  <View style={s.legendItem}>
                    <View
                      style={[s.legendDot, { backgroundColor: colors.accent }]}
                    />
                    <Text style={s.caption}>Dot · focus day</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: green }]} />
                    <Text style={s.caption}>Check · goal reached</Text>
                  </View>
                </View>

                {!analytics.sessions.length && (
                  <Text style={s.chartEmpty}>
                    No sessions in this {mode} yet. Every completed session
                    counts.
                  </Text>
                )}
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
                      onPress={() => open({ kind: "day", key: day.key })}
                      accessibilityRole="button"
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
              <Section
                title="Where it went"

              />
              <View style={s.card}>
                {analytics.areas.length > 0 && <View style={{ flexDirection: "row", height: 9, borderRadius: 5, overflow: "hidden", marginBottom: 8 }}>
                  {analytics.areas.map(area => <View key={area.key} style={{ flex: area.seconds, backgroundColor: area.color }} />)}
                </View>}
                {analytics.areas.length ? (
                  <View style={s.areaSummary}>
                    {analytics.areas.map((area) => <Pressable key={area.key}
                      onPress={() => open({ kind: "area", key: area.key })} accessibilityRole="button"
                      accessibilityLabel={`${focusAreaTitle(area.title)}, ${durationLabel(area.seconds)}. View sessions`} style={s.areaSummaryItem}>
                      <View style={[s.areaDot, { backgroundColor: area.color }]} />
                      <Text style={s.caption}>{area.title} {durationLabel(area.seconds)}</Text>
                    </Pressable>)}
                  </View>
                ) : (
                  <Empty
                    icon="leaf-outline"
                    title="Room to grow"
                    body="Your completed sessions will show where you’re investing your time."
                  />
                )}
              </View>
              <Pressable onPress={openHistory} accessibilityRole="button" accessibilityLabel="View sessions in selected period" style={s.historyEntrance}>
                <Text style={s.rowTitle}>Sessions</Text>
                <Text style={[s.caption, s.flex, { textAlign: "right" }]}>{analytics.sessions.length} completed</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
              </Pressable>
              <Section
                title="Consistency"
                action="How it works"
                onPress={() => open({ kind: "consistency" })}
              />
              <Pressable
                onPress={() => open({ kind: "consistency" })}
                accessibilityRole="button"
                accessibilityLabel={`${data.streak}-day focus streak. Learn about focus and daily goals`}
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
                      ? `${data.streak}-day focus streak`
                      : "Your next day starts here"}
                  </Text>
                  <Text style={s.caption}>
                    {data.streak
                      ? "A little time, day after day."
                      : "Complete any session to begin."}
                  </Text>
                  <Text style={s.caption}>Longest focus streak: {data.longestStreak ?? 0} days</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>

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
          historyRequest.current++;
          historyBusy.current = false;
        }}
        label="progress details"
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
            {detail?.kind !== "history" &&
              detail?.kind !== "consistency" &&
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
                <Text style={s.rowTitle}>{readSuggestedFocus(selectedSession.notes)?.title ?? "Time well spent"}</Text>
                <Text style={s.emptyBody}>
                  {sessionCategory(selectedSession, data?.areas ?? [])}
                </Text>
              </View>
              <View style={s.detailRow}>
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
                  {selectedSession.credit_version === 1
                    ? selectedSession.credit_result?.area_xp_earned != null ? ` · +${selectedSession.credit_result.area_xp_earned} Focus area XP` : ""
                    : ` · +${selectedSession.gold_earned ?? 0} gold`}
                </Text>
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
                <Text style={s.rowTitle}>Current focus streak</Text>
              </View>
              <View style={s.detailRow}><Text style={s.caption}>Longest focus streak</Text><Text style={s.rowTitle}>{data?.longestStreak ?? 0} days</Text></View>
              <View style={s.detailRow}><Text style={s.caption}>Sessions</Text><Text style={s.rowTitle}>{analytics?.sessions.length ?? 0}</Text></View>
              <View style={s.detailRow}><Text style={s.caption}>Focus days this {mode}</Text><Text style={s.rowTitle}>{analytics?.activeDays ?? 0}</Text></View>
              <View style={s.detailRow}><Text style={s.caption}>Goal days this {mode}</Text><Text style={s.rowTitle}>{analytics?.goalDays ?? 0}</Text></View>
              <Text style={s.explainTitle}>Showing up counts</Text>
              <Text style={s.explain}>
                Complete any session to mark an active day. A 30-second session
                counts just as a longer one does for consistency. Paused or
                cancelled sessions don’t count.
              </Text>
              <Text style={s.explainTitle}>Keep your rhythm</Text>
              <Text style={s.explain}>
                Your streak continues across consecutive active days. If you
                haven’t focused today, yesterday’s streak stays visible until
                today ends. Dates use your account’s time zone ({timeZone}).
              </Text>
              <Text style={s.explainTitle}>Daily goals are a separate win</Text>
              <Text style={s.explain}>
                A green dot marks a saved daily-goal achievement. Focus time includes every completed second.
                Goal credit follows the saved daily record. Older sessions used whole minutes;
                sessions credited by the new system count seconds and carry leftover seconds toward XP.
                Historical rewards and achievements stay unchanged.
              </Text>
            </>
          ) : (
            <>
              {detail?.kind === "period" && <Pressable accessibilityRole="button" accessibilityLabel="View all session history" onPress={openAllHistory} style={s.loadMore}><Text style={s.link}>View all history</Text></Pressable>}
              {detail?.kind !== "history" && detail?.kind !== "period" && (
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
                          : `${durationLabel(creditedDailySeconds(activeDay.goal))} of ${activeDay.goal.goal_minutes} min credited`}
                      </Text>
                    </View>
                  )}
                </>
              )}
              {detailSessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  areas={data?.areas ?? []}
                  timeZone={timeZone}
                  inSheet
                  onPress={() => setSelectedSession(session)}
                />
              ))}
              {!detailSessions.length &&
                (detail?.kind !== "history" ||
                  (!historyLoading && !historyError)) && (
                  <Empty
                    icon="time-outline"
                    title={
                      activeDay?.future
                        ? "Time ahead of you"
                        : "No completed sessions"
                    }
                    body={
                      activeDay?.future
                        ? "Your next moments of focus will appear here."
                        : "Each completed session will become part of your story."
                    }
                  />
                )}
              {detail?.kind === "history" && (
                <>
                  {historyLoading && (
                    <ActivityIndicator
                      color={colors.accent}
                      style={s.historySpinner}
                    />
                  )}
                  {historyError && (
                    <Text style={s.errorText}>
                      Couldn’t load sessions. Your history is safe.
                    </Text>
                  )}
                  {(historyMore || historyError) && (
                    <SheetButton
                      onPress={() => void loadHistory()}
                      disabled={historyLoading}
                      accessibilityRole="button"
                      accessibilityLabel={
                        historyError
                          ? "Retry session history"
                          : "Load more sessions"
                      }
                      style={s.loadMore}
                    >
                      <Text style={s.link}>
                        {historyError ? "Retry" : "Load more"}
                      </Text>
                    </SheetButton>
                  )}
                </>
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
  areaSummary: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 0 },
  areaSummaryItem: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44 },
  historyEntrance: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  page: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 24 },
  flex: { flex: 1, minWidth: 0 },
  header: { marginBottom: 8 },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "500",
    letterSpacing: -1,
  },
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
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 18 },
  hero: {
    paddingTop: 8, paddingBottom: 10,
  },
  focusValue: {
    color: colors.text,
    fontSize: 48,
    fontWeight: "600",
    letterSpacing: -1.4,
    marginTop: 6,
    fontVariant: ["tabular-nums"],
  },
  heroDescription: {
    color: colors.secondary,
    fontSize: 15,
    lineHeight: 20,
    marginTop: 2,
  },
  comparisonNote: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 17,
    marginTop: 4,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 32,
    marginBottom: 12,
  },
  sectionTitle: {
    ...type.section,
    marginBottom: 0,
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 44,
  },
  link: { color: colors.accent, fontSize: 15, fontWeight: "500" },
  card: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
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
  bar: {
    overflow: "hidden", flexDirection: "column-reverse", width: "100%", maxWidth: 28, borderRadius: 5 },
  dayLabel: { color: colors.secondary, fontSize: 14 },
  todayLabel: { color: colors.accent, fontWeight: "500" },
  goalDot: { width: 7, height: 7, borderRadius: 4 },
  dayStatus: { height: 24, justifyContent: "center", alignItems: "center", marginTop: 4 },
  goalCheck: { width: 18, height: 18, borderRadius: 9, justifyContent: "center", alignItems: "center", backgroundColor: colors.success },
  legend: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  chartEmpty: {
    color: colors.secondary,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 12,
  },
  consistency: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  streakIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
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
  areaDot: { height: 8, width: 8, borderRadius: 4 },
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
    backgroundColor: "rgba(143,216,182,0.10)",
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
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 290,
  },
  milestonePreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 20,
  },
  footnote: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 18,
    marginTop: 18,
    textAlign: "center",
  },
  error: {
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
  sheetHeader: { paddingHorizontal: 22, paddingBottom: 16 },
  sheetTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "500",
    marginBottom: 5,
  },
  sheetBack: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    marginBottom: 4,
  },
  sheetContent: { paddingHorizontal: 22 },
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
  explain: { color: colors.secondary, fontSize: 14, lineHeight: 23 },
  historySpinner: { marginVertical: 20 },
  errorText: {
    color: colors.secondary,
    marginVertical: 16,
    textAlign: "center",
  },
  loadMore: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
  },
});
