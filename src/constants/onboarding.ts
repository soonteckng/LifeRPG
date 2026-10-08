import { PROFILE_NAME_LIMIT } from "./profile";
export const ONBOARDING_NAME_LIMIT = PROFILE_NAME_LIMIT;
export const INTRO_PAGES = [
  { icon: "timer-outline", title: "Start with one small block.", body: "Follow a suggestion or focus your own way. Your personal quests stay alongside both.", detail: "Choose a duration, settle into your work, and let the timer take care of the time." },
  { icon: "person-outline", title: "Your effort takes shape.", body: "Completed focus grows your character and the Focus area you choose. Levels reflect effort you’ve logged.", detail: "Every completed second counts toward your daily goal. Each 60 seconds earns 1 XP; leftover seconds carry forward." },
  { icon: "leaf-outline", title: "A rhythm, at your pace.", body: "Completed sessions build Focus days. Consecutive Focus days build your streak; your daily goal is a separate milestone.", detail: "Earned growth stays with you. Find your next step on Home lets you change direction, and Settings has a short guide whenever you need it." },
] as const;
