import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Text } from "./AppText";
import AppSheet from "./AppSheet";
import SheetTextInput from "./SheetTextInput";
import Pressable from "./MotionPressable";
import { PersonalButton, p } from "./PersonalUI";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import SheetConfirmation from "./SheetConfirmation";
import { colors } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { deleteMyAccount, forgetAccountOnPhone } from "../services/accountDeletion";

export const DELETE_WAIT_SECONDS = 10;
const sameName = (typed: string, name: string) => !!name.trim() && typed.trim().toLowerCase() === name.trim().toLowerCase();

/**
 * Settings → Delete account, in two steps so it can't happen by accident:
 * first what will be deleted, then type your username and wait ten seconds
 * before Delete forever unlocks. Then the account and its data are deleted on
 * the server, this phone forgets it, and you're signed out.
 */
export default function DeleteAccount() {
  const { profile } = useUser();
  const { signOut, accessMode } = useAuth();
  const { hasOpenSession, isRestoring, restoreError, actionBusy, unsyncedSessionCount } = useTimer({ live: false });
  const [step, setStep] = useState<"ask" | "type" | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [typed, setTyped] = useState(""), [wait, setWait] = useState(DELETE_WAIT_SECONDS);
  const lock = useRef(false);
  const online = accessMode === "online";
  const blocked = !!(hasOpenSession || isRestoring || restoreError || actionBusy);
  const unsynced = unsyncedSessionCount ?? 0;
  const name = profile.username ?? "";
  // The countdown runs only while the second step is open, and starts over each time.
  useEffect(() => {
    if (step !== "type" || wait <= 0) return;
    const timer = setTimeout(() => setWait(seconds => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [step, wait]);
  const ready = step === "type" && wait === 0 && sameName(typed, name) && !busy && !blocked && online;
  const close = () => { if (!busy) setStep(null); };
  const remove = async () => {
    if (lock.current || !ready) return;
    lock.current = true; setBusy(true); setError("");
    const owner = profile.id;
    const deleted = await deleteMyAccount();
    if (!deleted) {
      lock.current = false; setBusy(false); setStep(null);
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
  const label = busy ? "Deleting…" : wait > 0 ? `Delete forever (${wait})` : "Delete forever";
  return <>
    <SettingsGroup footer={footer}>
      <SettingsRow first danger icon="trash-outline" title="Delete account" disabled={blocked || !online || busy} onPress={() => { setError(""); setStep("ask"); }} />
    </SettingsGroup>
    {step === "ask" && <SheetConfirmation elevated destructive title="Delete your account?" message={message}
      confirmLabel="Continue" cancelLabel="Keep my account"
      onCancel={close} onConfirm={() => { setTyped(""); setWait(DELETE_WAIT_SECONDS); setStep("type"); }} />}
    <AppSheet label="Confirm account deletion" motionMode="timed" compact keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan" visible={step === "type"} guardDismiss={busy} onRequestClose={close}
      header={<View style={p.sheetHeader}><Text style={p.title}>Type your username</Text></View>}>
      <BottomSheetScrollView contentContainerStyle={p.sheetBody} keyboardShouldPersistTaps="handled">
        <Text style={p.body}>To delete your account for good, type <Text style={s.name}>{name}</Text> below.</Text>
        <SheetTextInput accessibilityLabel="Your username" value={typed} onChangeText={setTyped} editable={!busy} placeholder={name}
          placeholderTextColor={colors.tertiary} autoCapitalize="none" autoCorrect={false} autoComplete="off" style={s.input} testID="delete-account-name" />
        <Pressable onPress={() => void remove()} disabled={!ready} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !ready, busy }}
          testID="delete-account-confirm" style={[s.danger, !ready && s.off]}><Text style={s.dangerText}>{label}</Text></Pressable>
        <PersonalButton secondary title="Keep my account" disabled={busy} onPress={close} />
      </BottomSheetScrollView>
    </AppSheet>
  </>;
}
const s = StyleSheet.create({
  name: { color: colors.text, fontWeight: "700" },
  input: { minHeight: 54, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, color: colors.text, fontSize: 17 },
  danger: { minHeight: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", padding: 14, backgroundColor: colors.danger },
  // Dark text on the red keeps it easy to read (white on this red would be too faint).
  dangerText: { color: colors.background, fontSize: 17, lineHeight: 22, fontWeight: "700" },
  off: { opacity: 0.4 },
});
