// Space to leave at the end of a page's scroll for what floats at the bottom.
// There is no tab bar since Round 84, so an empty dock is only the safe area
// (plus the dock's small top padding); the session banner adds its own height.
// Round 86: the old pill height is no longer reserved, which left a white gap
// you could scroll into on every page.
export function floatingTabInset(_pillHeight: number, safeBottom: number, timer: {
  hasOpenSession?: boolean;
  sessionSummary?: unknown;
  summaryViewed?: boolean;
}) {
  const bannerVisible = timer.hasOpenSession || (timer.sessionSummary && !timer.summaryViewed);
  return 10 + (bannerVisible ? 60 + Math.max(safeBottom, 12) : safeBottom);
}
