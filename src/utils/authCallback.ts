// The link Google sign-in returns to (liferpg://auth/callback). Only this exact
// path is read, never other app links. A one-time code is the only thing it
// carries: it is useless without the secret this phone kept when sign-in began.
export type AuthCallback = { kind: "code"; code: string } | { kind: "error"; cancelled: boolean };

export function parseAuthCallback(raw: string, callbackUrl: string): AuthCallback | null {
  try {
    const url = new URL(raw), expected = new URL(callbackUrl);
    const path = (value: URL) => value.pathname.replace(/\/$/, "");
    if (url.protocol !== expected.protocol || url.host !== expected.host || path(url) !== path(expected)) return null;
    const params = new URLSearchParams(url.search);
    new URLSearchParams(url.hash.slice(1)).forEach((value, key) => { if (!params.has(key)) params.set(key, value); });
    if (params.has("error") || params.has("error_code")) {
      return { kind: "error", cancelled: params.get("error") === "access_denied" };
    }
    const code = params.get("code");
    if (code && /^[A-Za-z0-9._~-]{8,512}$/.test(code)) return { kind: "code", code };
    return { kind: "error", cancelled: false };
  } catch { return null; }
}

// Plain words for the sign-in screens. Never says whether an email or name exists.
export function signInMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  const status = (error as { status?: number })?.status;
  const message = String((error as { message?: string })?.message ?? "");
  if (code === "over_email_send_rate_limit") return "We sent an email a moment ago. Please wait a little, then try again.";
  if (code === "too_many_attempts" || status === 429 || code === "over_request_rate_limit")
    return "Too many tries for now. Wait a few minutes, or sign in with your email.";
  if (code === "email_not_confirmed") return "Confirm your email first. We’ll send a new code to it.";
  if (code === "username_sign_in_unavailable") return "Signing in with a username isn’t ready yet. Use your email for now.";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message))
    return "That email or username and password don’t match. Try again, or reset your password.";
  if (code === "user_banned") return "This account can’t sign in right now.";
  if (code === "google_cancelled") return "Google sign-in was cancelled.";
  if (code === "google_failed") return "Google sign-in didn’t finish. Please try again.";
  if (code === "otp_expired" || /expired/i.test(message)) return "That code has expired. Ask for a new one below.";
  if (code === "otp_invalid" || /invalid.*(otp|token)|token.*invalid/i.test(message)) return "That code isn’t right. Check the newest email and try again.";
  if (code === "weak_password") return "Choose a stronger password with letters, numbers and a symbol.";
  if (code === "signup_disabled") return "New accounts are paused right now. Please try again later.";
  return "Couldn’t connect. Check your internet and try again.";
}
