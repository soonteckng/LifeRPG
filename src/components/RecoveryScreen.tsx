import { Text, TextInput } from "./AppText";
import { useRef, useState } from "react";
import { ActivityIndicator, Keyboard, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors } from "../constants/theme";
import { passwordValidation, recoveryError, recoveryLinkError, validEmail } from "../utils/passwordRecovery";
import PasswordInput from "./PasswordInput";
import { PersonalButton, p } from "./PersonalUI";
import AuthFormFrame from "./AuthFormFrame";

export default function RecoveryScreen({ requestOnly = false, onBack }: { requestOnly?: boolean; onBack?: () => void }) {
  const { recovery, requestPasswordReset, saveRecoveryPassword, leaveRecovery } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<{ field: "email" | "password" | "confirmation"; message: string } | null>(null);
  const [requestAnother, setRequestAnother] = useState(false);
  const lock = useRef(false);
  const checking = !requestOnly && recovery === "checking";
  const success = !requestOnly && recovery === "success";
  const invalid = !requestOnly && recovery === "invalid";
  const requesting = requestOnly || invalid || requestAnother;
  const submit = async (focus: (field: string) => void) => {
    if (lock.current || checking || success || (requesting && sent)) return;
    setError(""); setFieldError(null);
    const validation = requesting ? (validEmail(email) ? "" : "Enter a valid email address.") : passwordValidation(password, confirmation);
    if (validation) {
      const field = requesting ? "email" : password.length < 8 ? "password" : "confirmation";
      focus(field); setFieldError({ field, message: validation });
      return;
    }
    lock.current = true; setBusy(true);
    try {
      if (requesting) { await requestPasswordReset(email); setSent(true); }
      else { await saveRecoveryPassword(password); setPassword(""); setConfirmation(""); }
      Keyboard.dismiss();
    } catch (cause) { focus("submit"); setError(recoveryError(cause, !requesting)); }
    finally { lock.current = false; setBusy(false); }
  };
  const back = async (focus: (field: string) => void) => {
    if (lock.current || checking) return;
    lock.current = true; setBusy(true); setError(""); setFieldError(null);
    try { Keyboard.dismiss(); if (requestOnly) onBack?.(); else await leaveRecovery(); }
    catch { focus("submit"); setError("Could not sign out of recovery. Check your connection and try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <AuthFormFrame transitionKey={checking ? "checking" : success ? "success" : requesting ? "request-recovery" : "save-password"}
    title={checking ? "Checking recovery link" : success ? "Password updated" : requesting ? "Reset your password" : "Set new password"}
    description={checking ? "We’re checking that this link belongs to your account." : success ? "You’re ready to return to your account." : requesting ? "We’ll send a secure link to your email." : "Choose a password you can keep safe."}>
    {({ focus, layout }) => <>
      {checking ? <><ActivityIndicator color={colors.accent} /><Text style={p.body}>Verifying your recovery link...</Text></> : <>
        {success ? <Text style={p.body} accessibilityRole="alert">Your password was saved. Return to sign in with your new password.</Text> : <>
          {invalid && <Text style={p.error} accessibilityRole="alert">{recoveryLinkError}</Text>}
          {requesting ? <>
            <View onLayout={event => layout("email", event)} style={{ gap: 6 }}>
              <Text style={[p.caption, { color: colors.secondary }]}>Account email</Text>
              <TextInput accessibilityLabel="Email" style={[p.input, { backgroundColor: colors.surface, borderColor: colors.border, minHeight: 52 }]}
                placeholder="you@example.com" placeholderTextColor={colors.muted} keyboardType="email-address"
                autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
                value={email} onChangeText={setEmail} onFocus={() => focus("email")} editable={!busy && !sent}
                returnKeyType="done" submitBehavior="submit" onSubmitEditing={() => void submit(focus)} />
              {fieldError?.field === "email" && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{fieldError.message}</Text>}
            </View>
            <View onLayout={event => layout("submit", event)} style={{ gap: 12 }}>
              {sent && <Text style={p.body} accessibilityRole="alert">If an account exists for that email, you will receive a password recovery link. Check your inbox and spam folder. Use the newest email.</Text>}
              {!!error && !(invalid && error === recoveryLinkError) && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
              <PersonalButton title={busy ? "Requesting..." : sent ? "Recovery email requested" : "Send recovery email"}
                disabled={busy || sent} onPress={() => void submit(focus)} />
            </View>
          </> : <>
            <Text style={p.body}>Use at least 8 characters. A longer password with letters, numbers, and symbols is stronger.</Text>
            <View onLayout={event => layout("password", event)}>
              <PasswordInput accessibilityLabel="New password" placeholder="New password" autoComplete="new-password" textContentType="newPassword"
                style={{ backgroundColor: colors.surface, borderColor: colors.border, minHeight: 52 }}
                value={password} onChangeText={setPassword} onFocus={() => focus("password")} editable={!busy}
                error={fieldError?.field === "password" ? fieldError.message : undefined} />
            </View>
            <View onLayout={event => layout("confirmation", event)}>
              <PasswordInput accessibilityLabel="Confirm new password" placeholder="Confirm new password" autoComplete="new-password" textContentType="newPassword"
                style={{ backgroundColor: colors.surface, borderColor: colors.border, minHeight: 52 }}
                value={confirmation} onChangeText={setConfirmation} onFocus={() => focus("confirmation")} editable={!busy}
                returnKeyType="done" submitBehavior="submit" onSubmitEditing={() => void submit(focus)}
                error={fieldError?.field === "confirmation" ? fieldError.message : undefined} />
            </View>
            <View onLayout={event => layout("submit", event)} style={{ gap: 12 }}>
              {!!error && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
              <PersonalButton title={busy ? "Saving..." : "Save new password"} disabled={busy} onPress={() => void submit(focus)} />
            </View>
            <PersonalButton secondary title="Request another recovery email" disabled={busy}
              onPress={() => { Keyboard.dismiss(); setRequestAnother(true); setError(""); setFieldError(null); setPassword(""); setConfirmation(""); }} />
          </>}
        </>}
        {success && !!error && <View onLayout={event => layout("submit", event)}><Text style={p.error} accessibilityRole="alert">{error}</Text></View>}
        {busy && <ActivityIndicator color={colors.accent} />}
        <PersonalButton secondary title={busy ? "Please wait..." : "Return to sign in"} disabled={busy} onPress={() => void back(focus)} />
      </>}
    </>}
  </AuthFormFrame>;
}
