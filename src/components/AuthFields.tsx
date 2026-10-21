import { forwardRef, type ComponentRef } from "react";
import { ActivityIndicator, Platform, View, type LayoutChangeEvent, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text, TextInput } from "./AppText";
import PasswordInput from "./PasswordInput";
import { colors } from "../constants/theme";
import { p } from "./PersonalUI";

// The pieces every sign-in screen shares, so they look and behave the same.
const field = (active: boolean, error: boolean) => [p.input, { backgroundColor: colors.surface,
  borderColor: error ? colors.danger : active ? colors.accent : colors.border, borderWidth: 1, minHeight: 56, paddingHorizontal: 16, fontSize: 17 }];
const labelStyle = { color: colors.neutral, fontSize: 14, lineHeight: 20, fontWeight: "500" as const };

export const AuthTextField = forwardRef<ComponentRef<typeof TextInput>, TextInputProps & {
  label: string; active: boolean; error?: string; onFieldLayout?: (event: LayoutChangeEvent) => void;
}>(function AuthTextField({ label, active, error, onFieldLayout, ...props }, ref) {
  return <View onLayout={onFieldLayout} style={{ gap: 8 }}>
    <Text style={labelStyle}>{label}</Text>
    <TextInput ref={ref} accessibilityLabel={label} placeholderTextColor={colors.muted} {...props} style={field(active, !!error)} />
    {!!error && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
  </View>;
});

export function AuthPasswordField({ label, active, error, onFieldLayout, ...props }: TextInputProps & {
  label: string; active: boolean; error?: string; onFieldLayout?: (event: LayoutChangeEvent) => void;
}) {
  return <View onLayout={onFieldLayout} style={{ gap: 8 }}>
    <Text style={labelStyle}>{label}</Text>
    <PasswordInput accessibilityLabel={label} {...props} style={field(active, !!error)} error={error} />
  </View>;
}

export function AuthDivider({ label = "or" }: { label?: string }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }} accessible={false} importantForAccessibility="no-hide-descendants">
    <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
    <Text style={{ color: colors.secondary, fontSize: 14, lineHeight: 20 }}>{label}</Text>
    <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
  </View>;
}

/** One quiet button for Google; shown only when Google sign-in is switched on. */
export function GoogleButton({ onPress, disabled = false, busy = false }: { onPress: () => void; disabled?: boolean; busy?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityLabel="Continue with Google"
    accessibilityState={{ disabled: disabled || busy, busy }} testID="google-sign-in"
    style={{ minHeight: 54, borderRadius: 27, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 18, opacity: disabled ? 0.45 : 1 }}>
    {busy ? <ActivityIndicator color={colors.text} /> : <Ionicons name="logo-google" size={20} color={colors.text} />}
    <Text style={{ color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" }}>{busy ? "Finishing with Google…" : "Continue with Google"}</Text>
  </Pressable>;
}

/** The 6-digit email code: one roomy box the phone can fill from the email. */
export function CodeInput({ value, onChange, onComplete, active, error, editable = true, onFocus, onBlur, onFieldLayout }: {
  value: string; onChange: (code: string) => void; onComplete?: (code: string) => void; active: boolean; error?: string; editable?: boolean;
  onFocus?: () => void; onBlur?: () => void; onFieldLayout?: (event: LayoutChangeEvent) => void;
}) {
  return <View onLayout={onFieldLayout} style={{ gap: 8 }}>
    <Text style={labelStyle}>6-digit code</Text>
    <TextInput accessibilityLabel="6-digit code" value={value} editable={editable} onFocus={onFocus} onBlur={onBlur}
      onChangeText={text => {
        const digits = text.replace(/\D/g, "").slice(0, 6);
        onChange(digits);
        if (digits.length === 6) onComplete?.(digits);
      }}
      keyboardType="number-pad" inputMode="numeric" maxLength={6} textContentType="oneTimeCode"
      autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"} autoCorrect={false}
      placeholder="000000" placeholderTextColor={colors.muted} returnKeyType="done"
      style={[...field(active, !!error), { fontSize: 28, letterSpacing: 10, textAlign: "center", fontVariant: ["tabular-nums"], minHeight: 64 }]} />
    {!!error && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
  </View>;
}

export function AuthLink({ label, emphasis, onPress, disabled = false, align = "center", testID }: {
  label: string; emphasis?: string; onPress: () => void; disabled?: boolean; align?: "center" | "end"; testID?: string;
}) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={emphasis ? `${label}${emphasis}` : label}
    accessibilityState={{ disabled }} testID={testID}
    style={{ minHeight: 44, justifyContent: "center", alignSelf: align === "end" ? "flex-end" : "center", paddingVertical: 8, opacity: disabled ? 0.45 : 1 }}>
    <Text style={{ color: emphasis ? colors.secondary : colors.accent, fontSize: 15, lineHeight: 20, textAlign: "center" }}>
      {label}{!!emphasis && <Text style={{ color: colors.accent, fontSize: 15, fontWeight: "500" }}>{emphasis}</Text>}
    </Text>
  </Pressable>;
}
