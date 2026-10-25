/** Presentation only. This never starts, completes or credits a session. */
export const RETURN_TO_CAMP_MS = 1800;
let active: string | null = null;
const done = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => { for (const listener of [...listeners]) listener(); };
function remember(key: string) {
  done.add(key);
  if (done.size > 64) done.delete(done.values().next().value!);
}
export const sessionReturnKey = (scope: string, sessionId: string | null | undefined) => sessionId ? JSON.stringify([scope, sessionId]) : null;
export const sessionReturn = {
  snapshot: () => active,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  completed: (key: string) => done.has(key),
  begin(key: string) {
    if (done.has(key)) return false;
    if (active === key) return true;
    if (active) remember(active);
    active = key; notify(); return true;
  },
  finish(key: string) {
    if (active !== key) return;
    remember(key); active = null; notify();
  },
};

/**
 * The return screen the session screen is showing right now (its id), so the
 * reward pop-ups never show the same one again on top, such as over Outfits
 * opened from it.
 */
let hosted: string | null = null;
const hostListeners = new Set<() => void>();
export const sessionRevealHost = {
  snapshot: () => hosted,
  subscribe(listener: () => void) { hostListeners.add(listener); return () => { hostListeners.delete(listener); }; },
  /** Returns the release. */
  hold(id: string) {
    hosted = id; for (const l of [...hostListeners]) l();
    return () => { if (hosted !== id) return; hosted = null; for (const l of [...hostListeners]) l(); };
  },
};
