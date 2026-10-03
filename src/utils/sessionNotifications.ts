import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

export type SessionNotificationsModule = typeof import("expo-notifications");
type NotificationsModule = SessionNotificationsModule;
let cached: NotificationsModule | null | undefined;

// Android Expo Go's package entry can initialise unavailable push functionality
// even though this app only schedules local alerts. Keep that entry out of the
// UI preview; real development and release builds still load the complete API.
export function getSessionNotifications(): NotificationsModule | null {
  if (Platform.OS === "web" || (Platform.OS === "android" && isRunningInExpoGo())) return null;
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-notifications") as NotificationsModule;
  } catch {
    cached = null;
    console.warn("Session notifications are unavailable in this runtime.");
  }
  return cached;
}
