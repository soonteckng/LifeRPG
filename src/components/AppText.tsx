import { forwardRef } from "react";
import { Platform, StyleSheet, Text as NativeText, TextInput as NativeInput, type TextProps, type TextInputProps } from "react-native";
import { fonts } from "../constants/theme";
import { fontState } from "../utils/fontState";

// Inter for reading and Newsreader for titles, both bundled with the app.
// Android can't pick a weight inside a custom family, so each weight names its
// own file. Until the fonts load (or if they fail), the phone's own font keeps
// the requested weight.
const systemFont = Platform?.OS === "ios" ? "System" : undefined;
export const DISPLAY = "display";
function flatten(style: TextProps["style"]): Record<string, unknown> {
  if (StyleSheet?.flatten) return { ...StyleSheet.flatten(style) };
  // Native primitives are mocked in interaction tests.
  if (Array.isArray(style)) return Object.assign({}, ...style.map(item => flatten(item as TextProps["style"])));
  return typeof style === "object" && style ? style as Record<string, unknown> : {};
}
function weightOf(value: unknown): number {
  if (value === "bold") return 700;
  const weight = Number(value);
  return Number.isFinite(weight) ? weight : 400;
}
/** The bundled font file for a family and weight, or null for the system font. */
export function fontFor(family: unknown, weight: unknown): { fontFamily: string | undefined; fontWeight?: "normal" } {
  const display = family === DISPLAY || family === fonts.display || family === fonts.displayMedium;
  if (!fontState.ready()) return { fontFamily: display ? (Platform?.OS === "ios" ? "Georgia" : "serif") : systemFont };
  const w = weightOf(weight);
  if (display) return { fontFamily: w >= 500 ? fonts.displayMedium : fonts.display, fontWeight: "normal" };
  if (family && family !== "System") return { fontFamily: family as string };
  return { fontFamily: w >= 700 ? fonts.bodyBold : w >= 600 ? fonts.bodySemiBold : w >= 500 ? fonts.bodyMedium : fonts.body, fontWeight: "normal" };
}
export const Text = forwardRef<NativeText, TextProps>(function AppText({ style, ...props }, ref) {
  const applied = flatten(style);
  const size = typeof applied.fontSize === "number" ? applied.fontSize : 16;
  const readableSize = props.allowFontScaling === false ? size : Math.max(13, size);
  const lineHeight = typeof applied.lineHeight === "number" && readableSize > size ? Math.max(applied.lineHeight, Math.ceil(readableSize * 1.35)) : undefined;
  return <NativeText {...props} ref={ref} style={[{ fontSize: 16 }, style,
    { ...fontFor(applied.fontFamily, applied.fontWeight), fontSize: readableSize, ...(lineHeight ? { lineHeight } : {}) }]} />;
});
export const TextInput = forwardRef<NativeInput, TextInputProps>(function AppTextInput({ style, ...props }, ref) {
  const applied = flatten(style);
  return <NativeInput {...props} ref={ref} style={[{ fontSize: 17 }, style, fontFor(applied.fontFamily, applied.fontWeight)]} />;
});
