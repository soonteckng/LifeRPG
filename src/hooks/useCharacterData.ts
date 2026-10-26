import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { afterTransition } from "../utils/afterTransition";
import {
  getCompletedSessions,
  getProgressSubjects,
  type ProgressSession,
} from "../services/progressService";
import type { Subject } from "../services/taskService";

type CharacterData = { userId: string; areas: Subject[]; sessions: ProgressSession[] };
type Snapshot = CharacterData & { at: number; summary: unknown };
// Profile and its milestone collection share a small account-scoped cache. A
// late old-account read cannot evict the current account's completed copy.
// Copies last a minute, and are refreshed after a newer session finishes.
const snapshots = new Map<string, Snapshot>();
const staleOwners = new Set<string>();
type PendingCharacter = { userId: string; summary: unknown; generation: number; request: Promise<CharacterData> };
const prefetching = new Map<string, PendingCharacter>();
const readGenerations = new Map<string, number>();
async function loadCharacter(userId: string): Promise<CharacterData> {
  const [areas, sessions] = await Promise.all([
    getProgressSubjects(userId),
    getCompletedSessions("1970-01-01T00:00:00Z", new Date().toISOString(), userId),
  ]);
  return { userId, areas, sessions };
}
function remember(value: CharacterData, summary: unknown) {
  const next = { ...value, at: Date.now(), summary };
  snapshots.delete(value.userId); snapshots.set(value.userId, next);
  staleOwners.delete(value.userId);
  while (snapshots.size > 4) {
    const oldest = snapshots.keys().next().value!;
    snapshots.delete(oldest); staleOwners.delete(oldest);
  }
  return next;
}
function invalidateCompletedCache(userId: string, summary: unknown) {
  const cached = snapshots.get(userId);
  // Keep the invalidation after Done clears the temporary summary, including
  // while Profile is blurred and therefore waits to refresh until its visit.
  if (summary && cached && cached.summary !== summary) staleOwners.add(userId);
}
function readCharacter(userId: string, summary: unknown): PendingCharacter {
  invalidateCompletedCache(userId, summary);
  // Clearing the result on Done is not another completion. A null marker can
  // share the already fresh read rather than replacing it with another call.
  const existing = prefetching.get(userId);
  if (existing && (!summary || existing.summary === summary)) return existing;
  const generation = (readGenerations.get(userId) ?? 0) + 1;
  readGenerations.set(userId, generation);
  const request = loadCharacter(userId).then(value => generation === readGenerations.get(userId) ? remember(value, summary) : value);
  const pending = { userId, summary, generation, request };
  prefetching.set(userId, pending);
  // A pre-completion reply must neither replace the newer shared snapshot nor
  // detach the read that now serves Profile and Milestones.
  void request.then(() => {}, () => {}).finally(() => { if (prefetching.get(userId) === pending) prefetching.delete(userId); });
  return pending;
}
/** Loads Profile's growth quietly so its first visit is already drawn. */
export function prefetchCharacterData(userId: string, summary: unknown) {
  const cached = snapshots.get(userId);
  if (!userId || cached && !staleOwners.has(userId) && (!summary || cached.summary === summary) && Date.now() - cached.at <= 60_000) return;
  readCharacter(userId, summary);
}
export function useCharacterData() {
  const { profile } = useUser();
  const { sessionSummary } = useTimer({ live: false });
  const [data, setData] = useState<CharacterData | null>(() => snapshots.get(profile.id) ?? null);
  const [loading, setLoading] = useState(() => !snapshots.has(profile.id));
  const [errorOwner, setErrorOwner] = useState<string | null>(null);
  const generation = useRef(0);
  const focused = useRef(false);
  const summary = useRef(sessionSummary);
  const currentOwner = useRef(profile.id);
  useLayoutEffect(() => {
    currentOwner.current = profile.id;
    summary.current = sessionSummary;
    invalidateCompletedCache(profile.id, sessionSummary);
    const pending = prefetching.get(profile.id);
    if (sessionSummary && pending && pending.summary !== sessionSummary) {
      readGenerations.set(profile.id, (readGenerations.get(profile.id) ?? 0) + 1);
      prefetching.delete(profile.id);
    }
  }, [profile.id, sessionSummary]);
  const refresh = useCallback(async () => {
    if (!profile.id) return;
    const request = ++generation.current;
    const seen = summary.current;
    const pending = readCharacter(profile.id, seen);
    const current = () => request === generation.current && currentOwner.current === profile.id && pending.generation === readGenerations.get(profile.id);
    setLoading(true);
    try {
      const value = await pending.request;
      if (current()) {
        setData(value);
        setErrorOwner(null);
      }
    } catch {
      if (current()) setErrorOwner(profile.id);
    } finally {
      if (current()) setLoading(false);
    }
  }, [profile.id]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const cached = snapshots.get(profile.id);
      // Nothing to show yet: start at once. Otherwise refresh quietly after
      // the entrance, only when the copy is old or a session finished since.
      let cancelEntranceWork = () => {};
      if (!cached) void refresh();
      else {
        if (data !== cached) setData(cached);
        if (staleOwners.has(profile.id) || Date.now() - cached.at > 60_000 || cached.summary !== summary.current) cancelEntranceWork = afterTransition(() => { void refresh(); });
      }
      return () => {
        cancelEntranceWork();
        focused.current = false;
        generation.current++;
      };
      // data is read only to adopt a newer shared copy on focus.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh, profile.id]),
  );
  // A session finishing while this screen is open; a mount is handled on focus.
  const lastSummary = useRef(sessionSummary);
  useEffect(() => {
    if (lastSummary.current === sessionSummary) return;
    lastSummary.current = sessionSummary;
    if (sessionSummary && focused.current) void refresh();
  }, [sessionSummary, refresh]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && focused.current) void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  return {
    data: data?.userId === profile.id ? data : null,
    loading,
    error: errorOwner === profile.id,
    refresh,
  };
}
