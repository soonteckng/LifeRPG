import type { TextStyle } from "react-native";
import { colors } from "./theme";

// Native system faces keep startup immediate and dynamic text supported.
export const type = {
  hero: { fontSize: 48, lineHeight: 56, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.text },
  pageTitle: { fontSize: 28, lineHeight: 34, fontWeight: "500", color: colors.text, letterSpacing: -0.6 },
  section: { fontSize: 14, lineHeight: 18, fontWeight: "500", color: colors.secondary },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400", color: colors.text },
  secondary: { fontSize: 14, lineHeight: 20, fontWeight: "400", color: colors.secondary },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.secondary },
} satisfies Record<string, TextStyle>;

export const spacing = { screen: 20, section: 32, inside: 12, row: 52 } as const;
