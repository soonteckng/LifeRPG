export interface CloudConnectionScope { backendId: string; ownerId: string; admissionEpoch: number }
interface RequestScope extends CloudConnectionScope { revision: number }
const failureListeners = new Set<(scope: CloudConnectionScope) => void>();
let scope: RequestScope | null = null;
let revision = 0;

/** A connection hint is never account proof. Every admitted cloud epoch gets
 * its own request scope so a delayed old failure cannot downgrade a new one. */
export function setCloudConnectionScope(next: CloudConnectionScope | null) {
  scope = next ? { ...next, revision: ++revision } : null;
}
export function subscribeCloudConnectionFailure(listener: (scope: CloudConnectionScope) => void) {
  failureListeners.add(listener);
  return () => { failureListeners.delete(listener); };
}

/** Observe the existing SDK requests; this sends no extra requests and never
 * retains their URLs, headers, credentials or response bodies. */
export function connectivityAwareFetch(backendId: string, fetcher: typeof fetch): typeof fetch {
  let requestNumber = 0, latestReachableRequest = 0;
  return async (input, init) => {
    const captured = scope?.backendId === backendId ? scope : null;
    const request = ++requestNumber;
    const failed = () => {
      if (!captured || scope !== captured || request < latestReachableRequest) return;
      for (const listener of failureListeners) {
        try { listener({ backendId: captured.backendId, ownerId: captured.ownerId, admissionEpoch: captured.admissionEpoch }); }
        catch { /* Presentation/admission observers never change HTTP results. */ }
      }
    };
    try {
      const response = await fetcher(input, init);
      if ([502, 503, 504].includes(response.status)) failed();
      else latestReachableRequest = Math.max(latestReachableRequest, request);
      return response;
    } catch (error) {
      const signal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : null);
      // Aborting a screen's stale read is intentional, not evidence of outage.
      if (!signal?.aborted && (error as { name?: string })?.name === "TypeError") failed();
      throw error;
    }
  };
}
