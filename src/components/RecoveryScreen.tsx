import { Text } from "./AppText";
import { useRef, useState } from "react";
import { ActivityIndicator, Keyboard, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors } from "../constants/theme";
import { passwordValidation, recoveryError } from "../utils/passwordRecovery";
import { PersonalButton, p } from "./PersonalUI";
import AuthFormFrame from "./AuthFormFrame";
import { AuthPasswordField } from "./AuthFields";

/**
 * After a right reset code (or an older reset link): choose a new password.
 * Asking for a code happens on the Forgot password screen, so an expired
 * reset simply leads back to Sign in to ask for a new one.
 */
export default function RecoveryScreen() {
  const { recovery, saveRecoveryPassword, leaveRecovery } = useAuth();
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<{ field: "password" | "confirmation"; message: string } | null>(null);
  const lock = useRef(false);
  const checking = recovery === "checking", success = recovery === "success", invalid = recovery === "invalid";
  const submit = async (focus: (field: string) => void) => {
    if (lock.current || checking || success || invalid) return;
    setError(""); setFieldError(null);
    const validation = passwordValidation(password, confirmation);
    if (validation) {
      const field = password.length < 8 ? "password" : "confirmation";
      focus(field); setFieldError({ field, message: validation });
      return;
    }
    lock.current = true; setBusy(true);
    try { await saveRecoveryPassword(password); setPassword(""); setConfirmation(""); Keyboard.dismiss(); }
    catch (cause) { focus("submit"); setError(recoveryError(cause, true)); }
    finally { lock.current = false; setBusy(false); }
  };
  const back = async (focus: (field: string) => void) => {
    if (lock.current || checking) return;
    lock.current = true; setBusy(true); setError(""); setFieldError(null);
    try { Keyboard.dismiss(); await leaveRecovery(); }
    catch { focus("submit"); setError("Couldn’t leave the reset. Check your connection and try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <AuthFormFrame transitionKey={checking ? "checking" : success ? "success" : invalid ? "invalid" : "save-password"}
    title={checking ? "One moment" : success ? "Password updated" : invalid ? "This reset has expired" : "Set a new password"}
    description={checking ? "Checking that this reset is yours." : success ? "You’re ready to sign in with your new password."
      : invalid ? "Reset codes and links only last a short while. Ask for a new code from Sign in." : "Choose one you’ll remember. At least 8 characters."}>
    {({ active, focus, blur, layout }) => <>
      {checking ? <View style={{ alignItems: "center" }}><ActivityIndicator color={colors.accent} /></View> : <>
        {!success && !invalid && <>
          <AuthPasswordField label="New password" active={active === "password"} onFieldLayout={event => layout("password", event)}
            placeholder="New password" autoComplete="new-password" textContentType="newPassword"
            value={password} onChangeText={setPassword} onFocus={() => focus("password")} onBlur={() => blur("password")} editable={!busy}
            error={fieldError?.field === "password" ? fieldError.message : undefined} />
          <AuthPasswordField label="Confirm new password" active={active === "confirmation"} onFieldLayout={event => layout("confirmation", event)}
            placeholder="Type it again" autoComplete="new-password" textContentType="newPassword"
            value={confirmation} onChangeText={setConfirmation} onFocus={() => focus("confirmation")} onBlur={() => blur("confirmation")} editable={!busy}
            returnKeyType="done" submitBehavior="submit" onSubmitEditing={() => void submit(focus)}
            error={fieldError?.field === "confirmation" ? fieldError.message : undefined} />
        </>}
        <View onLayout={event => layout("submit", event)} style={{ gap: 12 }}>
          {!!error && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
          {!success && !invalid && <PersonalButton title={busy ? "Saving…" : "Save new password"} disabled={busy} onPress={() => void submit(focus)} />}
          <PersonalButton secondary={!success && !invalid} title={busy && (success || invalid) ? "Please wait…" : "Back to sign in"} disabled={busy}
            onPress={() => void back(focus)} />
        </View>
      </>}
    </>}
  </AuthFormFrame>;
}
