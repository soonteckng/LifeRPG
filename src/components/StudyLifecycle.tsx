import { useEffect, useLayoutEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { createExamReminderCoordinator, examReminderPlan, type ScheduledExamReminder } from "../services/examReminders";
import { subscribeNotificationPermissionChanges } from "../services/notificationPermissionService";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { createStudyTransport, studyPlanStore } from "../services/studyPlanService";
import { studySelection } from "../services/studySelection";
import { useQuests } from "../context/QuestContext";
import { generalArea } from "../utils/focusAreas";
import { subjectForArea } from "../utils/studyPlan";

const examReminders = createExamReminderCoordinator({
  allowed: async () => Platform.OS !== "web" && (await Notifications.getPermissionsAsync()).granted,
  async list() {
    if (Platform.OS === "web") return [];
    return (await Notifications.getAllScheduledNotificationsAsync()).flatMap(item => {
      const data = item.content.data;
      return data?.kind === "liferpg-exam" && typeof data.scopeKey === "string" && typeof data.key === "string"
        ? [{ id: item.identifier, scopeKey: data.scopeKey, key: data.key } satisfies ScheduledExamReminder] : [];
    });
  },
  cancel: id => Notifications.cancelScheduledNotificationAsync(id),
  async schedule(scopeKey, reminder) {
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("exam-reminders", { name: "Exam reminders", importance: Notifications.AndroidImportance.DEFAULT });
    return Notifications.scheduleNotificationAsync({
      content: { title: reminder.title, body: reminder.body, data: { kind: "liferpg-exam", scopeKey, key: reminder.key } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at, channelId: "exam-reminders" },
    });
  },
});

let latestSync: (() => void) | null = null;
/** Asks the mounted lifecycle to sync now, e.g. when the Study tab gains focus. */
export function requestStudySync() { latestSync?.(); }

/** Keeps exams and subjects in sync and counts sessions toward the picked subject. */
export default function StudyLifecycle() {
  const auth = useAuth();
  const { verifyCurrentOwner } = auth;
  const { scope, ready, pendingCount, courses, exams } = useStudyPlan();
  const { protectionSessionId, isCompleted, targetAttributeId } = useTimer();
  const { subjects = [] } = useQuests();
  const generalId = generalArea(subjects)?.id;
  const ownerVerifier = useRef(verifyCurrentOwner);
  useLayoutEffect(() => { ownerVerifier.current = verifyCurrentOwner; }, [verifyCurrentOwner]);
  const syncNow = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!scope || !ready || auth.accessMode !== "online") return;
    let active = true;
    const transport = createStudyTransport(scope, async () => {
      const owner = await ownerVerifier.current();
      return owner?.backendId === scope.backendId ? owner.id : null;
    });
    const sync = () => { if (active && AppState.currentState === "active") void studyPlanStore.sync(scope, transport, () => active); };
    syncNow.current = sync; latestSync = sync; sync();
    const interval = setInterval(() => { if (studyPlanStore.snapshot(scope).pendingCount) sync(); }, 15000);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") sync(); });
    return () => { active = false; if (syncNow.current === sync) syncNow.current = null; if (latestSync === sync) latestSync = null; clearInterval(interval); foreground.remove(); };
  }, [scope, ready, auth.accessMode, auth.admissionEpoch]);
  useEffect(() => { if (pendingCount) syncNow.current?.(); }, [pendingCount]);
  // A finished session changes subject totals; refresh once it is recorded.
  useEffect(() => { if (isCompleted) syncNow.current?.(); }, [isCompleted]);
  // Read the latest setup without re-running the tag effect when it changes.
  const setup = useRef({ courses, targetAttributeId, generalId });
  useLayoutEffect(() => { setup.current = { courses, targetAttributeId, generalId }; }, [courses, targetAttributeId, generalId]);
  useEffect(() => {
    const courseId = studySelection.take(protectionSessionId);
    const { courses: list, targetAttributeId: area, generalId: general } = setup.current;
    const course = courseId ? subjectForArea(list, courseId, area, general) : null;
    if (course && scope && protectionSessionId) void studyPlanStore.tagSession(scope, protectionSessionId, course.id);
  }, [protectionSessionId, scope]);
  // Exam reminders follow the saved exams; signing out clears them.
  useEffect(() => {
    const reconcile = () => { void examReminders.update(ready ? scope : null, examReminderPlan(exams, courses)).catch(() => {}); };
    reconcile();
    const unsubscribe = subscribeNotificationPermissionChanges(reconcile);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") reconcile(); });
    return () => { unsubscribe(); foreground.remove(); };
  }, [ready, scope, exams, courses]);
  useEffect(() => () => { void examReminders.update(null, []).catch(() => {}); }, []);
  return null;
}
