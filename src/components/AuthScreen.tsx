import { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing information", "Enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const result = await signUp(email.trim(), password);

        if (result.error) {
          Alert.alert("Sign up failed", result.error.message);
        } else if (result.needsEmailConfirmation) {
          Alert.alert(
            "Check your email",
            "Your account was created. Please confirm your email before signing in."
          );
        } else {
          Alert.alert("Account created", "You are now signed in.");
        }
      } else {
        const result = await signIn(email.trim(), password);

        if (result.error) {
          Alert.alert("Sign in failed", result.error.message);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LifeRPG</Text>
      <Text style={styles.subtitle}>
        {isSignUp ? "Create your account" : "Welcome back"}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#94A3B8"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#94A3B8"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading
            ? "Please wait..."
            : isSignUp
            ? "Create Account"
            : "Sign In"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setIsSignUp((current) => !current)}
      >
        <Text style={styles.switchText}>
          {isSignUp
            ? "Already have an account? Sign in"
            : "Don't have an account? Sign up"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 16,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 32,
  },
  input: {
    backgroundColor: "#1E293B",
    color: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#6366F1",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  switchText: {
    color: "#A5B4FC",
    textAlign: "center",
    marginTop: 20,
  },
});