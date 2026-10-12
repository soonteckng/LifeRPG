import Pressable from "./MotionPressable";
import { Text, TextInput } from "./AppText";
import { useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { PersonalButton, p } from "./PersonalUI";
import CharacterPortrait from "./CharacterPortrait";
import { colors } from "../constants/theme";
import PasswordInput from "./PasswordInput";
import RecoveryScreen from "./RecoveryScreen";
import AuthFormFrame from "./AuthFormFrame";
import type { AuthEntryMode } from "../services/authEntryPreference";

export default function AuthScreen({ initialMode = "sign-in" }: { initialMode?: AuthEntryMode }) {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [register, setRegister] = useState(initialMode === "sign-up"), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<"email" | "password" | null>(null);
  const [forgot, setForgot] = useState(false);
  const lock = useRef(false);
  const submit = async (focus: (field: string) => void) => {
    if (lock.current) return;
    setMessage(""); setError(""); setFieldError(null);
    if (!email.trim() || !password) {
      const field = !email.trim() ? "email" : "password";
      focus(field); setFieldError(field); setError("Enter your email and password.");
      return;
    }
    lock.current = true; setBusy(true);
    try {
      if (register) {
        const result = await signUp(email.trim(), password);
        if (result.error) throw result.error;
        if (result.needsEmailConfirmation) {
          Keyboard.dismiss();
          setMessage("If registration can be completed for this email, check your inbox for next steps. If you already have an account, sign in or use Forgot password.");
          setRegister(false); setPassword("");
        }
      } else {
        const result = await signIn(email.trim(), password);
        if (result.error) throw result.error;
      }
    } catch (err) {
      focus("submit");
      setError(err instanceof Error ? err.message : "Couldn’t connect. Please try again.");
    } finally { lock.current = false; setBusy(false); }
  };
  if (forgot) return <RecoveryScreen requestOnly onBack={() => setForgot(false)} />;
  return <AuthFormFrame transitionKey={register ? "sign-up" : "sign-in"}
    title={register ? "Create your account" : "Welcome back"}
    description={register ? "Choose something that matters. See your effort grow." : "Your next small step is waiting for you."}
    hero={<CharacterPortrait avatar="🌱" size={124} interactive={false} />}>
    {({ tight, active, focus, blur, layout }) => <>
      <View onLayout={event => layout("email", event)} style={{ gap: 8 }}>
        <Text style={{ color: colors.neutral, fontSize: 14, lineHeight: 20, fontWeight: "500" }}>Email</Text>
        <TextInput accessibilityLabel="Email" editable={!busy}
          style={[p.input, { backgroundColor: colors.surface, borderColor: fieldError === "email" ? colors.danger : active === "email" ? colors.accent : colors.border,
            borderWidth: 1, minHeight: 56, paddingHorizontal: 16, fontSize: 17 }]}
          placeholder="you@example.com" placeholderTextColor={colors.muted}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
          autoComplete="email" textContentType="emailAddress" value={email} onChangeText={setEmail}
          onFocus={() => focus("email")} onBlur={() => blur("email")} returnKeyType="next" />
        {fieldError === "email" && !!error && <Text style={p.error} accessibilityRole="alert">{error}</Text>}
      </View>
      <View onLayout={event => layout("password", event)} style={{ gap: 8 }}>
        <Text style={{ color: colors.neutral, fontSize: 14, lineHeight: 20, fontWeight: "500" }}>Password</Text>
        <PasswordInput accessibilityLabel="Password" editable={!busy}
          style={{ backgroundColor: colors.surface, borderColor: fieldError === "password" ? colors.danger : active === "password" ? colors.accent : colors.border,
            borderWidth: 1, minHeight: 56, paddingHorizontal: 16, fontSize: 17 }}
          placeholder={register ? "Create a password" : "Your password"}
          autoComplete={register ? "new-password" : "current-password"}
          textContentType={register ? "newPassword" : "password"}
          value={password} onChangeText={setPassword} onFocus={() => focus("password")} onBlur={() => blur("password")}
          returnKeyType="done" submitBehavior="submit" onSubmitEditing={() => void submit(focus)}
          error={fieldError === "password" ? error : undefined} />
      </View>
      {!register && <Pressable accessibilityRole="button" disabled={busy}
        onPress={() => { Keyboard.dismiss(); setForgot(true); }}
        style={{ alignSelf: "flex-end", paddingVertical: 6, minHeight: 36, justifyContent: "center" }}>
        <Text style={{ color: colors.accent, fontSize: 14, lineHeight: 20 }}>Forgot password?</Text>
      </Pressable>}
      <View onLayout={event => layout("submit", event)} style={{ gap: 12 }}>
        {!!error && !fieldError && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
        {!!message && <Text style={p.body} accessibilityRole="alert" accessibilityLiveRegion="polite">{message}</Text>}
        <PersonalButton title={busy ? "Please wait…" : register ? "Create account" : "Sign in"}
          disabled={busy} onPress={() => void submit(focus)} />
      </View>
      <Pressable disabled={busy} accessibilityRole="button"
        style={{ paddingVertical: tight ? 8 : 12, minHeight: 44, alignItems: "center", justifyContent: "center" }}
        onPress={() => {
          Keyboard.dismiss(); setRegister(current => !current); setError(""); setMessage(""); setFieldError(null);
        }}>
        <Text style={{ color: colors.secondary, fontSize: 15, lineHeight: 23, textAlign: "center" }}>
          {register ? "Already have an account? " : "New here? "}
          <Text style={{ color: colors.accent, fontSize: 15, fontWeight: "500" }}>{register ? "Sign in" : "Create an account"}</Text>
        </Text>
      </Pressable>
    </>}
  </AuthFormFrame>;
}
