/** Which squad the Squads tab shows. Home sets it before opening the tab. */
let chosen: string | null = null;
const listeners = new Set<() => void>();
export const squadSelection = {
  get: () => chosen,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  choose(id: string | null) { if (id !== chosen) { chosen = id; listeners.forEach(listener => listener()); } },
};
