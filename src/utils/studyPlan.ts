import type { JournalScope } from "../types/sessionJournal";
import type { StudyCourse, StudyCourseDraft, StudyEnvelope, StudyExam, StudyExamDraft, StudyOperation, StudyRecent, StudyRemoved, StudyTag } from "../types/studyPlan";
import { isJournalUuid, validateJournalScope } from "./sessionJournalSchema";

export const COURSE_LIMIT = 24;
export const EXAM_LIMIT = 40;
export const STUDY_QUEUE_LIMIT = 64;
export const STUDY_TAG_LIMIT = 32;
/** Exams may sit up to two years ahead, matching the server. */
export const EXAM_DAYS_AHEAD = 730;
const DAY = 86_400_000;

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const cleanText = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max
  && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));

export function validDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number), date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
export function validCourseDraft(value: unknown): value is StudyCourseDraft {
  return object(value) && cleanText(value.name, 60) && (value.focusAreaId === null || integer(value.focusAreaId, 1, Number.MAX_SAFE_INTEGER));
}
export function validExamDraft(value: unknown): value is StudyExamDraft {
  // Exams saved before times and reminders existed have neither field.
  return object(value) && cleanText(value.title, 80) && (value.courseId === null || isJournalUuid(value.courseId)) && validDateKey(value.examDate)
    && (value.examMinute === undefined || value.examMinute === null || integer(value.examMinute, 0, 1439)) && (value.remind === undefined || typeof value.remind === "boolean");
}
const validMeta = (value: Record<string, unknown>) => isJournalUuid(value.id) && integer(value.revision, 0, Number.MAX_SAFE_INTEGER)
  && (value.deletedAt === null || integer(value.deletedAt, 0, Number.MAX_SAFE_INTEGER));
export function validCourse(value: unknown): value is StudyCourse {
  return validCourseDraft(value) && object(value) && value.kind === "course" && validMeta(value) && integer(value.totalSeconds, 0, Number.MAX_SAFE_INTEGER);
}
export function validExam(value: unknown): value is StudyExam {
  return validExamDraft(value) && object(value) && value.kind === "exam" && validMeta(value);
}
export function validRecent(value: unknown): value is StudyRecent {
  return object(value) && isJournalUuid(value.courseId) && integer(value.completedAt, 0, Number.MAX_SAFE_INTEGER) && integer(value.seconds, 1, 86_400);
}
export function validStudyOperation(value: unknown): value is StudyOperation {
  return object(value) && isJournalUuid(value.operationId) && isJournalUuid(value.itemId) && integer(value.expectedRevision, 0, Number.MAX_SAFE_INTEGER)
    && typeof value.deleted === "boolean" && (value.kind === "course" ? validCourseDraft(value.draft) : value.kind === "exam" && validExamDraft(value.draft));
}
export const REMOVED_LIMIT = 48;
export function validRemoved(value: unknown): value is StudyRemoved {
  return object(value) && exact(value, ["id", "revision", "name"]) && isJournalUuid(value.id) && integer(value.revision, 1, Number.MAX_SAFE_INTEGER) && cleanText(value.name, 60);
}
export function validStudyTag(value: unknown): value is StudyTag {
  return object(value) && isJournalUuid(value.clientSessionId) && (value.courseId === null || isJournalUuid(value.courseId));
}
/** Server items carry an extra field or two; the phone keeps only what it knows. */
export function normaliseCourse(value: unknown): StudyCourse | null {
  if (!object(value)) return null;
  const course = { kind: value.kind, id: value.id, revision: value.revision, name: value.name, focusAreaId: value.focusAreaId,
    deletedAt: value.deletedAt, totalSeconds: value.totalSeconds ?? 0 };
  return validCourse(course) ? course : null;
}
export function normaliseExam(value: unknown): StudyExam | null {
  if (!object(value)) return null;
  const exam = { kind: value.kind, id: value.id, revision: value.revision, title: value.title, courseId: value.courseId, examDate: value.examDate,
    examMinute: value.examMinute ?? null, remind: value.remind ?? true, deletedAt: value.deletedAt };
  return validExam(exam) ? exam : null;
}

