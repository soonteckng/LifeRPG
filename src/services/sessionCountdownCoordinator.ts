import type { JournalClock, JournalScope } from "../types/sessionJournal";
import { decideSessionCountdownAction, projectSessionCountdown } from "../utils/sessionCountdown";
import { isJournalUuid } from "../utils/sessionJournalSchema";
import type { SessionJournalStore } from "./sessionJournalStore";
import type { SessionTimerController } from "./sessionTimerController";
import type { createNativeSessionCountdownLifecycle, SessionCountdownPreferences } from "./nativeSessionCountdown";

type NativeLifecycle = ReturnType<typeof createNativeSessionCountdownLifecycle>;
interface CountdownCoordinatorOptions {
  scope: JournalScope;
  store: SessionJournalStore;
  controller: Pick<SessionTimerController, "pause" | "resume" | "tick">;
  native: NativeLifecycle;
  currentScope(): JournalScope | null;
  currentEpoch(): number;
  currentRecordId(): string | null;
  busy(): boolean;
  clock(): JournalClock;
}

/** Notification presentation only; all session changes use the existing controller. */
export function createSessionCountdownCoordinator(options: CountdownCoordinatorOptions) {
  const epoch = options.currentEpoch(), scope = { ...options.scope };
  let disposed = false, revision = 0;
  const consumed = new Set<string>();
  const live = () => {
    const owner = options.currentScope();
    return !disposed && options.currentEpoch() === epoch && owner?.ownerId === scope.ownerId && owner.backendId === scope.backendId;
  };
  return {
    initialize: () => live() ? options.native.activate() : Promise.resolve(false),
    ownsNative: options.native.ownsNative,
    async shouldRefreshOnForeground(): Promise<boolean> {
      if (!live()) return false;
      // A warm notification action needs its exact saved revision. The native
      // launch notice survives consuming that nonce, so either route/AppState
      // event order skips only this incidental refresh. Cold/ordinary launches
      // still use normal server reconciliation. This grants no command itself.
      const nonce = await options.native.takeForegroundAction();
      return live() && nonce === null;
    },
    async refresh(title: string, preferences: SessionCountdownPreferences, force = false): Promise<void> {
      const request = ++revision;
      try {
        const loaded = await options.store.load();
        if (!live() || request !== revision) return;
        if (loaded.kind !== "ready") { await options.native.clear(); return; }
        const projection = projectSessionCountdown({ journal: loaded.journal, currentScope: options.currentScope(),
          currentAdmissionEpoch: loaded.journal.admission.epoch, currentClientSessionId: options.currentRecordId(), clock: options.clock() });
        if (!projection?.showOngoing) {
          const record = loaded.journal.records.find(item => item.clientSessionId === options.currentRecordId());
          // A durable early End never becomes a finish alert. Completed records
          // can preserve an already-delivered alert or emit it at a proven
          // native deadline; neither path changes credit or cloud state.
          await options.native.clear(projection?.phase === "finished" || record?.state === "completed");
          return;
        }
        projection.title = title.trim().slice(0, 256) || projection.title;
        const accepted = await options.native.publish(projection, preferences, force);
        if (!accepted && live() && request === revision) await options.native.clear();
      } catch {
        // A failed presentation cannot erase work or start a second alert owner.
        if (live() && request === revision) await options.native.clear().catch(() => false);
      }
    },
    async action(nonce: string): Promise<"end" | null> {
      if (!live() || options.busy() || !isJournalUuid(nonce)) return null;
      const token = await options.native.consumeAction(nonce);
      if (!token || !live() || options.busy()) return null;
      const loaded = await options.store.load().catch(() => null);
      if (!loaded || loaded.kind !== "ready" || !live() || options.busy()) return null;
      const decision = decideSessionCountdownAction({ token, journal: loaded.journal, currentScope: options.currentScope(),
        currentAdmissionEpoch: loaded.journal.admission.epoch, currentClientSessionId: options.currentRecordId(),
        clock: options.clock(), consumedOperationIds: [...consumed] });
      if (!decision.accepted || !live()) return null;
      consumed.add(decision.operationId);
      if (decision.foregroundAction === "end") return "end";
      if (decision.foregroundAction === "pause") await options.controller.pause();
      else if (decision.foregroundAction === "resume") await options.controller.resume();
      else await options.controller.tick();
      return null;
    },
    async dispose(): Promise<void> {
      disposed = true; revision++;
      await options.native.dispose();
    },
  };
}
