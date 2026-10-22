import { useEffect, useState } from "react";
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
