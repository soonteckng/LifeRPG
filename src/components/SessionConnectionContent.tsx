import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import ConnectionSurface from "./ConnectionSurface";
import OfflineSessionRecovery from "./OfflineSessionRecovery";
import SheetConfirmation from "./SheetConfirmation";

/** A reconnect may close an obsolete timer route, never rebuild its stack. */
export default function SessionConnectionContent({ children }: { children: ReactNode }) {
  const { accessMode, user, localOwner } = useAuth();
  const timer = useTimer();
  const ownerId = user?.id ?? localOwner?.id;
  const pathname = usePathname(), router = useRouter();
  const params = useGlobalSearchParams<{ countdownAction?: string }>();
  const handledNotification = useRef<string | null>(null);
  const notificationView = useRef({ mounted: false, ownerId, sessionId: timer.sessionId,
    open: timer.hasOpenSession, completed: timer.isCompleted, ending: timer.endingSession });
  const [requestedEnd, setRequestedEnd] = useState<{ ownerId: string | undefined; sessionId: string | null } | null>(null);
  const { consumeNotificationAction, isRestoring, actionBusy } = timer;
  useLayoutEffect(() => {
    notificationView.current = { ...notificationView.current, ownerId, sessionId: timer.sessionId,
      open: timer.hasOpenSession, completed: timer.isCompleted, ending: timer.endingSession };
  }, [ownerId, timer.sessionId, timer.hasOpenSession, timer.isCompleted, timer.endingSession]);
  useEffect(() => {
    notificationView.current.mounted = true;
    return () => { notificationView.current.mounted = false; };
  }, []);
  useEffect(() => {
    const nonce = params.countdownAction;
    if (!ownerId || typeof nonce !== "string" || handledNotification.current === nonce || isRestoring || actionBusy) return;
    // The coordinator owns the durable nonce/revision proof. Keeping this
    // consumer above both connection surfaces prevents a hidden timer route
    // from consuming End and then discarding its confirmation while offline.
    handledNotification.current = nonce;
    const sessionId = notificationView.current.sessionId;
    void consumeNotificationAction?.(nonce).then(action => {
      const view = notificationView.current;
      if (view.mounted && view.ownerId === ownerId && view.sessionId === sessionId
        && view.open && !view.completed && !view.ending && action === "end") setRequestedEnd({ ownerId, sessionId });
    }).catch(() => {});
  }, [params.countdownAction, ownerId, consumeNotificationAction, isRestoring, actionBusy]);
  const showEnd = requestedEnd !== null && requestedEnd.ownerId === ownerId && requestedEnd.sessionId === timer.sessionId
    && timer.hasOpenSession && !timer.isCompleted && !timer.endingSession;
  if (requestedEnd && !showEnd) setRequestedEnd(null);
  const localOnly = accessMode === "local-only";
  const [offlineCycle, setOfflineCycle] = useState(localOnly);
  if (localOnly && !offlineCycle) setOfflineCycle(true);
  const obsoleteSessionRoute = offlineCycle && !localOnly && (pathname === "/session" || pathname === "/timer")
    && !timer.hasOpenSession && !timer.isCompleted && !timer.endingSession && !timer.sessionEnded
    && !timer.awaitingStart && timer.linkedTaskId === null;
  const onlineReady = !(offlineCycle && !localOnly && (timer.isRestoring || obsoleteSessionRoute));
  if (offlineCycle && !localOnly && onlineReady) setOfflineCycle(false);
  useLayoutEffect(() => {
    if (localOnly) return;
    if (!offlineCycle || timer.isRestoring) return;
    if (obsoleteSessionRoute) router.replace("/");
  }, [localOnly, offlineCycle, obsoleteSessionRoute, timer.isRestoring, router]);
  return <><ConnectionSurface localOnly={localOnly} onlineReady={onlineReady}
    offline={active => <OfflineSessionRecovery active={active} />}>{children}</ConnectionSurface>
    {showEnd && <SheetConfirmation title="End this session?"
      message="Ending early stops this session without recorded time or XP."
      cancelLabel="Keep session" confirmLabel="End session" onCancel={() => setRequestedEnd(null)}
      onConfirm={() => {
        const view = notificationView.current;
        if (!requestedEnd || view.ownerId !== requestedEnd.ownerId || view.sessionId !== requestedEnd.sessionId
          || !view.open || view.completed || view.ending || actionBusy || isRestoring) return;
        setRequestedEnd(null); void timer.resetTimer();
      }} />}</>;
}
