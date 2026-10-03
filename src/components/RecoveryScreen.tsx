import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { colors } from "../constants/theme";
import { passwordValidation, recoveryError, recoveryLinkError, validEmail } from "../utils/passwordRecovery";
import PasswordInput from "./PasswordInput";
import { PersonalButton, p } from "./PersonalUI";
export default function RecoveryScreen({ requestOnly = false, onBack }: { requestOnly?: boolean; onBack?: () => void }) {
  const { recovery, requestPasswordReset, saveRecoveryPassword, leaveRecovery } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [requestAnother, setRequestAnother] = useState(false);
  const lock = useRef(false);
  const checking = !requestOnly && recovery === "checking";
  const success = !requestOnly && recovery === "success";
  const invalid = !requestOnly && recovery === "invalid";
  const requesting = requestOnly || invalid || requestAnother;
  const submit = async () => {
    if (lock.current || checking || success || (requesting && sent)) return;
    setError("");
    const validation = requesting ? (validEmail(email) ? "" : "Enter a valid email address.") : passwordValidation(password, confirmation);
    if (validation) { setError(validation); return; }
    lock.current = true; setBusy(true);
    try {
      if (requesting) { await requestPasswordReset(email); setSent(true); }
      else { await saveRecoveryPassword(password); setPassword(""); setConfirmation(""); }
    } catch (cause) { setError(recoveryError(cause, !requesting)); }
    finally { lock.current = false; setBusy(false); }
  };
  const back = async () => {
    if (lock.current || checking) return;
    lock.current = true; setBusy(true); setError("");
    try { if (requestOnly) onBack?.(); else await leaveRecovery(); }
    catch { setError("Could not sign out of recovery. Check your connection and try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  return (
    <SafeAreaView style={p.page}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingBottom: 48, gap: 16 }}>
          <Text style={p.label}>LIFERPG</Text>
          <Text style={p.pageTitle} accessibilityRole="header">
            {checking ? "Checking recovery link" : success ? "Password updated" : requesting ? "Reset your password" : "Set new password"}
          </Text>
          {checking ? <><ActivityIndicator color={colors.accent} /><Text style={p.body}>Verifying your recovery link...</Text></> : <>
            {success ? <Text style={p.body} accessibilityRole="alert">Your password was saved. Return to sign in with your new password.</Text> : <>
              {invalid && <Text style={p.error} accessibilityRole="alert">{recoveryLinkError}</Text>}
              {requesting ? <>
                <Text style={p.body}>Enter your account email to request a password recovery link.</Text>
                <TextInput accessibilityLabel="Email" style={p.input} placeholder="Email" placeholderTextColor={colors.muted}
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
                  value={email} onChangeText={setEmail} editable={!busy && !sent} onSubmitEditing={() => void submit()} />
                {sent && <Text style={p.body} accessibilityRole="alert">If an account exists for that email, you will receive a password recovery link. Check your inbox and spam folder. Use the newest email.</Text>}
                <PersonalButton title={busy ? "Requesting..." : sent ? "Recovery email requested" : "Send recovery email"}
                  disabled={busy || sent} onPress={() => void submit()} />
              </> : <>
                <Text style={p.body}>Use at least 8 characters. A longer password with letters, numbers, and symbols is stronger.</Text>
                <PasswordInput accessibilityLabel="New password" placeholder="New password" autoComplete="new-password" textContentType="newPassword"
                  value={password} onChangeText={setPassword} editable={!busy} />
                <PasswordInput accessibilityLabel="Confirm new password" placeholder="Confirm new password" autoComplete="new-password" textContentType="newPassword"
                  value={confirmation} onChangeText={setConfirmation} editable={!busy} onSubmitEditing={() => void submit()} />
                <PersonalButton title={busy ? "Saving..." : "Save new password"} disabled={busy} onPress={() => void submit()} />
                <PersonalButton secondary title="Request another recovery email" disabled={busy} onPress={() => { setRequestAnother(true); setError(""); setPassword(""); setConfirmation(""); }} />
              </>}
            </>}
            {!!error && <Text style={p.error} accessibilityRole="alert">{error}</Text>}
            {busy && <ActivityIndicator color={colors.accent} />}
            <PersonalButton secondary title={busy ? "Please wait..." : "Return to sign in"} disabled={busy} onPress={() => void back()} />
          </>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
