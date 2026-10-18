// BottomTabBar reports the pill height; its transparent wrapper also holds the
// safe area and optional session banner. Reserve all of that at scroll end.
export function floatingTabInset(pillHeight: number, safeBottom: number, timer: {
  hasOpenSession?: boolean;
  sessionSummary?: unknown;
  summaryViewed?: boolean;
}) {
  const bannerVisible = timer.hasOpenSession || (timer.sessionSummary && !timer.summaryViewed);
  return pillHeight + Math.max(safeBottom, 12) + 10 + (bannerVisible ? 70 : 0);
}
