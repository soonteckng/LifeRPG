// A bounded entrance window followed by an idle callback. InteractionManager
// is deprecated and is only a setImmediate stub in the installed RN version.
export function afterTransition(work: () => void): () => void {
  let cancelled = false;
  if (typeof globalThis.requestIdleCallback === "function") {
    let idle: number | null = null;
    const entrance = setTimeout(() => {
      if (cancelled) return;
      idle = globalThis.requestIdleCallback(() => { idle = null; if (!cancelled) work(); }, { timeout: 500 });
    }, 260);
    return () => {
      cancelled = true; clearTimeout(entrance);
      if (idle !== null && typeof globalThis.cancelIdleCallback === "function") globalThis.cancelIdleCallback(idle);
    };
  }
  // Older runtimes/test hosts still yield a turn and retain cancellation.
  void Promise.resolve().then(() => { if (!cancelled) work(); });
  return () => { cancelled = true; };
}
