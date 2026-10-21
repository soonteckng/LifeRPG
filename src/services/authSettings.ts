import { useEffect, useState } from "react";

/**
 * What the account server offers right now, read from its public settings.
 * The Google button only appears once Google sign-in is switched on in
 * Supabase, so it can never lead to an error page.
 */
export type AuthSettings = { google: boolean };
const unavailable: AuthSettings = { google: false };
let known: AuthSettings | null = null;
let request: Promise<AuthSettings> | null = null;

export function loadAuthSettings(): Promise<AuthSettings> {
  if (known) return Promise.resolve(known);
  if (request) return request;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL, key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || typeof fetch !== "function") return Promise.resolve(unavailable);
  request = (async () => {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), 6000);
    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, { headers: { apikey: key }, signal: controller?.signal });
      if (!response.ok) return unavailable;
      const body = await response.json() as { external?: { google?: unknown } };
      known = { google: body?.external?.google === true };
      return known;
    } catch { return unavailable; }
    finally { clearTimeout(timer); request = null; }
  })();
  return request;
}

export function useAuthSettings(): AuthSettings {
  const [settings, setSettings] = useState<AuthSettings>(known ?? unavailable);
  useEffect(() => {
    let live = true;
    void loadAuthSettings().then(next => { if (live) setSettings(next); });
    return () => { live = false; };
  }, []);
  return settings;
}
