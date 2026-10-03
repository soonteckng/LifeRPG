import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { supabase } from "../../lib/supabase";
import { isExpoGoLanRecoveryRedirect, parseRecoveryLink, recoveryLinkError, recoveryStorageKey, validEmail, type RecoveryState } from "../utils/passwordRecovery";
interface AuthContextType {
  session: Session | null; user: User | null; loading: boolean; recovery: RecoveryState;
  sessionError: boolean;
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
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState<User | null>(null);
  const verified = useRef<User | null>(null);
  const verificationGeneration = useRef(0);
  const [recovery, setRecovery] = useState<RecoveryState>("none");
  const recoveryRef = useRef<RecoveryState>("none");
  const recoveryUser = useRef<string | null>(null);
  const saving = useRef(false), requesting = useRef(false);
  const nextRequest = useRef(0);
  const storageQueue = useRef(Promise.resolve());
  const changeRecovery = (state: RecoveryState) => { recoveryRef.current = state; setRecovery(state); };
  const persistRecovery = (value: string | null) => {
    const task = storageQueue.current.catch(() => {}).then(() => value === null
      ? AsyncStorage.removeItem(recoveryStorageKey) : AsyncStorage.setItem(recoveryStorageKey, value));
    storageQueue.current = task; return task;
  };
  const redirectTo = Platform.OS === "web" && typeof window === "undefined"
    ? "" : Linking.createURL("auth/recovery");
  const verifySession = async (current: Session | null) => {
    if (current?.access_token && current.refresh_token && verified.current?.id === current.user?.id) return;
    const generation = ++verificationGeneration.current;
    verified.current = null; setVerifiedUser(null); setSessionError(false);
    if (!current) { setVerifying(false); return; }
    setVerifying(true);
    try {
      if (!current.access_token || !current.refresh_token || !current.user?.id) throw new Error("Invalid session");
      const { data, error } = await supabase.auth.getUser(current.access_token);
      if (error || !data.user || data.user.id !== current.user.id) throw new Error("Session verification failed");
      if (generation !== verificationGeneration.current) return;
      verified.current = data.user; setVerifiedUser(data.user);
    } catch {
      if (generation === verificationGeneration.current) setSessionError(true);
    } finally {
      if (generation === verificationGeneration.current) setVerifying(false);
    }
  };
  useEffect(() => {
    let live = true, authEventSeen = false;
    let processing = false, recoveryEventSeen = false, lastLink: string | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, current) => {
      authEventSeen = true;
      if (!live) return;
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
      void verifySession(current);
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
        if (live) { setSession(recovered); changeRecovery("ready"); }
      } catch { if (live) changeRecovery("invalid"); }
      finally { processing = false; }
    };
    const listener = Linking.addEventListener("url", ({ url }) => { void handleLink(url); });
    void (async () => {
      try {
        const [restored, marker, url] = await Promise.all([
          supabase.auth.getSession(), AsyncStorage.getItem(recoveryStorageKey), Linking.getInitialURL(),
        ]);
        if (!live) return;
        if (!authEventSeen) {
          setSession(restored.data.session);
          await verifySession(restored.error ? null : restored.data.session);
        }
        if (marker && recoveryRef.current === "none") {
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
    const { error } = await supabase.auth.signInWithPassword({ email, password }); return { error };
  };
  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    const duplicate = ["user_already_exists", "email_exists"].includes(error?.code ?? "");
    return { error: duplicate ? null : error, needsEmailConfirmation: duplicate || !data.session };
  };
  const signOut = async () => {
    const { error } = await supabase.auth.signOut({ scope: "local" }); return { error };
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
      setSession(null); changeRecovery("none");
    } finally { saving.current = false; }
  };
  return (
    <AuthContext.Provider value={{ session, user: verifiedUser?.id === session?.user?.id ? verifiedUser : null, loading: loading || verifying, recovery,
      sessionError, retrySessionVerification: () => verifySession(session),
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
