import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";

/**
 * Whether the signed-in account is a developer account. Only the server
 * knows; the answer is asked once per account and anything but a clear yes
 * means no.
 */
const known = new Map<string, boolean>();

export async function isDeveloper(owner: string): Promise<boolean> {
  if (!owner) return false;
  if (known.has(owner)) return known.get(owner)!;
  try {
    const { data, error } = await supabase.rpc("is_developer_v1");
    const yes = !error && data === true;
    if (!error) known.set(owner, yes);
    return yes;
  } catch { return false; }
}

export function useIsDeveloper(owner: string, online: boolean): boolean {
  const [state, setState] = useState<{ owner: string; yes: boolean }>({ owner, yes: known.get(owner) === true });
  useEffect(() => {
    if (!owner || !online) return;
    let live = true;
    void isDeveloper(owner).then(yes => { if (live) setState({ owner, yes }); });
    return () => { live = false; };
  }, [owner, online]);
  return state.owner === owner && state.yes;
}

/**
 * Developer accounts only: clears the "intro finished" mark on the server and
 * the welcome screen's "seen" mark on this phone, so the whole intro plays
 * again. Nothing else changes. The server refuses everyone else.
 */
export async function restartIntro(owner: string): Promise<boolean> {
  if (!owner) return false;
  try {
    const { data, error } = await supabase.rpc("dev_restart_intro_v1");
    if (error || data !== true) return false;
  } catch { return false; }
  try { await AsyncStorage.removeItem(`liferpg:welcome:v1:${owner}`); } catch { /* the intro still opens, only without its welcome */ }
  return true;
}
