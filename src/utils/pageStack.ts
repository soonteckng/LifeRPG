// Second-level pages register how they move, so the page beneath can drift
// left as one slides in and follow back as it is swiped away, like iOS and
// One UI settings. Order is mount order: a page's child mounts after it.
type Listener = () => void;
let entries: { id: number; motion: unknown }[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(listener => listener());

export const pageStack = {
  /** A fresh id for a page; it joins the stack when it mounts. */
  reserve(): number { return nextId++; },
  /** Adds a page; `motion` is null for pages that don't slide (they can still be parents). */
  add(id: number, motion: unknown) { entries = [...entries.filter(entry => entry.id !== id), { id, motion }]; emit(); },
  remove(id: number) { entries = entries.filter(entry => entry.id !== id); emit(); },
  /** How the page directly above this one moves, if it slides. */
  above<T>(id: number): T | null { const index = entries.findIndex(entry => entry.id === id); return index < 0 ? null : (entries[index + 1]?.motion as T) ?? null; },
  subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
