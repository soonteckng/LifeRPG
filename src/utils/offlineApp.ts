type OfflineTimer = { offlineAvailable: boolean; clientReported: boolean; restoreError: boolean; awaitingStart: boolean;
  interactionKind: "start" | "pause" | "resume" | null; endingSession: boolean };

/**
 * Offline, the whole app stays usable while sessions can be timed on this
 * phone. Only work that has to be checked with the server first (a Start or
 * End whose reply never arrived, or a journal that could not be read) needs
 * the separate recovery screen.
 */
export function offlineAppAvailable(timer: OfflineTimer) {
  return !!(timer.offlineAvailable || timer.clientReported) && !timer.restoreError
    && !(timer.awaitingStart && timer.interactionKind !== "start")
    && !(timer.endingSession && !timer.clientReported);
}
