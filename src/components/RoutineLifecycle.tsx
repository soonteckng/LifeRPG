import { useEffect, useMemo } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import { useSavedRoutines } from "../hooks/useSavedRoutines";
import { createRoutineTransport, savedRoutineStore } from "../services/savedRoutineService";
import { createRoutineReminderCoordinator, routineReminderFingerprint, routineReminderScope, type ScheduledRoutineReminder } from "../services/routineReminderCoordinator";
import { subscribeNotificationPermissionChanges } from "../services/notificationPermissionService";

let reminderSound = true;
const reminders = createRoutineReminderCoordinator({
  fingerprint: routine => `${routineReminderFingerprint(routine)}:${reminderSound}`,
  allowed: async () => Platform.OS !== "web" && (await Notifications.getPermissionsAsync()).granted,
  async list() {
    if (Platform.OS === "web") return [];
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.flatMap(item => {
      const data = item.content.data;
      return data?.kind === "liferpg-routine" && typeof data.scopeKey === "string" && typeof data.routineId === "string" && typeof data.fingerprint === "string"
        ? [{ id: item.identifier, scopeKey: data.scopeKey, routineId: data.routineId, fingerprint: data.fingerprint } satisfies ScheduledRoutineReminder] : [];
    });
  },
  cancel: id => Notifications.cancelScheduledNotificationAsync(id),
  async schedule(scope, routine, fingerprint) {
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("routine-reminders", { name: "Routine reminders", importance: Notifications.AndroidImportance.DEFAULT });
    return Notifications.scheduleNotificationAsync({
      content: { title: "Make room for what matters", body: routine.name, sound: reminderSound ? "default" : false, data: { kind: "liferpg-routine", scopeKey: routineReminderScope(scope), routineId: routine.id, fingerprint } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: routine.reminder.hour, minute: routine.reminder.minute, channelId: "routine-reminders" },
    });
  },
});

export default function RoutineLifecycle() {
  const auth = useAuth();
  const { verifyCurrentOwner } = auth;
  const { soundEnabled } = useUser();
  const routines = useSavedRoutines();
  const { scope, ready, pendingCount } = routines;
  const transport = useMemo(() => scope ? createRoutineTransport(scope, async () => {
    const owner = await verifyCurrentOwner();
    return owner?.backendId === scope.backendId ? owner.id : null;
  }) : null, [scope, verifyCurrentOwner]);
  useEffect(() => {
    if (!scope || !ready || !transport || auth.accessMode !== "online") return;
    let active = true;
    const sync = () => { if (active && AppState.currentState === "active") void savedRoutineStore.sync(scope, transport, () => active); };
    sync();
    const interval = setInterval(() => { if (savedRoutineStore.snapshot(scope).pendingCount) sync(); }, 15000);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") sync(); });
    return () => { active = false; clearInterval(interval); foreground.remove(); };
  }, [scope, ready, pendingCount, transport, auth.accessMode, auth.admissionEpoch]);
  useEffect(() => {
    reminderSound = soundEnabled;
    const reconcile = () => { void reminders.update(ready ? scope : null, routines.routines).catch(() => {}); };
    reconcile();
    const unsubscribePermission = subscribeNotificationPermissionChanges(reconcile);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") reconcile(); });
    return () => { unsubscribePermission(); foreground.remove(); void reminders.update(null, []).catch(() => {}); };
  }, [ready, scope, routines.routines, soundEnabled]);
  return null;
}
