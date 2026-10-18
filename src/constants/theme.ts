// True black with iOS-style greys; one mint accent carries every action.
export const colors = {
  background: "#000000",
  surface: "#1C1C1E",
  surfaceRaised: "#1C1C1E",
  // Cards inside sheets sit above the raised sheet, never below it.
  sheetCard: "#2C2C2E",
  focusSurface: "#1C1C1E",
  focusBorder: "rgba(255,255,255,0.08)",
  protection: "#63E6BE",
  text: "#FFFFFF",
  neutral: "#D1D1D6",
  secondary: "#98989F",
  muted: "#8E8E93",
  // Chevrons and quiet glyphs only; too dim for reading text.
  tertiary: "#636366",
  accent: "#63E6BE",
  accentFill: "#63E6BE",
  accentSoft: "rgba(99,230,190,0.14)",
  primary: "#63E6BE",
  primaryText: "#00140D",
  selection: "#3A3A3C",
  success: "#30D158",
  level: "#FFD60A",
  levelSoft: "rgba(255,214,10,0.16)",
  streak: "#FF9F0A",
  line: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.12)",
  glass: "rgba(28,28,30,0.95)",
  glassTint: "rgba(28,28,30,0.8)",
  danger: "#FF6961",
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

// Cards you tap on their own (and sheet panels) share this thin edge. Lists
// of rows sit flat, without it, so a page isn't a stack of identical boxes.
export const edge = { borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" } as const;
