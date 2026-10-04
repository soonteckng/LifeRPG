import { Text, TextInput } from "./AppText";
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View, type LayoutChangeEvent } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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
  const [fieldError, setFieldError] = useState<{ field: "email" | "password" | "confirmation"; message: string } | null>(null);
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const target = useRef<string | null>(null);
  const positions = useRef<Record<string, { y: number; height: number }>>({});
  const viewport = useRef(0);
  const offset = useRef(0);
  // Only move enough to expose obscured content. Never align a visible field
  // to the top merely because it gained focus or the keyboard opened.
  const reveal = () => {
    const rect = target.current ? positions.current[target.current] : undefined;
    if (!rect || !viewport.current) return;
    let y = offset.current;
    if (rect.y < y) y = Math.max(0, rect.y - 12);
    else if (rect.y + rect.height > y + viewport.current - 12)
      y = Math.max(0, rect.height > viewport.current - 24 ? rect.y - 12 : rect.y + rect.height - viewport.current + 12);
    if (y !== offset.current) {
      offset.current = y;
      scroll.current?.scrollTo({ y, animated: false });
    }
  };
  const layout = (field: string, event: LayoutChangeEvent) => {
    positions.current[field] = event.nativeEvent.layout;
    if (target.current === field) reveal();
  };
  const focus = (field: string) => { target.current = field; reveal(); };
  const [requestAnother, setRequestAnother] = useState(false);
  const lock = useRef(false);
  const checking = !requestOnly && recovery === "checking";
  const success = !requestOnly && recovery === "success";
  const invalid = !requestOnly && recovery === "invalid";
  const requesting = requestOnly || invalid || requestAnother;
  const submit = async () => {
    if (lock.current || checking || success || (requesting && sent)) return;
    setError("");
    setFieldError(null);
    const validation = requesting ? (validEmail(email) ? "" : "Enter a valid email address.") : passwordValidation(password, confirmation);
    if (validation) {
      const field = requesting ? "email" : password.length < 8 ? "password" : "confirmation";
      target.current = field;
      setFieldError({ field, message: validation });
      reveal();
      return;
    }
    lock.current = true; setBusy(true);
    try {
      if (requesting) { await requestPasswordReset(email); setSent(true); }
      else { await saveRecoveryPassword(password); setPassword(""); setConfirmation(""); }
    } catch (cause) { target.current = "submit"; setError(recoveryError(cause, !requesting)); }
    finally { lock.current = false; setBusy(false); }
  };
  const back = async () => {
    if (lock.current || checking) return;
    lock.current = true; setBusy(true); setError(""); setFieldError(null);
    try { if (requestOnly) onBack?.(); else await leaveRecovery(); }
    catch { target.current = "submit"; setError("Could not sign out of recovery. Check your connection and try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  return (
    <SafeAreaView style={p.page}>
      <KeyboardAvoidingView style={{ flex: 1 }} keyboardVerticalOffset={insets.top} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, gap: 16 }}>
          <Text style={p.label}>LIFERPG</Text>
          <Text style={p.pageTitle} accessibilityRole="header">
            {checking ? "Checking recovery link" : success ? "Password updated" : requesting ? "Reset your password" : "Set new password"}
          </Text>
        </View>
        <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="none"
          bounces={false} overScrollMode="never" scrollEventThrottle={16}
          onScroll={(event) => { offset.current = event.nativeEvent.contentOffset.y; }}
          onLayout={(event) => { viewport.current = event.nativeEvent.layout.height; reveal(); }} onContentSizeChange={reveal}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 48, gap: 16 }}>
          {checking ? <><ActivityIndicator color={colors.accent} /><Text style={p.body}>Verifying your recovery link...</Text></> : <>
            {success ? <Text style={p.body} accessibilityRole="alert">Your password was saved. Return to sign in with your new password.</Text> : <>
              {invalid && <Text style={p.error} accessibilityRole="alert">{recoveryLinkError}</Text>}
              {requesting ? <>
                <Text style={p.body}>Enter your account email to request a password recovery link.</Text>
                <View onLayout={(event) => layout("email", event)} style={{ gap: 6 }}>
                <TextInput accessibilityLabel="Email" style={p.input} placeholder="Email" placeholderTextColor={colors.muted}
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
                  value={email} onChangeText={setEmail} onFocus={() => focus("email")} editable={!busy && !sent} submitBehavior="submit" onSubmitEditing={() => void submit()} />
                {fieldError?.field === "email" && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{fieldError.message}</Text>}
                </View>
                {sent && <Text style={p.body} accessibilityRole="alert">If an account exists for that email, you will receive a password recovery link. Check your inbox and spam folder. Use the newest email.</Text>}
                <View onLayout={(event) => layout("submit", event)} style={{ gap: 16 }}>
                {!!error && !(invalid && error === recoveryLinkError) && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
                <PersonalButton title={busy ? "Requesting..." : sent ? "Recovery email requested" : "Send recovery email"}
                  disabled={busy || sent} onPress={() => void submit()} />
                </View>
              </> : <>
                <Text style={p.body}>Use at least 8 characters. A longer password with letters, numbers, and symbols is stronger.</Text>
                <View onLayout={(event) => layout("password", event)}>
                <PasswordInput accessibilityLabel="New password" placeholder="New password" autoComplete="new-password" textContentType="newPassword"
                  value={password} onChangeText={setPassword} onFocus={() => focus("password")} editable={!busy}
                  error={fieldError?.field === "password" ? fieldError.message : undefined} />
                </View>
                <View onLayout={(event) => layout("confirmation", event)}>
                <PasswordInput accessibilityLabel="Confirm new password" placeholder="Confirm new password" autoComplete="new-password" textContentType="newPassword"
                  value={confirmation} onChangeText={setConfirmation} onFocus={() => focus("confirmation")} editable={!busy} submitBehavior="submit" onSubmitEditing={() => void submit()}
                  error={fieldError?.field === "confirmation" ? fieldError.message : undefined} />
                </View>
                <View onLayout={(event) => layout("submit", event)} style={{ gap: 16 }}>
                {!!error && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
                <PersonalButton title={busy ? "Saving..." : "Save new password"} disabled={busy} onPress={() => void submit()} />
                </View>
                <PersonalButton secondary title="Request another recovery email" disabled={busy} onPress={() => { target.current = null; setRequestAnother(true); setError(""); setFieldError(null); setPassword(""); setConfirmation(""); }} />
              </>}
            </>}
            {success && !!error && <Text style={p.error} accessibilityRole="alert">{error}</Text>}
            {busy && <ActivityIndicator color={colors.accent} />}
            <PersonalButton secondary title={busy ? "Please wait..." : "Return to sign in"} disabled={busy} onPress={() => void back()} />
          </>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
