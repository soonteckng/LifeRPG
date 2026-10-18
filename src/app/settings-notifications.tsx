import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { Text } from "../components/AppText";
import { PersonalButton, PersonalPage, p } from "../components/PersonalUI";
import { SettingsGroup, SettingsRow } from "../components/SettingsList";
import { useAppPreferences } from "../hooks/useAppPreferences";
import { appPreferences } from "../services/appPreferences";
import { enableNotifications, openAlarmSettings, openNotificationSettings, readExactAlarmAccess, readNotificationPermission, type NotificationPermission } from "../services/notificationPermissionService";
import { afterTransition } from "../utils/afterTransition";

/** Settings › Notifications: the phone's permission, precise alerts and exam reminders. */
export default function NotificationSettingsScreen() {
  const preferences = useAppPreferences();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [alarmAccess, setAlarmAccess] = useState<"allowed" | "not_allowed" | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), lock = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const [result, alarm] = await Promise.all([readNotificationPermission(), readExactAlarmAccess?.() ?? Promise.resolve(null)]);
    if (request === generation.current) { setPermission(result); setAlarmAccess(alarm); }
  }, []);
  useEffect(() => {
    let mounted = true;
    const cancel = afterTransition(() => { if (mounted) void refresh(); });
    const listener = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    const requests = generation;
    return () => { mounted = false; cancel(); listener.remove(); requests.current++; };
  }, [refresh]);
  const act = async () => {
    if (lock.current || !permission?.action) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (permission.action === "enable") {
        const request = ++generation.current, result = await enableNotifications();
        if (request === generation.current) setPermission(result); else await refresh();
      } else if (permission.action === "settings") await openNotificationSettings();
      else await refresh();
    } catch { setError("Could not update notification permission. Try again or check your phone settings."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <PersonalPage title="Notifications" subtitle="" back animateTransition fallback="/settings">
    <SettingsGroup title="Permission" footer="Session alerts and routine reminders use ordinary notification permission. Phone settings and battery limits can still delay them.">
      <SettingsRow first icon="notifications-outline" title="Notifications" value={permission?.label ?? "Checking…"} />
      {permission?.action && <View style={{ padding: 14 }}><PersonalButton title={busy ? "Please wait..." : permission.action === "enable" ? "Enable notifications" : permission.action === "settings" ? "Open phone settings" : "Retry permission check"}
        disabled={busy} onPress={() => void act()} /></View>}
      {!permission?.supported && permission && <SettingsRow icon="open-outline" title="Phone notification settings" onPress={() => { void openNotificationSettings().catch(() => setError("Couldn’t open phone settings.")); }} />}
    </SettingsGroup>
    <SettingsGroup title="Reminders" footer="A week before, the evening before and the morning of each exam. You can also turn them off for a single exam.">
      <SettingsRow first icon="calendar-outline" tint="#FF6961" title="Exam reminders" toggle={{ value: preferences.examReminders, onChange: value => void appPreferences.update({ examReminders: value }) }} />
    </SettingsGroup>
    {Platform.OS === "android" && Number(Platform.Version) >= 31 && <SettingsGroup title="Timing" footer={alarmAccess === "allowed" ? "Precise timer alerts are allowed on this phone." : "Precise alerts are off. Your timer still works; finish alerts may arrive a little later."}>
      <SettingsRow first icon="alarm-outline" tint="#FF9F0A" title="Alarms & reminders" value={alarmAccess === "allowed" ? "Allowed" : alarmAccess ? "Off" : ""}
        onPress={() => { void openAlarmSettings().catch(() => setError("Couldn’t open Alarms & reminders. Open your phone’s app settings to check it.")); }} />
    </SettingsGroup>}
    {!!error && <Text style={p.error} accessibilityRole="alert">{error}</Text>}
  </PersonalPage>;
}
