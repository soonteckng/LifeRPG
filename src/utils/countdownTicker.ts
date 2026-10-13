/** Re-arm from the current deadline, so late frames do not shift later seconds. */
export function createCountdownTicker(tick: () => void, delay: () => number) {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const reschedule = () => {
    if (!active) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!active) return;
      tick();
      reschedule();
    }, delay());
  };
  reschedule();
  return { reschedule, dispose() {
    active = false;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  } };
}
