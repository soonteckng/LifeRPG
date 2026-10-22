import { useEffect, useRef, useState } from "react";
import { Modal } from "react-native";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import SessionResultSheet from "./SessionResultSheet";
import SessionSavingOverlay from "./SessionSavingOverlay";
import SheetConfirmation from "./SheetConfirmation";
import { useFeatureTour } from "./FeatureTour";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import { restartIntro, useIsDeveloper } from "../services/developerAccess";
import { requiredCharacterXP } from "../utils/levelTiers";

type Preview = "level" | "complete" | "recovered";
const SAVING_PREVIEW_MS = 3000;

/**
 * Previews for the developer account only. The server decides who is a
 * developer. Nothing here saves anything: the cards are shown as previews and
 * never count toward a real celebration.
 */
export default function DeveloperTools() {
  const { profile, reloadProfile } = useUser();
  const auth = useAuth();
  const tour = useFeatureTour();
  const { hasOpenSession } = useTimer({ live: false });
  const restartLock = useRef(false);
  const [restarting, setRestarting] = useState<"ask" | "busy" | null>(null), [message, setMessage] = useState("");
  const developer = useIsDeveloper(profile.id, auth.accessMode === "online");
  const [preview, setPreview] = useState<{ kind: Preview; id: number } | null>(null);
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!saving) return;
    const timeout = setTimeout(() => setSaving(false), SAVING_PREVIEW_MS);
    return () => clearTimeout(timeout);
  }, [saving]);
  if (!developer) return null;
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
  const level = (profile.level ?? 1) + (preview?.kind === "level" ? 1 : 0);
  return <>
    <SettingsGroup title="Developer" footer={message || busySession || "Only your developer account sees this. Previews never save anything."}>
      <SettingsRow first icon="trophy-outline" tint="#FBBF24" title="Preview level up" onPress={() => open("level")} />
      <SettingsRow icon="checkmark-circle-outline" tint="#2DD4A7" title="Preview session complete" onPress={() => open("complete")} />
      <SettingsRow icon="cloud-done-outline" tint="#64D2FF" title="Preview earlier session saved" onPress={() => open("recovered")} />
      <SettingsRow icon="hourglass-outline" tint="#A3ABC2" title="Preview saving screen" onPress={() => setSaving(true)} />
      <SettingsRow icon="map-outline" tint="#7C3AED" title="Replay the guide" disabled={hasOpenSession || !tour} onPress={() => { setMessage(""); tour?.start(); }} />
      <SettingsRow icon="refresh-outline" tint="#FF9F0A" title="Restart the intro" disabled={hasOpenSession || restarting === "busy"} onPress={() => { setMessage(""); setRestarting("ask"); }} />
    </SettingsGroup>
    {preview && <SessionResultSheet preview visible={shown} sessionId={`preview-${preview.id}`}
      xpEarned={25} minutesSpent={25} durationSeconds={1500} recovered={preview.kind === "recovered"}
      questTitle="Preview session" areaTitle="Study" isLevelUp={preview.kind === "level"} newLevel={level}
      currentXP={preview.kind === "level" ? 0 : profile.current_xp ?? 0} requiredXP={requiredCharacterXP(level)}
      onClose={() => setShown(false)} onDismiss={() => setPreview(null)} />}
    {restarting && <SheetConfirmation elevated title="Go through the intro again?"
      message="You'll see the intro and the guide like a new player. Your name and goal are filled in, and your level, sessions, routines and squads all stay."
      confirmLabel={restarting === "busy" ? "Restarting…" : "Restart intro"} cancelLabel="Not now"
      onCancel={() => { if (restarting !== "busy") setRestarting(null); }} onConfirm={() => void restart()} />}
    <Modal visible={saving} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={() => setSaving(false)}>
      <SessionSavingOverlay visible={saving} />
    </Modal>
  </>;
}
