import type { Subject } from "../services/taskService";
export type FocusAreaKind = "learning" | "work" | "creative" | "wellbeing" | "personal" | "general";
const labels: Record<string, string> = {
  general: "Everyday focus", knowledge: "Learning", "fitness & health": "Wellbeing",
  "grooming & vitality": "Personal care", "life admin": "Life admin",
};
// Labels describe the existing saved area; IDs, XP and past sessions never move.
export function focusAreaTitle(title?: string | null) {
  const clean = title?.trim();
  return clean ? labels[clean.toLowerCase()] ?? clean : "Everyday focus";
}
const aliases: Record<FocusAreaKind, string[]> = {
  learning: ["knowledge", "learning", "study"], work: ["work", "career", "projects"],
  creative: ["creative", "creativity", "creative practice"],
  wellbeing: ["fitness & health", "wellbeing", "health"],
  personal: ["life admin", "personal life", "everyday life"], general: ["general", "everyday focus"],
};
export function suggestedArea(subjects: Subject[], kind: FocusAreaKind): Subject | undefined {
  return subjects.find(area => aliases[kind].includes(area.title.trim().toLowerCase()))
    ?? subjects.find(area => aliases.general.includes(area.title.trim().toLowerCase()));
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
