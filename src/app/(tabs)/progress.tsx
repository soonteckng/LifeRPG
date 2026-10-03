import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetScrollView,
  TouchableOpacity as SheetButton,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import AppSheet from "../../components/AppSheet";
import { colors } from "../../constants/theme";
import { useTimer } from "../../context/TimerContext";
import { useUser } from "../../context/UserContext";
import { useProgressData } from "../../hooks/useProgressData";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import {
  getSessionHistory,
  type ProgressSession,
} from "../../services/progressService";
import {
  buildProgress,
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
  const title = sessionCategory(session, areas);
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
          {calendarLabel(key)} · {time}
        </Text>
      </View>
      <Text style={s.rowValue}>{durationLabel(session.duration_seconds)}</Text>
      <Ionicons name="chevron-forward" size={15} color={colors.muted} />
    </Button>
  );
}

export default function ProgressScreen() {
  const router = useRouter();
  const { profile, hapticsEnabled } = useUser();
  const { sessionSummary } = useTimer();
  const timeZone = profile?.timezone || DEFAULT_TIMEZONE;
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
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
  const [reveal] = useState(() => new Animated.Value(1));
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
  useEffect(() => {
    reveal.stopAnimation();
    if (reduced || !data) {
      reveal.setValue(1);
      return;
    }
    reveal.setValue(0.35);
    const animation = Animated.timing(reveal, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [data, reduced, reveal]);
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
  const openHistory = () => {
    open({ kind: "history" });
    void loadHistory(true);
  };
  const currentPeriod = period.end >= today;
  const range = `${calendarLabel(period.start)} – ${calendarLabel(period.end, { month: "short", day: "numeric", year: "numeric" })}`;
  const peak = Math.max(1, ...(analytics?.days.map((d) => d.seconds) ?? []));
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
      : (activeDay?.sessions ?? activeArea?.sessions ?? []);
  const detailTitle = selectedSession
    ? "Session details"
    : detail?.kind === "history"
      ? "Session history"
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
        : `${Math.abs(comparison)}% ${comparison > 0 ? "more" : "less"} focus time than the previous ${mode}.`;

  return (
    <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={s.page}
        refreshControl={
          <RefreshControl
            refreshing={loading && !!data}
            onRefresh={() => void refresh()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={s.header}>
          <Text style={s.eyebrow}>YOUR JOURNEY</Text>
          <Text style={s.title}>Progress</Text>
          <Text style={s.subtitle}>Small moments. Meaningful momentum.</Text>
        </View>
        <View style={s.segment} accessibilityRole="tablist">
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
              style={[s.segmentButton, mode === value && s.segmentSelected]}
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
            <Text style={s.periodTitle}>
              {currentPeriod
                ? `This ${mode}`
                : mode === "month"
                  ? calendarLabel(period.start, {
                      month: "long",
                      year: "numeric",
                    })
                  : "Earlier week"}
            </Text>
            <Text style={s.caption}>{range}</Text>
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
              color={currentPeriod ? "#404656" : colors.text}
              size={20}
            />
          </Pressable>
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
            <Animated.View style={{ opacity: reveal }}>
              <View style={s.hero}>
                <View style={s.heroTop}>
                  <Text style={s.overline}>FOCUS TIME</Text>
                  <View style={s.iconBubble}>
                    <Ionicons
                      name="time-outline"
                      size={20}
                      color={colors.accent}
                    />
                  </View>
                </View>
                <Text
                  style={s.focusValue}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  numberOfLines={1}
                >
                  {durationLabel(analytics.seconds)}
                </Text>
                <Text style={s.heroDescription}>
                  {analytics.sessions.length
                    ? comparisonLabel
                    : "Make a little space for what matters."}
                </Text>
                {analytics.previousSeconds > 0 && (
                  <Text style={s.comparisonNote}>
                    {`First ${analytics.comparisonDays} days compared`} ·{" "}
                    {durationLabel(analytics.previousSeconds)} previously
                  </Text>
                )}
                <View style={s.heroStats}>
                  <View style={s.stat}>
                    <Text style={s.statNumber}>
                      {analytics.sessions.length}
                    </Text>
                    <Text style={s.caption}>Sessions</Text>
                  </View>
                  <View style={s.statDivider} />
                  <View style={s.stat}>
                    <Text style={s.statNumber}>{analytics.activeDays}</Text>
                    <Text style={s.caption}>Active days</Text>
                  </View>
                  <View style={s.statDivider} />
                  <View style={s.stat}>
                    <Text style={s.statNumber}>{analytics.goalDays}</Text>
                    <Text style={s.caption}>Goal days</Text>
                  </View>
                </View>
              </View>
              <Section
                title="Your rhythm"
                subtitle="Tap a day to explore your focus time"
              />
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
                      accessibilityLabel={`${calendarLabel(day.key, { weekday: "long", month: "short", day: "numeric" })}, ${day.future ? "upcoming" : `${durationLabel(day.seconds)}, ${day.sessions.length} sessions${day.goal?.goal_completed ? ", daily goal reached" : ""}`}`}
                      style={[s.chartDay, mode === "week" && s.weekDay]}
                    >
                      <View style={s.barTrack}>
                        <View
                          style={[
                            s.bar,
                            {
                              height: day.seconds
                                ? Math.max(5, (day.seconds / peak) * 110)
                                : 3,
                              backgroundColor: day.future
                                ? "#282E3B"
                                : day.seconds
                                  ? colors.accent
                                  : "#3A4152",
                            },
                          ]}
                        />
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
                      <View
                        style={[
                          s.goalDot,
                          {
                            backgroundColor: day.goal?.goal_completed
                              ? green
                              : "transparent",
                          },
                        ]}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={s.legend}>
                  <View style={s.legendItem}>
                    <View
                      style={[s.legendDot, { backgroundColor: colors.accent }]}
                    />
                    <Text style={s.caption}>Focus time</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: green }]} />
                    <Text style={s.caption}>Goal reached</Text>
                  </View>
                </View>
                {!analytics.sessions.length && (
                  <Text style={s.chartEmpty}>
                    No sessions in this {mode} yet. Every completed session
                    counts.
                  </Text>
                )}
              </View>
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
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
              <View style={[s.card, s.calendarCard]}>
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
              </View>
              <Section
                title="Life areas"
                subtitle="Where you made time this period"
              />
              <View style={s.card}>
                {analytics.areas.length ? (
                  analytics.areas.map((area) => (
                    <Pressable
                      key={area.key}
                      onPress={() => open({ kind: "area", key: area.key })}
                      accessibilityRole="button"
                      accessibilityLabel={`${area.title}, ${durationLabel(area.seconds)}. View sessions`}
                      style={s.areaRow}
                    >
                      <View style={s.areaHeading}>
                        <View
                          style={[s.areaDot, { backgroundColor: area.color }]}
                        />
                        <Text style={[s.rowTitle, s.flex]}>{area.title}</Text>
                        <Text style={s.rowValue}>
                          {durationLabel(area.seconds)}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={15}
                          color={colors.muted}
                        />
                      </View>
                      <View style={s.areaTrack}>
                        <View
                          style={[
                            s.areaFill,
                            {
                              width: `${(area.seconds / analytics.seconds) * 100}%`,
                              backgroundColor: area.color,
                            },
                          ]}
                        />
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <Empty
                    icon="leaf-outline"
                    title="Room to grow"
                    body="Your completed sessions will show where you’re investing your time."
                  />
                )}
              </View>
              <Section
                title="Recent sessions"
                action="View all"
                onPress={openHistory}
              />
              <View style={s.card}>
                {analytics.sessions.length ? (
                  analytics.sessions.slice(0, 4).map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      areas={data.areas}
                      timeZone={timeZone}
                      onPress={() => {
                        open({
                          kind: "day",
                          key: dateKey(
                            new Date(session.completed_at!),
                            timeZone,
                          ),
                        });
                        setSelectedSession(session);
                      }}
                    />
                  ))
                ) : (
                  <Empty
                    icon="checkmark-circle-outline"
                    title="A fresh chapter"
                    body="Finish a session and it will appear here, even if it’s just a few seconds."
                  />
                )}
              </View>
              <Section
                title="Milestones"
                action="Explore"
                onPress={() => router.navigate("/rewards")}
              />
              <Pressable
                onPress={() => router.navigate("/rewards")}
                accessibilityRole="button"
                accessibilityLabel="Explore your level and consistency milestones"
                style={[s.card, s.milestonePreview]}
              >
                <Ionicons
                  name="sparkles-outline"
                  size={23}
                  color={colors.accent}
                />
                <View style={s.flex}>
                  <Text style={s.rowTitle}>Keep growing at your pace</Text>
                  <Text style={s.caption}>
                    Level {profile?.level ?? 1} · Earned milestones and personal
                    rewards
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
              <Text style={s.footnote}>
                Focus time includes seconds. Daily-goal credit and rewards
                follow the current whole-minute rules.
              </Text>
            </Animated.View>
          )
        )}
      </ScrollView>
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
                <Text style={s.rowTitle}>Time well spent</Text>
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
                  +{selectedSession.xp_earned ?? 0} XP · +
                  {selectedSession.gold_earned ?? 0} gold
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
                A green dot marks a saved daily-goal achievement. Goals and
                XP/gold still use the current whole-minute credit rules; focus
                time here includes every completed second.
              </Text>
            </>
          ) : (
            <>
              {detail?.kind !== "history" && (
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
                          : `${activeDay.goal.completed_minutes} of ${activeDay.goal.goal_minutes} goal minutes credited`}
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
  page: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  flex: { flex: 1, minWidth: 0 },
  header: { marginBottom: 24 },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "600",
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "600",
    letterSpacing: -1,
  },
  subtitle: {
    color: colors.secondary,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  segmentSelected: { backgroundColor: "#2A3047" },
  segmentText: { color: colors.secondary, fontSize: 14, fontWeight: "600" },
  segmentActive: { color: colors.text },
  periodNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
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
    gap: 4,
    minHeight: 44,
    justifyContent: "center",
  },
  periodTitle: { color: colors.text, fontWeight: "600", fontSize: 15 },
  caption: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  hero: {
    backgroundColor: "#191D30",
    borderWidth: 1,
    borderColor: "rgba(165,180,252,0.18)",
    borderRadius: 24,
    padding: 22,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  overline: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    color: colors.accent,
  },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  focusValue: {
    color: colors.text,
    fontSize: 43,
    fontWeight: "600",
    letterSpacing: -1.4,
    marginTop: 6,
    fontVariant: ["tabular-nums"],
  },
  heroDescription: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  comparisonNote: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  stat: { flex: 1, gap: 3 },
  statNumber: { color: colors.text, fontSize: 21, fontWeight: "600" },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.line,
    marginRight: 14,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 26,
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 3,
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 44,
  },
  link: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
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
    height: 116,
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 10,
  },
  bar: { width: "100%", maxWidth: 28, borderRadius: 5 },
  dayLabel: { color: colors.secondary, fontSize: 12 },
  todayLabel: { color: colors.accent, fontWeight: "700" },
  goalDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6 },
  legend: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  chartEmpty: {
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 12,
  },
  consistency: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
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
    fontWeight: "600",
    marginBottom: 4,
  },
  calendarCard: { marginTop: 10 },
  calendar: { flexDirection: "row", flexWrap: "wrap", rowGap: 7 },
  calendarDay: {
    width: "13%",
    marginHorizontal: "0.64%",
    height: 40,
    borderRadius: 10,
    backgroundColor: "#1C2230",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  calendarWeekdays: { flexDirection: "row", marginBottom: 8 },
  weekdayLabel: {
    width: "14.285%",
    textAlign: "center",
    fontSize: 11,
    color: colors.muted,
  },
  calendarBlank: { backgroundColor: "transparent" },
  calendarActive: { backgroundColor: "#303953" },
  calendarFuture: { backgroundColor: "transparent", borderColor: colors.line },
  calendarToday: { borderColor: colors.accent },
  calendarNumber: {
    color: colors.text,
    fontSize: 12,
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
  areaRow: { paddingVertical: 12 },
  areaHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  areaDot: { height: 8, width: 8, borderRadius: 4 },
  rowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 21,
  },
  rowValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  areaTrack: {
    height: 4,
    backgroundColor: "#252B38",
    borderRadius: 2,
    marginTop: 12,
  },
  areaFill: { height: 4, borderRadius: 2 },
  sessionRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    minHeight: 70,
    paddingVertical: 12,
    borderBottomWidth: 1,
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
    fontWeight: "600",
    textAlign: "center",
  },
  emptyBody: {
    color: colors.secondary,
    fontSize: 13,
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
    fontSize: 11,
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
    fontWeight: "600",
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
    fontWeight: "600",
    letterSpacing: -1,
  },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  detailValue: { flexShrink: 1 },
  detailTotal: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "600",
    marginBottom: 5,
  },
  goalStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  goalStatusText: { color: colors.secondary, fontSize: 13, flex: 1 },
  explainTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 8,
  },
  explain: { color: colors.secondary, fontSize: 14, lineHeight: 23 },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 78,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  unmet: { backgroundColor: colors.line },
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
