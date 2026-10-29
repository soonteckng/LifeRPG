import { useRef, useState } from "react";
import { ActivityIndicator, Keyboard, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import { useAuth } from "../context/AuthContext";
import { useAuthSettings } from "../services/authSettings";
import { signInMessage } from "../utils/authCallback";
import { validEmail } from "../utils/passwordRecovery";
import AuthFormFrame from "./AuthFormFrame";
import { AuthDivider, AuthLink, AuthPasswordField, AuthTextField, GoogleButton } from "./AuthFields";
import { PersonalButton, p } from "./PersonalUI";
import { colors } from "../constants/theme";

/**
 * Signing back in on a phone that has used the app before: an email or the
 * username picked in the intro, plus the password. Or Google, when it is on.
 * An email that was never confirmed can ask for a new code from here.
 */
export default function SignInScreen({ identifier, password, onIdentifier, onPassword, onForgot, onCreate, onConfirm }: {
  identifier: string; password: string; onIdentifier: (value: string) => void; onPassword: (value: string) => void;
  onForgot: () => void; onCreate: () => void; onConfirm: () => void;
}) {
  const { signIn, signInWithGoogle, googleStatus, resendSignUpCode } = useAuth();
  const settings = useAuthSettings();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [fieldError, setFieldError] = useState<"identifier" | "password" | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false), [sending, setSending] = useState(false);
  const lock = useRef(false);
  const google = googleStatus === "finishing";
  // A Google sign-in that came back cancelled or failed explains itself once.
  const [seenGoogle, setSeenGoogle] = useState(googleStatus);
  if (seenGoogle !== googleStatus) {
    setSeenGoogle(googleStatus);
    if (googleStatus === "failed" || googleStatus === "cancelled") {
      setFieldError(null); setError(signInMessage({ code: googleStatus === "failed" ? "google_failed" : "google_cancelled" }));
    }
  }
  const submit = async (focus: (field: string) => void) => {
    if (lock.current || google) return;
    setError(""); setFieldError(null); setUnconfirmed(false);
    const name = identifier.trim();
    if (!name || !password) {
      const field = !name ? "identifier" : "password";
      focus(field); setFieldError(field); setError(!name ? "Enter your email or username." : "Enter your password.");
      return;
    }
    if (name.includes("@") && !validEmail(name)) {
      focus("identifier"); setFieldError("identifier"); setError("Check your email address, including the part after @.");
      return;
    }
    lock.current = true; setBusy(true);
    try {
      const result = await signIn(name, password);
      if (result.error) throw result.error;
      Keyboard.dismiss();
    } catch (cause) {
      focus("submit"); setError(signInMessage(cause));
      setUnconfirmed((cause as { code?: string })?.code === "email_not_confirmed" && validEmail(name));
    }
    finally { lock.current = false; setBusy(false); }
  };
  // The right password on an email that was never confirmed: a new code, then
  // the same code screen the intro uses.
  const sendCode = async (focus: (field: string) => void) => {
    if (lock.current || google) return;
    lock.current = true; setSending(true); setError("");
    try {
      const result = await resendSignUpCode(identifier.trim());
      if (result.error) throw result.error;
      Keyboard.dismiss(); onConfirm();
    } catch (cause) { focus("submit"); setError(signInMessage(cause)); }
    finally { lock.current = false; setSending(false); }
  };
  const working = busy || sending;
  const withGoogle = async () => {
    if (lock.current) return;
    setError(""); setFieldError(null); Keyboard.dismiss();
    const result = await signInWithGoogle();
    if (result.error) setError(signInMessage({ code: "google_failed" }));
  };
  return <AuthFormFrame transitionKey="sign-in" title="Welcome back" description="Sign in to pick up where you left off."
    hero={<View style={s.mark} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><Ionicons name="timer-outline" size={52} color={colors.progress} /></View>}>
    {({ active, focus, blur, layout }) => <>
      <AuthTextField label="Email or username" active={active === "identifier"} onFieldLayout={event => layout("identifier", event)}
        value={identifier} onChangeText={value => {
          onIdentifier(value);
          if (fieldError === "identifier" || unconfirmed) { setFieldError(null); setError(""); setUnconfirmed(false); }
        }}
        placeholder="you@example.com or your name" autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username"
        editable={!working && !google} onFocus={() => focus("identifier")} onBlur={() => blur("identifier")} returnKeyType="next"
        error={fieldError === "identifier" ? error : undefined} />
      <AuthPasswordField label="Password" active={active === "password"} onFieldLayout={event => layout("password", event)}
        value={password} onChangeText={value => { onPassword(value); if (fieldError === "password") { setFieldError(null); setError(""); } }}
        placeholder="Your password" autoComplete="current-password" textContentType="password" editable={!working && !google}
        onFocus={() => focus("password")} onBlur={() => blur("password")} returnKeyType="done" submitBehavior="submit"
        onSubmitEditing={() => void submit(focus)} error={fieldError === "password" ? error : undefined} />
      <AuthLink label="Forgot password?" onPress={() => { Keyboard.dismiss(); onForgot(); }} disabled={working || google} align="end" />
      <View onLayout={event => layout("submit", event)} style={{ gap: 12 }}>
        {!!error && !fieldError && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
        {unconfirmed && <PersonalButton title={sending ? "Sending…" : "Send a new code"} disabled={working || google} onPress={() => void sendCode(focus)} />}
        <PersonalButton secondary={unconfirmed} title={busy ? "Signing in…" : "Sign in"} disabled={working || google} onPress={() => void submit(focus)} />
      </View>
      {settings.google && <><AuthDivider /><GoogleButton onPress={() => void withGoogle()} disabled={working} busy={google} /></>}
      {google && !settings.google && <View style={{ alignItems: "center", gap: 8 }}><ActivityIndicator color={colors.accent} /><Text style={p.body}>Finishing with Google…</Text></View>}
      <AuthLink label="New here? " emphasis="Create an account" onPress={() => { Keyboard.dismiss(); onCreate(); }} disabled={working || google} />
    </>}
  </AuthFormFrame>;
}

// A calm mark above the form: the timer the whole app is about.
const s = {
  mark: { width: 112, height: 112, borderRadius: 56, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
} as const;
