import type { Subject } from "../services/taskService";
import type { ProgressSession } from "../services/progressService";
import { dateKey, shiftDay } from "./progressAnalytics";

export const ATTRIBUTES = [
  {
    id: "strength",
    title: "Strength",
    icon: "barbell-outline",
    color: "#F5B5A1",
    description: "Training, movement and physical practice.",
  },
  {
    id: "knowledge",
    title: "Knowledge",
    icon: "book-outline",
    color: "#A5B4FC",
    description: "Learning, reading and exploring ideas.",
  },
  {
    id: "creativity",
    title: "Creativity",
    icon: "color-palette-outline",
    color: "#D8B4FE",
    description: "Making, designing and expressing yourself.",
  },
  {
    id: "balance",
    title: "Balance",
    icon: "leaf-outline",
    color: "#9CDCC1",
    description: "Care, reflection and everyday wellbeing.",
  },
] as const;
export type AttributeId = (typeof ATTRIBUTES)[number]["id"];
export type AreaMapping = Record<string, AttributeId>;
export function validMapping(value: unknown): AreaMapping {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, id]) => /^\d+$/.test(key) && ATTRIBUTES.some((a) => a.id === id),
    ),
  ) as AreaMapping;
}
// Subject levels use the server's existing 50 * level threshold.
// Reassigning an area changes this presentation, never the underlying earned XP.
export function lifetimeAreaXP(area: Subject) {
  const level = Math.max(1, Math.floor(area.level || 1));
  return 25 * level * (level - 1) + Math.max(0, area.current_xp || 0);
}
export function attributeProgress(xp: number) {
  const total = Math.max(0, Math.floor(xp));
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + total / 6.25)) / 2));
  while (25 * level * (level - 1) > total) level--;
  const current = total - 25 * level * (level - 1);
  return { level, current, required: level * 50, total };
}
export function characterAttributes(areas: Subject[], mapping: AreaMapping) {
  return ATTRIBUTES.map((attribute) => {
    const linked = areas.filter(
      (area) => mapping[String(area.id)] === attribute.id,
    );
    return {
      ...attribute,
      areas: linked,
      ...attributeProgress(
        linked.reduce((sum, area) => sum + lifetimeAreaXP(area), 0),
      ),
    };
  });
}
export function earnedMilestones(
  sessions: ProgressSession[],
  timeZone: string,
) {
  const unique = [
    ...new Map(
      sessions
        .filter(
          (s) =>
            s.duration_seconds > 0 &&
            s.completed_at &&
            Number.isFinite(new Date(s.completed_at).getTime()),
        )
        .map((s) => [s.id, s]),
    ).values(),
  ];
  const seconds = unique.reduce((sum, s) => sum + s.duration_seconds, 0);
  const days = [
    ...new Set(unique.map((s) => dateKey(new Date(s.completed_at!), timeZone))),
  ].sort();
  let bestStreak = 0,
    run = 0,
    previous = "";
  for (const day of days) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    previous = day;
  }
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
export function rewardDraft(title: string, cost: string) {
  const name = title.trim();
  if (!name || name.length > 80)
    return { error: "Enter a reward name between 1 and 80 characters." };
  if (
    !/^\d+$/.test(cost.trim()) ||
    !Number.isSafeInteger(Number(cost)) ||
    Number(cost) < 1 ||
    Number(cost) > 1000000
  )
    return { error: "Enter a whole Gold cost between 1 and 1,000,000." };
  return { title: name, cost: Number(cost), error: null };
}
