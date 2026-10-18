import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Small app settings kept on this phone: motion, exam reminders and the order
 * of Home's sections for each account. Read once, then shared by every screen.
 */
export const HOME_SECTIONS = ["routines", "exams", "squad", "week", "milestones"] as const;
export type HomeSection = typeof HOME_SECTIONS[number];
export interface AppPreferences {
  /** Calmer motion inside the app, on top of the phone's own setting. */
  reduceMotion: boolean;
  examReminders: boolean;
  homeOrder: Record<string, HomeSection[]>;
}
const KEY = "liferpg:app-preferences:v1";
const DEFAULTS: AppPreferences = { reduceMotion: false, examReminders: true, homeOrder: {} };
let value: AppPreferences = DEFAULTS;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** A saved order with unknown names dropped and new sections added at the end. */
export function cleanHomeOrder(order: unknown): HomeSection[] {
  const known = Array.isArray(order) ? order.filter((item, index): item is HomeSection =>
    (HOME_SECTIONS as readonly unknown[]).includes(item) && order.indexOf(item) === index) : [];
  return [...known, ...HOME_SECTIONS.filter(item => !known.includes(item))];
}
function parse(raw: string | null): AppPreferences {
  if (!raw || raw.length > 16_384) return DEFAULTS;
  try {
    const data = JSON.parse(raw) as Partial<AppPreferences>;
    const homeOrder: Record<string, HomeSection[]> = {};
    if (data.homeOrder && typeof data.homeOrder === "object") {
      for (const [owner, order] of Object.entries(data.homeOrder).slice(0, 8)) if (owner.length <= 64) homeOrder[owner] = cleanHomeOrder(order);
    }
    return { reduceMotion: data.reduceMotion === true, examReminders: data.examReminders !== false, homeOrder };
  } catch { return DEFAULTS; }
}
export const appPreferences = {
  get: () => value,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  load(): Promise<void> {
    loaded ??= AsyncStorage.getItem(KEY).then(raw => { value = parse(raw); listeners.forEach(listener => listener()); }).catch(() => {});
    return loaded;
  },
  async update(patch: Partial<AppPreferences>): Promise<boolean> {
    await appPreferences.load();
    value = { ...value, ...patch }; listeners.forEach(listener => listener());
    try { await AsyncStorage.setItem(KEY, JSON.stringify(value)); return true; } catch { return false; }
  },
  homeOrder: (owner: string) => cleanHomeOrder(value.homeOrder[owner]),
  setHomeOrder: (owner: string, order: HomeSection[] | null) => {
    const next = { ...value.homeOrder };
    if (order) next[owner] = cleanHomeOrder(order); else delete next[owner];
    return appPreferences.update({ homeOrder: next });
  },
};