export function studyStorageKey(scope: JournalScope): string {
  validateJournalScope(scope);
  return `liferpg:study:v1:${scope.backendId}:${scope.ownerId}`;
}
export function emptyStudyEnvelope(scope: JournalScope): StudyEnvelope {
  validateJournalScope(scope);
  return { version: 1, scope: { ...scope }, courses: [], exams: [], recent: [], pending: [], tags: [] };
}
function unique<T>(items: T[], key: (item: T) => string) { return new Set(items.map(key)).size === items.length; }
export function parseStudyEnvelope(raw: string | null, scope: JournalScope): StudyEnvelope {
  if (raw === null) return emptyStudyEnvelope(scope);
  const broken = "Your study plan on this phone needs another look. Try again.";
  if (raw.length > 256 * 1024) throw new Error(broken);
  const value: unknown = JSON.parse(raw);
  if (!object(value) || value.version !== 1 || !object(value.scope) || value.scope.ownerId !== scope.ownerId || value.scope.backendId !== scope.backendId
    || !Array.isArray(value.courses) || value.courses.length > COURSE_LIMIT + STUDY_QUEUE_LIMIT || !value.courses.every(validCourse) || !unique(value.courses, item => item.id)
    || !Array.isArray(value.exams) || value.exams.length > 2 * EXAM_LIMIT + STUDY_QUEUE_LIMIT || !value.exams.every(validExam) || !unique(value.exams, item => item.id)
    || !Array.isArray(value.recent) || value.recent.length > 500 || !value.recent.every(validRecent)
    || !Array.isArray(value.pending) || value.pending.length > STUDY_QUEUE_LIMIT || !value.pending.every(validStudyOperation) || !unique(value.pending, item => item.operationId)
    || !Array.isArray(value.tags) || value.tags.length > STUDY_TAG_LIMIT || !value.tags.every(validStudyTag)
    || value.removed !== undefined && (!Array.isArray(value.removed) || value.removed.length > REMOVED_LIMIT || !value.removed.every(validRemoved))
    || value.restores !== undefined && (!Array.isArray(value.restores) || value.restores.length > COURSE_LIMIT || !value.restores.every(isJournalUuid))
    || !exact(value, ["version", "scope", "courses", "exams", "recent", "pending", "tags", "removed", "restores"])) throw new Error(broken);
  const envelope = value as unknown as StudyEnvelope;
  return { ...envelope, exams: envelope.exams.map(withExamDefaults),
    pending: envelope.pending.map(op => op.kind === "exam" ? { ...op, draft: withExamDefaults(op.draft) } : op) };
}
export function withExamDefaults<T extends StudyExamDraft>(exam: T): T {
  return { ...exam, examMinute: exam.examMinute ?? null, remind: exam.remind ?? true };
}
export function examTimeLabel(minute: number): string {
  const h = Math.floor(minute / 60), m = minute % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Server state with this phone's queued edits laid on top. */
export function visibleStudy(envelope: StudyEnvelope): { courses: StudyCourse[]; exams: StudyExam[] } {
  const courses = new Map(envelope.courses.map(item => [item.id, item])), exams = new Map(envelope.exams.map(item => [item.id, item]));
  for (const op of envelope.pending) {
    const meta = { id: op.itemId, revision: op.expectedRevision + 1, deletedAt: op.deleted ? 0 : null };
    if (op.kind === "course") courses.set(op.itemId, { ...op.draft, ...meta, kind: "course", totalSeconds: courses.get(op.itemId)?.totalSeconds ?? 0 });
    else exams.set(op.itemId, { ...op.draft, ...meta, kind: "exam" });
  }
  const liveCourses = [...courses.values()].filter(item => item.deletedAt === null), ids = new Set(liveCourses.map(item => item.id));
  return {
    courses: liveCourses,
    exams: [...exams.values()].filter(item => item.deletedAt === null)
      .map(item => item.courseId && !ids.has(item.courseId) ? { ...item, courseId: null } : item)
      .sort((a, b) => a.examDate.localeCompare(b.examDate) || a.title.localeCompare(b.title)),
  };
}

export function dateKey(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}
export function localDate(key: string): Date { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
/** Whole calendar days from today to the exam (0 = today, negative = past). */
export function daysUntil(examDate: string, now = new Date()): number {
  const today = localDate(dateKey(now));
  return Math.round((localDate(examDate).getTime() - today.getTime()) / DAY);
}
export function countdownLabel(days: number): string {
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 0 ? "Done" : `in ${days} days`;
}
export function examDateLabel(examDate: string, withWeekday = true): string {
  const date = localDate(examDate);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  const day = `${date.getDate()} ${date.toLocaleDateString("en-GB", { month: "short" })}`;
  return withWeekday ? `${weekday} ${day}` : day;
}
/** Exams from today on, soonest first; one just added on this phone takes its place by date. */
export function upcomingExams(exams: StudyExam[], now = new Date()): StudyExam[] {
  return exams.filter(item => daysUntil(item.examDate, now) >= 0).sort((a, b) => a.examDate.localeCompare(b.examDate) || a.title.localeCompare(b.title));
}
/** Start of the local 7-day window that ends today. */
export function studyWindowStart(now = new Date()): number {
  const start = localDate(dateKey(now)); start.setDate(start.getDate() - 6); return start.getTime();
}
/** Seconds per day for the last 7 local days (oldest first), for one subject or all. */
export function studyDays(recent: StudyRecent[], courseId: string | null, now = new Date()): number[] {
  const start = studyWindowStart(now), days = [0, 0, 0, 0, 0, 0, 0];
  for (const item of recent) {
    if (courseId && item.courseId !== courseId || item.completedAt < start) continue;
    const index = daysUntil(dateKey(new Date(item.completedAt)), new Date(start));
    if (index >= 0 && index < 7) days[index] += item.seconds;
  }
  return days;
}
export function weekSeconds(recent: StudyRecent[], courseId: string, now = new Date()): number {
  return studyDays(recent, courseId, now).reduce((sum, value) => sum + value, 0);
}
export function studyTime(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60), h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

const COURSE_COLORS = ["#2E6A9E", "#3F7A5A", "#B4651E", "#7A4C9C", "#A84569", "#5A4FA0", "#8A6A12", "#2F7D74"];
/** A steady colour per subject, so the same subject looks the same everywhere. */
export function courseColor(id: string | null | undefined): string {
  if (!id) return "#7A6F78";
  let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length];
}
/** Weeks of a month, Monday first; null pads the edges. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1), lead = (first.getDay() + 6) % 7, days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => dateKey(new Date(year, month, i + 1)))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}
export function addDays(key: string, days: number): string { const date = localDate(key); date.setDate(date.getDate() + days); return dateKey(date); }
/** Common school, college and university subjects; anything else can be typed. */
export const SUBJECT_CATALOG = [
  "Mathematics", "Additional Mathematics", "Physics", "Chemistry", "Biology", "Science", "English", "Bahasa Melayu", "Chinese", "Tamil",
  "History", "Geography", "Economics", "Accounting", "Business Studies", "Commerce", "Computer Science", "Programming", "Information Technology",
  "Statistics", "Calculus", "Further Mathematics", "Psychology", "Sociology", "Law", "Literature", "Art & Design", "Music", "Moral Education",
  "Marketing", "Finance", "Management", "Engineering Mathematics", "Data Structures", "Databases", "Networking", "Web Development",
  "Human Biology", "Anatomy", "Pharmacology", "Architecture", "Media Studies", "Communication",
] as const;
/** The first few, offered as one-tap chips. */
export const QUICK_SUBJECTS = ["Mathematics", "English", "Physics", "Chemistry", "Biology", "Bahasa Melayu", "History", "Computer Science"] as const;
/** Catalog names (and a typed name) matching a search, leaving out subjects you already have. */
export function subjectSuggestions(query: string, mine: string[], limit = 18): string[] {
  const q = query.trim().toLowerCase(), have = new Set(mine.map(name => name.toLowerCase()));
  return SUBJECT_CATALOG.filter(name => !have.has(name.toLowerCase()) && (!q || name.toLowerCase().includes(q))).slice(0, limit);
}
/** The focus area a subject's time counts toward; no area means Everyday focus. */
export function courseArea(course: Pick<StudyCourse, "focusAreaId">, generalId: number | null | undefined): number | null {
  return course.focusAreaId ?? generalId ?? null;
}
/** Whether a subject has an exam today or later. */
export function hasUpcomingExam(courseId: string, exams: StudyExam[], now = new Date()): boolean {
  return upcomingExams(exams, now).some(exam => exam.courseId === courseId);
}
/**
 * Where a study session's time counts, decided as it starts: Revision while
 * the subject has an exam coming up, otherwise the subject's own area
 * (Learning by default). Without a Revision area it falls back to that area.
 */
export function studyAreaFor(course: Pick<StudyCourse, "id" | "focusAreaId">, exams: StudyExam[], revisionId: number | null | undefined,
  generalId: number | null | undefined, now = new Date()): number | null {
  return revisionId != null && hasUpcomingExam(course.id, exams, now) ? revisionId : courseArea(course, generalId);
}
/** A picked subject applies only while the session is set to that subject's area, or to Revision. */
export function subjectForArea(courses: StudyCourse[], chosenId: string | null, areaId: number | null, generalId: number | null | undefined,
  revisionId?: number | null): StudyCourse | null {
  const course = chosenId ? courses.find(item => item.id === chosenId) : undefined;
  const area = areaId ?? generalId ?? null;
  return course && (courseArea(course, generalId) === area || revisionId != null && area === revisionId) ? course : null;
}
/** Subjects with an exam first (soonest first), then the rest in the order they were added. */
export function sortCoursesByExam(courses: StudyCourse[], exams: StudyExam[], now = new Date()): StudyCourse[] {
  const next = new Map<string, string>();
  for (const exam of upcomingExams(exams, now)) if (exam.courseId && (!next.has(exam.courseId) || exam.examDate < next.get(exam.courseId)!)) next.set(exam.courseId, exam.examDate);
  return courses.map((course, index) => ({ course, index, date: next.get(course.id) }))
    .sort((a, b) => a.date && b.date ? a.date.localeCompare(b.date) || a.index - b.index : a.date ? -1 : b.date ? 1 : a.index - b.index)
    .map(item => item.course);
}
/** How far back tagged sessions are fetched: this week, this month and the last 7 days. */
export function studyListSince(now = new Date()): number {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate()); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return Math.min(studyWindowStart(now), monday.getTime(), new Date(now.getFullYear(), now.getMonth(), 1).getTime());
}
