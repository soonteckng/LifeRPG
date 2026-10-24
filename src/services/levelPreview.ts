import { useSyncExternalStore } from "react";

/**
 * Developer accounts only: show your own level as another level, to see each
 * tier's colours on Home, your picture, Profile, Outfits and the level road.
 * It changes what's drawn on this phone for this app run, nothing saved.
 * Only the Developer section sets it (the server decides who sees that), and
 * it's tied to that account, so it never shows for anyone else on the phone.
 */
let preview: { owner: string; level: number } | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of [...listeners]) listener(); };

export const levelPreview = {
  get(owner: string | null | undefined) { return owner && preview?.owner === owner ? preview.level : null; },
  set(owner: string, level: number | null) {
    if (level === null) { if (preview?.owner === owner) { preview = null; notify(); } return; }
    if (!owner || !Number.isFinite(level) || level < 1) return;
    preview = { owner, level: Math.floor(level) }; notify();
  },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};

/** Your level as drawn: your real level, or a developer's preview of another. */
export function useShownLevel(owner: string | null | undefined, real: number | null | undefined) {
  const previewed = useSyncExternalStore(levelPreview.subscribe, () => levelPreview.get(owner), () => null);
  const level = Number.isFinite(real) && (real as number) >= 1 ? Math.floor(real as number) : 1;
  return { level: previewed ?? level, previewing: previewed !== null };
}
