import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { supabase } from "../../lib/supabase";
import { isExpoGoLanRecoveryRedirect, parseRecoveryLink, recoveryLinkError, recoveryStorageKey, validEmail, type RecoveryState } from "../utils/passwordRecovery";
import { sessionBackendIdentity } from "../utils/sessionBackend";
import { createLocalAccountCache, readPersistedCredentialOwner, localRecoveryOwner, isTemporaryAuthFailure, isExpiredAuthFailure,
  type LocalAccountOwner, type LocalAccountCache, type CachedVerifiedProfile } from "../services/localAccountCache";
interface AuthContextType {
  session: Session | null; user: User | null; loading: boolean; recovery: RecoveryState;
  sessionError: boolean;
  localOwner: LocalAccountOwner | null;
  accessMode: "online" | "local-only" | "signed-out";
  admissionEpoch: number;
  cachedProfile: CachedVerifiedProfile | null;
  cacheVerifiedProfile: (profile: CachedVerifiedProfile) => Promise<void>;
  verifyCurrentOwner: () => Promise<LocalAccountOwner | null>;
  retrySessionVerification: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<{ error: Error | null }>;
  requestPasswordReset: (email: string) => Promise<void>;
  saveRecoveryPassword: (password: string) => Promise<void>;
  leaveRecovery: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const backend = useMemo(() => sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL), []);
  const accountCache = useMemo(() => backend ? createLocalAccountCache(AsyncStorage, backend.backendId) : null, [backend]);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState<User | null>(null);
  const verified = useRef<User | null>(null);
  const verificationGeneration = useRef(0);
  const admissionClosed = useRef(false);
  const cacheRef = useRef<LocalAccountCache | null>(null);
  const [cachedProfile, setCachedProfile] = useState<CachedVerifiedProfile | null>(null);
  const admission = useRef<{ mode: "online" | "local-only" | "signed-out"; owner: LocalAccountOwner | null }>({ mode: "signed-out", owner: null });
  const admissionRevision = useRef(0);
  const [accessMode, setAccessMode] = useState<"online" | "local-only" | "signed-out">("signed-out");
  const [localOwner, setLocalOwner] = useState<LocalAccountOwner | null>(null);
  const [admissionEpoch, setAdmissionEpoch] = useState(0);
  const [recovery, setRecovery] = useState<RecoveryState>("none");
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
    setAccessMode(mode); setLocalOwner(mode === "local-only" ? owner : null);
  };
  const clearAccountCache = async () => {
    cacheRef.current = null; setCachedProfile(null);
    await accountCache?.clear();
  };
  const revokeAdmission = () => {
    verificationGeneration.current++; verified.current = null; setVerifiedUser(null);
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
  const verifySession = async (current: Session | null, force = false, restorationError: unknown = null): Promise<LocalAccountOwner | null> => {
    if (admissionClosed.current && recoveryRef.current === "none") return null;
    if (!force && current?.access_token && current.refresh_token && verified.current?.id === current.user?.id) {
      return backend && recoveryRef.current === "none" ? { id: verified.current.id, backendId: backend.backendId } : null;
    }
    const generation = ++verificationGeneration.current;
    const fresh = () => generation === verificationGeneration.current;
    if (!force || verified.current?.id !== current?.user?.id) { verified.current = null; setVerifiedUser(null); }
    setSessionError(false);
    setVerifying(true);
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
      const { data, error } = await supabase.auth.getUser(current.access_token);
      if (error) throw error;
      if (!data.user || data.user.id !== current.user.id) throw { code: "owner_mismatch" };
      if (!fresh() || sessionRef.current?.user.id !== current.user.id) return null;
      verified.current = data.user; setVerifiedUser(data.user);
      // Recovery may display a network-verified identity but never admits Home
      // or stores a local recovery marker for that recovery session.
      if (recoveryRef.current !== "none") return null;
      const owner = backend ? { id: data.user.id, backendId: backend.backendId } : null;
      changeAdmission("online", owner);
      if (accountCache && owner) {
        const ownerGeneration = admissionRevision.current;
        const sameOwner = () => ownerGeneration === admissionRevision.current && recoveryRef.current === "none"
          && admission.current.mode === "online" && verified.current?.id === owner.id && sessionRef.current?.user.id === owner.id;
        try {
          const saved = await accountCache.verified(owner.id, sameOwner);
          if (saved && sameOwner()) { cacheRef.current = saved; setCachedProfile(saved.profile); }
        } catch { /* Online access is valid; a failed marker cannot grant future local admission. */ }
      }
      return fresh() ? owner : null;
    } catch (error) {
      if (!fresh()) return null;
      verified.current = null; setVerifiedUser(null);
      if (recoveryRef.current !== "none") return null;
      const credential = backend ? await readPersistedCredentialOwner(AsyncStorage, backend) : { kind: "missing" as const };
      if (!fresh()) return null;
      let cache = cacheRef.current;
      if (!cache && accountCache) { try { cache = await accountCache.load(); } catch { cache = null; } }
      if (!fresh()) return null;
      const owner = (isTemporaryAuthFailure(error) || (isExpiredAuthFailure(error) && credential.kind === "present" && credential.expired))
        ? localRecoveryOwner(cache, credential) : null;
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
      if (generation === verificationGeneration.current || !current) setVerifying(false);
    }
  };
  const cacheVerifiedProfile = useCallback(async (profile: CachedVerifiedProfile) => {
    const generation = admissionRevision.current;
    const current = () => generation === admissionRevision.current && recoveryRef.current === "none" && admission.current.mode === "online"
      && verified.current?.id === profile.id && sessionRef.current?.user.id === profile.id;
    if (!accountCache || !current()) return;
    const saved = await accountCache.profile(profile, current);
    if (saved && current()) { cacheRef.current = saved; setCachedProfile(saved.profile); }
  }, [accountCache]);
  const verifyCurrentOwner = async () => {
    const ownerId = admission.current.owner?.id ?? sessionRef.current?.user.id;
    const generation = verificationGeneration.current;
    if (!ownerId || recoveryRef.current !== "none") return null;
    const result = await supabase.auth.getSession().catch(error => ({ data: { session: null }, error }));
    if (generation !== verificationGeneration.current || admissionClosed.current) return null;
    if (recoveryRef.current !== "none" || (result.data.session && result.data.session.user.id !== ownerId)) return null;
    sessionRef.current = result.data.session; setSession(result.data.session);
    return verifySession(result.data.session, true, result.error);
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
    const handleLink = async (url: string) => {
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
        const [credential, cached, marker, url] = await Promise.all([
          backend ? readPersistedCredentialOwner(AsyncStorage, backend) : Promise.resolve({ kind: "missing" as const }),
          accountCache?.load().catch(() => null) ?? Promise.resolve(null), AsyncStorage.getItem(recoveryStorageKey), Linking.getInitialURL(),
        ]);
        if (!live) return;
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
        const restored = await supabase.auth.getSession().catch(error => ({ data: { session: null }, error }));
        if (!live) return;
        if (!authEventSeen || (!restored.data.session && restored.error)) {
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
    const cancelVerification = () => { verificationGeneration.current++; };
    return () => { live = false; cancelVerification(); subscription.unsubscribe(); listener.remove(); };
    // The listener and boot guard belong to this provider instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const signIn = async (email: string, password: string) => {
    admissionClosed.current = false;
    const { error } = await supabase.auth.signInWithPassword({ email, password }); return { error };
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
  return (
    <AuthContext.Provider value={{ session, user: verifiedUser?.id === session?.user?.id ? verifiedUser : null, loading: loading || (verifying && accessMode === "signed-out"), recovery,
      sessionError, localOwner, accessMode, admissionEpoch, cachedProfile, cacheVerifiedProfile, verifyCurrentOwner,
      retrySessionVerification: async () => { if (admission.current.owner) await verifyCurrentOwner(); else { const result = await supabase.auth.getSession().catch(error => ({ data: { session: null }, error })); sessionRef.current = result.data.session; setSession(result.data.session); await verifySession(result.data.session, true, result.error); } },
      signIn, signUp, signOut, requestPasswordReset, saveRecoveryPassword, leaveRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
