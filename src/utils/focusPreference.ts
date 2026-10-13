import { defaultFocusId, focusDirection, suggestedFocusAreaKey, type FocusDirection, type FocusNeed } from "../constants/guidedQuests";
import type { GuidedPreference } from "../services/guidedPreferenceService";
import { focusAreaKind } from "./focusAreas";

// Both Home controls save one account-scoped direction/category selection.
export function preferenceForFocusMode(value: GuidedPreference, enabled: boolean): GuidedPreference {
  return { ...value, enabled, invited: true, areaId: enabled ? undefined : null };
}

// Free focus keeps the last suggested prompt, so returning to that category
// restores the user's choice. A different category starts with its own prompt.
export function preferenceForFocusDirection(value: GuidedPreference, direction: FocusDirection): GuidedPreference {
  if (focusDirection(value.need).id === direction.id) return preferenceForFocusMode(value, true);
  return { ...value, enabled: true, invited: true, areaId: undefined, need: direction.defaultNeed,
    templateId: defaultFocusId(direction.defaultNeed), smaller: false };
}

export function preferenceForFocusArea(value: GuidedPreference, areaId: number | null, title: string): GuidedPreference {
  const kind = focusAreaKind(title);
  if (!kind || kind === "general") return { ...value, enabled: false, invited: true, areaId };
  if (suggestedFocusAreaKey(value.templateId) === kind) return { ...value, areaId };
  const needs: Record<Exclude<typeof kind, "general">, FocusNeed> = { learning: "revision", work: "work", creative: "creative", wellbeing: "restore", personal: "life-admin" };
  const need = needs[kind];
  return { ...value, need, templateId: defaultFocusId(need), smaller: false, invited: true, areaId };
}
