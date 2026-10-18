/**
 * Which kind of session the shared setup is preparing: a routine (any activity
 * in a category, or one of your saved routines) or study, plus the routine
 * picked for Routine. The Study and Routines tabs set them before opening the
 * session screen, which then stays in that one mode. Nothing here outlives the
 * app process.
 */
export type SetupMode = "routine" | "study";
type Listener = () => void;
let mode: SetupMode = "routine";
let routineKey: string | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(listener => listener());
export const setupMode = {
  get: () => mode,
  routine: () => routineKey,
  subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  choose(next: SetupMode) { if (next !== mode) { mode = next; emit(); } },
  chooseRoutine(key: string | null) { if (key !== routineKey) { routineKey = key; emit(); } },
};
