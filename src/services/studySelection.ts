/**
 * The subject picked for the next focus session. Session setup sets it, the
 * Study tab presets it, and StudyLifecycle counts the session that starts
 * right after it is armed. Nothing here outlives the app process.
 */
type Listener = () => void;
let chosen: string | null = null;
let armed: { courseId: string; at: number; previous: string | null } | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(listener => listener());

export const studySelection = {
  get: () => chosen,
  subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  choose(courseId: string | null) { if (chosen !== courseId) { chosen = courseId; emit(); } },
  /** Called as a session starts; the next new session id within 20 s gets the subject. */
  arm(previousSessionId: string | null, at = Date.now()) {
    armed = chosen ? { courseId: chosen, at, previous: previousSessionId } : null;
  },
  take(sessionId: string | null, at = Date.now()): string | null {
    if (!armed || !sessionId || sessionId === armed.previous) return null;
    const courseId = at - armed.at <= 20_000 ? armed.courseId : null;
    armed = null; if (courseId) studySelection.choose(null);
    return courseId;
  },
};
