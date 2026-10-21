import AsyncStorage from "@react-native-async-storage/async-storage";
import { IDEA_AREAS, IDEA_AREA_LIMIT, type IdeaArea } from "../constants/routineIdeas";

/**
 * A new person starts the intro before they have an account. What they pick
 * there (what they'd like to make time for) waits here until the account
 * exists, then the intro carries on from the name step with it. It is a
 * device-only draft: never account data, never sent anywhere.
 */
export type IntroHandoff = { areas: IdeaArea[] };
const KEY = "liferpg.intro.handoff.v1";
let current: IntroHandoff | null = null;

const clean = (value: unknown): IntroHandoff | null => {
  if (!value || typeof value !== "object" || !Array.isArray((value as { areas?: unknown }).areas)) return null;
  const picked = (value as { areas: unknown[] }).areas;
  return { areas: IDEA_AREAS.filter(kind => picked.includes(kind)).slice(0, IDEA_AREA_LIMIT) };
};

export const introHandoff = {
  /** Called as the account step begins, so the picks survive the sign-up. */
  set(areas: readonly IdeaArea[]) {
    current = clean({ areas });
    // Storage is a convenience here: a failure never blocks the intro.
    try { void AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {}); } catch { /* memory still holds it */ }
  },
  peek: (): IntroHandoff | null => current ? { areas: [...current.areas] } : null,
  /** Reads a draft saved before the app last closed. Never replaces a newer one. */
  async restore(): Promise<IntroHandoff | null> {
    if (current) return introHandoff.peek();
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? clean(JSON.parse(raw)) : null;
      if (saved && !current) current = saved;
    } catch { /* A missing draft only means starting the intro from the top. */ }
    return introHandoff.peek();
  },
  clear() {
    current = null;
    try { void AsyncStorage.removeItem(KEY).catch(() => {}); } catch { /* nothing left to carry over */ }
  },
};
