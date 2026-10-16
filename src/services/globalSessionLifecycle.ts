export interface SessionResultDismissal {
  ownerId: string;
  scope: string;
  sessionId: string | null;
}

/** Presentation only. A network acknowledgement never dismisses a result. */
export function createGlobalSessionLifecycle() {
  const listeners = new Set<(result: Readonly<SessionResultDismissal>) => void>();
  return {
    subscribe(listener: (result: Readonly<SessionResultDismissal>) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dismissResult(result: SessionResultDismissal) {
      const dismissed = Object.freeze({ ...result });
      for (const listener of listeners) {
        // Navigation is optional presentation work. It cannot prevent the
        // caller acknowledging durable work or releasing other surfaces.
        try { listener(dismissed); } catch { /* Keep independent listeners usable. */ }
      }
    },
  };
}

export const globalSessionLifecycle = createGlobalSessionLifecycle();
