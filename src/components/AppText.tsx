import { forwardRef } from "react";
import { Platform, StyleSheet, Text as NativeText, TextInput as NativeInput, type TextProps, type TextInputProps } from "react-native";

// San Francisco is supplied by iOS. Android retains its native system face;
// no Apple-only font asset is bundled or silently substituted.
const systemFont = Platform?.OS === "ios" ? "System" : undefined;
function flatten(style: TextProps["style"]): Record<string, unknown> {
  if (StyleSheet?.flatten) return { ...StyleSheet.flatten(style) };
  // Native primitives are mocked in interaction tests.
  if (Array.isArray(style)) return Object.assign({}, ...style.map(item => flatten(item as TextProps["style"])));
  return typeof style === "object" && style ? style as Record<string, unknown> : {};
}
export const Text = forwardRef<NativeText, TextProps>(function AppText({ style, ...props }, ref) {
  const applied = flatten(style);
  const size = typeof applied.fontSize === "number" ? applied.fontSize : 16;
  const readableSize = props.allowFontScaling === false ? size : Math.max(13, size);
  const lineHeight = typeof applied.lineHeight === "number" && readableSize > size ? Math.max(applied.lineHeight, Math.ceil(readableSize * 1.35)) : undefined;
  return <NativeText {...props} ref={ref} style={[{ fontFamily: systemFont, fontSize: 16 }, style,
    { fontSize: readableSize, ...(lineHeight ? { lineHeight } : {}) }]} />;
});
export const TextInput = forwardRef<NativeInput, TextInputProps>(function AppTextInput({ style, ...props }, ref) {
  return <NativeInput {...props} ref={ref} style={[{ fontFamily: systemFont, fontSize: 17 }, style]} />;
});

