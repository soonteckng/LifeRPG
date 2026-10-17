import { uuid } from "expo-modules-core";
import { getNativeSessionCountdownModule } from "./nativeSessionCountdown";
import { savedRoutineStore } from "./savedRoutineService";
import { readOfflineFocusAreas } from "./offlineFocusCatalog";
import { focusAreaTitle } from "../utils/focusAreas";
import { isJournalUuid, validateJournalScope } from "../utils/sessionJournalSchema";
import type { JournalScope } from "../types/sessionJournal";
import type { SavedRoutine } from "../types/savedRoutine";

export interface RoutineWidgetRow { id: string; name: string; durationSeconds: number; areaTitle: string; color: string }
export interface RoutineWidgetLaunch { scope: JournalScope; routineId: string }
export interface NativeRoutineWidgetModule {
  routineWidgetVersion: number;
  activateRoutineWidgets(leaseId: string, scopeJson: string): Promise<boolean>;
  publishRoutineWidgets(leaseId: string, routinesJson: string): Promise<boolean>;
  clearRoutineWidgets(leaseId: string): Promise<boolean>;
  pinRoutineWidget(leaseId: string, routineId: string): Promise<boolean>;
  consumeRoutineWidgetLaunch(scopeJson: string, nonce: string): Promise<RoutineWidgetLaunch | null>;
}
const sameScope = (a: JournalScope, b: JournalScope) => a.ownerId === b.ownerId && a.backendId === b.backendId;
const compatible = (value: unknown): value is NativeRoutineWidgetModule => {
  const module = value as NativeRoutineWidgetModule | null;
  return !!module && module.routineWidgetVersion === 1 && [module.activateRoutineWidgets, module.publishRoutineWidgets,
    module.clearRoutineWidgets, module.pinRoutineWidget, module.consumeRoutineWidgetLaunch].every(item => typeof item === "function");
};

/** Projection/launch bridge only. All session changes stay in the JS controller. */
export function createRoutineWidgetBridge(options: {
  resolveModule: () => Promise<unknown>; newLeaseId: () => string;
}) {
  let tail: Promise<unknown> = Promise.resolve(), generation = 0;
  let desiredScope: JournalScope | null = null;
  let active: { scope: JournalScope; lease: string; generation: number } | null = null;
  let activation: { scope: JournalScope; lease: string; flight: Promise<boolean> } | null = null;
  const ordered = <T,>(work: () => Promise<T>): Promise<T> => {
    const flight = tail.catch(() => {}).then(work); tail = flight.then(() => undefined, () => undefined); return flight;
  };
  async function api() {
    try { const value = await options.resolveModule(); return compatible(value) ? value : null; }
    catch { return null; }
  }
  async function activate(scope: JournalScope): Promise<boolean> {
    validateJournalScope(scope);
    if (!desiredScope || !sameScope(desiredScope, scope)) return false;
    if (active && sameScope(active.scope, scope)) return true;
    if (activation && sameScope(activation.scope, scope)) return activation.flight;
    const expected = ++generation, lease = options.newLeaseId();
    if (!isJournalUuid(lease)) return false;
    const flight = ordered(async () => {
      const module = await api(); if (!module || expected !== generation) return false;
      try {
        const accepted = await module.activateRoutineWidgets(lease, JSON.stringify(scope));
        if (accepted && expected !== generation) { await module.clearRoutineWidgets(lease); return false; }
        if (!accepted) return false;
        active = { scope: { ...scope }, lease, generation: expected }; return true;
      } catch { return false; }
    }).finally(() => { if (activation?.flight === flight) activation = null; });
    activation = { scope: { ...scope }, lease, flight };
    return flight;
  }
  return {
    selectOwner(scope: JournalScope | null) {
      if (scope) validateJournalScope(scope);
      if (scope && desiredScope && sameScope(scope, desiredScope) || !scope && !desiredScope) return;
      const previousLease = active?.lease ?? activation?.lease;
      generation++; active = null; activation = null; desiredScope = scope ? { ...scope } : null;
      if (previousLease) void ordered(async () => {
        const module = await api();
        try { await module?.clearRoutineWidgets(previousLease); } catch { /* Keep session storage separate. */ }
      });
    },
    supported: async () => !!await api(),
    async publish(scope: JournalScope, rows: RoutineWidgetRow[]) {
      if (!await activate(scope)) return false;
      const selected = active;
      return ordered(async () => {
        if (!selected || active !== selected || !sameScope(selected.scope, scope)) return false;
        const module = await api();
        if (!module || active !== selected) return false;
        try { return await module.publishRoutineWidgets(selected.lease, JSON.stringify(rows)); }
        catch { return false; }
      });
    },
    async pin(scope: JournalScope, routineId: string) {
      if (!isJournalUuid(routineId) || !await activate(scope)) return false;
      const selected = active;
      return ordered(async () => {
        if (!selected || active !== selected || !sameScope(selected.scope, scope)) return false;
        const module = await api(); if (!module || active !== selected) return false;
        try { return await module.pinRoutineWidget(selected.lease, routineId); } catch { return false; }
      });
    },
    async consume(scope: JournalScope, nonce: string): Promise<RoutineWidgetLaunch | null> {
      validateJournalScope(scope);
      if (!isJournalUuid(nonce) || !await activate(scope)) return null;
      const selected = active;
      return ordered(async () => {
        if (!selected || active !== selected || !sameScope(selected.scope, scope)) return null;
        const module = await api(); if (!module || active !== selected) return null;
        try {
          const launch = await module.consumeRoutineWidgetLaunch(JSON.stringify(scope), nonce);
          if (!launch || active !== selected || !isJournalUuid(launch.routineId) || !sameScope(launch.scope, scope)) return null;
          return launch;
        } catch { return null; }
      });
    },
    clear(scope: JournalScope) {
      if (desiredScope && sameScope(desiredScope, scope)) desiredScope = null;
      if (!active || !sameScope(active.scope, scope)) {
        if (activation && sameScope(activation.scope, scope)) { generation++; activation = null; }
        return Promise.resolve(false);
      }
      const previous = active; generation++; active = null;
      return ordered(async () => {
        const module = await api(); if (!module) return false;
        try { return await module.clearRoutineWidgets(previous.lease); } catch { return false; }
      });
    },
  };
}

