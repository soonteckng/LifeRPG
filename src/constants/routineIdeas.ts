import type { Ionicons } from "@expo/vector-icons";

/** The areas ideas belong to, in the order the app always shows them. */
export const IDEA_AREAS = ["learning", "work", "creative", "personal", "wellbeing"] as const;
export type IdeaArea = (typeof IDEA_AREAS)[number];
export type RoutineIdea = { name: string; minutes: number; area: IdeaArea; icon: React.ComponentProps<typeof Ionicons>["name"]; popular?: boolean };

/**
 * Ready-made starting points, four for each area. Names are how a saved idea
 * is recognised (it then leaves the list), so keep existing names unchanged.
 * "popular" marks the six a new account sees first: short, everyday ones, so
 * a first session never feels daunting.
 */
export const ROUTINE_IDEAS: RoutineIdea[] = [
  { name: "Review today’s notes", minutes: 30, area: "learning", icon: "book-outline", popular: true },
  { name: "Past-year paper", minutes: 30, area: "learning", icon: "document-text-outline", popular: true },
  { name: "Language practice", minutes: 20, area: "learning", icon: "chatbubbles-outline" },
  { name: "Flashcards", minutes: 15, area: "learning", icon: "albums-outline" },
  { name: "Side project", minutes: 45, area: "work", icon: "construct-outline" },
  { name: "Deep work block", minutes: 30, area: "work", icon: "hourglass-outline" },
  { name: "Clear my inbox", minutes: 20, area: "work", icon: "mail-outline", popular: true },
  { name: "Prep for a meeting", minutes: 20, area: "work", icon: "people-outline" },
  { name: "Practise my craft", minutes: 25, area: "creative", icon: "color-palette-outline" },
  { name: "Sketch something", minutes: 20, area: "creative", icon: "brush-outline" },
  { name: "Write a page", minutes: 25, area: "creative", icon: "pencil-outline" },
  { name: "Learn a technique", minutes: 30, area: "creative", icon: "bulb-outline" },
  { name: "Plan tomorrow", minutes: 15, area: "personal", icon: "calendar-outline", popular: true },
  { name: "Tidy my desk", minutes: 10, area: "personal", icon: "sparkles-outline" },
  { name: "Sort my money", minutes: 20, area: "personal", icon: "wallet-outline" },
  { name: "Plan my meals", minutes: 15, area: "personal", icon: "restaurant-outline" },
  { name: "Read before bed", minutes: 20, area: "wellbeing", icon: "moon-outline", popular: true },
  { name: "Morning stretch", minutes: 10, area: "wellbeing", icon: "body-outline" },
  { name: "Journal", minutes: 10, area: "wellbeing", icon: "create-outline" },
  { name: "Go for a walk", minutes: 20, area: "wellbeing", icon: "walk-outline", popular: true },
];
