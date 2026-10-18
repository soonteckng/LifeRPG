/**
 * Which kind of session the shared setup is preparing: free focus, a routine
 * or study, plus the routine picked for Routine. Home's card and the session
 * screen read the same values; the Study and Routines tabs set them before
 * opening setup. Nothing here outlives the app process.
 */
export type SetupMode = "focus" | "routine" | "study";
type Listener = () => void;
let mode: SetupMode = "focus";
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
