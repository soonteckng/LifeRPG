import { INTEREST_KINDS, STARTER_QUESTS, defaultFocusId, suggestedFocusAreaKey, type FocusNeed, type InterestKind } from "../constants/guidedQuests";
import { ROUTINE_IDEAS, type RoutineIdea } from "../constants/routineIdeas";
import type { GuidedPreference } from "../services/guidedPreferenceService";

/**
 * What someone said they're into ("Show me ideas"). It only changes which
 * ideas come first; every idea stays available, and nothing is hidden.
 */
export function interestsOf(value: GuidedPreference): InterestKind[] {
  // Saved interests stand on their own: the offline workspace's suggestion
  // switch (enabled) never clears them.
  if (value.interests) return value.interests;
  if (!value.enabled) return [];
  // Saved before interests existed: the single direction chosen then.
  const kind = suggestedFocusAreaKey(value.templateId);
  return kind === "general" ? [] : [kind];
}

const NEEDS: Record<InterestKind, FocusNeed> = { learning: "revision", work: "work", creative: "creative", personal: "life-admin", wellbeing: "restore" };
/** Saves the picked interests. Picking none is the same as "I'll choose my own". */
export function withInterests(value: GuidedPreference, picked: readonly InterestKind[]): GuidedPreference {
  const interests = INTEREST_KINDS.filter(kind => picked.includes(kind));
  const next: GuidedPreference = { ...value, enabled: interests.length > 0, invited: true, interests, areaId: interests.length ? undefined : null };
  // The older single suggestion follows the first interest, for the offline workspace.
  const current = STARTER_QUESTS.find(task => task.id === value.templateId)?.areaKey;
  if (interests.length && !interests.some(kind => kind === current)) {
    const need = NEEDS[interests[0]];
    return { ...next, need, templateId: defaultFocusId(need), smaller: false };
  }
  return next;
}

/** Ideas from your interests first (each area in its usual order), then the rest. */
export function orderedIdeas(interests: readonly InterestKind[], ideas: readonly RoutineIdea[] = ROUTINE_IDEAS): RoutineIdea[] {
  return [...ideas.filter(idea => interests.includes(idea.area)), ...ideas.filter(idea => !interests.includes(idea.area))];
}

/** One idea for the day, from your interests: the same all day, a different one tomorrow. */
export function ideaOfTheDay(interests: readonly InterestKind[], day: string): RoutineIdea | null {
  const pool = ROUTINE_IDEAS.filter(idea => interests.includes(idea.area));
  if (!pool.length) return null;
  // Counting days keeps the same idea all day and a new one each day, in turn.
  const [year, month, date] = day.split("-").map(Number);
  const index = Math.floor(Date.UTC(year, (month || 1) - 1, date || 1) / 86_400_000);
  return pool[(Number.isFinite(index) ? index : 0) % pool.length];
}
