import { PROFILE_NAME_LIMIT } from "./profile";
export const ONBOARDING_NAME_LIMIT = PROFILE_NAME_LIMIT;
export const INTRO_PAGES = [
  { icon: "timer-outline", title: "Start small", body: "Start a routine, study a subject or just focus. Pick how long, and the timer takes care of the rest.", detail: "Want fewer distractions? A protected session can cover the apps that pull you away until you’re done. Ending a session is always one tap away." },
  { icon: "person-outline", title: "See yourself show up", body: "Every session you finish counts toward your daily goal and shows up in Progress, sorted by category.", detail: "Every second counts. Short sessions count too, so a busy day still moves you forward." },
  { icon: "leaf-outline", title: "Go at your own pace", body: "Focus on a day and your streak grows. Add your exams and they’ll count down on Home, so nothing sneaks up on you.", detail: "Up next, a quick look around the app. It takes about a minute, and Settings has all the details whenever you want them." },
] as const;
