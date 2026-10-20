import type { Ionicons } from "@expo/vector-icons";

/** The areas ideas belong to, in the order the app always shows them. */
export const IDEA_AREAS = ["learning", "work", "creative", "personal", "wellbeing"] as const;
export type IdeaArea = (typeof IDEA_AREAS)[number];
export type RoutineIdea = { name: string; minutes: number; area: IdeaArea; icon: React.ComponentProps<typeof Ionicons>["name"] };
/** The most areas someone picks in the intro, so their ideas stay focused. */
export const IDEA_AREA_LIMIT = 3;

/**
 * Ready-made starting points, eight for each area. Names are how a saved
 * idea is recognised (it then leaves the list), so keep existing names
 * unchanged. Lengths stay short, so a first session never feels daunting.
 */
export const ROUTINE_IDEAS: RoutineIdea[] = [
  { name: "Review today’s notes", minutes: 30, area: "learning", icon: "book-outline" },
  { name: "Past-year paper", minutes: 30, area: "learning", icon: "document-text-outline" },
  { name: "Language practice", minutes: 20, area: "learning", icon: "chatbubbles-outline" },
  { name: "Flashcards", minutes: 15, area: "learning", icon: "albums-outline" },
  { name: "Read a chapter", minutes: 25, area: "learning", icon: "reader-outline" },
  { name: "Summarise a lecture", minutes: 20, area: "learning", icon: "list-outline" },
  { name: "Practice problems", minutes: 30, area: "learning", icon: "calculator-outline" },
  { name: "Watch a tutorial", minutes: 20, area: "learning", icon: "play-circle-outline" },
  { name: "Side project", minutes: 45, area: "work", icon: "construct-outline" },
  { name: "Deep work block", minutes: 30, area: "work", icon: "hourglass-outline" },
  { name: "Clear my inbox", minutes: 20, area: "work", icon: "mail-outline" },
  { name: "Prep for a meeting", minutes: 20, area: "work", icon: "people-outline" },
  { name: "Plan the week", minutes: 20, area: "work", icon: "calendar-number-outline" },
  { name: "Update my CV", minutes: 30, area: "work", icon: "document-outline" },
  { name: "Learn a work skill", minutes: 30, area: "work", icon: "school-outline" },
  { name: "Tidy my files", minutes: 15, area: "work", icon: "folder-outline" },
  { name: "Practise my craft", minutes: 25, area: "creative", icon: "color-palette-outline" },
  { name: "Sketch something", minutes: 20, area: "creative", icon: "brush-outline" },
  { name: "Write a page", minutes: 25, area: "creative", icon: "pencil-outline" },
  { name: "Learn a technique", minutes: 30, area: "creative", icon: "bulb-outline" },
  { name: "Play an instrument", minutes: 20, area: "creative", icon: "musical-notes-outline" },
  { name: "Edit a photo", minutes: 20, area: "creative", icon: "image-outline" },
  { name: "Make something small", minutes: 20, area: "creative", icon: "cube-outline" },
  { name: "Brainstorm ideas", minutes: 15, area: "creative", icon: "sparkles-outline" },
  { name: "Plan tomorrow", minutes: 15, area: "personal", icon: "calendar-outline" },
  { name: "Tidy my desk", minutes: 10, area: "personal", icon: "sparkles-outline" },
  { name: "Sort my money", minutes: 20, area: "personal", icon: "wallet-outline" },
  { name: "Plan my meals", minutes: 15, area: "personal", icon: "restaurant-outline" },
  { name: "Reply to messages", minutes: 15, area: "personal", icon: "chatbox-ellipses-outline" },
  { name: "Laundry and chores", minutes: 30, area: "personal", icon: "shirt-outline" },
  { name: "Clean my room", minutes: 20, area: "personal", icon: "home-outline" },
  { name: "Sort out paperwork", minutes: 20, area: "personal", icon: "file-tray-full-outline" },
  { name: "Read before bed", minutes: 20, area: "wellbeing", icon: "moon-outline" },
  { name: "Morning stretch", minutes: 10, area: "wellbeing", icon: "body-outline" },
  { name: "Journal", minutes: 10, area: "wellbeing", icon: "create-outline" },
  { name: "Go for a walk", minutes: 20, area: "wellbeing", icon: "walk-outline" },
  { name: "Quiet breathing", minutes: 10, area: "wellbeing", icon: "leaf-outline" },
  { name: "Workout", minutes: 30, area: "wellbeing", icon: "barbell-outline" },
  { name: "Screen-free time", minutes: 30, area: "wellbeing", icon: "phone-portrait-outline" },
  { name: "Gratitude list", minutes: 10, area: "wellbeing", icon: "heart-outline" },
];
