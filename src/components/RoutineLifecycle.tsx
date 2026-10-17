import { useEffect, useLayoutEffect, useRef } from "react";
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
  // Owner verification itself updates Auth state. Its fresh callback must not
  // replace the transport and invalidate the very sync awaiting that proof.
  // Read only the latest committed verifier; account/admission changes still
  // cancel the effect below and every RPC keeps its immutable expected owner.
  const ownerVerifier = useRef(verifyCurrentOwner);
  useLayoutEffect(() => { ownerVerifier.current = verifyCurrentOwner; }, [verifyCurrentOwner]);
  const syncNow = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!scope || !ready || auth.accessMode !== "online") return;
    let active = true;
    const transport = createRoutineTransport(scope, async () => {
      const owner = await ownerVerifier.current();
      return owner?.backendId === scope.backendId ? owner.id : null;
    });
    const sync = () => { if (active && AppState.currentState === "active") void savedRoutineStore.sync(scope, transport, () => active); };
    syncNow.current = sync;
    sync();
    const interval = setInterval(() => { if (savedRoutineStore.snapshot(scope).pendingCount) sync(); }, 15000);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") sync(); });
    return () => { active = false; if (syncNow.current === sync) syncNow.current = null; clearInterval(interval); foreground.remove(); };
  }, [scope, ready, auth.accessMode, auth.admissionEpoch]);
  // Queue edits wake an idle sync without cancelling an in-flight drain after
  // each acknowledgement. The store coalesces these calls into one flight.
  useEffect(() => { if (pendingCount) syncNow.current?.(); }, [pendingCount]);
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
