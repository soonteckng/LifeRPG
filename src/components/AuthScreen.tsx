import { useState } from "react";
import WelcomeFlow from "./WelcomeFlow";
import SignInScreen from "./SignInScreen";
import ForgotPasswordScreen from "./ForgotPasswordScreen";
import type { AuthEntryMode } from "../services/authEntryPreference";

/**
 * Before an account is open on this phone. A new phone goes straight into the
 * intro, which creates the account along the way; a phone that has been used
 * before shows Sign in. What was typed carries across the screens. An email
 * that was never confirmed goes from Sign in straight to its code screen.
 */
export default function AuthScreen({ initialMode = "sign-in" }: { initialMode?: AuthEntryMode }) {
  const [screen, setScreen] = useState<"welcome" | "confirm" | "sign-in" | "forgot">(initialMode === "sign-up" ? "welcome" : "sign-in");
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  if (screen === "welcome" || screen === "confirm") return <WelcomeFlow key={screen} startAt={screen === "confirm" ? "code" : "welcome"}
    email={email} password={password} onEmail={setEmail} onPassword={setPassword} onSignIn={() => setScreen("sign-in")} />;
  if (screen === "forgot") return <ForgotPasswordScreen email={email} onBack={() => setScreen("sign-in")} />;
  return <SignInScreen identifier={email} password={password} onIdentifier={setEmail} onPassword={setPassword}
    onForgot={() => setScreen("forgot")} onCreate={() => { setPassword(""); setScreen("welcome"); }}
    onConfirm={() => { setEmail(email.trim()); setScreen("confirm"); }} />;
}
