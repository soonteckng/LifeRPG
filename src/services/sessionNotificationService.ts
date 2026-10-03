import type { SessionNotificationsModule } from "../utils/sessionNotifications";

export const ONGOING_NOTIFICATION_ID = "life-rpg-ongoing-timer";
export const COMPLETION_NOTIFICATION_ID = "life-rpg-completion-timer";
// New channels avoid inheriting previously-created Android sound defaults.
export const ONGOING_CHANNEL_ID = "session-ongoing-channel-v18";
const COMPLETION_CHANNEL_ID = "session-complete-channel-v18";
type Preferences = { sound: boolean; haptics: boolean };
// Shared across providers so an old account's teardown cannot clear new alerts.
let generation = 0;
let queue: Promise<void> = Promise.resolve();
export function completionChannelId(preferences: Preferences) {
  return `${COMPLETION_CHANNEL_ID}-${preferences.sound ? "sound" : "silent"}-${preferences.haptics ? "haptic" : "quiet"}`;
}

// Serialize native requests so a late background refresh cannot resurrect a
// banner after pause/end/account teardown. Every native failure is best-effort.
export function createSessionNotificationLifecycle(
  api: SessionNotificationsModule | null,
  platform: string,
  initialPreferences: Preferences,
) {
  let disposed = false;
  let settings = initialPreferences;
  const preferences = () => settings;
  const attempt = async (operation: () => Promise<unknown>) => {
    try { await operation(); } catch { console.warn("A session notification operation failed."); }
  };
  const run = (replace: boolean, work: (current: () => boolean) => Promise<void>) => {
    if (disposed) return Promise.resolve();
    const revision = replace ? ++generation : generation;
    const current = () => revision === generation;
    const task = queue.catch(() => {}).then(async () => { if (api && current()) await work(current); })
      .catch(() => { console.warn("Session notifications are unavailable; the timer continues."); });
    queue = task;
    return task;
  };
  const clearRequests = async () => {
    if (!api) return;
    for (const id of [ONGOING_NOTIFICATION_ID, COMPLETION_NOTIFICATION_ID]) {
      await attempt(() => api.cancelScheduledNotificationAsync(id));
      await attempt(() => api.dismissNotificationAsync(id));
    }
  };
  const ensureChannels = async (settings = preferences()) => {
    if (disposed || !api || platform !== "android") return;
    await attempt(() => api.setNotificationChannelAsync(ONGOING_CHANNEL_ID, {
      name: "Active Session Banner", importance: api.AndroidImportance.LOW,
      sound: null, enableVibrate: false, showBadge: false,
    }));
    await attempt(() => api.setNotificationChannelAsync(completionChannelId(settings), {
      name: "Session Finish Alert", importance: api.AndroidImportance.MAX,
      sound: settings.sound ? "default" : null,
      enableVibrate: settings.haptics,
      vibrationPattern: settings.haptics ? [0, 500, 250, 500] : [0], showBadge: true,
    }));
  };
  const ongoing = async (questTitle?: string) => {
    if (!api) return;
    await attempt(() => api.scheduleNotificationAsync({
      identifier: ONGOING_NOTIFICATION_ID,
      content: {
        title: "🚀 Session Active",
        body: questTitle ? `Quest: "${questTitle}" in progress...` : "Session in progress. Tap to view your timer.",
        sticky: true, autoDismiss: false, sound: false,
      },
      trigger: platform === "android" ? { channelId: ONGOING_CHANNEL_ID } : null,
    }));
  };
  return {
    // React Strict Mode can clean up and re-run the same mounted effect.
    activate: () => { disposed = false; },
    dispose: () => {
      if (disposed) return Promise.resolve();
      const clearing = run(true, clearRequests);
      disposed = true;
      return clearing;
    },
    setPreferences: (next: Preferences) => { settings = next; },
    ensureChannels,
    clear: () => run(true, clearRequests),
    schedule: (seconds: number, questTitle?: string) => run(true, async current => {
      if (!api) return;
      const settings = preferences();
      await clearRequests();
      if (!current()) return;
      await ensureChannels(settings);
      if (!current()) return;
      await ongoing(questTitle);
      if (!current()) return;
      await attempt(() => api.scheduleNotificationAsync({
        identifier: COMPLETION_NOTIFICATION_ID,
        content: {
          title: "⚔️ Session Complete!",
          body: questTitle ? `Quest "${questTitle}" is complete! Open LifeRPG to see your rewards.` : "Your session is complete! Open LifeRPG to see your rewards.",
          sound: settings.sound ? "default" : false,
          ...(platform === "android" ? { priority: api.AndroidNotificationPriority.MAX } : {}),
          data: { type: "COMPLETION" },
        },
        trigger: {
          type: api.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, Math.ceil(seconds)), repeats: false,
          ...(platform === "android" ? { channelId: completionChannelId(settings) } : {}),
        },
      }));
    }),
    refreshOngoing: (questTitle?: string) => run(false, async current => {
      if (!api) return;
      await attempt(() => api.cancelScheduledNotificationAsync(ONGOING_NOTIFICATION_ID));
      await attempt(() => api.dismissNotificationAsync(ONGOING_NOTIFICATION_ID));
      if (current()) await ongoing(questTitle);
    }),
  };
}
