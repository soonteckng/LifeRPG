import { useEffect, useState } from "react";
import { Modal } from "react-native";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import SessionResultSheet from "./SessionResultSheet";
import SessionSavingOverlay from "./SessionSavingOverlay";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { useIsDeveloper } from "../services/developerAccess";
import { requiredCharacterXP } from "../utils/levelTiers";

type Preview = "level" | "complete" | "recovered";
const SAVING_PREVIEW_MS = 3000;

/**
 * Previews for the developer account only. The server decides who is a
 * developer. Nothing here saves anything: the cards are shown as previews and
 * never count toward a real celebration.
 */
export default function DeveloperTools() {
  const { profile } = useUser();
  const auth = useAuth();
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
  const level = (profile.level ?? 1) + (preview?.kind === "level" ? 1 : 0);
  return <>
    <SettingsGroup title="Developer" footer="Only your developer account sees this. Previews never save anything.">
      <SettingsRow first icon="trophy-outline" tint="#FBBF24" title="Preview level up" onPress={() => open("level")} />
      <SettingsRow icon="checkmark-circle-outline" tint="#2DD4A7" title="Preview session complete" onPress={() => open("complete")} />
      <SettingsRow icon="cloud-done-outline" tint="#64D2FF" title="Preview earlier session saved" onPress={() => open("recovered")} />
      <SettingsRow icon="hourglass-outline" tint="#A3ABC2" title="Preview saving screen" onPress={() => setSaving(true)} />
    </SettingsGroup>
    {preview && <SessionResultSheet preview visible={shown} sessionId={`preview-${preview.id}`}
      xpEarned={25} minutesSpent={25} durationSeconds={1500} recovered={preview.kind === "recovered"}
      questTitle="Preview session" areaTitle="Study" isLevelUp={preview.kind === "level"} newLevel={level}
      currentXP={preview.kind === "level" ? 0 : profile.current_xp ?? 0} requiredXP={requiredCharacterXP(level)}
      onClose={() => setShown(false)} onDismiss={() => setPreview(null)} />}
    <Modal visible={saving} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={() => setSaving(false)}>
      <SessionSavingOverlay visible={saving} />
    </Modal>
  </>;
}
