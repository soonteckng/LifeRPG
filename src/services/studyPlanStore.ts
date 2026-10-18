import type { JournalScope } from "../types/sessionJournal";
import type { StudyCourseDraft, StudyEnvelope, StudyExamDraft, StudyOperation, StudyReply, StudyState, StudyTransport } from "../types/studyPlan";
import { COURSE_LIMIT, EXAM_LIMIT, normaliseCourse, normaliseExam, parseStudyEnvelope, STUDY_QUEUE_LIMIT, STUDY_TAG_LIMIT, studyStorageKey,
  studyListSince, upcomingExams, validCourseDraft, validExamDraft, validRecent, visibleStudy } from "../utils/studyPlan";
import { isJournalUuid } from "../utils/sessionJournalSchema";

interface Storage { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> }
const initial: StudyState = { ready: false, busy: false, error: null, courses: [], exams: [], recent: [], pendingCount: 0 };
const inactive: StudyState = { ...initial, ready: true };
const conflictMessage: Record<string, string> = {
  limit: "You've reached the limit. Remove one to make room.",
  area: "That focus area is no longer available. Pick another.",
  course: "That subject was removed on another device.",
  date: "Pick a date from today onwards.",
};

/** Exams and subjects, kept on the phone first and synced like saved routines. */
export function createStudyPlanStore(storage: Storage, newId: () => string, now: () => Date = () => new Date()) {
  const envelopes = new Map<string, StudyEnvelope>(), states = new Map<string, StudyState>();
  const listeners = new Map<string, Set<() => void>>(), reads = new Map<string, Promise<void>>();
  const writes = new Map<string, Promise<unknown>>(), flights = new Map<string, Promise<void>>();
  function publish(key: string, patch: Partial<StudyState> = {}) {
    const envelope = envelopes.get(key), before = states.get(key) ?? initial;
    states.set(key, { ...before, ...(envelope ? { ready: true, ...visibleStudy(envelope), recent: envelope.recent, pendingCount: envelope.pending.length + envelope.tags.length } : {}), ...patch });
    listeners.get(key)?.forEach(listener => listener());
  }
  async function commit(key: string, next: StudyEnvelope) {
    await storage.setItem(key, JSON.stringify(next)); envelopes.set(key, next); publish(key, { error: null });
  }
  function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const request = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
    writes.set(key, request); void request.finally(() => { if (writes.get(key) === request) writes.delete(key); }).catch(() => {});
    return request;
  }
  async function enqueue(scope: JournalScope, kind: "course" | "exam", draft: StudyCourseDraft | StudyExamDraft, id: string | undefined, deleted: boolean, createId?: string) {
    if (id !== undefined && !isJournalUuid(id) || (kind === "course" ? !validCourseDraft(draft) : !validExamDraft(draft))) return false;
    await store.load(scope); const key = studyStorageKey(scope);
    return serial(key, async () => {
      const before = envelopes.get(key); if (!before) return false;
      const visible = visibleStudy(before), list = kind === "course" ? visible.courses : visible.exams;
      const current = id ? list.find(item => item.id === id) : undefined;
      const full = !id && (kind === "course" ? list.length >= COURSE_LIMIT : upcomingExams(visible.exams, now()).length >= EXAM_LIMIT);
      if (id && !current || full || before.pending.length >= STUDY_QUEUE_LIMIT) {
        publish(key, { error: before.pending.length >= STUDY_QUEUE_LIMIT ? "Reconnect to save your queued changes before making more." : full ? conflictMessage.limit : "This was removed. Refresh and try again." });
        return false;
      }
      const itemId = id ?? createId ?? newId(), operationId = newId();
      if (!isJournalUuid(itemId) || !isJournalUuid(operationId)) return false;
      const clean = kind === "course" ? { name: (draft as StudyCourseDraft).name, focusAreaId: (draft as StudyCourseDraft).focusAreaId }
        : { title: (draft as StudyExamDraft).title, courseId: (draft as StudyExamDraft).courseId, examDate: (draft as StudyExamDraft).examDate,
          examMinute: (draft as StudyExamDraft).examMinute ?? null, remind: (draft as StudyExamDraft).remind ?? true };
      const operation = { operationId, kind, itemId, expectedRevision: current?.revision ?? 0, draft: clean, deleted } as StudyOperation;
      try { await commit(key, { ...before, pending: [...before.pending, operation] }); return true; }
      catch { publish(key, { error: "Couldn't save this on your phone. Please try again." }); return false; }
    });
  }
  function validReply(reply: StudyReply, operation: StudyOperation) {
    if (!reply || !["saved", "conflict"].includes(reply.status)) return null;
    const item = reply.item === null ? null : operation.kind === "course" ? normaliseCourse(reply.item) : normaliseExam(reply.item);
    if (reply.item !== null && (!item || item.id !== operation.itemId)) return null;
    if (reply.status === "saved" && (!item || item.revision !== operation.expectedRevision + 1 || (item.deletedAt !== null) !== operation.deleted)) return null;
    return { item };
  }
  const store = {
    snapshot(scope: JournalScope | null): StudyState { return scope ? states.get(studyStorageKey(scope)) ?? initial : inactive; },
    subscribe(scope: JournalScope | null, listener: () => void) {
      if (!scope) return () => {};
      const key = studyStorageKey(scope); if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key)!.add(listener);
      return () => { listeners.get(key)?.delete(listener); };
    },
    async load(scope: JournalScope): Promise<void> {
      const key = studyStorageKey(scope); if (envelopes.has(key)) return;
      const pending = reads.get(key); if (pending) return pending;
      const request = storage.getItem(key).then(raw => { envelopes.set(key, parseStudyEnvelope(raw, scope)); publish(key, { error: null }); })
        .catch(() => publish(key, { error: "Couldn't read your study plan on this phone. Your saved data has been kept." }))
        .finally(() => reads.delete(key));
      reads.set(key, request); return request;
    },
    saveCourse: (scope: JournalScope, draft: StudyCourseDraft, id?: string) => enqueue(scope, "course", draft, id, false),
    /** Finds a subject by name (any case) or adds it, and returns its id. */
    async ensureCourse(scope: JournalScope, name: string, focusAreaId: number | null): Promise<string | null> {
      const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
      if (!validCourseDraft({ name: clean, focusAreaId })) return null;
      await store.load(scope);
      const existing = store.snapshot(scope).courses.find(course => course.name.toLowerCase() === clean.toLowerCase());
      if (existing) return existing.id;
      const id = newId();
      return await enqueue(scope, "course", { name: clean, focusAreaId }, undefined, false, id) ? id : null;
    },
    saveExam: (scope: JournalScope, draft: StudyExamDraft, id?: string) => enqueue(scope, "exam", draft, id, false),
    async remove(scope: JournalScope, kind: "course" | "exam", id: string): Promise<boolean> {
      await store.load(scope); const snapshot = store.snapshot(scope);
      const current = kind === "course" ? snapshot.courses.find(item => item.id === id) : snapshot.exams.find(item => item.id === id);
      if (!current) return false;
      const draft = current.kind === "course" ? { name: current.name, focusAreaId: current.focusAreaId } : { title: current.title, courseId: current.courseId, examDate: current.examDate, examMinute: current.examMinute ?? null, remind: current.remind ?? true };
      return enqueue(scope, kind, draft, id, true);
    },
    /** Counts a focus session toward a subject; a null subject clears it. */
    async tagSession(scope: JournalScope, clientSessionId: string, courseId: string | null): Promise<boolean> {
      if (!isJournalUuid(clientSessionId) || courseId !== null && !isJournalUuid(courseId)) return false;
      await store.load(scope); const key = studyStorageKey(scope);
      return serial(key, async () => {
        const before = envelopes.get(key); if (!before) return false;
        const tags = [...before.tags.filter(item => item.clientSessionId !== clientSessionId), { clientSessionId, courseId }];
        if (tags.length > STUDY_TAG_LIMIT) return false;
        try { await commit(key, { ...before, tags }); return true; } catch { return false; }
      });
    },
    async sync(scope: JournalScope, transport: StudyTransport, active: () => boolean): Promise<void> {
      const key = studyStorageKey(scope), flight = flights.get(key); if (flight) return flight;
      const request = (async () => {
        await store.load(scope); if (!active() || !envelopes.has(key)) return;
        publish(key, { busy: true });
        let notice: string | null = null;
        try {
          for (let count = 0; count < STUDY_QUEUE_LIMIT && active(); count++) {
            const operation = envelopes.get(key)?.pending[0]; if (!operation) break;
            const reply = await transport.apply(JSON.parse(JSON.stringify(operation)));
            if (!active()) return;
            const checked = validReply(reply, operation); if (!checked) throw new Error("Invalid study reply");
            await serial(key, async () => {
              const before = envelopes.get(key)!;
              if (!active() || before.pending[0]?.operationId !== operation.operationId) return;
              const saved = reply.status === "saved";
              // A conflict drops this item's queued edits and adopts the server's copy.
              const pending = saved ? before.pending.slice(1) : before.pending.filter(item => item.itemId !== operation.itemId);
              const keep = <T extends { id: string; deletedAt: number | null }>(items: T[], next: T | null) =>
                [...items.filter(item => item.id !== operation.itemId), ...(next && next.deletedAt === null ? [next] : [])];
              const courses = operation.kind === "course" ? keep(before.courses, checked.item && checked.item.kind === "course"
                ? { ...checked.item, totalSeconds: before.courses.find(item => item.id === operation.itemId)?.totalSeconds ?? 0 } : null) : before.courses;
              const exams = operation.kind === "exam" ? keep(before.exams, checked.item && checked.item.kind === "exam" ? checked.item : null) : before.exams;
              if (!saved) notice = conflictMessage[reply.reason ?? ""] ?? "Changed on another device. We kept the latest version.";
              await commit(key, { ...before, courses, exams, pending });
            });
          }
          for (let count = 0; count < STUDY_TAG_LIMIT && active(); count++) {
            const tag = envelopes.get(key)?.tags[0]; if (!tag) break;
            const reply = await transport.tag({ ...tag });
            if (!active()) return;
            if (reply?.status === "conflict" && reply.reason === "limit") break;
            if (reply?.status !== "saved" && reply?.status !== "conflict") throw new Error("Invalid tag reply");
            await serial(key, async () => {
              const before = envelopes.get(key)!;
              if (active() && before.tags[0] === tag) await commit(key, { ...before, tags: before.tags.slice(1) });
            });
          }
          if (!active()) return;
          const remote = await transport.list(studyListSince(now()));
          if (!active()) return;
          const courses = Array.isArray(remote?.courses) ? remote.courses.map(normaliseCourse) : null;
          const exams = Array.isArray(remote?.exams) ? remote.exams.map(normaliseExam) : null;
          if (!courses || !exams || !Array.isArray(remote.recent) || courses.length > COURSE_LIMIT || exams.length > 2 * EXAM_LIMIT || remote.recent.length > 500
            || courses.some(item => !item) || exams.some(item => !item) || !remote.recent.every(validRecent)) throw new Error("Invalid study list");
          await serial(key, async () => {
            if (!active()) return;
            await commit(key, { ...envelopes.get(key)!, courses: courses as NonNullable<typeof courses[number]>[], exams: exams as NonNullable<typeof exams[number]>[], recent: remote.recent });
          });
        } catch { if (active()) notice = "Saved on this phone. We'll sync your study plan when the connection returns."; }
        finally { publish(key, { busy: false, ...(notice && active() ? { error: notice } : {}) }); }
      })().finally(() => { if (flights.get(key) === request) flights.delete(key); });
      flights.set(key, request); return request;
    },
  };
  return store;
}
