// awhile: warm paper, aubergine ink and soft lilac. Each colour has one job:
// aubergine for text and the main buttons, lilac only for the one card that
// matters on a screen (the next thing, a focus card), and calm earthy tones for
// progress, protection, streaks and warnings. Lists stay on plain paper.
export const colors = {
  background: "#F6F2EC",
  // Quiet cards on the page.
  surface: "#EDE6DD",
  // Sheets and floating panels sit a little lighter than the page.
  surfaceRaised: "#FBF8F4",
  // Cards inside sheets sit on the lighter sheet, a step darker.
  sheetCard: "#F0EAE2",
  // The one lilac card: what's next, or the session you're in.
  focusSurface: "#EADFF0",
  focusBorder: "rgba(59,39,55,0.10)",
  // The warm card: a break, and the time you just finished.
  warmSurface: "#F4DFD3",
  warmText: "#6E4434",
  warmLine: "rgba(110,68,52,0.16)",
  protection: "#3A6853",
  text: "#2A2028",
  neutral: "#3E3340",
  secondary: "#5E5360",
  muted: "#665A67",
  // Chevrons and quiet glyphs only; too light for reading text.
  tertiary: "#9A8E98",
  // Small links and icons.
  accent: "#3B2737",
  accentFill: "#3B2737",
  accentSoft: "rgba(59,39,55,0.08)",
  primary: "#3B2737",
  primaryText: "#F6F2EC",
  // Progress that is still filling: goal rings, timers and bars.
  progress: "#6E4F7A",
  // The empty part of a bar or ring.
  track: "#DDD3C8",
  selection: "#E4D8EA",
  success: "#36694D",
  level: "#8A5110",
  levelSoft: "rgba(138,81,16,0.12)",
  streak: "#934C14",
  line: "rgba(42,32,40,0.09)",
  border: "rgba(42,32,40,0.15)",
  glass: "rgba(251,248,244,0.97)",
  glassTint: "rgba(251,248,244,0.88)",
  danger: "#A8322A",
  dangerSoft: "rgba(168,50,42,0.10)",
  // Behind sheets and dialogs.
  scrim: "rgba(42,32,40,0.45)",
  // Text fields.
  inputFill: "rgba(42,32,40,0.04)",
} as const;

// Text and rings drawn over the session's night scene, which stays dark
// whatever the app's own colours are.
export const sceneInk = {
  text: "#F6F2EC",
  secondary: "rgba(246,242,236,0.74)",
  track: "rgba(246,242,236,0.14)",
  progress: "#D9C2E6",
  paused: "#F0B98A",
  link: "#E6D3EA",
  error: "#FFB4AE",
} as const;

// The guide is a distinct instruction layer above the ordinary app surfaces:
// an aubergine card, so it never blends into the paper underneath.
export const guideColors = {
  surface: "#3B2737",
  text: "#F6F2EC",
  secondary: "#E3D6E6",
  action: "#EADFF0",
  tag: "rgba(234,223,240,0.18)",
  line: "rgba(246,242,236,0.22)",
  scrim: "rgba(42,32,40,0.62)",
  overviewScrim: "rgba(42,32,40,0.08)",
  outline: "rgba(59,39,55,0.55)",
} as const;

// Newsreader for titles and big numbers; Inter for everything else. AppText
// picks the right file for each weight.
export const fonts = {
  display: "Newsreader_400Regular",
  displayMedium: "Newsreader_500Medium",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
} as const;

// One corner per level, so cards, tiles and rows read as one family.
export const radius = { card: 24, tile: 20, row: 16, sheet: 32 } as const;

// Every card, tile and grouped list shares this thin edge, on pages and in
// sheets alike, so surfaces read as one family.
export const edge = { borderWidth: 1, borderColor: "rgba(42,32,40,0.07)" } as const;
