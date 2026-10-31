// awhile, after dark (Round 87): Soon Teck found the paper too bright, so the
// whole app is dark. Deep aubergine for the page, lifted plum cards with a
// faint lilac edge, light warm text, and lilac for the main button and the one
// card that matters on a screen. Earthy tones stay for progress, protection,
// streaks and warnings, lifted so they read on the dark.
export const colors = {
  background: "#1C1519",
  // Quiet cards on the page.
  surface: "#2A2027",
  // Sheets and floating panels sit a little lighter than the page.
  surfaceRaised: "#261D23",
  // Cards inside sheets sit on the sheet, a step lighter.
  sheetCard: "#332830",
  // The one lilac card: what's next, or the session you're in.
  focusSurface: "#3B2D44",
  focusBorder: "rgba(217,194,230,0.16)",
  // The break: the arch turns warm while you rest.
  warmSurface: "#47302C",
  protection: "#9DD3B4",
  text: "#F4EDF1",
  neutral: "#E3D7DF",
  secondary: "#BFB1BC",
  muted: "#AE9FAB",
  // Chevrons and quiet glyphs only; too dim for reading text.
  tertiary: "#7F717C",
  // Small links and icons.
  accent: "#E2CDEA",
  accentFill: "#D9C2E6",
  accentSoft: "rgba(217,194,230,0.12)",
  // The main buttons are lilac with dark ink.
  primary: "#D9C2E6",
  primaryText: "#22191F",
  // Progress that is still filling: goal bars and timers.
  progress: "#CDB0DE",
  // The empty part of a bar or ring.
  track: "rgba(244,237,241,0.12)",
  selection: "#43354B",
  success: "#9DD3B4",
  level: "#E9B776",
  levelSoft: "rgba(233,183,118,0.14)",
  streak: "#F2AE7A",
  line: "rgba(244,237,241,0.08)",
  border: "rgba(244,237,241,0.14)",
  glass: "rgba(38,29,35,0.97)",
  glassTint: "rgba(38,29,35,0.88)",
  danger: "#F3A69D",
  dangerSoft: "rgba(243,166,157,0.14)",
  // Behind sheets and dialogs.
  scrim: "rgba(0,0,0,0.6)",
  // Text fields.
  inputFill: "rgba(244,237,241,0.06)",
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
// a lilac card with dark ink, so it never blends into the dark page.
export const guideColors = {
  surface: "#D9C2E6",
  text: "#22191F",
  secondary: "#4A3A48",
  action: "#22191F",
  // Words on the guide's dark button, and the ring around what it points at.
  actionText: "#F4EDF1",
  ring: "#D9C2E6",
  tag: "rgba(34,25,31,0.12)",
  line: "rgba(34,25,31,0.18)",
  scrim: "rgba(0,0,0,0.62)",
  overviewScrim: "rgba(0,0,0,0.12)",
  outline: "rgba(217,194,230,0.6)",
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
export const edge = { borderWidth: 1, borderColor: "rgba(244,237,241,0.07)" } as const;
