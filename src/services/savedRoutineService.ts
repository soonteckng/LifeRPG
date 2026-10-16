import AsyncStorage from "@react-native-async-storage/async-storage";
import { uuid } from "expo-modules-core";
import { supabase } from "../../lib/supabase";
import { createSavedRoutineStore } from "./savedRoutineStore";
import type { JournalScope } from "../types/sessionJournal";
import type { RoutineReply, RoutineTransport, SavedRoutine } from "../types/savedRoutine";
import { validSavedRoutine } from "../utils/savedRoutine";
export const savedRoutineStore = createSavedRoutineStore(AsyncStorage, () => uuid.v4().toLowerCase());
export const resolveSavedRoutine = (scope: JournalScope, id: string) => savedRoutineStore.resolve(scope, id);

export function createRoutineTransport(scope: JournalScope, verifyOwner: () => Promise<string | null>): RoutineTransport {
  const verify = async () => { if (await verifyOwner() !== scope.ownerId) throw new Error("Account changed"); };
  const bounded = <T>(request: PromiseLike<T>): Promise<T> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Routine connection timed out")), 8000);
    Promise.resolve(request).then(value => { clearTimeout(timeout); resolve(value); }, error => { clearTimeout(timeout); reject(error); });
  });
  return {
    async list() {
      await verify(); const { data, error } = await bounded(supabase.rpc("list_saved_routines_v1", { p_expected_owner: scope.ownerId }));
      if (error || !Array.isArray(data) || !data.every(validSavedRoutine)) throw error ?? new Error("Invalid routine list");
      await verify(); return data as SavedRoutine[];
    },
    async apply(operation) {
      await verify(); const { data, error } = await bounded(supabase.rpc("change_saved_routine_v1", { p_operation_id: operation.operationId,
        p_routine_id: operation.routineId, p_expected_revision: operation.expectedRevision, p_draft: operation.draft, p_deleted: operation.deleted, p_expected_owner: scope.ownerId }));
      if (error) throw error; await verify(); return data as RoutineReply;
    },
  };
}
