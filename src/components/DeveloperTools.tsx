import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modal, Share } from "react-native";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import SessionResultSheet from "./SessionResultSheet";
import SessionSavingOverlay from "./SessionSavingOverlay";
import SheetConfirmation from "./SheetConfirmation";
import { notificationOnboardingStore } from "../services/notificationOnboardingStore";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import { restartIntro, useIsDeveloper } from "../services/developerAccess";
import { colors } from "../constants/theme";
import { readSessionTrail } from "../services/sessionTrail";

/** Every result card a person can see, on the same real component. */
type Preview = "complete" | "recovered" | "ended" | "offline" | "sync" | "rejected";
const SAVING_PREVIEW_MS = 3000;

/**
 * Previews for the developer account only. The server decides who is a
 * developer. Nothing here saves anything: every card is the real one, shown
 * with sample numbers, and Done only closes it.
 */
export default function DeveloperTools() {
  const { profile, reloadProfile } = useUser();
  const auth = useAuth();
  const { hasOpenSession } = useTimer({ live: false });
  const restartLock = useRef(false);
  const [restarting, setRestarting] = useState<"ask" | "busy" | null>(null), [message, setMessage] = useState("");
  const developer = useIsDeveloper(profile.id, auth.accessMode === "online");
  const [preview, setPreview] = useState<{ kind: Preview; id: number } | null>(null);
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const scope = JSON.stringify([profile.id, auth.admissionEpoch]);
  const logShareLock = useRef(false);
  const [logShare, setLogShare] = useState({ scope, busy: false });
  const sharingLog = logShare.scope === scope && logShare.busy;
  const currentScope = useRef(scope);
  useLayoutEffect(() => { currentScope.current = scope; logShareLock.current = false; }, [scope]);
  useEffect(() => {
    if (!saving) return;
    const timeout = setTimeout(() => setSaving(false), SAVING_PREVIEW_MS);
    return () => clearTimeout(timeout);
  }, [saving]);
  if (!developer) return null;
  const shareLog = async () => {
    if (logShareLock.current) return;
    logShareLock.current = true; setLogShare({ scope, busy: true }); setMessage("");
    try {
      const log = await readSessionTrail();
      if (currentScope.current !== scope) return;
      await Share.share({ message: log || "No session events yet." });
    } catch {
      if (currentScope.current === scope) setMessage("Couldn't open sharing. Please try again.");
    } finally {
      if (currentScope.current === scope) { logShareLock.current = false; setLogShare({ scope, busy: false }); }
    }
  };
  const open = (kind: Preview) => { setPreview({ kind, id: Date.now() }); setShown(true); };
  const restart = async () => {
    if (restartLock.current) return;
    restartLock.current = true; setRestarting("busy"); setMessage("");
    try {
      const ok = await restartIntro(profile.id);
      // Reloading the profile sends the app to the intro by itself.
      const opened = ok && await reloadProfile();
      setRestarting(null);
      if (!opened) setMessage(ok ? "The intro is ready. Close and reopen the app to start it." : "Couldn't restart the intro. Check your connection and try again.");
    } finally { restartLock.current = false; }
  };
  const busySession = hasOpenSession ? "Finish or end your session first." : "";
  const kind = preview?.kind;
  return <>
    <SettingsGroup title="Developer" footer={message || busySession || "Only your developer account sees this. Previews never save anything."}>
      <SettingsRow first icon="share-outline" title="Share session log" subtitle="Share this phone's recent timer events" testID="dev-share-session-log"
        busy={sharingLog} disabled={sharingLog} onPress={() => void shareLog()} />
      {/* Round 88: the tour is gone; first-time setup and the notification ask are what a new person sees now. */}
      <SettingsRow icon="refresh-outline" title="Replay first-time setup" subtitle="Welcome, your areas, name, goal, protection and How it works" wrap testID="dev-replay-setup"
        disabled={hasOpenSession || restarting === "busy"} onPress={() => { setMessage(""); setRestarting("ask"); }} />
      <SettingsRow icon="notifications-outline" title="Show the notification ask again" subtitle="It appears on Today, as it does after setup" wrap testID="dev-notification-ask"
        disabled={hasOpenSession} onPress={() => { setMessage(""); void notificationOnboardingStore.reopen(profile.id ?? "").then(() => setMessage("Go to Today to see the notification ask."), () => setMessage("Couldn't reset the notification ask.")); }} />
    </SettingsGroup>
    <SettingsGroup title="Developer: session cards" footer="The real cards with sample numbers. They don't add time, streak days or squad time. To try the locked session page, start a 1-minute session.">
      <SettingsRow wrap first icon="checkmark-circle-outline" title="Session complete" testID="dev-preview-complete" disabled={hasOpenSession} onPress={() => open("complete")} />
      <SettingsRow wrap icon="cloud-done-outline" title="Earlier session saved" testID="dev-preview-recovered" disabled={hasOpenSession} onPress={() => open("recovered")} />
      <SettingsRow wrap icon="stop-circle-outline" title="Session ended early" testID="dev-ended-result" disabled={hasOpenSession} onPress={() => open("ended")} />
      <SettingsRow wrap icon="cloud-offline-outline" title="Saved offline result" testID="dev-offline-result" disabled={hasOpenSession} onPress={() => open("offline")} />
      <SettingsRow wrap icon="cloud-done-outline" title="Offline sync summary" subtitle="Three 1-minute sessions, one summary" testID="dev-sync-summary" disabled={hasOpenSession} onPress={() => open("sync")} />
      <SettingsRow wrap icon="information-circle-outline" title="Session could not be credited" testID="dev-rejected-result" disabled={hasOpenSession} onPress={() => open("rejected")} />
      <SettingsRow wrap icon="hourglass-outline" title="Saving screen" testID="dev-saving-preview" onPress={() => setSaving(true)} />
    </SettingsGroup>
    {preview && <SessionResultSheet visible={shown} sessionId={`preview-${preview.id}`}
      minutesSpent={kind === "sync" ? 3 : 25} durationSeconds={kind === "sync" ? 180 : 1500} recovered={kind === "recovered" || kind === "sync"}
      questTitle="Preview session" areaTitle="Study" goalReachedNow={kind === "complete"}
      completedAtMs={preview.id} dailyCompletedSeconds={kind === "complete" ? 5100 : undefined} dailyGoalMinutes={kind === "complete" ? 60 : undefined}
      streakDays={kind === "complete" ? 12 : undefined} weekSeconds={kind === "complete" ? 13200 : undefined} weekLabel="on this, past 7 days" onOpenRhythm={() => setShown(false)}
      ending={kind === "ended"} pending={kind === "offline"} offline={kind === "offline"} localSaved={kind === "offline"} rejected={kind === "rejected"}
      syncSummary={kind === "sync" ? { sessionCount: 3, durations: [{ seconds: 60, count: 3 }], areas: [{ title: "Study", color: colors.accent }] } : undefined}
      onClose={() => setShown(false)} onDismiss={() => setPreview(null)} />}
    {restarting && <SheetConfirmation elevated title="Go through the intro again?"
      message="You'll go through first-time setup like someone new. Your name and goal are filled in, and your sessions, routines and squads all stay."
      confirmLabel={restarting === "busy" ? "Restarting…" : "Restart intro"} cancelLabel="Not now"
      onCancel={() => { if (restarting !== "busy") setRestarting(null); }} onConfirm={() => void restart()} />}
    <Modal visible={saving} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={() => setSaving(false)}>
      <SessionSavingOverlay visible={saving} />
    </Modal>
  </>;
}
