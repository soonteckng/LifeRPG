import type { Squad, SquadStatus } from "../types/squads";
import type { JournalScope } from "../types/sessionJournal";
import { squadMessage, validSquad, weekStart } from "../utils/squads";

interface Storage { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> }
export interface SquadTransport {
  list: (since: number) => Promise<unknown>;
  create: (requestId: string, name: string, since: number) => Promise<unknown>;
  join: (code: string, since: number) => Promise<unknown>;
  leave: (squadId: string) => Promise<unknown>;
  remove: (squadId: string, memberId: string) => Promise<unknown>;
  update: (squadId: string, name: string, goalMinutes: number | null, since: number) => Promise<unknown>;
  newCode: (squadId: string, since: number) => Promise<unknown>;
}
export interface SquadState { ready: boolean; loading: boolean; error: string | null; squads: Squad[] }
const initial: SquadState = { ready: false, loading: false, error: null, squads: [] };
const offline = "Couldn't reach your squads. Check your connection and try again.";
const withGoal = (squad: Squad): Squad => ({ ...squad, goalMinutes: squad.goalMinutes ?? null });
const key = (scope: JournalScope) => `liferpg:squads:v1:${scope.backendId}:${scope.ownerId}`;

/** Squads are online-only; the last list is kept so the tab never looks empty offline. */
export function createSquadStore(storage: Storage, newId: () => string, now: () => Date = () => new Date()) {
  const states = new Map<string, SquadState>(), listeners = new Map<string, Set<() => void>>(), loads = new Map<string, Promise<void>>();
  const publish = (scope: JournalScope, patch: Partial<SquadState>) => {
    const k = key(scope); states.set(k, { ...(states.get(k) ?? initial), ...patch }); listeners.get(k)?.forEach(listener => listener());
  };
  const remember = (scope: JournalScope, squads: Squad[]) => { publish(scope, { squads, ready: true, error: null }); void storage.setItem(key(scope), JSON.stringify(squads)).catch(() => {}); };
  const reply = (value: unknown): { status: SquadStatus; squad?: Squad } => {
    const r = value as { status?: unknown; squad?: unknown } | null;
    if (!r || typeof r.status !== "string" || !(r.status in squadMessage || r.status === "saved")) throw new Error("Invalid squad reply");
    if (r.squad !== undefined && !validSquad(r.squad)) throw new Error("Invalid squad reply");
    return { status: r.status as SquadStatus, squad: r.squad === undefined ? undefined : withGoal(r.squad as Squad) };
  };
  const store = {
    snapshot: (scope: JournalScope | null): SquadState => scope ? states.get(key(scope)) ?? initial : { ...initial, ready: true },
    subscribe(scope: JournalScope | null, listener: () => void) {
      if (!scope) return () => {};
      const k = key(scope); if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k)!.add(listener);
      return () => { listeners.get(k)?.delete(listener); };
    },
    /** Shows the remembered list at once, then refreshes it when online. */
    async load(scope: JournalScope, transport: SquadTransport | null, active: () => boolean = () => true): Promise<void> {
      const k = key(scope), running = loads.get(k); if (running) return running;
      const request = (async () => {
        if (!store.snapshot(scope).ready) {
          try { const raw = await storage.getItem(k); const saved: unknown = raw ? JSON.parse(raw) : []; if (active() && Array.isArray(saved) && saved.every(validSquad)) publish(scope, { squads: saved.map(withGoal), ready: true }); }
          catch { /* a broken cache just means a fresh list */ }
        }
        if (!transport) { if (active()) publish(scope, { ready: true }); return; }
        publish(scope, { loading: true });
        try {
          const list = await transport.list(weekStart(now()));
          if (!active()) return;
          if (!Array.isArray(list) || list.length > 5 || !list.every(validSquad)) throw new Error("Invalid squad list");
          remember(scope, list.map(withGoal));
        } catch { if (active()) publish(scope, { ready: true, error: offline }); }
        finally { if (active()) publish(scope, { loading: false }); }
      })().finally(() => loads.delete(k));
      loads.set(k, request); return request;
    },
    /** Returns null when it worked, or a sentence saying what to do. */
    async create(scope: JournalScope, transport: SquadTransport, name: string, requestId = newId()): Promise<string | null> {
      try {
        const result = reply(await transport.create(requestId, name, weekStart(now())));
        if (result.status !== "saved" || !result.squad) return squadMessage[result.status] ?? offline;
        remember(scope, [...store.snapshot(scope).squads.filter(item => item.id !== result.squad!.id), result.squad]); return null;
      } catch { return offline; }
    },
    async join(scope: JournalScope, transport: SquadTransport, code: string): Promise<string | null> {
      try {
        const result = reply(await transport.join(code, weekStart(now())));
        if (result.status !== "saved" || !result.squad) return squadMessage[result.status] ?? offline;
        remember(scope, [...store.snapshot(scope).squads.filter(item => item.id !== result.squad!.id), result.squad]); return null;
      } catch { return offline; }
    },
    async leave(scope: JournalScope, transport: SquadTransport, squadId: string): Promise<string | null> {
      try {
        const result = reply(await transport.leave(squadId));
        if (result.status !== "saved") return squadMessage[result.status] ?? offline;
        remember(scope, store.snapshot(scope).squads.filter(item => item.id !== squadId)); return null;
      } catch { return offline; }
    },
    /** Owner only: a new name and weekly goal, or a fresh invite code. */
    async update(scope: JournalScope, transport: SquadTransport, squadId: string, change: { name: string; goalMinutes: number | null } | "code"): Promise<string | null> {
      try {
        const result = reply(change === "code" ? await transport.newCode(squadId, weekStart(now())) : await transport.update(squadId, change.name, change.goalMinutes, weekStart(now())));
        if (result.status !== "saved" || !result.squad) return squadMessage[result.status] ?? offline;
        remember(scope, store.snapshot(scope).squads.map(item => item.id === squadId ? result.squad! : item)); return null;
      } catch { return offline; }
    },
    async remove(scope: JournalScope, transport: SquadTransport, squadId: string, memberId: string): Promise<string | null> {
      try {
        const result = reply(await transport.remove(squadId, memberId));
        if (result.status !== "saved") return squadMessage[result.status] ?? offline;
        remember(scope, store.snapshot(scope).squads.map(item => item.id === squadId ? { ...item, members: item.members.filter(member => member.id !== memberId) } : item)); return null;
      } catch { return offline; }
    },
  };
  return store;
}
