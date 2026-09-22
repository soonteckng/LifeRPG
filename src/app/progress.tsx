import { useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Header from "../components/Header";
import { useUser } from "../context/UserContext";
import {
  getCompletedSessions,
  getProgressSubjects,
  type ProgressSession,
} from "../services/progressService";

const TIME_ZONE = "Asia/Kuala_Lumpur";

interface ProgressDay {
  key: string;
  day: string;
  date: string;
  minutes: number;
  xp: number;
}

function getDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
  }).format(date);
}

function getLastSevenDays(): ProgressDay[] {
  const today = new Date();

  const dayFormatter = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: TIME_ZONE,
      weekday: "short",
    },
  );

  const dateFormatter = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: TIME_ZONE,
      month: "short",
      day: "numeric",
    },
  );

  return Array.from(
    { length: 7 },
    (_, index) => {
      const date = new Date(
        today.getTime() -
          (6 - index) * 24 * 60 * 60 * 1000,
      );

      return {
        key: getDateKey(date),
        day: dayFormatter.format(date),
        date: dateFormatter.format(date),
        minutes: 0,
        xp: 0,
      };
    },
  );
}

export default function ProgressScreen() {
  const { profile } = useUser();

  const [sessions, setSessions] = useState<
    ProgressSession[]
  >([]);

  const [subjects, setSubjects] = useState<
    Array<{
      id: number;
      title: string;
      level: number;
      current_xp: number;
      color_code: string | null;
    }>
  >([]);

  const [refreshing, setRefreshing] =
    useState(false);

  const loadData = useCallback(async () => {
    try {
      const since = new Date(
        Date.now() -
          8 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const [
        sessionList,
        subjectList,
      ] = await Promise.all([
        getCompletedSessions(since),
        getProgressSubjects(),
      ]);

      setSessions(sessionList);
      setSubjects(subjectList);
    } catch (error) {
      console.error(
        "Failed to load progress data:",
        error,
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const weeklyDays = useMemo(() => {
    const days = getLastSevenDays();

    const dayMap = new Map(
      days.map((day) => [
        day.key,
        day,
      ]),
    );

    sessions.forEach((session) => {
      if (!session.completed_at) {
        return;
      }

      const date = new Date(
        session.completed_at,
      );

      const key = getDateKey(date);
      const day = dayMap.get(key);

      if (!day) {
        return;
      }

      const minutes = Math.max(
        0,
        Math.round(
          session.duration_seconds / 60,
        ),
      );

      day.minutes += minutes;
      day.xp += session.xp_earned || 0;
    });

    return days;
  }, [sessions]);

  const totalWeeklyMinutes =
    weeklyDays.reduce(
      (sum, day) =>
        sum + day.minutes,
      0,
    );

  const totalWeeklyXP =
    weeklyDays.reduce(
      (sum, day) =>
        sum + day.xp,
      0,
    );

  const totalWeeklyGold =
    sessions.reduce(
      (sum, session) =>
        sum + (session.gold_earned || 0),
      0,
    );

  const weeklySessionCount =
    sessions.length;

  const maxDailyMinutes = Math.max(
    60,
    ...weeklyDays.map(
      (day) => day.minutes,
    ),
  );

  const activityBreakdown = useMemo(() => {
    const map = new Map<
      string,
      number
    >();

    sessions.forEach((session) => {
      const activity =
        session.activity_type ||
        "general";

      const minutes = Math.max(
        0,
        Math.round(
          session.duration_seconds / 60,
        ),
      );

      map.set(
        activity,
        (map.get(activity) || 0) +
          minutes,
      );
    });

    return Array.from(
      map.entries(),
    )
      .map(
        ([activity, minutes]) => ({
          activity,
          minutes,
        }),
      )
      .sort(
        (a, b) =>
          b.minutes - a.minutes,
      );
  }, [sessions]);

  const subjectBreakdown = useMemo(() => {
    const map = new Map<
      number,
      number
    >();

    sessions.forEach((session) => {
      if (session.subject_id === null) {
        return;
      }

      const minutes = Math.max(
        0,
        Math.round(
          session.duration_seconds / 60,
        ),
      );

      map.set(
        session.subject_id,
        (map.get(
          session.subject_id,
        ) || 0) + minutes,
      );
    });

    return subjects
      .map((subject) => ({
        ...subject,
        minutes:
          map.get(subject.id) || 0,
      }))
      .sort(
        (a, b) =>
          b.minutes - a.minutes,
      );
  }, [sessions, subjects]);

  const level =
    profile?.level ?? 1;

  const streak =
    profile?.streak_count ?? 0;

  const badges = [
    {
      icon: "🐣",
      title: "First Step",
      description:
        "Reach Character Level 2",
      unlocked: level >= 2,
    },
    {
      icon: "🔥",
      title: "Consistent Hero",
      description:
        "Maintain a 3-day streak",
      unlocked: streak >= 3,
    },
    {
      icon: "⚡",
      title: "Rising Adventurer",
      description:
        "Reach Character Level 5",
      unlocked: level >= 5,
    },
    {
      icon: "👑",
      title: "Streak Veteran",
      description:
        "Maintain a 7-day streak",
      unlocked: streak >= 7,
    },
    {
      icon: "🏆",
      title: "Legendary Hero",
      description:
        "Reach Character Level 10",
      unlocked: level >= 10,
    },
  ];

  const unlockedBadges =
    badges.filter(
      (badge) => badge.unlocked,
    ).length;

  return (
    <SafeAreaView
      style={styles.container}
    >
      <Header
        title="Progress"
        subtitle="See how you're building momentum"
        showBack={false}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#818CF8"
          />
        }
      >
        {/* SUMMARY */}
        <View
          style={styles.summaryRow}
        >
          <View
            style={styles.summaryCard}
          >
            <Text
              style={styles.summaryValue}
            >
              Lv. {level}
            </Text>

            <Text
              style={styles.summaryLabel}
            >
              Level
            </Text>
          </View>

          <View
            style={styles.summaryCard}
          >
            <Text
              style={[
                styles.summaryValue,
                {
                  color: "#F59E0B",
                },
              ]}
            >
              {streak}
            </Text>

            <Text
              style={styles.summaryLabel}
            >
              Day Streak
            </Text>
          </View>

          <View
            style={styles.summaryCard}
          >
            <Text
              style={[
                styles.summaryValue,
                {
                  color: "#10B981",
                },
              ]}
            >
              {totalWeeklyMinutes}
            </Text>

            <Text
              style={styles.summaryLabel}
            >
              Minutes
            </Text>
          </View>
        </View>

        {/* WEEKLY ACTIVITY */}
        <Text
          style={styles.sectionTitle}
        >
          LAST 7 DAYS
        </Text>

        <View
          style={styles.chartCard}
        >
          <View
            style={
              styles.chartTopRow
            }
          >
            <View>
              <Text
                style={
                  styles.chartMainValue
                }
              >
                {totalWeeklyMinutes} min
              </Text>

              <Text
                style={
                  styles.chartSubtext
                }
              >
                +{totalWeeklyXP} XP ·{" "}
                {weeklySessionCount} sessions
              </Text>
            </View>

            <Text
              style={styles.goldText}
            >
              +{totalWeeklyGold} 💰
            </Text>
          </View>

          <View
            style={styles.chart}
          >
            {weeklyDays.map(
              (day) => {
                const height =
                  day.minutes === 0
                    ? 4
                    : Math.max(
                        10,
                        (day.minutes /
                          maxDailyMinutes) *
                          100,
                      );

                return (
                  <View
                    key={day.key}
                    style={
                      styles.barColumn
                    }
                  >
                    <Text
                      style={
                        styles.barValue
                      }
                    >
                      {day.minutes > 0
                        ? `${day.minutes}`
                        : ""}
                    </Text>

                    <View
                      style={
                        styles.barTrack
                      }
                    >
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${height}%`,
                            opacity:
                              day.minutes >
                              0
                                ? 1
                                : 0.35,
                          },
                        ]}
                      />
                    </View>

                    <Text
                      style={
                        styles.barDay
                      }
                    >
                      {day.day}
                    </Text>
                  </View>
                );
              },
            )}
          </View>
        </View>

        {/* ACTIVITY BREAKDOWN */}
        <Text
          style={styles.sectionTitle}
        >
          ACTIVITY BREAKDOWN
        </Text>

        <View
          style={styles.card}
        >
          {activityBreakdown.length ===
          0 ? (
            <Text
              style={styles.emptyText}
            >
              Complete a session to see
              your activity breakdown.
            </Text>
          ) : (
            activityBreakdown
              .slice(0, 6)
              .map((item, index) => {
                const percentage =
                  totalWeeklyMinutes >
                  0
                    ? Math.round(
                        (item.minutes /
                          totalWeeklyMinutes) *
                          100,
                      )
                    : 0;

                return (
                  <View
                    key={
                      item.activity
                    }
                    style={[
                      styles.breakdownRow,
                      index ===
                        activityBreakdown.length -
                          1 &&
                        styles.lastRow,
                    ]}
                  >
                    <View
                      style={
                        styles.breakdownHeader
                      }
                    >
                      <Text
                        style={
                          styles.breakdownName
                        }
                      >
                        {formatActivity(
                          item.activity,
                        )}
                      </Text>

                      <Text
                        style={
                          styles.breakdownValue
                        }
                      >
                        {item.minutes} min ·{" "}
                        {percentage}%
                      </Text>
                    </View>

                    <View
                      style={
                        styles.breakdownTrack
                      }
                    >
                      <View
                        style={[
                          styles.breakdownFill,
                          {
                            width: `${percentage}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })
          )}
        </View>

        {/* AREA MASTERY */}
        <Text
          style={styles.sectionTitle}
        >
          AREA MASTERY
        </Text>

        <View
          style={styles.card}
        >
          {subjectBreakdown.map(
            (subject) => {
              const requiredXP =
                Math.max(
                  50,
                  subject.level *
                    50,
                );

              const progress =
                Math.min(
                  1,
                  subject.current_xp /
                    requiredXP,
                );

              return (
                <View
                  key={subject.id}
                  style={
                    styles.areaRow
                  }
                >
                  <View
                    style={
                      styles.areaHeader
                    }
                  >
                    <View
                      style={
                        styles.areaNameGroup
                      }
                    >
                      <View
                        style={[
                          styles.areaDot,
                          {
                            backgroundColor:
                              subject.color_code ??
                              "#6366F1",
                          },
                        ]}
                      />

                      <Text
                        style={
                          styles.areaTitle
                        }
                      >
                        {subject.title}
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.areaLevel
                      }
                    >
                      Lv.{" "}
                      {subject.level}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.areaTrack
                    }
                  >
                    <View
                      style={[
                        styles.areaFill,
                        {
                          width: `${progress * 100}%`,
                          backgroundColor:
                            subject.color_code ??
                            "#6366F1",
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            },
          )}
        </View>

        {/* HISTORY */}
        <Text
          style={styles.sectionTitle}
        >
          SESSION HISTORY
        </Text>

        <View
          style={styles.card}
        >
          {sessions.length === 0 ? (
            <Text
              style={styles.emptyText}
            >
              Your completed sessions
              will appear here.
            </Text>
          ) : (
            sessions
              .slice(0, 8)
              .map((session) => {
                const minutes =
                  Math.max(
                    0,
                    Math.round(
                      session.duration_seconds /
                        60,
                    ),
                  );

                const time =
                  session.completed_at
                    ? new Intl.DateTimeFormat(
                        "en-US",
                        {
                          timeZone:
                            TIME_ZONE,
                          month:
                            "short",
                          day: "numeric",
                        },
                      ).format(
                        new Date(
                          session.completed_at,
                        ),
                      )
                    : "";

                return (
                  <View
                    key={
                      session.id
                    }
                    style={
                      styles.historyRow
                    }
                  >
                    <View
                      style={
                        styles.historyMain
                      }
                    >
                      <Text
                        style={
                          styles.historyActivity
                        }
                      >
                        {formatActivity(
                          session.activity_type,
                        )}
                      </Text>

                      <Text
                        style={
                          styles.historyDate
                        }
                      >
                        {time}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.historyMetric
                      }
                    >
                      <Text
                        style={
                          styles.historyMinutes
                        }
                      >
                        {minutes}m
                      </Text>

                      <Text
                        style={
                          styles.historyXP
                        }
                      >
                        +{session.xp_earned} XP
                      </Text>
                    </View>
                  </View>
                );
              })
          )}
        </View>

        {/* ACHIEVEMENTS */}
        <View
          style={
            styles.achievementHeader
          }
        >
          <Text
            style={styles.sectionTitle}
          >
            ACHIEVEMENTS
          </Text>

          <Text
            style={
              styles.achievementCounter
            }
          >
            {unlockedBadges} /{" "}
            {badges.length}
          </Text>
        </View>

        <View
          style={styles.badgesGrid}
        >
          {badges.map((badge) => (
            <View
              key={badge.title}
              style={[
                styles.badgeCard,
                !badge.unlocked &&
                  styles.badgeLocked,
              ]}
            >
              <Text
                style={styles.badgeIcon}
              >
                {badge.unlocked
                  ? badge.icon
                  : "🔒"}
              </Text>

              <Text
                style={[
                  styles.badgeTitle,
                  !badge.unlocked &&
                    styles.badgeTitleLocked,
                ]}
              >
                {badge.title}
              </Text>

              <Text
                style={styles.badgeDescription}
              >
                {badge.description}
              </Text>
            </View>
          ))}
        </View>

        <View
          style={styles.bottomSpace}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function formatActivity(
  activity: string,
): string {
  if (!activity) {
    return "General";
  }

  return (
    activity.charAt(0).toUpperCase() +
    activity.slice(1)
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090D16",
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },

  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    marginBottom: 22,
  },

  summaryCard: {
    flex: 1,
    padding: 13,
    borderRadius: 18,
    backgroundColor:
      "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.08)",
    alignItems: "center",
  },

  summaryValue: {
    color: "#818CF8",
    fontSize: 19,
    fontWeight: "900",
  },

  summaryLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 4,
  },

  sectionTitle: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
    marginBottom: 10,
    marginTop: 4,
  },

  chartCard: {
    padding: 17,
    borderRadius: 21,
    backgroundColor:
      "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.08)",
    marginBottom: 22,
  },

  chartTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  chartMainValue: {
    color: "#F8FAFC",
    fontSize: 21,
    fontWeight: "900",
  },

  chartSubtext: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 4,
  },

  goldText: {
    color: "#FBBF24",
    fontSize: 10,
    fontWeight: "900",
  },

  chart: {
    height: 150,
    marginTop: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },

  barColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },

  barValue: {
    color: "#94A3B8",
    fontSize: 8,
    fontWeight: "800",
    marginBottom: 5,
  },

  barTrack: {
    width: 14,
    height: 92,
    backgroundColor: "#0F172A",
    borderRadius: 7,
    justifyContent: "flex-end",
    overflow: "hidden",
  },

  barFill: {
    width: "100%",
    borderRadius: 7,
    backgroundColor: "#6366F1",
  },

  barDay: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 6,
  },

  card: {
    padding: 15,
    borderRadius: 20,
    backgroundColor:
      "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.08)",
    marginBottom: 22,
  },

  emptyText: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
  },

  breakdownRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor:
      "rgba(255,255,255,0.05)",
  },

  lastRow: {
    borderBottomWidth: 0,
  },

  breakdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  breakdownName: {
    color: "#F8FAFC",
    fontSize: 11,
    fontWeight: "800",
  },

  breakdownValue: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "700",
  },

  breakdownTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0F172A",
    overflow: "hidden",
    marginTop: 7,
  },

  breakdownFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#818CF8",
  },

  areaRow: {
    paddingVertical: 10,
  },

  areaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },

  areaNameGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  areaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  areaTitle: {
    color: "#F8FAFC",
    fontSize: 11,
    fontWeight: "800",
  },

  areaLevel: {
    color: "#A5B4FC",
    fontSize: 10,
    fontWeight: "900",
  },

  areaTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "#0F172A",
    overflow: "hidden",
  },

  areaFill: {
    height: "100%",
    borderRadius: 4,
  },

  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor:
      "rgba(255,255,255,0.05)",
  },

  historyMain: {
    flex: 1,
  },

  historyActivity: {
    color: "#F8FAFC",
    fontSize: 11,
    fontWeight: "800",
  },

  historyDate: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 3,
  },

  historyMetric: {
    alignItems: "flex-end",
  },

  historyMinutes: {
    color: "#A5B4FC",
    fontSize: 12,
    fontWeight: "900",
  },

  historyXP: {
    color: "#6EE7B7",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 2,
  },

  achievementHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },

  achievementCounter: {
    color: "#818CF8",
    fontSize: 10,
    fontWeight: "900",
  },

  badgesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  badgeCard: {
    width: "48%",
    padding: 13,
    borderRadius: 18,
    backgroundColor:
      "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "#6366F1",
  },

  badgeLocked: {
    borderColor: "#334155",
    opacity: 0.5,
  },

  badgeIcon: {
    fontSize: 23,
    marginBottom: 7,
  },

  badgeTitle: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "900",
  },

  badgeTitleLocked: {
    color: "#94A3B8",
  },

  badgeDescription: {
    color: "#64748B",
    fontSize: 9,
    lineHeight: 13,
    marginTop: 3,
  },

  bottomSpace: {
    height: 25,
  },
});