// Focus, foreground and sheet-open events may request the same data together.
export function singleFlight<T>(operation: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    if (!pending) pending = operation().finally(() => { pending = undefined; });
    return pending;
  };
}
