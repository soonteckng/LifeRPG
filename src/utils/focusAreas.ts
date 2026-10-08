import type { Subject } from "../services/taskService";
export type FocusAreaKind = "learning" | "work" | "creative" | "wellbeing" | "personal" | "general";
const labels: Record<string, string> = {
  general: "Everyday focus", knowledge: "Learning", "fitness & health": "Wellbeing",
  "grooming & vitality": "Wellbeing", "life admin": "Everyday life",
};
// Compatibility for cached rows while the synced catalogue replaces old names.
export function focusAreaTitle(title?: string | null) {
  const clean = title?.trim();
  return clean ? labels[clean.toLowerCase()] ?? clean : "Everyday focus";
}
const aliases: Record<FocusAreaKind, string[]> = {
  learning: ["learning", "knowledge", "study"], work: ["work & projects", "work", "career", "projects"],
  creative: ["creative", "creativity", "creative practice"],
  wellbeing: ["wellbeing", "fitness & health", "grooming & vitality", "health"],
  personal: ["life admin", "personal life", "everyday life"], general: ["general", "everyday focus"],
};
export const FOCUS_AREAS = [
  { title: "Everyday focus", hint: "Anything you want to give your attention to.", color: "#AAB3FF" },
  { title: "Learning", hint: "Reading, studying and building knowledge.", color: "#79BFF2" },
  { title: "Work & projects", hint: "Work tasks and projects you want to move forward.", color: "#C1A8FA" },
  { title: "Creativity", hint: "Writing, art, music and practising your craft.", color: "#E98ABC" },
  { title: "Everyday life", hint: "Planning, organising and taking care of life tasks.", color: "#6DD4B5" },
  { title: "Wellbeing", hint: "Reading for pleasure, journaling, movement and time to recharge.", color: "#F4AA88" },
] as const;
export function focusAreaDescription(title?: string | null) {
  return FOCUS_AREAS.find(area => area.title === focusAreaTitle(title))?.hint ?? "A focus area you’ve made your own.";
}
export function orderFocusAreas<T extends { title: string }>(areas: T[]): T[] {
  const rank = (title: string) => {
    const index = FOCUS_AREAS.findIndex(area => area.title === focusAreaTitle(title));
    return index < 0 ? FOCUS_AREAS.length : index;
  };
  return [...areas].sort((a, b) => rank(a.title) - rank(b.title) || a.title.localeCompare(b.title));
}
// Cached legacy rows can share a label until the synced catalogue is migrated.
// Keep the selected real ID, so an open or remembered session keeps its area.
export function focusAreaChoices<T extends { id: number; title: string }>(areas: T[], selectedId?: number | null): T[] {
  const choices = new Map<string, T>();
  for (const area of orderFocusAreas(areas)) {
    const key = focusAreaKind(area.title) ?? `custom:${area.id}`;
    const previous = choices.get(key);
    if (!previous || area.id === selectedId || (previous.id !== selectedId && area.title === focusAreaTitle(area.title))) choices.set(key, area);
  }
  return [...choices.values()];
}
export function generalArea(subjects: Subject[]) {
  return subjects.find(area => aliases.general.includes(area.title.trim().toLowerCase()));
}
export function focusAreaKind(title?: string | null): FocusAreaKind | null {
  const clean = title?.trim().toLowerCase();
  return (Object.keys(aliases) as FocusAreaKind[]).find(kind => aliases[kind].includes(clean ?? "")) ?? null;
}
export function suggestedArea(subjects: Subject[], kind: FocusAreaKind): Subject | undefined {
  return subjects.find(area => aliases[kind].includes(area.title.trim().toLowerCase()))
    ?? generalArea(subjects);
}
export function focusAreaIcon(title: string): "book-outline" | "leaf-outline" | "heart-outline" | "briefcase-outline" | "brush-outline" | "albums-outline" {
  const name = focusAreaTitle(title).toLowerCase();
  if (/learning|study|knowledge/.test(name)) return "book-outline";
  if (/wellbeing|health|fitness/.test(name)) return "leaf-outline";
  if (/personal care|grooming/.test(name)) return "heart-outline";
  if (/work|career|project/.test(name)) return "briefcase-outline";
  if (/creativ/.test(name)) return "brush-outline";
  return "albums-outline";
}
