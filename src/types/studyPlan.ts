import type { JournalScope } from "./sessionJournal";

export interface StudyCourseDraft { name: string; focusAreaId: number | null }
export interface StudyExamDraft { title: string; courseId: string | null; examDate: string }
export interface StudyCourse extends StudyCourseDraft { kind: "course"; id: string; revision: number; deletedAt: number | null; totalSeconds: number }
export interface StudyExam extends StudyExamDraft { kind: "exam"; id: string; revision: number; deletedAt: number | null }
export type StudyItem = StudyCourse | StudyExam;
export type StudyOperation =
  | { operationId: string; kind: "course"; itemId: string; expectedRevision: number; draft: StudyCourseDraft; deleted: boolean }
  | { operationId: string; kind: "exam"; itemId: string; expectedRevision: number; draft: StudyExamDraft; deleted: boolean };
/** A finished-or-running focus session counted toward a subject. */
export interface StudyTag { clientSessionId: string; courseId: string | null }
export interface StudyRecent { courseId: string; completedAt: number; seconds: number }
export interface StudyEnvelope { version: 1; scope: JournalScope; courses: StudyCourse[]; exams: StudyExam[]; recent: StudyRecent[]; pending: StudyOperation[]; tags: StudyTag[] }
export interface StudyState { ready: boolean; busy: boolean; error: string | null; courses: StudyCourse[]; exams: StudyExam[]; recent: StudyRecent[]; pendingCount: number }
export interface StudyReply { status: "saved" | "conflict"; item: StudyItem | null; reason?: "limit" | "area" | "course" | "date" }
export interface StudyList { courses: StudyCourse[]; exams: StudyExam[]; recent: StudyRecent[] }
export interface StudyTransport {
  list: (since: number) => Promise<StudyList>;
  apply: (operation: StudyOperation) => Promise<StudyReply>;
  tag: (tag: StudyTag) => Promise<{ status: "saved" | "conflict"; reason?: string }>;
}
