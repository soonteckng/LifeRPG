import { defaultFocusId, suggestedFocusAreaKey, type FocusNeed } from "../constants/guidedQuests";
import type { GuidedPreference } from "../services/guidedPreferenceService";
import { focusAreaKind } from "./focusAreas";

// Both Home controls save one account-scoped direction/category selection.
export function preferenceForFocusMode(value: GuidedPreference, enabled: boolean): GuidedPreference {
  return { ...value, enabled, invited: true, areaId: enabled ? undefined : null };
}

export function preferenceForFocusArea(value: GuidedPreference, areaId: number | null, title: string): GuidedPreference {
  const kind = focusAreaKind(title);
  if (!kind || kind === "general") return { ...value, enabled: false, invited: true, areaId };
  if (suggestedFocusAreaKey(value.templateId) === kind) return { ...value, areaId };
  const needs: Record<Exclude<typeof kind, "general">, FocusNeed> = { learning: "revision", work: "work", creative: "creative", wellbeing: "restore", personal: "life-admin" };
  const need = needs[kind];
  return { ...value, need, templateId: defaultFocusId(need), smaller: false, invited: true, areaId };
}
