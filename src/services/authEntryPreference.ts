export type AuthEntryMode = "sign-in" | "sign-up";

// This device preference chooses a form only. It never grants account access.
export const authEntryStorageKey = "liferpg.auth.entry.v1";

export function authEntryPreference(saved: unknown, hasAccountEvidence = false): AuthEntryMode {
  return saved === "sign-in" || hasAccountEvidence ? "sign-in" : "sign-up";
}
