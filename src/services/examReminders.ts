import type { JournalScope } from "../types/sessionJournal";
import type { StudyCourse, StudyExam } from "../types/studyPlan";
import { examTimeLabel } from "../utils/studyPlan";

export interface ExamReminder { key: string; examId: string; at: number; title: string; body: string }
export interface ScheduledExamReminder { id: string; scopeKey: string; key: string }
export interface ExamReminderAdapter {
  allowed: () => Promise<boolean>;
  list: () => Promise<ScheduledExamReminder[]>;
  cancel: (id: string) => Promise<void>;
  schedule: (scopeKey: string, reminder: ExamReminder) => Promise<string>;
}
export const examReminderScope = (scope: JournalScope) => `${scope.backendId}:${scope.ownerId}`;

const at = (day: string, minute: number, daysBefore = 0) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d - daysBefore, Math.floor(minute / 60), minute % 60).getTime();
};
/** A week before and the evening before at 7 PM, and the morning of (7:30, or an hour before an early exam). */
export function examReminderPlan(exams: StudyExam[], courses: StudyCourse[], now = Date.now()): ExamReminder[] {
  const plan: ExamReminder[] = [];
  for (const exam of exams) {
    if (exam.deletedAt !== null || exam.remind === false) continue;
    const subject = courses.find(course => course.id === exam.courseId)?.name;
    const time = exam.examMinute != null ? ` at ${examTimeLabel(exam.examMinute)}` : "";
    const morning = exam.examMinute != null ? Math.max(6 * 60, Math.min(7 * 60 + 30, exam.examMinute - 60)) : 7 * 60 + 30;
    const slots = [
      { slot: "week", when: at(exam.examDate, 19 * 60, 7), title: `${exam.title} in 7 days`, body: subject ? `A little ${subject} each day adds up.` : "A little each day adds up." },
      { slot: "eve", when: at(exam.examDate, 19 * 60, 1), title: `${exam.title} is tomorrow${time}`, body: "Plan a short review, then get some rest." },
      { slot: "day", when: at(exam.examDate, morning), title: `${exam.title} is today${time}`, body: "You've prepared for this. Good luck!" },
    ];
    for (const item of slots) if (item.when > now + 60_000)
      plan.push({ key: JSON.stringify([exam.id, item.slot, item.when, item.title, item.body]), examId: exam.id, at: item.when, title: item.title, body: item.body });
  }
  return plan.sort((a, b) => a.at - b.at).slice(0, 60);
}

/** One serialized reconciler for local exam reminders; it never asks for permission itself. */
export function createExamReminderCoordinator(adapter: ExamReminderAdapter) {
  let desired: { scope: JournalScope | null; plan: ExamReminder[] } = { scope: null, plan: [] };
  let generation = 0, flight: Promise<void> | null = null;
  return {
    update(scope: JournalScope | null, plan: ExamReminder[]) {
      desired = { scope, plan }; generation++;
      if (flight) return flight;
      flight = (async () => {
        let processed = -1;
        while (processed !== generation) {
          processed = generation;
          const request = desired, scopeKey = request.scope ? examReminderScope(request.scope) : "";
          const wanted = request.scope && await adapter.allowed() ? request.plan : [];
          const existing = await adapter.list();
          if (processed !== generation) continue;
          const keep = new Set<string>();
          for (const item of existing) {
            if (item.scopeKey === scopeKey && wanted.some(reminder => reminder.key === item.key) && !keep.has(item.key)) keep.add(item.key);
            else await adapter.cancel(item.id);
          }
          for (const reminder of wanted) {
            if (processed !== generation) break;
            if (!keep.has(reminder.key)) await adapter.schedule(scopeKey, reminder);
          }
        }
      })().finally(() => { flight = null; });
      return flight;
    },
  };
}
