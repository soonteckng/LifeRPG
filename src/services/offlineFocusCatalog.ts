import AsyncStorage from "@react-native-async-storage/async-storage";
import type { JournalScope } from "../types/sessionJournal";
import { validateJournalScope } from "../utils/sessionJournalSchema";

export interface OfflineFocusArea { id: number; title: string; color_code: string | null }
const key = (scope: JournalScope) => `liferpg:offline-areas:v1:${encodeURIComponent(scope.backendId)}:${scope.ownerId}`;
const valid = (area: unknown): area is OfflineFocusArea => !!area && typeof area === "object"
  && "id" in area && typeof area.id === "number" && Number.isSafeInteger(area.id) && area.id > 0
  && "title" in area && typeof area.title === "string" && area.title.length > 0 && area.title.length <= 120
  && "color_code" in area && (area.color_code === null || typeof area.color_code === "string" && /^#[0-9a-f]{6}$/i.test(area.color_code));

/** Display/setup hints only; the server rechecks area ownership on import. */
export async function cacheOfflineFocusAreas(scope: JournalScope, areas: OfflineFocusArea[]): Promise<void> {
  validateJournalScope(scope);
  if (areas.length > 100 || !areas.every(valid)) return;
  await AsyncStorage.setItem(key(scope), JSON.stringify({ version: 1, scope, savedAtMs: Date.now(),
    areas: areas.map(({ id, title, color_code }) => ({ id, title, color_code })) }));
}
export async function readOfflineFocusAreas(scope: JournalScope): Promise<OfflineFocusArea[]> {
  try {
    validateJournalScope(scope);
    const raw = await AsyncStorage.getItem(key(scope));
    if (!raw || raw.length > 32768) return [];
    const entry = JSON.parse(raw);
    if (entry.version !== 1 || entry.scope?.ownerId !== scope.ownerId || entry.scope?.backendId !== scope.backendId
      || !Number.isSafeInteger(entry.savedAtMs) || entry.savedAtMs > Date.now()
      || Date.now() - entry.savedAtMs > 7 * 86400000 || !Array.isArray(entry.areas)
      || entry.areas.length > 100 || !entry.areas.every(valid)) return [];
    return entry.areas;
  } catch { return []; }
}
