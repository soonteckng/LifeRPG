// Midnight blue-black with cool greys. Each colour has one job everywhere:
// purple for the main buttons and the active tab, teal for progress and
// success (rings, bars, "Protected"), amber only for streaks, levels and the
// paused state. Small links and icons stay a quiet near-white.
export const colors = {
  background: "#090C14",
  surface: "#131826",
  surfaceRaised: "#161C2B",
  // Cards inside sheets sit above the raised sheet, never below it.
  sheetCard: "#1E2436",
  focusSurface: "#131826",
  focusBorder: "rgba(160,172,214,0.12)",
  protection: "#2DD4A7",
  text: "#F5F7FF",
  neutral: "#D6DAE8",
  secondary: "#A3ABC2",
  muted: "#9199B1",
  // Chevrons and quiet glyphs only; too dim for reading text.
  tertiary: "#5F6782",
  accent: "#E6E9F5",
  accentFill: "#7C3AED",
  accentSoft: "rgba(160,172,214,0.14)",
  primary: "#7C3AED",
  primaryText: "#FFFFFF",
  // Progress that is still filling: goal rings, timers and bars.
  progress: "#2DD4A7",
  selection: "#2A3149",
  success: "#34D399",
  level: "#FBBF24",
  levelSoft: "rgba(251,191,36,0.16)",
  streak: "#FFB020",
  line: "rgba(160,172,214,0.10)",
  border: "rgba(160,172,214,0.16)",
  glass: "rgba(19,24,38,0.95)",
  glassTint: "rgba(19,24,38,0.8)",
  danger: "#FF6B6B",
} as const;

// The guide is a distinct instruction layer above the ordinary app surfaces.
export const guideColors = {
  surface: "#FFF4DC",
  text: "#382A1B",
  secondary: "#64503A",
  action: "#F5B84B",
  tag: "rgba(245,184,75,0.22)",
  line: "rgba(56,42,27,0.22)",
  scrim: "rgba(0,0,0,0.80)",
  overviewScrim: "rgba(3,6,12,0.12)",
  outline: "rgba(255,255,255,0.38)",
} as const;

// One corner per level, so cards, tiles and rows read as one family.
export const radius = { card: 24, tile: 20, row: 16, sheet: 32 } as const;

// Every card, tile and grouped list shares this thin edge, on pages and in
// sheets alike, so surfaces read as one family.
export const edge = { borderWidth: 1, borderColor: "rgba(160,172,214,0.12)" } as const;
