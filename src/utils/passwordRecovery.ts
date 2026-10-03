export type RecoveryState = "none" | "checking" | "ready" | "invalid" | "success";
export const recoveryStorageKey = "liferpg:password-recovery";
export const recoveryLinkError = "This recovery link is invalid or has expired. Request a new email and open the newest link.";
// Supabase rejects non-loopback IP redirect hosts before its allowlist check.
// Expo Go's hostname-based tunnel avoids sending a link to the Site URL fallback.
export function isExpoGoLanRecoveryRedirect(redirectTo: string) {
  try {
    const url = new URL(redirectTo);
    return ["exp:", "exps:"].includes(url.protocol)
      && /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && !url.hostname.startsWith("127.");
  } catch { return false; }
}
export function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
export function passwordValidation(password: string, confirmation: string) {
  if (password.length < 8) return "Use at least 8 characters for your new password.";
  if (password !== confirmation) return "Your passwords do not match.";
  return "";
}
// Only consume credentials at our configured callback, never arbitrary app links.
export function parseRecoveryLink(raw: string, redirectTo: string) {
  try {
    const url = new URL(raw), expected = new URL(redirectTo);
    const path = (value: URL) => value.pathname.replace(/\/$/, "");
    if (url.protocol !== expected.protocol || url.host !== expected.host || path(url) !== path(expected)) return null;
    const params = new URLSearchParams(url.search);
    new URLSearchParams(url.hash.slice(1)).forEach((value, key) => params.set(key, value));
    if (params.has("error") || params.has("error_code")) return { kind: "invalid" } as const;
    if (params.get("type") === "recovery") {
      const tokenHash = params.get("token_hash");
      if (tokenHash) return { kind: "hash", tokenHash } as const;
      const accessToken = params.get("access_token"), refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) return { kind: "session", accessToken, refreshToken } as const;
    }
    const code = params.get("code");
    if (code) return { kind: "code", code } as const;
    return { kind: "invalid" } as const;
  } catch { return null; }
}
export function recoveryError(error: unknown, saving = false) {
  const code = (error as { code?: string; status?: number })?.code;
  const status = (error as { status?: number })?.status;
  if (code === "unsupported_recovery_redirect") return "This Expo Go connection cannot receive recovery links. Restart Expo with --tunnel and configure its callback in Supabase Redirect URLs, or use a development build.";
  if (status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit")
    return "Too many attempts. Wait a few minutes before trying again.";
  if (code === "same_password") return "Choose a password different from your current password.";
  if (code === "weak_password") return "Choose a stronger password with uppercase and lowercase letters, a number, and a symbol.";
  if (code === "otp_expired" || code === "session_not_found" || status === 401 || status === 403) return recoveryLinkError;
  return saving ? "Could not save your password. Check your connection and try again. If this keeps happening, request a new recovery email."
    : "Could not request a recovery email. Check your connection and try again in a few minutes.";
}
