import { Redirect } from "expo-router";
// AuthGate consumes recovery before mounting profile/onboarding providers.
export default function RecoveryCallback() { return <Redirect href="/" />; }
