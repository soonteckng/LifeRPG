import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";

/**
 * Deletes the signed-in account and everything stored for it on the server.
 * Squads it leads pass to the next member first. True only when the server
 * says it's done.
 */
export async function deleteMyAccount(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("delete_my_account_v1", { p_confirm: "DELETE" });
    return !error && (data as { status?: string } | null)?.status === "deleted";
  } catch { return false; }
}

/**
 * Removes everything this phone kept for a deleted account: every saved key
 * that names it (sessions waiting to sync, routines, caches, preferences).
 * Other accounts on the phone are untouched.
 */
export async function forgetAccountOnPhone(owner: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(owner)) return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter(key => key.includes(owner) || key.includes(encodeURIComponent(owner)));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch { /* The account is already gone on the server; leftovers can't be opened by anyone. */ }
}
