import AsyncStorage from "@react-native-async-storage/async-storage";
import type { JournalScope } from "../types/sessionJournal";
import { createSessionJournalStore } from "./sessionJournalStore";

/**
 * Optional foreground/Expo Go adapter using the existing dependency. Providers
 * do not import it. This JS-owned store must not run alongside a native writer
 * for the same journal; native reliability requires a single native authority.
 */
export function createAsyncStorageSessionJournalStore(scope: JournalScope) {
  // Keep the imported singleton identity so independent factories share its queue.
  return createSessionJournalStore(AsyncStorage, scope);
}
