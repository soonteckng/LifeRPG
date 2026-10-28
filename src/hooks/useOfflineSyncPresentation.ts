import { useCallback, useMemo, useSyncExternalStore } from "react";
import { offlineSyncPresentation } from "../services/offlineSyncPresentation";
import type { JournalScope } from "../types/sessionJournal";
import { isJournalUuid } from "../utils/sessionJournalSchema";

/** Subscribe to immutable presentation state without adding per-second timer work. */
export function useOfflineSyncPresentation(scope: JournalScope | null) {
  const owner = scope?.ownerId, backend = scope?.backendId;
  const stable = useMemo(() => isJournalUuid(owner) && backend ? { ownerId: owner, backendId: backend } : null, [owner, backend]);
  const subscribe = useCallback((listener: () => void) => offlineSyncPresentation.subscribe(stable, listener), [stable]);
  const snapshot = useCallback(() => offlineSyncPresentation.snapshot(stable), [stable]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
