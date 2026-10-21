import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { AppState, Platform } from "react-native";
import { supabase } from "../../lib/supabase";
import { isExpoGoLanRecoveryRedirect, parseRecoveryLink, recoveryLinkError, recoveryStorageKey, validEmail, type RecoveryState } from "../utils/passwordRecovery";
import { sessionBackendIdentity } from "../utils/sessionBackend";
import { authEntryPreference, authEntryStorageKey, type AuthEntryMode } from "../services/authEntryPreference";
import { parseAuthCallback } from "../utils/authCallback";
import { setCloudConnectionScope, subscribeCloudConnectionFailure } from "../services/cloudConnection";
import { readNativeConnectivity, subscribeNativeConnectivity } from "../services/nativeFocusProtection";
import { createLocalAccountCache, readPersistedCredentialOwner, localRecoveryOwner, isTemporaryAuthFailure, isExpiredAuthFailure,
  type LocalAccountOwner, type LocalAccountCache, type CachedVerifiedProfile } from "../services/localAccountCache";
interface AuthContextType {
  session: Session | null; user: User | null; loading: boolean; recovery: RecoveryState;
  sessionError: boolean;
  authEntryMode: AuthEntryMode;
  localOwner: LocalAccountOwner | null;
  accessMode: "online" | "local-only" | "signed-out";
  admissionEpoch: number;
  cachedProfile: CachedVerifiedProfile | null;
  cacheVerifiedProfile: (profile: CachedVerifiedProfile) => Promise<void>;
  /** `fresh` always asks the server, e.g. before starting a session, where the
   * check also notices a dead connection before anything is sent. */
  verifyCurrentOwner: (options?: { fresh?: boolean }) => Promise<LocalAccountOwner | null>;
  retrySessionVerification: () => Promise<void>;
  /** An email, or a username picked in the intro, plus the password. */
  signIn: (identifier: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null; needsEmailConfirmation: boolean }>;
  /** The 6-digit code from the sign-up email. */
  verifySignUpCode: (email: string, code: string) => Promise<{ error: Error | null }>;
  resendSignUpCode: (email: string) => Promise<{ error: Error | null }>;
  /** Opens Google in the browser; the app signs in when it comes back. */
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  /** A Google sign-in that came back to the app: finishing, or why it stopped. */
  googleStatus: "idle" | "finishing" | "failed" | "cancelled";
  /** The 6-digit code from the reset email; then a new password is chosen. */
  recoverWithCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<{ error: Error | null }>;
  requestPasswordReset: (email: string) => Promise<void>;
  saveRecoveryPassword: (password: string) => Promise<void>;
  leaveRecovery: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_VERIFICATION_TIMEOUT_MS = 8000;
// A server-checked account stays proven for a short while, but only for the
// exact same credentials. Each session step used to repeat the same check, an
// extra round trip every time. A refreshed token, another account, recovery
// or a lost connection always gets a new check at once.
const OWNER_PROOF_TTL_MS = 60_000;
const LOCAL_RECONNECT_INTERVAL_MS = 4000;
class AuthVerificationTimeout extends Error {
  readonly status = 503;
  constructor() { super("Account verification timed out"); this.name = "AuthRetryableFetchError"; }
}
function boundedAuthRequest<T>(request: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new AuthVerificationTimeout()), AUTH_VERIFICATION_TIMEOUT_MS);
    request.then(result => { clearTimeout(timeout); resolve(result); }, error => { clearTimeout(timeout); reject(error); });
  });
}
const sameCredentials = (left: Session | null, right: Session | null) => left?.user?.id === right?.user?.id
  && left?.access_token === right?.access_token && left?.refresh_token === right?.refresh_token;
