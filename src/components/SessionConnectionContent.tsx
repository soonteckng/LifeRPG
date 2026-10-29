import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { sessionBackendIdentity } from "../utils/sessionBackend";
import { navigationTiming } from "../utils/navigationMotion";
import { offlineAppAvailable } from "../utils/offlineApp";
import { colors, edge } from "../constants/theme";
import { Text } from "./AppText";
import ConnectionSurface from "./ConnectionSurface";
import OfflineSessionRecovery from "./OfflineSessionRecovery";
import SheetConfirmation from "./SheetConfirmation";

/** A reconnect may close an obsolete timer route, never rebuild its stack. */
export default function SessionConnectionContent({ children }: { children: ReactNode }) {
  const { accessMode, user, localOwner, admissionEpoch } = useAuth();
  const timer = useTimer({ live: false });
  const ownerId = user?.id ?? localOwner?.id;
  const backendId = localOwner?.backendId ?? sessionBackendIdentity(process.env.EXPO_PUBLIC_SUPABASE_URL)?.backendId;
  const ownerScope = JSON.stringify([backendId, ownerId]);
  const scope = JSON.stringify([backendId, ownerId, admissionEpoch]);
  const reducedMotion = useReducedMotion(), insets = useSafeAreaInsets();
  const pathname = usePathname(), router = useRouter();
  const params = useGlobalSearchParams<{ countdownAction?: string; protectionEnd?: string; protectionSession?: string }>();
  const handledNotification = useRef<string | null>(null);
  const [handledProtectionEnd, setHandledProtectionEnd] = useState<string | null>(null);
  const notificationView = useRef({ mounted: false, ownerId, sessionId: timer.sessionId,
    clientSessionId: timer.protectionSessionId,
    open: timer.hasOpenSession, completed: timer.isCompleted, ending: timer.endingSession });
  const [requestedEnd, setRequestedEnd] = useState<{ ownerId: string | undefined; sessionId: string | null; clientSessionId?: string | null } | null>(null);
  const { consumeNotificationAction, isRestoring, actionBusy } = timer;
  const protectionNonce = params.protectionEnd;
  if (typeof protectionNonce === "string" && protectionNonce !== handledProtectionEnd && ownerId && !isRestoring && !actionBusy
    && typeof params.protectionSession === "string" && params.protectionSession === timer.protectionSessionId
    && timer.hasOpenSession && !timer.isCompleted && !timer.endingSession) {
    setHandledProtectionEnd(protectionNonce);
    setRequestedEnd({ ownerId, sessionId: timer.sessionId, clientSessionId: timer.protectionSessionId });
  }
  useLayoutEffect(() => {
    notificationView.current = { ...notificationView.current, ownerId, sessionId: timer.sessionId, clientSessionId: timer.protectionSessionId,
      open: timer.hasOpenSession, completed: timer.isCompleted, ending: timer.endingSession };
  }, [ownerId, timer.sessionId, timer.protectionSessionId, timer.hasOpenSession, timer.isCompleted, timer.endingSession]);
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
  const showEnd = requestedEnd !== null && requestedEnd.ownerId === ownerId
    && (requestedEnd.clientSessionId ? requestedEnd.clientSessionId === timer.protectionSessionId : requestedEnd.sessionId === timer.sessionId)
    && timer.hasOpenSession && !timer.isCompleted && !timer.endingSession;
  if (requestedEnd && !showEnd) setRequestedEnd(null);
  const localOnly = accessMode === "local-only";
  // Offline the app itself stays on screen; only saved work that must be
  // checked with the server first takes over the screen. While the journal
  // is being read the last decision holds, so nothing flashes.
  const [recoveryShown, setRecoveryShown] = useState(false);
  const recoveryNow = localOnly && (timer.isRestoring ? recoveryShown : !offlineAppAvailable(timer));
  if (recoveryNow !== recoveryShown) setRecoveryShown(recoveryNow);
  const [offlineCycle, setOfflineCycle] = useState(recoveryNow);
  if (recoveryNow && !offlineCycle) setOfflineCycle(true);
  const obsoleteSessionRoute = offlineCycle && !recoveryNow && (pathname === "/session" || pathname === "/timer")
    && !timer.hasOpenSession && !timer.isCompleted && !timer.endingSession && !timer.sessionEnded
    && !timer.awaitingStart && timer.linkedTaskId === null;
  const onlineReady = !(offlineCycle && !recoveryNow && (timer.isRestoring || obsoleteSessionRoute));
  if (offlineCycle && !recoveryNow && onlineReady) setOfflineCycle(false);
  useLayoutEffect(() => {
    if (recoveryNow) return;
    if (!offlineCycle || timer.isRestoring) return;
    if (obsoleteSessionRoute) router.replace("/");
  }, [recoveryNow, offlineCycle, obsoleteSessionRoute, timer.isRestoring, router]);
  const [visitedOffline, setVisitedOffline] = useState({ scope: ownerScope, local: localOnly });
  // A brief note at the top when the connection drops or returns.
  const [notice, setNotice] = useState<{ scope: string; kind: "online" | "offline" } | null>(null);
  const [noticeOpacity] = useState(() => new Animated.Value(1));
  if (visitedOffline.scope !== ownerScope) {
    setVisitedOffline({ scope: ownerScope, local: localOnly });
    if (notice !== null) setNotice(null);
  } else if (localOnly) {
    if (!visitedOffline.local) {
      setVisitedOffline({ scope: ownerScope, local: true });
      setNotice(recoveryNow ? null : { scope, kind: "offline" });
    } else if (notice?.kind === "online") setNotice(null);
  } else if (visitedOffline.local && accessMode === "online" && onlineReady) {
    setVisitedOffline({ scope: ownerScope, local: false }); setNotice({ scope, kind: "online" });
  } else if (notice?.kind === "offline") setNotice(null);
  useLayoutEffect(() => { if (notice !== null) noticeOpacity.setValue(1); }, [notice, noticeOpacity]);
  useEffect(() => {
    if (notice === null) return;
    let live = true;
    let animation: Animated.CompositeAnimation | undefined;
    const timeout = setTimeout(() => {
      const clear = () => { if (live) setNotice(current => current === notice ? null : current); };
      if (reducedMotion) clear();
      else {
        animation = Animated.timing(noticeOpacity, { toValue: 0, ...navigationTiming(140) });
        animation.start(({ finished }) => { if (finished) clear(); });
      }
    }, notice.kind === "offline" ? 2000 : 1200);
    return () => { live = false; clearTimeout(timeout); animation?.stop(); };
  }, [notice, noticeOpacity, reducedMotion]);
  // Count includes rejected records. Only an actual pending, busy operation
  // warrants "syncing"; being back online alone never promises a saved result.
  const syncing = timer.syncStatus === "waiting" && timer.actionBusy && !timer.isRestoring && !timer.actionError;
  return <><ConnectionSurface localOnly={recoveryNow} onlineReady={onlineReady}
    offline={active => <OfflineSessionRecovery active={active} />}>{children}
      {notice?.scope === scope && (notice.kind === "online" ? accessMode === "online" && onlineReady : localOnly && !recoveryNow) && <Animated.View pointerEvents="none"
        testID={`connection-${notice.kind}-notice`} style={[styles.notice, { top: insets.top + 8, opacity: noticeOpacity }]}>
        <View style={styles.noticeCard}><Text accessibilityLiveRegion="polite" style={styles.noticeText}>
          {notice.kind === "offline" ? "Offline · sessions save on this phone" : syncing ? "Back online · syncing" : "Back online"}</Text></View>
      </Animated.View>}
    </ConnectionSurface>
    {showEnd && <SheetConfirmation elevated title="End this session?"
      message="Ending early stops this session without recording its time."
      cancelLabel="Keep session" confirmLabel="End session" onCancel={() => setRequestedEnd(null)}
      onConfirm={() => {
        const view = notificationView.current;
        if (!requestedEnd || view.ownerId !== requestedEnd.ownerId
          || (requestedEnd.clientSessionId ? view.clientSessionId !== requestedEnd.clientSessionId : view.sessionId !== requestedEnd.sessionId)
          || !view.open || view.completed || view.ending || actionBusy || isRestoring) return;
        setRequestedEnd(null); void timer.resetTimer();
      }} />}</>;
}
const styles = StyleSheet.create({
  notice: { position: "absolute", left: 20, right: 20, alignItems: "center" },
  noticeCard: { ...edge, borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 9 },
  noticeText: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: "500" },
});
