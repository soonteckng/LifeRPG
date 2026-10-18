import AsyncStorage from "@react-native-async-storage/async-storage";
import { uuid } from "expo-modules-core";
import { supabase } from "../../lib/supabase";
import { createSquadStore, type SquadTransport } from "./squadStore";
import type { JournalScope } from "../types/sessionJournal";

export const squadStore = createSquadStore(AsyncStorage, () => uuid.v4().toLowerCase());

export function createSquadTransport(scope: JournalScope, verifyOwner: () => Promise<string | null>): SquadTransport {
  const call = async (name: string, args: Record<string, unknown>) => {
    if (await verifyOwner() !== scope.ownerId) throw new Error("Account changed");
    const request = supabase.rpc(name, { ...args, p_expected_owner: scope.ownerId });
    const { data, error } = await new Promise<Awaited<typeof request>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Squad connection timed out")), 8000);
      Promise.resolve(request).then(value => { clearTimeout(timeout); resolve(value); }, error => { clearTimeout(timeout); reject(error); });
    });
    if (error) throw error;
    if (await verifyOwner() !== scope.ownerId) throw new Error("Account changed");
    return data as unknown;
  };
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    list: since => call("list_squads_v1", { p_since: iso(since) }),
    create: (requestId, name, since) => call("create_squad_v1", { p_request_id: requestId, p_name: name, p_since: iso(since) }),
    join: (code, since) => call("join_squad_v1", { p_code: code, p_since: iso(since) }),
    leave: squadId => call("leave_squad_v1", { p_squad_id: squadId }),
    remove: (squadId, memberId) => call("remove_squad_member_v1", { p_squad_id: squadId, p_member: memberId }),
    update: (squadId, name, goalMinutes, since) => call("update_squad_v1", { p_squad_id: squadId, p_name: name, p_goal_minutes: goalMinutes, p_since: iso(since) }),
    newCode: (squadId, since) => call("new_squad_code_v1", { p_squad_id: squadId, p_since: iso(since) }),
  };
}
