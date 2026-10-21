import { useEffect, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { Text } from "./AppText";
import OnboardingWelcome from "./OnboardingWelcome";
import OnboardingFrame, { useOnboardingTransition } from "./OnboardingFrame";
import IdeaAreaPicker from "./IdeaAreaPicker";
import AuthFormFrame from "./AuthFormFrame";
import { AuthDivider, AuthLink, AuthPasswordField, AuthTextField, CodeInput, GoogleButton } from "./AuthFields";
import { PersonalButton, p } from "./PersonalUI";
import { useAuth } from "../context/AuthContext";
import { useAuthSettings } from "../services/authSettings";
import { introHandoff } from "../services/introHandoff";
import { getSessionProtectionModule } from "../services/nativeFocusProtection";
import { signInMessage } from "../utils/authCallback";
import { validEmail } from "../utils/passwordRecovery";
import type { IdeaArea } from "../constants/routineIdeas";

const RESEND_SECONDS = 60;
// The intro's steps with the account step: areas, account, name, goal,
// protection (when this phone supports it) and three short intro pages.
export const introTotal = (protection: boolean) => (protection ? 8 : 7);

/**
 * A new person's first minutes: the welcome, what they'd like to make time
 * for, then their account (Google, or email with a 6-digit code). The rest of
 * the intro carries on from the name step once the account exists. Sign in
 * opens it at the code for an email that was never confirmed.
 */
export default function WelcomeFlow({ email, password, onEmail, onPassword, onSignIn, startAt = "welcome" }: {
  email: string; password: string; onEmail: (value: string) => void; onPassword: (value: string) => void; onSignIn: () => void;
  startAt?: "welcome" | "code";
}) {
  const { signUp, verifySignUpCode, resendSignUpCode, signInWithGoogle, googleStatus } = useAuth();
  const settings = useAuthSettings();
  const transition = useOnboardingTransition();
  const [stage, setStage] = useState<"welcome" | "areas" | "account" | "code">(startAt);
  const [areas, setAreas] = useState<IdeaArea[]>(() => introHandoff.peek()?.areas ?? []);
  const [protection, setProtection] = useState(true);
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<"email" | "password" | "code" | null>(null);
  // Arriving at the code means one was just sent, so a new one waits a minute.
  const [wait, setWait] = useState(startAt === "code" ? RESEND_SECONDS : 0);
  const lock = useRef(false);
  const google = googleStatus === "finishing";
  const total = introTotal(protection);
  useEffect(() => {
    let live = true;
    void introHandoff.restore().then(saved => { if (live && saved && !areas.length) setAreas(saved.areas); });
    void getSessionProtectionModule().then(native => native ? native.capabilities() : null)
      .then(caps => { if (live) setProtection(!!caps?.supported); }, () => { if (live) setProtection(false); });
    return () => { live = false; };
    // Only once, when the intro opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(seconds => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  // A Google sign-in that came back cancelled or failed explains itself once.
  const [seenGoogle, setSeenGoogle] = useState(googleStatus);
  if (seenGoogle !== googleStatus) {
    setSeenGoogle(googleStatus);
    if (googleStatus === "failed" || googleStatus === "cancelled") {
      setFieldError(null); setError(signInMessage({ code: googleStatus === "failed" ? "google_failed" : "google_cancelled" }));
    }
  }
  const reset = () => { setError(""); setFieldError(null); };

  const create = async (focus: (field: string) => void) => {
    if (lock.current || google) return;
    reset();
    if (!validEmail(email)) { focus("email"); setFieldError("email"); setError("Enter a real email address. We’ll send a code to it."); return; }
    if (password.length < 8) { focus("password"); setFieldError("password"); setError("Use at least 8 characters."); return; }
    lock.current = true; setBusy(true);
    introHandoff.set(areas);
    try {
      const result = await signUp(email.trim(), password);
      if (result.error) throw result.error;
      // With email confirmation on, the account opens with the code below.
      // Otherwise the account is ready and the intro carries on by itself.
      if (result.needsEmailConfirmation) { Keyboard.dismiss(); setCode(""); setWait(RESEND_SECONDS); setStage("code"); }
    } catch (cause) { focus("submit"); setError(signInMessage(cause)); }
    finally { lock.current = false; setBusy(false); }
  };
  const confirm = async (value: string, focus: (field: string) => void) => {
    if (lock.current) return;
    reset();
    if (!/^\d{6}$/.test(value)) { focus("code"); setFieldError("code"); setError("Enter the 6 digits from the email."); return; }
    lock.current = true; setBusy(true); Keyboard.dismiss();
    try {
      const result = await verifySignUpCode(email, value);
      if (result.error) throw result.error;
    } catch (cause) { focus("code"); setFieldError("code"); setError(signInMessage(cause)); setCode(""); }
    finally { lock.current = false; setBusy(false); }
  };
  const resend = async (focus: (field: string) => void) => {
    if (lock.current || wait > 0) return;
    reset(); lock.current = true; setBusy(true);
    try {
      const result = await resendSignUpCode(email);
      if (result.error) throw result.error;
      setWait(RESEND_SECONDS);
    } catch (cause) { focus("submit"); setError(signInMessage(cause)); }
    finally { lock.current = false; setBusy(false); }
  };
  const withGoogle = async () => {
    if (lock.current) return;
    reset(); Keyboard.dismiss();
    introHandoff.set(areas);
    const result = await signInWithGoogle();
    if (result.error) setError(signInMessage({ code: "google_failed" }));
  };

  if (stage === "welcome") return <OnboardingWelcome owner="device" onDone={() => setStage("areas")} />;
  if (stage === "areas") return <OnboardingFrame step={1} total={total} title="What would you like to make time for?"
    subtitle="Choose what matters to you right now. We’ll have ideas waiting once you’ve settled in." opacity={transition.opacity}
    transitioning={transition.moving} primary={areas.length ? "Continue" : "Skip for now"}
    onNext={() => { introHandoff.set(areas); setStage("account"); }}
    secondary="I already have an account" onSecondary={onSignIn}>
    <IdeaAreaPicker value={areas} onChange={setAreas} />
  </OnboardingFrame>;
  if (stage === "account") return <AuthFormFrame transitionKey="welcome-account" progress={{ step: 2, total }}
    onBack={() => { if (!busy) { Keyboard.dismiss(); reset(); setStage("areas"); } }}
    title="Save your progress" description="Create your account so your time and progress stay safe, even on a new phone.">
    {({ active, focus, blur, layout }) => <>
      {settings.google && <><GoogleButton onPress={() => void withGoogle()} disabled={busy} busy={google} /><AuthDivider label="or use your email" /></>}
      <AuthTextField label="Email" active={active === "email"} onFieldLayout={event => layout("email", event)}
        value={email} onChangeText={value => { onEmail(value); if (fieldError === "email") reset(); }}
        placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"
        textContentType="emailAddress" editable={!busy && !google} onFocus={() => focus("email")} onBlur={() => blur("email")}
        returnKeyType="next" error={fieldError === "email" ? error : undefined} />
      <AuthPasswordField label="Password" active={active === "password"} onFieldLayout={event => layout("password", event)}
        value={password} onChangeText={value => { onPassword(value); if (fieldError === "password") reset(); }}
        placeholder="At least 8 characters" autoComplete="new-password" textContentType="newPassword" editable={!busy && !google}
        onFocus={() => focus("password")} onBlur={() => blur("password")} returnKeyType="done" submitBehavior="submit"
        onSubmitEditing={() => void create(focus)} error={fieldError === "password" ? error : undefined} />
      <View onLayout={event => layout("submit", event)} style={{ gap: 12 }}>
        {!!error && !fieldError && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
        <PersonalButton title={busy ? "Creating your account…" : "Create account"} disabled={busy || google} onPress={() => void create(focus)} />
      </View>
      <AuthLink label="Already have an account? " emphasis="Sign in" onPress={() => { Keyboard.dismiss(); onSignIn(); }} disabled={busy || google} />
    </>}
  </AuthFormFrame>;
  return <AuthFormFrame transitionKey="welcome-code" progress={{ step: 2, total }}
    onBack={() => { if (!busy) { Keyboard.dismiss(); reset(); if (startAt === "code") onSignIn(); else setStage("account"); } }}
    title="Check your email" description={`We sent a 6-digit code to ${email.trim()}. Enter it to finish creating your account.`}>
    {({ active, focus, blur, layout }) => <>
      <CodeInput value={code} onChange={value => { setCode(value); if (fieldError) reset(); }}
        onComplete={value => void confirm(value, focus)} active={active === "code"} editable={!busy}
        onFocus={() => focus("code")} onBlur={() => blur("code")} onFieldLayout={event => layout("code", event)}
        error={fieldError === "code" ? error : undefined} />
      <View onLayout={event => layout("submit", event)} style={{ gap: 12 }}>
        {!!error && !fieldError && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
        <PersonalButton title={busy ? "Checking…" : "Continue"} disabled={busy} onPress={() => void confirm(code, focus)} />
      </View>
      <Text style={[p.body, { textAlign: "center" }]}>Can’t find it? Check your spam folder. If you already have an account with this email, sign in instead.</Text>
      <AuthLink label={wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"} disabled={busy || wait > 0} onPress={() => void resend(focus)} />
      <AuthLink label="Use a different email" onPress={() => { if (!busy) { reset(); setStage("account"); } }} disabled={busy} />
      <AuthLink label="Already have an account? " emphasis="Sign in" onPress={() => { Keyboard.dismiss(); onSignIn(); }} disabled={busy} />
    </>}
  </AuthFormFrame>;
}
