import AsyncStorage from "@react-native-async-storage/async-storage";

/** Today's numbers as Home last loaded them, so offline Home still shows them. */
export interface HomeSnapshot { day: string; completedSeconds: number; goalMinutes: number | null; goalCompleted: boolean; streak: number | null; savedAtMs: number }
const key = (owner: string) => `liferpg:home-today:v1:${owner}`;
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

export async function saveHomeSnapshot(owner: string, snapshot: HomeSnapshot): Promise<void> {
  try { await AsyncStorage.setItem(key(owner), JSON.stringify(snapshot)); } catch { /* Optional; Home works without it. */ }
}
/** Only today's snapshot counts; yesterday's minutes are never shown as today's. */
export async function readHomeSnapshot(owner: string, day: string): Promise<HomeSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(key(owner));
    const value = raw ? JSON.parse(raw) : null;
    if (!value || value.day !== day || !count(value.completedSeconds) || !count(value.savedAtMs) || value.savedAtMs > Date.now()
      || !(value.goalMinutes === null || count(value.goalMinutes)) || typeof value.goalCompleted !== "boolean"
      || !(value.streak === null || count(value.streak))) return null;
    return value;
  } catch { return null; }
}
