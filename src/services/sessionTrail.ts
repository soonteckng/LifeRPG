import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * A short, private record of what the session timer did, kept on this phone so
 * a rare freeze can be traced afterwards. It holds states and times only:
 * never names, emails or notes. Settings can share it when asked.
 */
const KEY = "liferpg:session-trail:v1";
const LIMIT = 300;
type Entry = { at: number; event: string; detail?: Record<string, unknown> };
let entries: Entry[] | null = null;
let loading: Promise<void> | null = null;
let writing = false, dirty = false;

const load = () => loading ??= AsyncStorage.getItem(KEY).then(raw => {
  const saved = raw ? JSON.parse(raw) : [];
  entries = [...(Array.isArray(saved) ? saved : []), ...(entries ?? [])].slice(-LIMIT);
}).catch(() => { entries ??= []; });

async function flush() {
  if (writing) { dirty = true; return; }
  writing = true;
  try {
    do { dirty = false; await load(); await AsyncStorage.setItem(KEY, JSON.stringify(entries ?? [])); } while (dirty);
  } catch { /* A trail is best effort; it must never affect a session. */ }
  finally { writing = false; }
}

export function sessionTrail(event: string, detail?: Record<string, unknown>) {
  try {
    (entries ??= []).push({ at: Date.now(), event, ...(detail ? { detail } : {}) });
    if (entries.length > LIMIT) entries.splice(0, entries.length - LIMIT);
    void flush();
  } catch { /* Never let diagnostics throw. */ }
}

/** The trail as plain text, oldest first, for sharing from Settings. */
export async function readSessionTrail(): Promise<string> {
  await load();
  return (entries ?? []).map(entry => `${new Date(entry.at).toISOString()} ${entry.event}${entry.detail ? ` ${JSON.stringify(entry.detail)}` : ""}`).join("\n");
}
