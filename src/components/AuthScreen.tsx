import Pressable from "./MotionPressable";
import { Text, TextInput } from "./AppText";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { PersonalButton, p } from "./PersonalUI";
import CharacterPortrait from "./CharacterPortrait";
import { colors } from "../constants/theme";
import PasswordInput from "./PasswordInput";
import RecoveryScreen from "./RecoveryScreen";
export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const lock = useRef(false);
  const [forgot, setForgot] = useState(false);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const compact = availableHeight !== null && availableHeight < 700;
  const tight = availableHeight !== null && availableHeight < 500;
  const submit = async () => {
    if (lock.current) return;
    setMessage("");
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      if (register) {
        const result = await signUp(email.trim(), password);
        if (result.error) throw result.error;
        if (result.needsEmailConfirmation) {
          setMessage(
            "If registration can be completed for this email, check your inbox for next steps. If you already have an account, sign in or use Forgot password.",
          );
          setRegister(false);
          setPassword("");
        }
      } else {
        const result = await signIn(email.trim(), password);
        if (result.error) throw result.error;
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn’t connect. Please try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (forgot) return <RecoveryScreen requestOnly onBack={() => setForgot(false)} />;
  return (
    <SafeAreaView style={p.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          testID="auth-surface"
          onLayout={(event) => setAvailableHeight(event.nativeEvent.layout.height)}
          style={{
            flex: 1,
            padding: tight ? 16 : 24,
            paddingBottom: tight ? 16 : 40,
            justifyContent: tight ? "flex-start" : "center",
            gap: tight ? 8 : 16,
          }}
        >
          <Text style={p.label}>LIFERPG</Text>
          {!tight && <Text style={[p.pageTitle, { fontSize: 36 }]}>
            Your effort.{"\n"}Your character.
          </Text>}
          {!tight && <Text style={p.body}>
            Make time for what matters. See yourself grow.
          </Text>}
          {!compact && <CharacterPortrait avatar="🌱" size={112} />}
          <Text style={p.title}>
            {register ? "Create your account" : "Welcome back"}
          </Text>
          <TextInput
            accessibilityLabel="Email"
            editable={!busy}
            style={p.input}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />
          <PasswordInput
            accessibilityLabel="Password"
            editable={!busy}
            style={p.input}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoComplete={register ? "new-password" : "current-password"}
            textContentType={register ? "newPassword" : "password"}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
          />
          {!register && (tight ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => setForgot(true)} style={{ paddingVertical: 6 }}>
            <Text style={[p.body, { color: colors.accent }]}>Forgot password?</Text>
          </Pressable> : <PersonalButton secondary title="Forgot password?" disabled={busy} onPress={() => setForgot(true)} />)}
          {!!error && (
            <Text style={p.error} accessibilityRole="alert">
              {error}
            </Text>
          )}
          {!!message && (
            <Text style={p.body} accessibilityRole="alert">
              {message}
            </Text>
          )}
          <PersonalButton
            title={
              busy ? "Please wait…" : register ? "Create account" : "Sign in"
            }
            disabled={busy}
            onPress={() => void submit()}
          />
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            style={{ padding: tight ? 6 : 14, alignItems: "center" }}
            onPress={() => {
              setRegister((current) => !current);
              setError("");
              setMessage("");
            }}
          >
            <Text style={[p.body, { color: colors.accent }]}>
              {register
                ? "Already have an account? Sign in"
                : "New here? Create an account"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
