import type { UserProfile } from "../context/UserContext";
import type { SessionBackendIdentity } from "../utils/sessionBackend";

export interface LocalAccountOwner { id: string; backendId: string }
export type CachedVerifiedProfile = UserProfile;
export interface LocalAccountCache {
  version: 1;
  backendId: string;
  ownerId: string;
  verifiedAtMs: number;
  profile: CachedVerifiedProfile | null;
}
export interface LocalAccountStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export type PersistedCredentialOwner =
  | { kind: "present"; owner: LocalAccountOwner; expired: boolean }
  | { kind: "missing" | "invalid" | "unavailable" };

// This marker is local recovery evidence, never authentication or authorization.
export const localAccountCacheKey = (backendId: string) => `liferpg:local-account:v1:${encodeURIComponent(backendId)}`;

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const bounded = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const dateOrNull = (value: unknown) => value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
export function validateCachedProfile(value: unknown, ownerId: string): CachedVerifiedProfile | null {
  if (!object(value) || value.id !== ownerId || !bounded(value.username, 100) || !bounded(value.avatar, 100)
    || !bounded(value.class_title, 100) || !bounded(value.timezone, 100) || typeof value.onboarding_completed !== "boolean"
    || !count(value.level) || (value.level as number) < 1 || !count(value.current_xp) || !count(value.gold) || !count(value.streak_count)
    || !count(value.daily_goal_minutes) || (value.daily_goal_minutes as number) < 1 || (value.daily_goal_minutes as number) > 1440
    || !dateOrNull(value.last_active_date) || !dateOrNull(value.last_goal_completed_date)) return null;
  // Whitelist UI fields. Credentials, email and user/app metadata are not saved.
  return {
    id: ownerId, username: value.username, avatar: value.avatar, class_title: value.class_title,
    level: value.level as number, current_xp: value.current_xp as number, gold: value.gold as number,
    streak_count: value.streak_count as number, last_active_date: value.last_active_date as string | null,
    daily_goal_minutes: value.daily_goal_minutes as number, last_goal_completed_date: value.last_goal_completed_date as string | null,
    onboarding_completed: value.onboarding_completed, timezone: value.timezone,
  };
}
export function parseLocalAccountCache(raw: string | null, backendId: string): LocalAccountCache | null {
  try {
    if (!raw || raw.length > 16_384) return null;
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== 1 || value.backendId !== backendId || !bounded(value.ownerId, 128)
      || !count(value.verifiedAtMs) || (value.verifiedAtMs as number) > 8_640_000_000_000_000) return null;
    const profile = value.profile === null ? null : validateCachedProfile(value.profile, value.ownerId);
    if (value.profile !== null && !profile) return null;
    return { version: 1, backendId, ownerId: value.ownerId, verifiedAtMs: value.verifiedAtMs as number, profile };
  } catch { return null; }
}

function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || token.length > 32_768) return null;
    const source = parts[1].replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    if (!/^[A-Za-z0-9+/]+$/.test(source) || source.length % 4 === 1) return null;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bits = 0, buffer = 0, encoded = "";
    for (const character of source) {
      buffer = (buffer << 6) | alphabet.indexOf(character); bits += 6;
      if (bits >= 8) { bits -= 8; encoded += `%${((buffer >> bits) & 255).toString(16).padStart(2, "0")}`; }
    }
    const value: unknown = JSON.parse(decodeURIComponent(encoded));
    return object(value) ? value : null;
  } catch { return null; }
}
export async function readPersistedCredentialOwner(storage: LocalAccountStorage, backend: SessionBackendIdentity, nowMs = Date.now()): Promise<PersistedCredentialOwner> {
  let raw: string | null;
  try { raw = await storage.getItem(backend.authStorageKey); } catch { return { kind: "unavailable" }; }
  try {
    if (raw === null) return { kind: "missing" };
    if (raw.length > 65_536) return { kind: "invalid" };
    const value: unknown = JSON.parse(raw);
    if (!object(value) || !object(value.user) || !bounded(value.user.id, 128)
      || !bounded(value.access_token, 32_768) || !bounded(value.refresh_token, 16_384)) return { kind: "invalid" };
    const payload = jwtPayload(value.access_token);
    if (!payload || payload.sub !== value.user.id || payload.iss !== `${backend.baseUrl}/auth/v1`
      || typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return { kind: "invalid" };
    return { kind: "present", owner: { id: value.user.id, backendId: backend.backendId }, expired: payload.exp * 1000 <= nowMs };
  } catch { return { kind: "invalid" }; }
}

export function isTemporaryAuthFailure(error: unknown): boolean {
  if (!object(error)) return false;
  return error.name === "AuthRetryableFetchError" || error.name === "TypeError"
    || error.status === 0 || [502, 503, 504].includes(error.status as number);
}
export function isExpiredAuthFailure(error: unknown): boolean {
  return object(error) && (error.code === "jwt_expired" || error.code === "token_expired");
}
export function localRecoveryOwner(cache: LocalAccountCache | null, credential: PersistedCredentialOwner): LocalAccountOwner | null {
  return cache?.profile?.onboarding_completed && credential.kind === "present"
    && cache.ownerId === credential.owner.id && cache.backendId === credential.owner.backendId ? credential.owner : null;
}

export function createLocalAccountCache(storage: LocalAccountStorage, backendId: string) {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T,>(task: () => Promise<T>) => {
    const result = queue.catch(() => {}).then(task); queue = result; return result;
  };
  return {
    load: () => serial(async () => parseLocalAccountCache(await storage.getItem(localAccountCacheKey(backendId)), backendId)),
    verified: (ownerId: string, current: () => boolean) => serial(async () => {
      const old = parseLocalAccountCache(await storage.getItem(localAccountCacheKey(backendId)), backendId);
      if (!current()) return null;
      const cache: LocalAccountCache = { version: 1, backendId, ownerId, verifiedAtMs: Date.now(), profile: old?.ownerId === ownerId ? old.profile : null };
      await storage.setItem(localAccountCacheKey(backendId), JSON.stringify(cache));
      return current() ? cache : null;
    }),
    profile: (profile: CachedVerifiedProfile, current: () => boolean) => serial(async () => {
      const old = parseLocalAccountCache(await storage.getItem(localAccountCacheKey(backendId)), backendId);
      const clean = validateCachedProfile(profile, profile.id);
      if (!current() || !old || old.ownerId !== profile.id || !clean) return null;
      const cache: LocalAccountCache = { ...old, profile: clean };
      await storage.setItem(localAccountCacheKey(backendId), JSON.stringify(cache));
      return current() ? cache : null;
    }),
    clear: () => serial(() => storage.removeItem(localAccountCacheKey(backendId))),
  };
}
