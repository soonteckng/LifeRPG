import { useEffect, useState } from "react";

export type ResultExtras = { streakDays?: number; weekSeconds?: number; onThis?: boolean };

/**
 * The two small tiles on the finished card (mockup 07): your streak, and your
 * time on this routine over the past week. Read-only and best effort: if a
 * read fails, its tile simply stays away. The service loads on demand, so the
 * result card never waits for it.
 */
export function useResultExtras(owner: string | undefined, sessionId: string | undefined, taskId: number | null, timeZone: string | undefined): ResultExtras | null {
  const key = owner && sessionId ? `${owner}:${sessionId}` : null;
  const [extras, setExtras] = useState<ResultExtras & { key: string | null }>({ key: null });
  useEffect(() => {
    if (!key || !owner) return;
    let live = true;
    void (async () => {
      const [service, analytics] = await Promise.all([import("../services/progressService"), import("../utils/progressAnalytics")]);
      const zone = timeZone || analytics.DEFAULT_TIMEZONE;
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [streak, sessions] = await Promise.all([
        service.getFocusStreakDetail(zone, undefined, owner).catch(() => undefined),
        service.getCompletedSessions(since, undefined, owner).catch(() => undefined),
      ]);
      if (!live) return;
      const mine = sessions?.filter(item => taskId === null || item.task_id === taskId);
      setExtras({ key, streakDays: streak?.current,
        weekSeconds: mine?.reduce((sum, item) => sum + Math.max(0, item.duration_seconds || 0), 0), onThis: taskId !== null });
    })().catch(() => {});
    return () => { live = false; };
  }, [key, owner, taskId, timeZone]);
  return extras.key && extras.key === key ? extras : null;
}
