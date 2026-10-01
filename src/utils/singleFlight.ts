// Focus, foreground and sheet-open events may request the same data together.
export function singleFlight<T>(operation: () => Promise<T>): (fresh?: boolean) => Promise<T> {
  let pending: Promise<T> | undefined;
  const run = () => {
    const request = operation();
    const wrapped = request.finally(() => { if (pending === wrapped) pending = undefined; });
    pending = wrapped;
    return wrapped;
  };
  const runAfterPending = () => pending ?? run();
  return (fresh = false) => {
    if (fresh && pending) return pending.then(runAfterPending, runAfterPending);
    return pending ?? run();
  };
}
