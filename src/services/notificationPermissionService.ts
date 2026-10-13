import { Linking, Platform } from "react-native";
import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import { getSessionNotifications } from "../utils/sessionNotifications";
import { ONGOING_CHANNEL_ID } from "./sessionNotificationService";
import { getNativeSessionCountdownModule } from "./nativeSessionCountdown";
export interface NotificationPermission {
  label: string;
  action: "enable" | "settings" | "retry" | null;
  supported: boolean;
  granted?: boolean;
}
export function notificationPermission(result: { granted: boolean; canAskAgain?: boolean; ios?: { status?: number } }): NotificationPermission {
  if (result.ios?.status === 3) return { label: "Allowed quietly", action: "settings", supported: true, granted: true };
  if (result.ios?.status === 4) return { label: "Allowed temporarily", action: "settings", supported: true, granted: true };
  if (result.granted || result.ios?.status === 2) return { label: "Allowed on this device", action: "settings", supported: true, granted: true };
  return { label: "Not allowed on this device", action: result.canAskAgain === false ? "settings" : "enable", supported: true, granted: false };
}
export async function readNotificationPermission(): Promise<NotificationPermission> {
  const api = getSessionNotifications();
  if (!api) return { label: "Notifications are unavailable here", action: null, supported: false };
  try { return notificationPermission(await api.getPermissionsAsync()); }
  catch { return { label: "Could not read notification permission", action: "retry", supported: true }; }
}
export async function readExactAlarmAccess(): Promise<"allowed" | "not_allowed" | null> {
  const module = await getNativeSessionCountdownModule();
  if (!module) return null;
  try {
    const capabilities = await module.capabilities();
    return capabilities.supported && typeof capabilities.exactAlarms === "boolean"
      ? capabilities.exactAlarms ? "allowed" : "not_allowed" : null;
  } catch { return null; }
}
export async function enableNotifications() {
  const api = getSessionNotifications();
  if (!api) throw new Error("Notifications are unavailable here.");
  // Android 13 requires a channel before displaying the permission prompt.
  if (Platform.OS === "android") await api.setNotificationChannelAsync(ONGOING_CHANNEL_ID, {
    name: "Active Session Banner", importance: api.AndroidImportance.LOW,
    sound: null, enableVibrate: false, showBadge: false,
  });
  return notificationPermission(await api.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  }));
}

export async function openAlarmSettings() {
  const packageName = installedAndroidPackage();
  if (!packageName || !(Number(Platform.Version) >= 31)) return Linking.openSettings();
  try {
    // Load only on a supported installed Android build. An older binary with
    // no native module must fall back without crashing the rest of Settings.
    const IntentLauncher = await import("expo-intent-launcher");
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM, {
      data: `package:${packageName}`,
    });
  } catch { await Linking.openSettings(); }
}

function installedAndroidPackage(): string | undefined {
  if (Platform.OS !== "android" || isRunningInExpoGo()) return undefined;
  const packageName = Constants.expoConfig?.android?.package;
  return typeof packageName === "string" && /^(?:[A-Za-z_]\w*\.)+[A-Za-z_]\w*$/.test(packageName) ? packageName : undefined;
}

export async function openNotificationSettings() {
  const packageName = installedAndroidPackage();
  if (!packageName) return Linking.openSettings();
  try {
    await Linking.sendIntent("android.settings.APP_NOTIFICATION_SETTINGS", [
      { key: "android.provider.extra.APP_PACKAGE", value: packageName },
    ]);
  } catch { await Linking.openSettings(); }
}
