import { PROFILE_NAME_LIMIT } from "./profile";
export const ONBOARDING_NAME_LIMIT = PROFILE_NAME_LIMIT;
// Round 88: one short page on how the app works, instead of three.
export const INTRO_PAGES = [
  { icon: "sparkles-outline", title: "How it works", body: "Today shows what’s next. Tap Start, or Something else for anything at all.", detail: "Once a session starts, it stays on screen until you end it, with one short break if you need it. Your rhythm shows the week you’ve built, and Your circle shows friends focusing too." },
] as const;
