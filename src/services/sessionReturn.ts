/** Presentation only. This never starts, completes or credits a session. */
export const RETURN_TO_CAMP_MS = 1800;
type ReturnState = { readonly active: string | null; readonly completed: readonly string[] };
let state: ReturnState = { active: null, completed: [] };
const listeners = new Set<() => void>();
const notify = () => { for (const listener of [...listeners]) listener(); };
const remember = (key: string) => [...state.completed.filter(value => value !== key), key].slice(-64);
export const sessionReturnKey = (scope: string, sessionId: string | null | undefined) => sessionId ? JSON.stringify([scope, sessionId]) : null;
export const sessionReturn = {
  snapshot: () => state.active,
  // Completion is reactive state too. Reading a mutable Set separately lets
  // React Compiler retain an old answer after the active walk finishes.
  stateSnapshot: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  completed: (key: string) => state.completed.includes(key),
  begin(key: string) {
    if (state.completed.includes(key)) return false;
    if (state.active === key) return true;
    state = { active: key, completed: state.active ? remember(state.active) : state.completed };
    notify(); return true;
  },
  finish(key: string) {
    if (state.active !== key) return;
    state = { active: null, completed: remember(key) }; notify();
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
