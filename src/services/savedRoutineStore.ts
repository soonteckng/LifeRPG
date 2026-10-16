import type { JournalScope } from "../types/sessionJournal";
import type { RoutineDraft, RoutineEnvelope, RoutineState, RoutineTransport, SavedRoutine } from "../types/savedRoutine";
import { parseRoutineEnvelope, ROUTINE_LIMIT, ROUTINE_QUEUE_LIMIT, routineStorageKey, validRoutineDraft, validSavedRoutine, visibleRoutines } from "../utils/savedRoutine";
import { isJournalUuid } from "../utils/sessionJournalSchema";

interface Storage { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> }
const initial: RoutineState = { ready: false, busy: false, error: null, routines: [], pendingCount: 0, conflicts: [] };
const inactive: RoutineState = { ...initial, ready: true };
export function createSavedRoutineStore(storage: Storage, newId: () => string) {
  const envelopes = new Map<string, RoutineEnvelope>(), states = new Map<string, RoutineState>();
  const listeners = new Map<string, Set<() => void>>(), reads = new Map<string, Promise<void>>();
  const writes = new Map<string, Promise<unknown>>(), flights = new Map<string, Promise<void>>();
  const scopeKey = (scope: JournalScope) => routineStorageKey(scope);
  function publish(key: string, patch: Partial<RoutineState> = {}) {
    const envelope = envelopes.get(key), before = states.get(key) ?? initial;
    states.set(key, { ...before, ...(envelope ? { ready: true, routines: visibleRoutines(envelope), pendingCount: envelope.pending.length, conflicts: envelope.conflicts } : {}), ...patch });
    listeners.get(key)?.forEach(listener => listener());
  }
  async function commit(key: string, next: RoutineEnvelope) {
    // Publish only after durable storage: a process kill cannot lose an edit that
    // the editor has already reported as saved. The old raw cache survives errors.
    await storage.setItem(key, JSON.stringify(next)); envelopes.set(key, next); publish(key, { error: null });
  }
  function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const request = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
    writes.set(key, request); void request.finally(() => { if (writes.get(key) === request) writes.delete(key); }).catch(() => {});
    return request;
  }
  const store = {
    snapshot(scope: JournalScope | null): RoutineState { return scope ? states.get(scopeKey(scope)) ?? initial : inactive; },
    subscribe(scope: JournalScope | null, listener: () => void) {
      if (!scope) return () => {};
      const key = scopeKey(scope); if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key)!.add(listener);
      return () => { listeners.get(key)?.delete(listener); };
    },
    async load(scope: JournalScope): Promise<void> {
      const key = scopeKey(scope); if (envelopes.has(key)) return;
      const pending = reads.get(key); if (pending) return pending;
      const request = storage.getItem(key).then(raw => { envelopes.set(key, parseRoutineEnvelope(raw, scope)); publish(key, { error: null }); })
        .catch(() => publish(key, { error: "Couldn't read your routines on this phone. Your saved data has been kept." }))
        .finally(() => reads.delete(key));
      reads.set(key, request); return request;
    },
    async resolve(scope: JournalScope, id: string): Promise<SavedRoutine | null> {
      if (!isJournalUuid(id)) return null; await store.load(scope); return store.snapshot(scope).routines.find(item => item.id === id) ?? null;
    },
    async save(scope: JournalScope, draft: RoutineDraft, id?: string, deleted = false): Promise<boolean> {
      if (!validRoutineDraft(draft) || id !== undefined && !isJournalUuid(id)) return false;
      await store.load(scope); const key = scopeKey(scope);
      return serial(key, async () => {
        const before = envelopes.get(key); if (!before) return false;
        const routines = visibleRoutines(before), current = id ? routines.find(item => item.id === id) : null;
        if (before.conflicts.length >= 8) { publish(key, { error: "Review the changes from your other device before editing more routines." }); return false; }
        if (id && !current || !id && routines.length >= ROUTINE_LIMIT || before.pending.length >= ROUTINE_QUEUE_LIMIT) {
          publish(key, { error: before.pending.length >= ROUTINE_QUEUE_LIMIT ? "Reconnect to save your queued changes before making more." : "Keep up to 32 routines. Remove one to make room." }); return false;
        }
        const routineId = id ?? newId(), operationId = newId();
        if (!isJournalUuid(routineId) || !isJournalUuid(operationId)) return false;
        const cleanDraft: RoutineDraft = { name: draft.name, focusAreaId: draft.focusAreaId, durationSeconds: draft.durationSeconds, reminder: { ...draft.reminder } };
        const operation = { operationId, routineId, expectedRevision: current?.revision ?? 0, draft: cleanDraft, deleted };
        const next = { ...before, pending: [...before.pending, operation] };
        try { await commit(key, next); return true; }
        catch { publish(key, { error: "Couldn't save this change on your phone. Please try again." }); return false; }
      });
    },
    async remove(scope: JournalScope, id: string): Promise<boolean> {
      const current = await store.resolve(scope, id); return current ? store.save(scope, current, id, true) : false;
    },
    async resolveConflict(scope: JournalScope, operationId: string, keepMine: boolean): Promise<boolean> {
      await store.load(scope); const key = scopeKey(scope);
      return serial(key, async () => {
        const before = envelopes.get(key), conflict = before?.conflicts.find(item => item.operation.operationId === operationId);
        if (!before || !conflict) return false;
        if (keepMine && conflict.latest?.deletedAt !== null && conflict.latest !== null) { publish(key, { error: "This routine was removed on another device. Create a new routine to keep these settings." }); return false; }
        if (keepMine && before.pending.length >= ROUTINE_QUEUE_LIMIT) return false;
        const operation = { ...conflict.operation, operationId: newId(), expectedRevision: conflict.latest?.revision ?? 0 };
        if (!isJournalUuid(operation.operationId)) return false;
        const next = { ...before, conflicts: before.conflicts.filter(item => item !== conflict), pending: keepMine ? [...before.pending, operation] : before.pending };
        try { await commit(key, next); return true; } catch { publish(key, { error: "Couldn't remember your choice. Try again." }); return false; }
      });
    },
    async sync(scope: JournalScope, transport: RoutineTransport, active: () => boolean): Promise<void> {
      const key = scopeKey(scope), flight = flights.get(key); if (flight) return flight;
      const request = (async () => {
        await store.load(scope); if (!active() || !envelopes.has(key)) return;
        publish(key, { busy: true });
        try {
          for (let count = 0; count < ROUTINE_QUEUE_LIMIT && active(); count++) {
            if ((envelopes.get(key)?.conflicts.length ?? 0) >= 8) break;
            const operation = envelopes.get(key)?.pending[0]; if (!operation) break;
            const reply = await transport.apply(JSON.parse(JSON.stringify(operation)));
            if (!active()) return;
            if (!reply || !["saved", "conflict"].includes(reply.status) || reply.routine !== null && !validSavedRoutine(reply.routine)
              || reply.routine && reply.routine.id !== operation.routineId || reply.status === "saved" && (!reply.routine || reply.routine.revision !== operation.expectedRevision + 1 || (reply.routine.deletedAt !== null) !== operation.deleted)) throw new Error("Invalid routine reply");
            await serial(key, async () => {
              if (!active()) return;
              const before = envelopes.get(key)!;
              if (before.pending[0]?.operationId !== operation.operationId) return;
              const related = before.pending.filter(item => item.routineId === operation.routineId);
              const routines = before.routines.filter(item => item.id !== operation.routineId);
              if (reply.routine && reply.routine.deletedAt === null) routines.push(reply.routine);
              const pending = reply.status === "saved" ? before.pending.slice(1) : before.pending.filter(item => item.routineId !== operation.routineId);
              const reason = reply.reason === "limit" ? "Your account has 32 routines. Remove one before keeping this routine." : reply.reason === "area" ? "This focus area is no longer available. Add a new routine with another area." : "Changed on another device. Choose which settings to keep.";
              const conflicts = reply.status === "conflict" ? [...before.conflicts, { operation: related[related.length - 1], latest: reply.routine, reason }] : before.conflicts;
              await commit(key, { ...before, routines, pending, conflicts });
            });
          }
          if (!active()) return;
          const remote = await transport.list();
          if (!active()) return;
          if (!Array.isArray(remote) || remote.length > ROUTINE_LIMIT || !remote.every(validSavedRoutine) || new Set(remote.map(item => item.id)).size !== remote.length) throw new Error("Invalid routine list");
          await serial(key, async () => { if (active()) { const before = envelopes.get(key)!; await commit(key, { ...before, routines: remote }); } });
        } catch { if (active()) publish(key, { error: "Saved on this phone. We'll sync your routines when the connection returns." }); }
        finally { publish(key, { busy: false }); }
      })().finally(() => { if (flights.get(key) === request) flights.delete(key); });
      flights.set(key, request); return request;
    },
  };
  return store;
}
