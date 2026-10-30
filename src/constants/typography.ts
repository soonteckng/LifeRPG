import type { TextStyle } from "react-native";
import { colors } from "./theme";

// Newsreader ("display") for titles and big numbers, Inter for the rest.
// AppText maps each family and weight to its bundled font file.
export const type = {
  hero: { fontSize: 50, lineHeight: 58, fontFamily: "display", fontWeight: "400", fontVariant: ["tabular-nums"], color: colors.text, letterSpacing: -0.8 },
  pageTitle: { fontSize: 32, lineHeight: 38, fontFamily: "display", fontWeight: "400", color: colors.text, letterSpacing: -0.6 },
  section: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.secondary },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400", color: colors.text },
  secondary: { fontSize: 14, lineHeight: 20, fontWeight: "400", color: colors.secondary },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.secondary },
  // Small caps over a group of controls, as in iOS grouped lists.
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase", color: colors.secondary },
} satisfies Record<string, TextStyle>;

export const spacing = { screen: 20, section: 32, inside: 12, row: 52 } as const;