const snapshotCredentials = (current: Session | null): Session | null => current ? { ...current, user: { ...current.user } } : null;
// An identical account reply keeps its object, so screens do not re-render for nothing.
const sameProfile = (left: CachedVerifiedProfile | null, right: CachedVerifiedProfile | null) => {
  if (!left || !right) return left === right;
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
};
const sameUserDetails = (left: User | null, right: User) => {
  if (!left || left.id !== right.id) return false;
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
};
interface SessionVerificationFlight {
  session: Session | null; epoch: number; recovery: RecoveryState; generation: number;
  promise: Promise<LocalAccountOwner | null>;
}
interface OwnerVerificationFlight {
  ownerId: string; session: Session | null; epoch: number; cancelled: boolean; fresh: boolean;
  promise: Promise<LocalAccountOwner | null>;
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const backend = useMemo(() => sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL), []);
  const accountCache = useMemo(() => backend ? createLocalAccountCache(AsyncStorage, backend.backendId) : null, [backend]);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [authEntryMode, setAuthEntryMode] = useState<AuthEntryMode>("sign-up");
  const returningEntry = useRef(false);
  const rememberSignInEntry = async () => {
    returningEntry.current = true;
    setAuthEntryMode("sign-in");
    // A failed presentation preference must not change auth or recovery proof.
    try { await AsyncStorage.setItem(authEntryStorageKey, "sign-in"); } catch { /* Best effort device preference. */ }
  };
  const [verifiedUser, setVerifiedUser] = useState<User | null>(null);
  const verified = useRef<User | null>(null);
  const verifiedCredentials = useRef<Session | null>(null);
  const verifiedAt = useRef(0);
  const verificationGeneration = useRef(0);
  const sessionVerification = useRef<SessionVerificationFlight | null>(null);
  const ownerVerification = useRef<OwnerVerificationFlight | null>(null);
  const deviceReachable = useRef<boolean | null>(null);
  const connectionDowngrade = useRef<Promise<LocalAccountOwner | null> | null>(null);
  const connectionDowngradeGeneration = useRef(-1);
  const admissionClosed = useRef(false);
  const cacheRef = useRef<LocalAccountCache | null>(null);
  const [cachedProfile, setCachedProfile] = useState<CachedVerifiedProfile | null>(null);
  const admission = useRef<{ mode: "online" | "local-only" | "signed-out"; owner: LocalAccountOwner | null }>({ mode: "signed-out", owner: null });
  const admissionRevision = useRef(0);
  const [accessMode, setAccessMode] = useState<"online" | "local-only" | "signed-out">("signed-out");
  const [localOwner, setLocalOwner] = useState<LocalAccountOwner | null>(null);
  const [admissionEpoch, setAdmissionEpoch] = useState(0);
  const [recovery, setRecovery] = useState<RecoveryState>("none");
  const [googleStatus, setGoogleStatus] = useState<"idle" | "finishing" | "failed" | "cancelled">("idle");
  const recoveryRef = useRef<RecoveryState>("none");
  const recoveryUser = useRef<string | null>(null);
  const saving = useRef(false), requesting = useRef(false);
  const nextRequest = useRef(0);
  const storageQueue = useRef(Promise.resolve());
  const changeAdmission = (mode: "online" | "local-only" | "signed-out", owner: LocalAccountOwner | null) => {
    if (admission.current.owner?.id !== owner?.id || admission.current.owner?.backendId !== owner?.backendId) {
      admissionRevision.current++; setAdmissionEpoch(admissionRevision.current);
    }
    admission.current = { mode, owner };
    setCloudConnectionScope(mode === "online" && owner ? { backendId: owner.backendId, ownerId: owner.id, admissionEpoch: admissionRevision.current } : null);
    setAccessMode(mode); setLocalOwner(mode === "local-only" ? owner : null);
  };
  const clearAccountCache = async () => {
    cacheRef.current = null; setCachedProfile(null);
    await accountCache?.clear();
  };
  const revokeAdmission = () => {
    verificationGeneration.current++; verified.current = null; verifiedCredentials.current = null; setVerifiedUser(null);
    sessionVerification.current = null;
    if (ownerVerification.current) ownerVerification.current.cancelled = true;
    ownerVerification.current = null;
    changeAdmission("signed-out", null); setVerifying(false);
  };
  const changeRecovery = (state: RecoveryState) => {
    const previous = recoveryRef.current;
    recoveryRef.current = state; setRecovery(state);
    if (state !== "none" && (previous === "none" || state === "checking" || state === "invalid")) {
      revokeAdmission(); void clearAccountCache().catch(() => {});
    }
  };
  const persistRecovery = (value: string | null) => {
    const task = storageQueue.current.catch(() => {}).then(() => value === null
      ? AsyncStorage.removeItem(recoveryStorageKey) : AsyncStorage.setItem(recoveryStorageKey, value));
    storageQueue.current = task; return task;
  };
  const redirectTo = Platform.OS === "web" && typeof window === "undefined"
    ? "" : Linking.createURL("auth/recovery");
  const callbackUrl = Platform.OS === "web" && typeof window === "undefined"
    ? "" : Linking.createURL("auth/callback");
  const verifySession = (current: Session | null, force = false, restorationError: unknown = null): Promise<LocalAccountOwner | null> => {
    if (admissionClosed.current && recoveryRef.current === "none") return Promise.resolve(null);
    if (deviceReachable.current === false && recoveryRef.current === "none") restorationError ??= new AuthVerificationTimeout();
    current = snapshotCredentials(current);
    const existing = sessionVerification.current;
    if (!restorationError && existing && existing.generation === verificationGeneration.current
      && existing.epoch === admissionRevision.current && existing.recovery === recoveryRef.current
      && sameCredentials(existing.session, current)) return existing.promise;
    if (!force && current?.access_token && current.refresh_token && verified.current?.id === current.user?.id
      && sameCredentials(verifiedCredentials.current, current)) {
      return Promise.resolve(backend && recoveryRef.current === "none" ? { id: verified.current.id, backendId: backend.backendId } : null);
    }
    const generation = ++verificationGeneration.current;
    let epoch = admissionRevision.current;
    const recoveryState = recoveryRef.current;
    const fresh = () => generation === verificationGeneration.current && epoch === admissionRevision.current
      && recoveryState === recoveryRef.current && sameCredentials(sessionRef.current, current)
      && !(admissionClosed.current && recoveryRef.current === "none");
    if (verified.current?.id !== current?.user?.id || !current) {
      verified.current = null; verifiedCredentials.current = null; setVerifiedUser(null);
    }
    setSessionError(false);
    setVerifying(true);
    const flight: SessionVerificationFlight = { session: current, epoch, recovery: recoveryState, generation,
      promise: Promise.resolve(null) };
    const work = async (): Promise<LocalAccountOwner | null> => {
    try {
      if (restorationError) throw restorationError;
      if (!current) {
        // A null SDK result is not evidence that persisted credentials vanished.
        const credential = backend ? await readPersistedCredentialOwner(AsyncStorage, backend) : { kind: "missing" as const };
        if (!fresh() || admissionClosed.current) return null;
        const owner = recoveryRef.current === "none" ? localRecoveryOwner(cacheRef.current, credential) : null;
        if (owner) { setCachedProfile(cacheRef.current!.profile); changeAdmission("local-only", owner); }
        else { revokeAdmission(); if (credential.kind === "missing" || credential.kind === "invalid") await clearAccountCache(); }
        return null;
      }
      if (!current.access_token || !current.refresh_token || !current.user?.id) throw { code: "invalid_session" };
      const { data, error } = await boundedAuthRequest(supabase.auth.getUser(current.access_token));
      if (error) throw error;
      if (!data.user || data.user.id !== current.user.id) throw { code: "owner_mismatch" };
      if (!fresh() || sessionRef.current?.user.id !== current.user.id) return null;
      if (deviceReachable.current === false && recoveryRef.current === "none") throw new AuthVerificationTimeout();
      verified.current = data.user; verifiedCredentials.current = current; verifiedAt.current = Date.now();
      setVerifiedUser(previous => sameUserDetails(previous, data.user) ? previous : data.user);
      // Recovery may display a network-verified identity but never admits Home
      // or stores a local recovery marker for that recovery session.
      if (recoveryRef.current !== "none") return null;
      const owner = backend ? { id: data.user.id, backendId: backend.backendId } : null;
      changeAdmission("online", owner);
      if (!returningEntry.current) void rememberSignInEntry();
      epoch = admissionRevision.current;
      flight.epoch = epoch;
      if (accountCache && owner) {
        const ownerGeneration = admissionRevision.current;
        const sameOwner = () => ownerGeneration === admissionRevision.current && recoveryRef.current === "none"
          && admission.current.mode === "online" && verified.current?.id === owner.id && sessionRef.current?.user.id === owner.id;
        try {
          const saved = await accountCache.verified(owner.id, sameOwner);
          if (saved && sameOwner()) { cacheRef.current = saved; setCachedProfile(previous => sameProfile(previous, saved.profile) ? previous : saved.profile); }
        } catch { /* Online access is valid; a failed marker cannot grant future local admission. */ }
      }
      return fresh() ? owner : null;
    } catch (error) {
      if (!fresh()) return null;
      if (recoveryRef.current !== "none") {
        verified.current = null; verifiedCredentials.current = null; setVerifiedUser(null);
        return null;
      }
      const credential = backend ? await readPersistedCredentialOwner(AsyncStorage, backend) : { kind: "missing" as const };
      if (!fresh()) return null;
      let cache = cacheRef.current;
      if (!cache && accountCache) { try { cache = await accountCache.load(); } catch { cache = null; } }
      if (!fresh()) return null;
      const owner = (isTemporaryAuthFailure(error) || (isExpiredAuthFailure(error) && credential.kind === "present" && credential.expired))
        ? localRecoveryOwner(cache, credential) : null;
      // Commit the new account surface together. Clearing user before these
      // storage reads briefly rendered a signed-out screen during an outage.
      verified.current = null; verifiedCredentials.current = null; setVerifiedUser(null);
      if (owner && (!current || current.user.id === owner.id)) {
        cacheRef.current = cache; setCachedProfile(cache!.profile); changeAdmission("local-only", owner); setSessionError(false);
      } else {
        changeAdmission("signed-out", null); setCachedProfile(null); setSessionError(!!current || !!restorationError);
        const reason = error as { code?: string; status?: number };
        const knownInvalid = ["invalid_session", "owner_mismatch", "bad_jwt", "invalid_credentials", "session_not_found", "user_not_found", "user_banned", "refresh_token_not_found", "refresh_token_already_used"].includes(reason?.code ?? "")
          || ((reason?.status === 401 || reason?.status === 403) && !isExpiredAuthFailure(error));
        const mismatch = credential.kind === "present" && ((cache && cache.ownerId !== credential.owner.id) || (current && current.user.id !== credential.owner.id));
        if (knownInvalid || mismatch || credential.kind === "missing" || credential.kind === "invalid") await clearAccountCache().catch(() => {});
      }
      return null;
    } finally {
      if (generation === verificationGeneration.current) setVerifying(false);
      if (sessionVerification.current === flight) sessionVerification.current = null;
    }
    };
    sessionVerification.current = flight;
    flight.promise = work();
    return flight.promise;
  };
  const cacheVerifiedProfile = useCallback(async (profile: CachedVerifiedProfile) => {
    const generation = admissionRevision.current;
    const current = () => generation === admissionRevision.current && recoveryRef.current === "none" && admission.current.mode === "online"
      && verified.current?.id === profile.id && sessionRef.current?.user.id === profile.id;
    if (!accountCache || !current()) return;
    const saved = await accountCache.profile(profile, current);
    if (saved && current()) { cacheRef.current = saved; setCachedProfile(previous => sameProfile(previous, saved.profile) ? previous : saved.profile); }
  }, [accountCache]);
  // The same credentials were checked with the server moments ago, online.
  const recentProof = (current: Session | null, error: unknown) => !error && !!current?.access_token && !!current.refresh_token
    && admission.current.mode === "online" && recoveryRef.current === "none" && deviceReachable.current !== false
    && verified.current?.id === current.user?.id && sameCredentials(verifiedCredentials.current, current)
    && Date.now() - verifiedAt.current >= 0 && Date.now() - verifiedAt.current < OWNER_PROOF_TTL_MS;
  const verifyCurrentOwner = (options?: { fresh?: boolean }): Promise<LocalAccountOwner | null> => {
    const wantsFresh = options?.fresh === true;
    const ownerId = admission.current.owner?.id ?? sessionRef.current?.user.id;
    if (!ownerId || recoveryRef.current !== "none" || admissionClosed.current) return Promise.resolve(null);
    if (deviceReachable.current === false) return connectionDowngrade.current ?? Promise.resolve(null);
    const epoch = admissionRevision.current;
    const current = snapshotCredentials(sessionRef.current);
    const existing = ownerVerification.current;
    // A fresh flight can answer anyone; a fresh request never joins a reused one.
    if (existing && !existing.cancelled && existing.ownerId === ownerId && existing.epoch === epoch
      && sameCredentials(existing.session, current) && (existing.fresh || !wantsFresh)) return existing.promise;
    const flight: OwnerVerificationFlight = { ownerId, epoch, session: current, cancelled: false, fresh: wantsFresh,
      promise: Promise.resolve(null) };
    const fresh = () => !flight.cancelled && flight.epoch === admissionRevision.current && !admissionClosed.current
      && recoveryRef.current === "none" && sameCredentials(sessionRef.current, flight.session)
      && (admission.current.owner?.id ?? sessionRef.current?.user.id) === ownerId;
    const work = async (): Promise<LocalAccountOwner | null> => {
      const result = await boundedAuthRequest(supabase.auth.getSession()).catch(error => ({ data: { session: null }, error }));
      if (!fresh() || (result.data.session && result.data.session.user.id !== ownerId)) return null;
      // A refresh may return new credentials. Their own fresh getUser check is
      // required; a same-owner JWT or local marker is never cloud proof.
      const changed = !sameCredentials(sessionRef.current, result.data.session);
      sessionRef.current = result.data.session;
      if (changed) setSession(result.data.session);
      flight.session = snapshotCredentials(result.data.session);
      return verifySession(result.data.session, wantsFresh || !recentProof(result.data.session, result.error), result.error);
    };
    ownerVerification.current = flight;
    flight.promise = boundedAuthRequest(work()).catch(async error => {
      if (!fresh()) return null;
      flight.cancelled = true;
      // Invalidate any hung proof before admitting only local recovery. The
      // network request may still resolve, but its generation cannot commit.
      return verifySession(sessionRef.current, true, error);
    }).finally(() => { if (ownerVerification.current === flight) ownerVerification.current = null; });
    return flight.promise;
  };
  useEffect(() => {
    let live = true, authEventSeen = false;
    let processing = false, recoveryEventSeen = false, lastLink: string | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, current) => {
      authEventSeen = true;
      if (!live) return;
      sessionRef.current = current;
      if (event === "SIGNED_OUT") { admissionClosed.current = true; revokeAdmission(); void clearAccountCache().catch(() => {}); }
      else if (current && admission.current.owner && current.user.id !== admission.current.owner.id) {
        revokeAdmission(); void clearAccountCache().catch(() => {});
      }
      // Never await Supabase inside its auth callback (auth lock deadlock).
      if (event === "PASSWORD_RECOVERY" && current) {
        recoveryEventSeen = true;
        recoveryUser.current = current.user.id;
        if (!processing) {
          changeRecovery("checking");
          void persistRecovery(current.user.id).then(() => { if (live) changeRecovery("ready"); })
            .catch(() => { if (live) changeRecovery("invalid"); });
        }
      } else if (recoveryRef.current === "ready" && current?.user.id !== recoveryUser.current) changeRecovery("invalid");
      setSession(current);
      // Defer SDK calls until its synchronous callback releases its auth lock.
      if (current) void Promise.resolve().then(() => live ? verifySession(current) : null);
    });
    // Google sign-in comes back here with a one-time code for this phone.
    let lastCallback: string | null = null;
    const handleCallback = async (url: string) => {
      // Never mistake a recovery link for a sign-in link.
      if (!callbackUrl || callbackUrl === redirectTo) return false;
      const callback = parseAuthCallback(url, callbackUrl);
      if (!callback) return false;
      if (lastCallback === url) return true;
      lastCallback = url;
      if (callback.kind === "error") { if (live) setGoogleStatus(callback.cancelled ? "cancelled" : "failed"); return true; }
      if (recoveryRef.current !== "none") return true;
      admissionClosed.current = false;
      if (live) setGoogleStatus("finishing");
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
        if (live) setGoogleStatus(error ? "failed" : "idle");
      } catch { if (live) setGoogleStatus("failed"); }
      return true;
    };
    const handleLink = async (url: string) => {
      if (await handleCallback(url)) return;
      const link = parseRecoveryLink(url, redirectTo);
      if (!link || processing || saving.current || lastLink === url) return;
      processing = true; recoveryEventSeen = false; lastLink = url; changeRecovery("checking");
      if (Platform.OS === "web" && typeof window !== "undefined") window.history.replaceState(null, "", "/auth/recovery");
      try {
        // Write the guard before the auth library persists a recovery session.
        await persistRecovery("pending");
        if (link.kind === "invalid") throw new Error(recoveryLinkError);
        let recovered: Session | null = null;
        if (link.kind === "session") {
          // Native implicit callbacks emit SIGNED_IN from setSession; latch recovery before it.
          const { data, error } = await supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
          if (error) throw error;
          recovered = data.session;
        } else if (link.kind === "hash") {
          const { data, error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: "recovery" });
          if (error) throw error;
          recovered = data.session; // Emits PASSWORD_RECOVERY.
        } else {
          const { data, error } = await supabase.auth.exchangeCodeForSession(link.code);
          if (error || !recoveryEventSeen) throw error ?? new Error(recoveryLinkError);
          recovered = data.session;
        }
        if (!recovered) throw new Error(recoveryLinkError);
        recoveryUser.current = recovered.user.id;
        await persistRecovery(recovered.user.id);
        if (live) { sessionRef.current = recovered; setSession(recovered); changeRecovery("ready"); }
      } catch { if (live) changeRecovery("invalid"); }
      finally { processing = false; }
    };
    const listener = Linking.addEventListener("url", ({ url }) => { void handleLink(url); });
    void (async () => {
      try {
        const [credential, cached, marker, url, entry] = await Promise.all([
          backend ? readPersistedCredentialOwner(AsyncStorage, backend) : Promise.resolve({ kind: "missing" as const }),
          accountCache?.load().catch(() => null) ?? Promise.resolve(null), AsyncStorage.getItem(recoveryStorageKey), Linking.getInitialURL(),
          AsyncStorage.getItem(authEntryStorageKey).catch(() => null),
        ]);
        if (!live) return;
        if (!returningEntry.current) setAuthEntryMode(authEntryPreference(entry, credential.kind !== "missing" || !!cached || !!marker));
        if (!verified.current || verified.current.id === cached?.ownerId) cacheRef.current = cached;
        const initialRecoveryLink = url ? parseRecoveryLink(url, redirectTo) : null;
        if (marker || initialRecoveryLink) {
          recoveryUser.current = marker;
          if (recoveryRef.current === "none") changeRecovery("checking");
        } else if (!admissionClosed.current && recoveryRef.current === "none") {
          const owner = localRecoveryOwner(cached, credential);
          if (owner && (!sessionRef.current || sessionRef.current.user.id === owner.id) && !verified.current) {
            setCachedProfile(cached!.profile); changeAdmission("local-only", owner);
            // The SDK can be retrying refresh/getUser with no network. A known
            // local owner must see their journal without waiting for that call.
            setLoading(false);
          }
        }
        const restorationGeneration = verificationGeneration.current;
        const restored = await boundedAuthRequest(supabase.auth.getSession()).catch(error => ({ data: { session: null }, error }));
        if (!live) return;
        // Automatic reconnect can verify an account while the boot SDK read is
        // still pending, even without an auth callback. Its newer proof wins.
        if (restorationGeneration === verificationGeneration.current
          && (!authEventSeen || (!restored.data.session && restored.error && !sessionRef.current && !verified.current))) {
          sessionRef.current = restored.data.session;
          setSession(restored.data.session);
          // A refresh failure may return null while the original credential is
          // still present. Verify against a new independent storage read below.
          if (credential.kind === "invalid") await clearAccountCache().catch(() => {});
          await verifySession(restored.data.session, false, restored.error);
        }
        if (marker && (recoveryRef.current === "none" || recoveryRef.current === "checking")) {
          recoveryUser.current = marker;
          changeRecovery(restored.data.session?.user.id === marker ? "ready" : "invalid");
        }
        // Browser history is scrubbed after verification. A refresh of that bare
        // callback may resume only the already verified, matching recovery session.
        const resumeBareCallback = !!marker && restored.data.session?.user.id === marker
          && !!url && parseRecoveryLink(url, redirectTo)?.kind === "invalid"
          && !new URL(url).search && !new URL(url).hash;
        if (url && !resumeBareCallback) await handleLink(url);
      } catch {
        // Storage failure must not expose a persisted recovery session to Home.
        if (live) changeRecovery("invalid");
      } finally { if (live) setLoading(false); }
    })();
    const cancelVerification = () => {
      verificationGeneration.current++; sessionVerification.current = null;
      if (ownerVerification.current) ownerVerification.current.cancelled = true;
      ownerVerification.current = null;
    };
    return () => { live = false; cancelVerification(); subscription.unsubscribe(); listener.remove(); };
    // The listener and boot guard belong to this provider instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const failure = (code: string) => Object.assign(new Error(code), { code });
  const signIn = async (identifier: string, password: string) => {
    admissionClosed.current = false;
    let email = identifier.trim();
    if (!email.includes("@")) {
      // A username: the database checks the password and, only when it is
      // right, returns the account's email. Then Supabase signs in as usual.
      try {
        const { data, error } = await supabase.rpc("username_sign_in_email_v1", { p_username: email, p_password: password });
        if (error) {
          if (/too_many_attempts/.test(error.message ?? "")) return { error: failure("too_many_attempts") };
          if (error.code === "PGRST202") return { error: failure("username_sign_in_unavailable") };
          return { error: failure("network") };
        }
        if (typeof data !== "string" || !validEmail(data)) return { error: failure("invalid_credentials") };
        email = data;
      } catch { return { error: failure("network") }; }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password }); return { error };
  };
  const verifySignUpCode = async (email: string, code: string) => {
    admissionClosed.current = false;
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "signup" });
    return { error };
  };
  const resendSignUpCode = async (email: string) => {
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    return { error };
  };
  const signInWithGoogle = async () => {
    if (!callbackUrl) return { error: failure("google_failed") };
    admissionClosed.current = false; setGoogleStatus("idle");
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google",
      options: { redirectTo: callbackUrl, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } } });
    if (error || !data?.url) return { error: error ?? failure("google_failed") };
    try { await Linking.openURL(data.url); } catch { return { error: failure("google_failed") }; }
    return { error: null };
  };
  // The reset email's 6-digit code. Like a recovery link, a guard is written
  // before the code opens a recovery session, so Home is never shown with it.
  const recoverWithCode = async (email: string, code: string) => {
    if (saving.current) return;
    if (!validEmail(email) || !/^\d{6,10}$/.test(code.trim())) throw failure("otp_invalid");
    await persistRecovery("pending");
    let result;
    try { result = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "recovery" }); }
    catch (error) { if (recoveryRef.current === "none") await persistRecovery(null).catch(() => {}); throw error; }
    if (result.error || !result.data.session) {
      if (recoveryRef.current === "none") await persistRecovery(null).catch(() => {});
      throw result.error ?? failure("otp_invalid");
    }
    const recovered = result.data.session;
    recoveryUser.current = recovered.user.id;
    await persistRecovery(recovered.user.id);
    sessionRef.current = recovered; setSession(recovered); changeRecovery("ready");
  };
  const signUp = async (email: string, password: string) => {
    admissionClosed.current = false;
    const { data, error } = await supabase.auth.signUp({ email, password });
    const duplicate = ["user_already_exists", "email_exists"].includes(error?.code ?? "");
    return { error: duplicate ? null : error, needsEmailConfirmation: duplicate || !data.session };
  };
  const signOut = async () => {
    admissionClosed.current = true;
    revokeAdmission(); setCachedProfile(null);
    const generation = verificationGeneration.current;
    await rememberSignInEntry();
    let cacheError: Error | null = null;
    try { await clearAccountCache(); } catch { cacheError = new Error("Could not clear local account access. Please retry sign out."); }
    if (generation !== verificationGeneration.current) return { error: new Error("Account changed before sign out finished. Please retry.") };
    const { error } = await supabase.auth.signOut({ scope: "local" }); return { error: error ?? cacheError };
  };
  const requestPasswordReset = async (email: string) => {
    if (!validEmail(email)) throw new Error("Enter a valid email address.");
    if (isExpoGoLanRecoveryRedirect(redirectTo)) throw { code: "unsupported_recovery_redirect" };
    if (requesting.current || Date.now() < nextRequest.current) throw { status: 429 };
    requesting.current = true; nextRequest.current = Date.now() + 60_000;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error && !["user_not_found", "email_not_found"].includes(error.code ?? "")) throw error;
    } finally { requesting.current = false; }
  };
  const saveRecoveryPassword = async (password: string) => {
    if (saving.current) return;
    if (password.length < 8) throw new Error("Use at least 8 characters.");
    if (recoveryRef.current !== "ready" || !session || session.user.id !== recoveryUser.current) throw new Error(recoveryLinkError);
    saving.current = true;
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (error.status === 401 || error.status === 403 || error.code === "session_not_found") changeRecovery("invalid");
        throw error;
      }
      changeRecovery("success");
    } finally { saving.current = false; }
  };
  const leaveRecovery = async () => {
    if (saving.current || recoveryRef.current === "checking") return;
    // Require successful local sign-out before clearing the recovery guard.
    saving.current = true;
    try {
      const { error } = await signOut();
      if (error) throw error;
      await persistRecovery(null);
      recoveryUser.current = null;
      sessionRef.current = null; setSession(null); changeRecovery("none");
    } finally { saving.current = false; }
  };
  const retrySessionVerification = async () => {
    if (admission.current.owner) { await verifyCurrentOwner(); return; }
    const generation = verificationGeneration.current;
    const epoch = admissionRevision.current;
    const current = snapshotCredentials(sessionRef.current);
    const result = await boundedAuthRequest(supabase.auth.getSession()).catch(error => ({ data: { session: null }, error }));
    if (generation !== verificationGeneration.current || epoch !== admissionRevision.current
      || admissionClosed.current || recoveryRef.current !== "none" || !sameCredentials(current, sessionRef.current)) return;
    sessionRef.current = result.data.session; setSession(result.data.session);
    await verifySession(result.data.session, true, result.error);
  };
  const reconnectVerification = useRef(verifyCurrentOwner);
  useEffect(() => { reconnectVerification.current = verifyCurrentOwner; });
  const enterLocalConnection = useRef<() => Promise<LocalAccountOwner | null>>(() => Promise.resolve(null));
  useEffect(() => { enterLocalConnection.current = () => {
    if (admission.current.mode !== "online" || !admission.current.owner || admissionClosed.current || recoveryRef.current !== "none") return Promise.resolve(null);
    if (connectionDowngrade.current && connectionDowngradeGeneration.current === verificationGeneration.current) return connectionDowngrade.current;
    if (ownerVerification.current) ownerVerification.current.cancelled = true;
    ownerVerification.current = null;
    // Reuse the independent persisted-owner/cache checks. Native network state
    // and failed HTTP calls can remove cloud access, never grant account access.
    const request = verifySession(sessionRef.current, true, new AuthVerificationTimeout()).finally(() => {
      if (connectionDowngrade.current === request) connectionDowngrade.current = null;
    });
    connectionDowngrade.current = request;
    connectionDowngradeGeneration.current = verificationGeneration.current;
    return request;
  }; });
  useEffect(() => {
    let live = true;
    let active = !AppState?.currentState || AppState.currentState === "active";
    let sequence = -1;
    let nativeSubscription: { remove(): void } | null = null;
    let validationTimer: ReturnType<typeof setTimeout> | null = null;
    const checkAgain = () => {
      if (!live || !active || deviceReachable.current === false || admission.current.mode !== "local-only"
        || admissionClosed.current || recoveryRef.current !== "none") return;
      void reconnectVerification.current().catch(() => null);
    };
    const acceptNetwork = (state: { connected: boolean; validated: boolean; sequence: number } | null) => {
      if (!live || !state || state.sequence <= sequence) return;
      sequence = state.sequence;
      if (validationTimer) { clearTimeout(validationTimer); validationTimer = null; }
      const reachable = state.connected && state.validated;
      const apply = () => {
        if (!live || sequence !== state.sequence) return;
        deviceReachable.current = reachable;
        if (!reachable) void enterLocalConnection.current().then(checkAgain).catch(() => null);
        else if (connectionDowngrade.current) void connectionDowngrade.current.then(checkAgain).catch(() => null);
        else checkAgain();
      };
      // New Wi-Fi may take a moment to validate while cellular hands over.
      // Ignore that short gap; a complete network loss is immediate.
      if (state.connected && !state.validated) validationTimer = setTimeout(apply, 800);
      else apply();
    };
    const unsubscribeFailures = subscribeCloudConnectionFailure(scope => {
      if (!live || scope.ownerId !== admission.current.owner?.id || scope.backendId !== admission.current.owner?.backendId
        || scope.admissionEpoch !== admissionRevision.current) return;
      void enterLocalConnection.current().catch(() => null);
    });
    // Subscribe before reading. The native sequence rejects a stale initial
    // snapshot that arrives after a more recent connection event.
    void subscribeNativeConnectivity(acceptNetwork).then(subscription => {
      if (!live) { subscription?.remove(); return; }
      nativeSubscription = subscription;
      void readNativeConnectivity().then(acceptNetwork).catch(() => null);
    }).catch(() => null);
    const listener = AppState?.addEventListener("change", state => {
      active = state === "active";
      if (active) { void readNativeConnectivity().then(acceptNetwork).catch(() => null); checkAgain(); }
    });
    return () => {
      live = false; unsubscribeFailures(); nativeSubscription?.remove(); listener?.remove();
      if (validationTimer) clearTimeout(validationTimer);
      setCloudConnectionScope(null);
    };
  }, []);
  useEffect(() => {
    if (accessMode !== "local-only" || !localOwner || recovery !== "none") return;
    let live = true, checking = false;
    let active = !AppState?.currentState || AppState.currentState === "active";
    const epoch = admissionEpoch, ownerId = localOwner.id, ownerBackend = localOwner.backendId;
    const retry = () => {
      if (!live || !active || checking || admissionClosed.current || recoveryRef.current !== "none"
        || admissionRevision.current !== epoch || admission.current.mode !== "local-only"
        || admission.current.owner?.id !== ownerId || admission.current.owner.backendId !== ownerBackend) return;
      checking = true;
      // This is a fresh cloud proof, not admission from the cached account.
      // Manual retry and session sync join the same owner verification flight.
      void reconnectVerification.current().catch(() => null).finally(() => { checking = false; });
    };
    const interval = setInterval(retry, LOCAL_RECONNECT_INTERVAL_MS);
    const listener = AppState?.addEventListener("change", state => {
      active = state === "active";
      if (active) retry();
    });
    return () => { live = false; clearInterval(interval); listener?.remove(); };
  }, [accessMode, localOwner, admissionEpoch, recovery]);
  return (
    <AuthContext.Provider value={{ session, user: verifiedUser?.id === session?.user?.id ? verifiedUser : null, loading: loading || (verifying && accessMode === "signed-out"), recovery,
      sessionError, authEntryMode, localOwner, accessMode, admissionEpoch, cachedProfile, cacheVerifiedProfile, verifyCurrentOwner,
      retrySessionVerification,
      signIn, signUp, signOut, requestPasswordReset, saveRecoveryPassword, leaveRecovery,
      verifySignUpCode, resendSignUpCode, signInWithGoogle, googleStatus, recoverWithCode }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
