import { useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import ConnectionSurface from "./ConnectionSurface";
import OfflineSessionRecovery from "./OfflineSessionRecovery";

/** A reconnect may close an obsolete timer route, never rebuild its stack. */
export default function SessionConnectionContent({ children }: { children: ReactNode }) {
  const { accessMode } = useAuth();
  const timer = useTimer();
  const pathname = usePathname(), router = useRouter();
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
  return <ConnectionSurface localOnly={localOnly} onlineReady={onlineReady}
    offline={active => <OfflineSessionRecovery active={active} />}>{children}</ConnectionSurface>;
}
