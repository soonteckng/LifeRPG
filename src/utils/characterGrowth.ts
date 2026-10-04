import type { Subject } from "../services/taskService";
import type { ProgressSession } from "../services/progressService";
import { focusDay, bestFocusStreak } from "./focusDays";

// Use the saved Life area directly: no parallel categories or device mappings.
export function lifeAreaGrowth(area: Subject) {
  const level = Math.max(1, Math.floor(area.level || 1));
  return {
    ...area,
    level,
    current: Math.max(0, area.current_xp || 0),
    required: level * 50,
  };
}
export function earnedMilestones(
  sessions: ProgressSession[],
  timeZone: string,
) {
  const unique = [
    ...new Map(
      sessions
        .filter(
          (s) => focusDay(s, timeZone) !== null,
        )
        .map((s) => [s.id, s]),
    ).values(),
  ];
  const seconds = unique.reduce((sum, s) => sum + s.duration_seconds, 0);
  const days = [
    ...new Set(unique.map((s) => focusDay(s, timeZone)!)),
  ].sort();
  const bestStreak = bestFocusStreak(days);
  const definitions = [
    {
      id: "first",
      title: "First step",
      description: "Finish your first session.",
      icon: "footsteps-outline",
      value: unique.length,
      target: 1,
      unit: "sessions",
    },
    {
      id: "return",
      title: "Showing up",
      description: "Focus on three consecutive days.",
      icon: "flame-outline",
      value: bestStreak,
      target: 3,
      unit: "days",
    },
    {
      id: "hour",
      title: "An hour invested",
      description: "Build one hour of focused effort.",
      icon: "time-outline",
      value: seconds,
      target: 3600,
      unit: "seconds",
    },
    {
      id: "ten",
      title: "Finding your rhythm",
      description: "Complete ten sessions.",
      icon: "checkmark-done-outline",
      value: unique.length,
      target: 10,
      unit: "sessions",
    },
    {
      id: "week",
      title: "A week of commitment",
      description: "Focus on seven consecutive days.",
      icon: "ribbon-outline",
      value: bestStreak,
      target: 7,
      unit: "days",
    },
    {
      id: "tenhours",
      title: "Time well spent",
      description: "Invest ten hours across your Life areas.",
      icon: "sparkles-outline",
      value: seconds,
      target: 36000,
      unit: "seconds",
    },
  ];
  return {
    seconds,
    sessions: unique.length,
    days: days.length,
    bestStreak,
    milestones: definitions.map((m) => ({
      ...m,
      unlocked: m.value >= m.target,
      progress: Math.min(1, m.value / m.target),
    })),
  };
}
