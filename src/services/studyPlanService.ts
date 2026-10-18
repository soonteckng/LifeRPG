import AsyncStorage from "@react-native-async-storage/async-storage";
import { uuid } from "expo-modules-core";
import { supabase } from "../../lib/supabase";
import { createStudyPlanStore } from "./studyPlanStore";
import type { JournalScope } from "../types/sessionJournal";
import type { StudyList, StudyReply, StudyTransport } from "../types/studyPlan";

export const studyPlanStore = createStudyPlanStore(AsyncStorage, () => uuid.v4().toLowerCase());

export function createStudyTransport(scope: JournalScope, verifyOwner: () => Promise<string | null>): StudyTransport {
  const verify = async () => { if (await verifyOwner() !== scope.ownerId) throw new Error("Account changed"); };
  const bounded = <T>(request: PromiseLike<T>): Promise<T> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Study connection timed out")), 8000);
    Promise.resolve(request).then(value => { clearTimeout(timeout); resolve(value); }, error => { clearTimeout(timeout); reject(error); });
  });
  return {
    async list(since) {
      await verify();
      const { data, error } = await bounded(supabase.rpc("list_study_plan_v1", { p_expected_owner: scope.ownerId, p_since: new Date(since).toISOString() }));
      if (error || !data || typeof data !== "object") throw error ?? new Error("Invalid study list");
      await verify(); return data as StudyList;
    },
    async apply(operation) {
      await verify();
      const { data, error } = await bounded(supabase.rpc("change_study_item_v1", { p_operation_id: operation.operationId, p_kind: operation.kind,
        p_item_id: operation.itemId, p_expected_revision: operation.expectedRevision, p_draft: operation.draft, p_deleted: operation.deleted, p_expected_owner: scope.ownerId }));
      if (error) throw error; await verify(); return data as StudyReply;
    },
    async tag(tag) {
      await verify();
      const { data, error } = await bounded(supabase.rpc("tag_session_course_v1", { p_client_session_id: tag.clientSessionId, p_course_id: tag.courseId, p_expected_owner: scope.ownerId }));
      if (error) throw error; await verify(); return data as { status: "saved" | "conflict"; reason?: string };
    },
  };
}
