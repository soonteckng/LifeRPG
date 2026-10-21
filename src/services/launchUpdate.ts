import * as Updates from "expo-updates";

/**
 * At launch, while the intro shows, look for a newer published update and
 * download it. Resolves true when one is ready to load now. A slow or failed
 * check resolves false, and the normal next-launch update still applies.
 */
export function prepareLaunchUpdate(limitMs: number): Promise<boolean> {
  if (__DEV__ || !Updates.isEnabled) return Promise.resolve(false);
  const work = (async () => {
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable && !check.isRollBackToEmbedded) return false;
      const fetched = await Updates.fetchUpdateAsync();
      return fetched.isNew || fetched.isRollBackToEmbedded;
    } catch { return false; }
  })();
  const limit = new Promise<boolean>(resolve => setTimeout(() => resolve(false), limitMs));
  return Promise.race([work, limit]);
}

/** Loads the downloaded update now. Only called before anyone has used the app. */
export function loadLaunchUpdate(): Promise<void> {
  return Updates.reloadAsync().catch(() => {});
}
