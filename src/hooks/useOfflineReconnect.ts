import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from "react";

const RETRY_INTERVAL_MS = 5000;
const MAX_RETRY_SCOPES = 32;
type Attempt = { started: number; flight: Promise<void> | null };
// The two offline presentations share a retry budget, including when one
// replaces the other. This coordinates taps only; Auth owns reconnection.
const attempts = new Map<string, Attempt>();
const listeners = new Set<() => void>();
let revision = 0, lastClock = 0;
const now = () => {
  const value = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  lastClock = Math.max(lastClock, value);
  return lastClock;
};
const changed = () => { revision++; for (const notify of listeners) notify(); };
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
const snapshot = () => revision;
const bucketFor = (scope: string) => {
  try {
    const parts: unknown = JSON.parse(scope);
    if (Array.isArray(parts) && parts.length >= 2 && parts.slice(0, 2).every(part => typeof part === "string" && part.length > 0))
      return JSON.stringify(parts.slice(0, 2));
  } catch { /* A caller's opaque scope still gets a shared tap budget. */ }
  return scope;
};

export function useOfflineReconnect({ scope, active, blocked = false, reconnect }: {
  scope: string | null; active: boolean; blocked?: boolean; reconnect(): Promise<void>;
}) {
  const current = useRef({ scope, active, blocked, reconnect });
  useLayoutEffect(() => {
    current.current = { scope, active, blocked, reconnect };
    return () => { current.current = { ...current.current, active: false }; };
  }, [scope, active, blocked, reconnect]);
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const attempt = scope ? attempts.get(bucketFor(scope)) : undefined;
  const checking = !!attempt?.flight;
  const disabled = !scope || !active || blocked || checking || !!attempt && now() - attempt.started < RETRY_INTERVAL_MS
    || !attempt && attempts.size >= MAX_RETRY_SCOPES;
  const retry = useCallback(async () => {
    const view = current.current;
    if (!scope || scope !== view.scope || !view.active || view.blocked) return;
    const bucket = bucketFor(scope), previous = attempts.get(bucket), started = now();
    if (previous && (previous.flight || started - previous.started < RETRY_INTERVAL_MS)) return;
    // Do not accumulate unbounded owner keys if an injected callback never
    // settles. Never discard its in-flight guard to make another request.
    if (!previous && attempts.size >= MAX_RETRY_SCOPES) return;
    const attempt: Attempt = { started, flight: null };
    attempts.set(bucket, attempt);
    const request = Promise.resolve().then(async () => {
      // A queued tap cannot dispatch from an outgoing surface or other account.
      if (current.current.scope !== scope || !current.current.active || current.current.blocked) return;
      await current.current.reconnect();
    }).catch(() => {
      // A disconnected phone is expected here. Keep saved work and its retry
      // control calm; only existing recovery logic decides actionable errors.
    });
    attempt.flight = request;
    changed();
    setTimeout(() => {
      if (attempts.get(bucket) === attempt) {
        if (!attempt.flight) attempts.delete(bucket);
        changed();
      }
    }, RETRY_INTERVAL_MS);
    await request;
    if (attempts.get(bucket) === attempt) {
      attempt.flight = null;
      if (now() - started >= RETRY_INTERVAL_MS) attempts.delete(bucket);
      changed();
    }
  }, [scope]);
  return { checking, disabled, retry };
}
