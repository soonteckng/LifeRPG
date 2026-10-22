import { useRef, useState } from "react";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import SheetConfirmation from "./SheetConfirmation";
import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { deleteMyAccount, forgetAccountOnPhone } from "../services/accountDeletion";

/**
 * Settings → Delete account. One clear confirmation, then the account and its
 * data are deleted on the server, this phone forgets it, and you're signed out.
 */
export default function DeleteAccount() {
  const { profile } = useUser();
  const { signOut, accessMode } = useAuth();
  const { hasOpenSession, isRestoring, restoreError, actionBusy, unsyncedSessionCount } = useTimer({ live: false });
  const [asking, setAsking] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  const online = accessMode === "online";
  const blocked = !!(hasOpenSession || isRestoring || restoreError || actionBusy);
  const unsynced = unsyncedSessionCount ?? 0;
  const remove = async () => {
    if (lock.current || blocked || !online) return;
    lock.current = true; setBusy(true); setError("");
    const owner = profile.id;
    const deleted = await deleteMyAccount();
    if (!deleted) {
      lock.current = false; setBusy(false); setAsking(false);
      setError("Couldn’t delete your account. Check your connection and try again.");
      return;
    }
    await forgetAccountOnPhone(owner);
    // The account no longer exists, so signing out here only clears this phone.
    await signOut().catch(() => null);
  };
  const footer = error || (blocked ? "Finish or end your session before deleting your account." : !online ? "Deleting your account needs internet." : "Deletes your account and everything in it. This can’t be undone.");
  const message = [
    "Your level, sessions, routines, subjects, exams and streak are deleted for good, on every device.",
    "Squads you lead pass to the next member, so your friends keep them.",
    unsynced ? `${unsynced} ${unsynced === 1 ? "session" : "sessions"} on this phone haven’t synced yet and will be lost too.` : "",
  ].filter(Boolean).join(" ");
  return <>
    <SettingsGroup footer={footer}>
      <SettingsRow first danger icon="trash-outline" title="Delete account" disabled={blocked || !online || busy} onPress={() => { setError(""); setAsking(true); }} />
    </SettingsGroup>
    {asking && <SheetConfirmation elevated destructive title="Delete your account?" message={message}
      confirmLabel={busy ? "Deleting…" : "Delete forever"} cancelLabel="Keep my account"
      onCancel={() => { if (!busy) setAsking(false); }} onConfirm={() => void remove()} />}
  </>;
}
