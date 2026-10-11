import AsyncStorage from "@react-native-async-storage/async-storage";

export type NotificationInvitation = "pending-guide" | "ready" | "handled" | null;
interface Storage { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> }
export const notificationInvitationKey = (owner: string) => `liferpg:notification-intro:v1:${owner}`;

export function createNotificationOnboardingStore(storage: Storage) {
  const queues = new Map<string, Promise<void>>();
  const read = async (owner: string, current: () => boolean): Promise<NotificationInvitation> => {
    if (!owner || !current()) return null;
    const saved = await storage.getItem(notificationInvitationKey(owner));
    return current() && ["pending-guide", "ready", "handled"].includes(saved ?? "") ? saved as NotificationInvitation : null;
  };
  const change = (owner: string, current: () => boolean, next: (previous: NotificationInvitation) => NotificationInvitation) => {
    if (!owner || !current()) return Promise.resolve();
    const previousQueue = queues.get(owner) ?? Promise.resolve();
    const task = previousQueue.catch(() => {}).then(async () => {
      const previous = await read(owner, current);
      const value = next(previous);
      if (!current() || value === null || previous === value) return;
      await storage.setItem(notificationInvitationKey(owner), value);
    });
    queues.set(owner, task);
    void task.finally(() => { if (queues.get(owner) === task) queues.delete(owner); }).catch(() => {});
    return task;
  };
  return {
    read,
    // Only account onboarding calls prepare. Replaying the guide does not.
    prepare: (owner: string, current: () => boolean = () => true) => change(owner, current, previous => previous ?? "pending-guide"),
    finishGuide: (owner: string, current: () => boolean) => change(owner, current, previous => previous === "pending-guide" ? "ready" : previous),
    dismiss: (owner: string, current: () => boolean) => change(owner, current, previous => previous === "ready" ? "handled" : previous),
  };
}

export const notificationOnboardingStore = createNotificationOnboardingStore(AsyncStorage);
