import { Redirect } from "expo-router";
// Google sign-in returns here. AuthProvider reads its one-time code; the app
// then opens as usual (the intro for a new account, otherwise Home).
export default function SignInCallback() { return <Redirect href="/" />; }
