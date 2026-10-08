import type { Subject } from "../services/taskService";
import type { ProgressSession } from "../services/progressService";
import { focusDay, bestFocusStreak } from "./focusDays";

// Use the saved focus area directly: changing its presentation never remaps XP.
export function lifeAreaGrowth(area: Subject) {
  const level = Math.max(1, Math.floor(area.level || 1));
  return { ...area, level, current: Math.max(0, area.current_xp || 0), required: level * 50 };
}

export const MILESTONE_TRACKS = [
  { id: "sessions", title: "Showing up", description: "Every completed block counts." },
  { id: "time", title: "Time invested", description: "Small blocks add up." },
  { id: "days", title: "Returning", description: "Focus days, at your own pace." },
  { id: "streak", title: "Consistency", description: "Your longest recorded run." },
  { id: "breadth", title: "Room to explore", description: "Make time for different parts of life." },
] as const;
export type MilestoneTrack = typeof MILESTONE_TRACKS[number]["id"];
type MilestoneDefinition = {
  id: string;
  title: string;
  description: string;
  icon: string;
  track: MilestoneTrack;
  value: number;
  target: number;
  unit: "sessions" | "seconds" | "days" | "areas";
};

export function earnedMilestones(sessions: ProgressSession[], timeZone: string, now = new Date()) {
  const unique = [...new Map(sessions.filter((session) => {
    // Full saved rows can retain timestamps after cancellation. Legacy
    // completed rows need no status; abandoned rows must never earn badges.
    const status = (session as ProgressSession & { status?: string }).status;
    return (!status || status === "completed") && focusDay(session, timeZone, now) !== null;
  }).map((session) => [session.id, session])).values()];
  const seconds = unique.reduce((sum, session) => sum + session.duration_seconds, 0);
  const days = [...new Set(unique.map((session) => focusDay(session, timeZone, now)!))].sort();
  const bestStreak = bestFocusStreak(days);
  const areas = new Set(unique.map((session) => session.subject_id).filter((id): id is number => typeof id === "number" && Number.isFinite(id) && id > 0)).size;
  const definitions: MilestoneDefinition[] = [
    { id: "first", title: "First step", description: "Finish your first session.", icon: "footsteps-outline", track: "sessions", value: unique.length, target: 1, unit: "sessions" },
    { id: "ten", title: "Finding your rhythm", description: "Complete ten sessions.", icon: "checkmark-done-outline", track: "sessions", value: unique.length, target: 10, unit: "sessions" },
    { id: "twentyfive", title: "Making space", description: "Complete 25 sessions, one block at a time.", icon: "leaf-outline", track: "sessions", value: unique.length, target: 25, unit: "sessions" },
    { id: "fifty", title: "A familiar practice", description: "Complete 50 sessions at your own pace.", icon: "repeat-outline", track: "sessions", value: unique.length, target: 50, unit: "sessions" },
    { id: "hundred", title: "One hundred beginnings", description: "Complete 100 sessions. Every return matters.", icon: "sparkles-outline", track: "sessions", value: unique.length, target: 100, unit: "sessions" },
    { id: "hour", title: "An hour invested", description: "Build one hour of focused effort.", icon: "time-outline", track: "time", value: seconds, target: 3600, unit: "seconds" },
    { id: "tenhours", title: "Time well spent", description: "Invest ten hours in things that matter to you.", icon: "sparkles-outline", track: "time", value: seconds, target: 36000, unit: "seconds" },
    { id: "twentyfivehours", title: "A growing investment", description: "Make room for 25 hours of focus.", icon: "hourglass-outline", track: "time", value: seconds, target: 90000, unit: "seconds" },
    { id: "hundredhours", title: "Time made meaningful", description: "Build 100 hours of recorded focus.", icon: "sunny-outline", track: "time", value: seconds, target: 360000, unit: "seconds" },
    { id: "fivedays", title: "Coming back", description: "Focus on five different days. They don’t need to be consecutive.", icon: "calendar-outline", track: "days", value: days.length, target: 5, unit: "days" },
    { id: "fifteendays", title: "Room in your routine", description: "Focus on 15 different days, in your own time.", icon: "calendar-clear-outline", track: "days", value: days.length, target: 15, unit: "days" },
    { id: "thirtydays", title: "Thirty days of showing up", description: "Record focus on 30 different days. Every day you return counts.", icon: "calendar-number-outline", track: "days", value: days.length, target: 30, unit: "days" },
    { id: "return", title: "Showing up", description: "Focus on three consecutive days.", icon: "flame-outline", track: "streak", value: bestStreak, target: 3, unit: "days" },
    { id: "week", title: "A week of commitment", description: "Focus on seven consecutive days.", icon: "ribbon-outline", track: "streak", value: bestStreak, target: 7, unit: "days" },
    { id: "fortnight", title: "A steady rhythm", description: "Focus on 14 consecutive days.", icon: "pulse-outline", track: "streak", value: bestStreak, target: 14, unit: "days" },
    { id: "month", title: "A lasting rhythm", description: "Focus on 30 consecutive days.", icon: "trail-sign-outline", track: "streak", value: bestStreak, target: 30, unit: "days" },
    { id: "twoareas", title: "A little variety", description: "Complete focus in two different focus areas.", icon: "compass-outline", track: "breadth", value: areas, target: 2, unit: "areas" },
    { id: "fourareas", title: "More room for life", description: "Complete focus in four different focus areas.", icon: "grid-outline", track: "breadth", value: areas, target: 4, unit: "areas" },
  ];
  return { seconds, sessions: unique.length, days: days.length, bestStreak, areas, milestones: definitions.map((milestone) => ({ ...milestone, unlocked: milestone.value >= milestone.target, progress: Math.min(1, milestone.value / milestone.target) })) };
}

// Compare completion ratios across tracks; ties retain the collection order.
export function nextMilestone(milestones: ReturnType<typeof earnedMilestones>["milestones"]) {
  return milestones.filter((milestone) => !milestone.unlocked).reduce<(typeof milestones)[number] | null>((nearest, milestone) => !nearest || milestone.progress > nearest.progress ? milestone : nearest, null);
}
