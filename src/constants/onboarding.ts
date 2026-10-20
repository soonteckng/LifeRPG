import { PROFILE_NAME_LIMIT } from "./profile";
export const ONBOARDING_NAME_LIMIT = PROFILE_NAME_LIMIT;
export const INTRO_PAGES = [
  { icon: "timer-outline", title: "Start with one small block.", body: "Start a routine, study a subject, or just focus. Pick a length and let the timer keep time.", detail: "A protected session can cover the apps that pull you away until it ends. Ending a session is always one tap away." },
  { icon: "person-outline", title: "Your effort takes shape.", body: "Finished sessions grow your companion and the category you chose. Levels reflect effort you’ve recorded, not ability.", detail: "Every completed second counts toward your daily goal. Each 60 seconds earns 1 XP; leftover seconds carry forward." },
  { icon: "leaf-outline", title: "A rhythm, at your pace.", body: "Focus days build your streak. Add your exams and they count down on Home, so nothing sneaks up on you.", detail: "Next, a short guide shows you around. It takes about a minute, and Settings has the details whenever you need them." },
] as const;
