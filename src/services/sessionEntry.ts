/** Explicit entry requests are presentation-only; they never start a timer. */
type EntryRequest = { readonly sequence: number; readonly sessionId: string | null; readonly pendingScope: string | null };
let current: EntryRequest = { sequence: 0, sessionId: null, pendingScope: null };
let consumed = 0;
const listeners = new Set<() => void>();
export const sessionEntry = {
  snapshot: () => current,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  request(sessionId: string | null | undefined, pendingScope?: string) {
    // A validated widget can enter before its new timer has a client id. That
    // one request belongs to the exact account admission, never another login.
    if (!sessionId && !pendingScope) return;
    current = { sequence: current.sequence + 1, sessionId: sessionId ?? null, pendingScope: sessionId ? null : pendingScope! };
    for (const listener of [...listeners]) listener();
  },
  /** Called only from a focused screen's effect/callback, never during render. */
  take(request: EntryRequest, sessionId: string | null | undefined, presentationScope?: string) {
    if (request !== current || request.sequence <= consumed) return false;
    if (request.sessionId ? request.sessionId !== sessionId : !request.pendingScope || request.pendingScope !== presentationScope) return false;
    consumed = request.sequence; return true;
  },
};
