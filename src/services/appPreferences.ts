import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Small app settings kept on this phone: motion, exam reminders and which
 * one-time tips have been seen. Read once, then shared by every screen.
 */
export interface AppPreferences {
  /** Calmer motion inside the app, on top of the phone's own setting. */
  reduceMotion: boolean;
  examReminders: boolean;
  /** One-time tips already shown and dismissed or acted on. */
  hints: string[];
}
const KEY = "liferpg:app-preferences:v1";
const DEFAULTS: AppPreferences = { reduceMotion: false, examReminders: true, hints: [] };
let value: AppPreferences = DEFAULTS;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function parse(raw: string | null): AppPreferences {
  if (!raw || raw.length > 16_384) return DEFAULTS;
  try {
    const data = JSON.parse(raw) as Partial<AppPreferences>;
    const hints = Array.isArray(data.hints) ? data.hints.filter((item): item is string => typeof item === "string" && item.length <= 32).slice(0, 32) : [];
    return { reduceMotion: data.reduceMotion === true, examReminders: data.examReminders !== false, hints };
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
  /** A tip is retired once it has been dismissed or its gesture used. */
  retireHint: (id: string) => value.hints.includes(id) ? Promise.resolve(true) : appPreferences.update({ hints: [...value.hints, id] }),
};
