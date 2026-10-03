import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { PersonalButton, p } from "./PersonalUI";
import CharacterPortrait from "./CharacterPortrait";
import { colors } from "../constants/theme";
export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const lock = useRef(false);
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
            "Check your email to confirm your account, then sign in here.",
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
  return (
    <SafeAreaView style={p.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            padding: 24,
            paddingBottom: 40,
            justifyContent: "center",
            gap: 16,
          }}
        >
          <Text style={p.label}>LIFERPG</Text>
          <Text style={[p.pageTitle, { fontSize: 36 }]}>
            Your effort.{"\n"}Your character.
          </Text>
          <Text style={p.body}>
            Make time for what matters. See yourself grow.
          </Text>
          <CharacterPortrait avatar="🌱" />
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
          <TextInput
            accessibilityLabel="Password"
            editable={!busy}
            style={p.input}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={register ? "new-password" : "current-password"}
            textContentType={register ? "newPassword" : "password"}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
          />
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
            style={{ padding: 14, alignItems: "center" }}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
