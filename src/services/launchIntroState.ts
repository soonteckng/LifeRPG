/**
 * Whether the launch intro (the logo while the app opens) is still showing.
 * Popups such as the session result wait for it, so nothing slides over the
 * logo before the app has finished opening. Without an intro it is done.
 */
let showing = false;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of [...listeners]) listener(); };

export const launchIntroState = {
  /** Called while the intro first renders, before anything under it renders. */
  begin() { if (!showing) { showing = true; notify(); } },
  finish() { if (showing) { showing = false; notify(); } },
  isDone: () => !showing,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
