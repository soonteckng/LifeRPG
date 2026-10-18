import type { JournalScope } from "./sessionJournal";

export interface StudyCourseDraft { name: string; focusAreaId: number | null }
/** examMinute is minutes after midnight, or null for no time. */
export interface StudyExamDraft { title: string; courseId: string | null; examDate: string; examMinute: number | null; remind: boolean }
export interface StudyCourse extends StudyCourseDraft { kind: "course"; id: string; revision: number; deletedAt: number | null; totalSeconds: number }
export interface StudyExam extends StudyExamDraft { kind: "exam"; id: string; revision: number; deletedAt: number | null }
export type StudyItem = StudyCourse | StudyExam;
export type StudyOperation =
  | { operationId: string; kind: "course"; itemId: string; expectedRevision: number; draft: StudyCourseDraft; deleted: boolean }
  | { operationId: string; kind: "exam"; itemId: string; expectedRevision: number; draft: StudyExamDraft; deleted: boolean };
/** A finished-or-running focus session counted toward a subject. */
export interface StudyTag { clientSessionId: string; courseId: string | null }
export interface StudyRecent { courseId: string; completedAt: number; seconds: number }
/** A removed subject the server still remembers, so adding it back restores its minutes. */
export interface StudyRemoved { id: string; revision: number; name: string }
export interface StudyEnvelope { version: 1; scope: JournalScope; courses: StudyCourse[]; exams: StudyExam[]; recent: StudyRecent[]; pending: StudyOperation[]; tags: StudyTag[];
  /** Older phones' copies have neither field. */
  removed?: StudyRemoved[]; restores?: string[] }
export interface StudyState { ready: boolean; busy: boolean; error: string | null; courses: StudyCourse[]; exams: StudyExam[]; recent: StudyRecent[]; pendingCount: number }
export interface StudyReply { status: "saved" | "conflict"; item: StudyItem | null; reason?: "limit" | "area" | "course" | "date" }
export interface StudyList { courses: StudyCourse[]; exams: StudyExam[]; recent: StudyRecent[]; removed?: StudyRemoved[] }
export interface StudyTransport {
  list: (since: number) => Promise<StudyList>;
  apply: (operation: StudyOperation) => Promise<StudyReply>;
  tag: (tag: StudyTag) => Promise<{ status: "saved" | "conflict"; reason?: string }>;
  restore: (courseId: string) => Promise<StudyReply>;
}
/** Which subject a study session was for, from the server, for Progress. */
export interface StudySessionCourse { clientSessionId: string; courseId: string; name: string }
