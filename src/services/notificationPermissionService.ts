import { Platform } from "react-native";
import { getSessionNotifications } from "../utils/sessionNotifications";
import { ONGOING_CHANNEL_ID } from "./sessionNotificationService";
export interface NotificationPermission {
  label: string;
  action: "enable" | "settings" | "retry" | null;
  supported: boolean;
}
export function notificationPermission(result: { granted: boolean; canAskAgain?: boolean; ios?: { status?: number } }): NotificationPermission {
  if (result.ios?.status === 3) return { label: "Allowed quietly", action: "settings", supported: true };
  if (result.ios?.status === 4) return { label: "Allowed temporarily", action: "settings", supported: true };
  if (result.granted || result.ios?.status === 2) return { label: "Allowed on this device", action: "settings", supported: true };
  return { label: "Not allowed on this device", action: result.canAskAgain === false ? "settings" : "enable", supported: true };
}
export async function readNotificationPermission(): Promise<NotificationPermission> {
  const api = getSessionNotifications();
  if (!api) return { label: "Notifications are unavailable here", action: null, supported: false };
  try { return notificationPermission(await api.getPermissionsAsync()); }
  catch { return { label: "Could not read notification permission", action: "retry", supported: true }; }
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
