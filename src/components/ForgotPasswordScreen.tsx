import { useEffect, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { Text } from "./AppText";
import { useAuth } from "../context/AuthContext";
import { recoveryError, validEmail } from "../utils/passwordRecovery";
import { signInMessage } from "../utils/authCallback";
import AuthFormFrame from "./AuthFormFrame";
import { AuthLink, AuthTextField, CodeInput } from "./AuthFields";
import { PersonalButton, p } from "./PersonalUI";

const RESEND_SECONDS = 60;

/**
 * Forgot password: your email, then the 6-digit code from the email. A right
 * code opens "Set a new password"; nothing else changes until then.
 */
export default function ForgotPasswordScreen({ email: startEmail, onBack }: { email: string; onBack: () => void }) {
  const { requestPasswordReset, recoverWithCode } = useAuth();
  const [email, setEmail] = useState(startEmail.includes("@") ? startEmail.trim() : "");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<"email" | "code" | null>(null);
  const [wait, setWait] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(seconds => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  const send = async (focus: (field: string) => void) => {
    if (lock.current) return;
    setError(""); setFieldError(null);
    if (!validEmail(email)) { focus("email"); setFieldError("email"); setError("Enter the email you signed up with."); return; }
    lock.current = true; setBusy(true);
    try {
      await requestPasswordReset(email);
      setStage("code"); setCode(""); setWait(RESEND_SECONDS);
    } catch (cause) { focus("submit"); setError(recoveryError(cause)); }
    finally { lock.current = false; setBusy(false); }
  };
  const verify = async (value: string, focus: (field: string) => void) => {
    if (lock.current) return;
    setError(""); setFieldError(null);
    if (!/^\d{6}$/.test(value)) { focus("code"); setFieldError("code"); setError("Enter the 6 digits from the email."); return; }
    lock.current = true; setBusy(true); Keyboard.dismiss();
    try { await recoverWithCode(email, value); }
    catch (cause) { focus("code"); setFieldError("code"); setError(signInMessage(cause)); setCode(""); }
    finally { lock.current = false; setBusy(false); }
  };
  const back = () => { if (busy) return; Keyboard.dismiss(); if (stage === "code") { setStage("email"); setError(""); setFieldError(null); } else onBack(); };
  return <AuthFormFrame transitionKey={`forgot-${stage}`} onBack={back}
    title={stage === "email" ? "Reset your password" : "Check your email"}
    description={stage === "email" ? "We’ll email you a 6-digit code to set a new password." : `If there’s an account for ${email.trim()}, a 6-digit code is on its way.`}>
    {({ active, focus, blur, layout }) => stage === "email" ? <>
      <AuthTextField label="Email" active={active === "email"} onFieldLayout={event => layout("email", event)}
        value={email} onChangeText={value => { setEmail(value); if (fieldError) { setFieldError(null); setError(""); } }}
        placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"
        textContentType="emailAddress" editable={!busy} onFocus={() => focus("email")} onBlur={() => blur("email")}
        returnKeyType="done" submitBehavior="submit" onSubmitEditing={() => void send(focus)} error={fieldError === "email" ? error : undefined} />
      <View onLayout={event => layout("submit", event)} style={{ gap: 12 }}>
        {!!error && !fieldError && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
        <PersonalButton title={busy ? "Sending…" : "Send code"} disabled={busy} onPress={() => void send(focus)} />
      </View>
      <AuthLink label="Back to sign in" onPress={back} disabled={busy} />
    </> : <>
      <CodeInput value={code} onChange={value => { setCode(value); if (fieldError) { setFieldError(null); setError(""); } }}
        onComplete={value => void verify(value, focus)} active={active === "code"} editable={!busy}
        onFocus={() => focus("code")} onBlur={() => blur("code")} onFieldLayout={event => layout("code", event)}
        error={fieldError === "code" ? error : undefined} />
      <View onLayout={event => layout("submit", event)} style={{ gap: 12 }}>
        {!!error && !fieldError && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
        <PersonalButton title={busy ? "Checking…" : "Continue"} disabled={busy} onPress={() => void verify(code, focus)} />
      </View>
      <Text style={[p.body, { textAlign: "center" }]}>Can’t find it? Check your spam folder. Codes last a short while, so use the newest email.</Text>
      <AuthLink label={wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"} disabled={busy || wait > 0} onPress={() => void send(focus)} />
      <AuthLink label="Use a different email" onPress={back} disabled={busy} />
    </>}
  </AuthFormFrame>;
}