const bridge = createRoutineWidgetBridge({ resolveModule: getNativeSessionCountdownModule, newLeaseId: () => uuid.v4().toLowerCase() });
export const routineWidgetsSupported = () => bridge.supported();
export const consumeSavedRoutineWidgetLaunch = (scope: JournalScope, nonce: string) => bridge.consume(scope, nonce);

/** Catalogue reads may finish out of order after an edit or deletion. */
export function createRoutineWidgetPublisher(options: {
  readAreas: typeof readOfflineFocusAreas; publish: typeof bridge.publish;
}) {
  let selectedScope: JournalScope | null = null, revision = 0;
  return {
    selectOwner(scope: JournalScope | null) {
      if (scope && selectedScope && sameScope(scope, selectedScope) || !scope && !selectedScope) return;
      selectedScope = scope ? { ...scope } : null; revision++;
    },
    clear(scope: JournalScope) {
      if (selectedScope && sameScope(selectedScope, scope)) { selectedScope = null; revision++; }
    },
    async publish(scope: JournalScope, routines: SavedRoutine[]) {
      if (!selectedScope || !sameScope(selectedScope, scope)) return false;
      const expected = ++revision;
      const areas = await options.readAreas(scope);
      if (expected !== revision || !selectedScope || !sameScope(selectedScope, scope)) return false;
      const rows = routines.filter(routine => routine.deletedAt === null).slice(0, 32).map(routine => {
        const area = areas.find(item => item.id === routine.focusAreaId), candidateColor = area?.color_code;
        return { id: routine.id, name: routine.name, durationSeconds: routine.durationSeconds,
          areaTitle: focusAreaTitle(area?.title), color: candidateColor && /^#[0-9a-f]{6}$/i.test(candidateColor) ? candidateColor : "#5E5CE6" };
      });
      return options.publish(scope, rows);
    },
  };
}
const publisher = createRoutineWidgetPublisher({ readAreas: readOfflineFocusAreas, publish: bridge.publish });
export const selectSavedRoutineWidgetOwner = (scope: JournalScope | null) => { publisher.selectOwner(scope); bridge.selectOwner(scope); };
export const clearSavedRoutineWidgets = (scope: JournalScope) => { publisher.clear(scope); return bridge.clear(scope); };
export const publishSavedRoutineWidgets = (scope: JournalScope, routines: SavedRoutine[]) => publisher.publish(scope, routines);

export async function pinSavedRoutine(scope: JournalScope, routineId: string) {
  await savedRoutineStore.load(scope);
  const snapshot = savedRoutineStore.snapshot(scope);
  if (!snapshot.ready || !snapshot.routines.some(item => item.id === routineId)) return false;
  if (!await publishSavedRoutineWidgets(scope, snapshot.routines)) return false;
  return bridge.pin(scope, routineId);
}
