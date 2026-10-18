const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const cache = new Map();
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), `${path.resolve(path.dirname(filename), name)}.ts`)) : require(name), module, module.exports);
  return module.exports;
}
const domain = load('src/utils/studyPlan.ts'), api = load('src/services/studyPlanStore.ts'), { studySelection } = load('src/services/studySelection.ts');
const scope = { backendId: 'study-fixture', ownerId: '11111111-1111-4111-8111-111111111111' };
const id = n => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`;
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h);
const now = at(2026, 10, 18);

function fixture(existing = new Map()) {
  let sequence = 0;
  const storage = { getItem: async key => existing.get(key) ?? null, setItem: async (key, value) => { existing.set(key, value); } };
  return { existing, store: api.createStudyPlanStore(storage, () => id(++sequence), () => now) };
}
function remote() {
  const rows = new Map(), tags = new Map(), calls = [];
  return { rows, tags, calls, transport: {
    async apply(op) {
      calls.push(op);
      const current = rows.get(op.itemId);
      if (current && current.revision !== op.expectedRevision) return { status: 'conflict', item: current };
      const item = { ...op.draft, kind: op.kind, id: op.itemId, revision: op.expectedRevision + 1, deletedAt: op.deleted ? 99 : null, ...(op.kind === 'course' ? { totalSeconds: 0 } : {}) };
      rows.set(op.itemId, item); return { status: 'saved', item };
    },
    async tag(t) { tags.set(t.clientSessionId, t.courseId); return { status: 'saved' }; },
    async list() {
      const live = [...rows.values()].filter(row => row.deletedAt === null);
      return { courses: live.filter(row => row.kind === 'course').map(row => ({ ...row, totalSeconds: 600 })), exams: live.filter(row => row.kind === 'exam'), recent: [{ courseId: id(1), completedAt: now.getTime(), seconds: 600 }],
        removed: [...rows.values()].filter(row => row.kind === 'course' && row.deletedAt !== null).map(row => ({ id: row.id, revision: row.revision, name: row.name })) };
    },
    async restore(courseId) {
      calls.push({ restore: courseId });
      const row = rows.get(courseId);
      if (!row) return { status: 'conflict', reason: 'course', item: null };
      const item = { ...row, revision: row.deletedAt === null ? row.revision : row.revision + 1, deletedAt: null };
      rows.set(courseId, item); return { status: 'saved', item: { ...item, totalSeconds: 1800 } };
    },
  } };
}

test('exam days count calendar days and the 7-day window buckets by local day', () => {
  assert.equal(domain.daysUntil('2026-10-30', now), 12);
  assert.equal(domain.daysUntil('2026-10-18', at(2026, 10, 18, 23)), 0);
  assert.equal(domain.countdownLabel(0), 'Today'); assert.equal(domain.countdownLabel(1), 'Tomorrow'); assert.equal(domain.countdownLabel(12), 'in 12 days');
  const recent = [{ courseId: id(1), completedAt: at(2026, 10, 18, 9).getTime(), seconds: 900 }, { courseId: id(1), completedAt: at(2026, 10, 12, 1).getTime(), seconds: 300 },
    { courseId: id(2), completedAt: at(2026, 10, 17).getTime(), seconds: 60 }, { courseId: id(1), completedAt: at(2026, 10, 11, 23).getTime(), seconds: 7200 }];
  assert.deepEqual(domain.studyDays(recent, id(1), now), [300, 0, 0, 0, 0, 0, 900]);
  assert.equal(domain.weekSeconds(recent, id(1), now), 1200);
  assert.equal(domain.studyTime(9600), '2h 40m'); assert.equal(domain.studyTime(1500), '25m');
});
test('dates, drafts and the month grid are validated the same way as the server', () => {
  assert.equal(domain.validDateKey('2026-02-30'), false); assert.equal(domain.validDateKey('2028-02-29'), true);
  assert.equal(domain.validCourseDraft({ name: ' Maths', focusAreaId: 1 }), false);
  assert.equal(domain.validExamDraft({ title: 'Final', courseId: null, examDate: '2026-10-30' }), true);
  const grid = domain.monthGrid(2026, 9);
  assert.deepEqual(grid[0].slice(0, 4), [null, null, null, '2026-10-01'], 'October 2026 starts on a Thursday, Monday first');
  assert.ok(grid.every(week => week.length === 7));
  assert.equal(domain.courseColor(id(1)), domain.courseColor(id(1)));
});
test('subjects and exams save on the phone first and survive a restart', async () => {
  const f = fixture();
  assert.equal(await f.store.saveCourse(scope, { name: 'Maths', focusAreaId: 1 }), true);
  const course = f.store.snapshot(scope).courses[0];
  assert.equal(await f.store.saveExam(scope, { title: 'Final', courseId: course.id, examDate: '2026-10-30' }), true);
  assert.equal(await f.store.saveExam(scope, { title: 'Bad', courseId: null, examDate: '2026-13-01' }), false);
  const again = fixture(f.existing); await again.store.load(scope);
  const state = again.store.snapshot(scope);
  assert.equal(state.courses[0].name, 'Maths'); assert.equal(state.exams[0].courseId, course.id); assert.equal(state.pendingCount, 2);
  assert.equal(await again.store.remove(scope, 'course', course.id), true);
  assert.equal(again.store.snapshot(scope).exams[0].courseId, null, 'an exam loses a removed subject');
});
test('sync sends edits in order, drains session tags and adopts the server list', async () => {
  const f = fixture(), r = remote();
  await f.store.saveCourse(scope, { name: 'Maths', focusAreaId: 1 });
  const course = f.store.snapshot(scope).courses[0];
  await f.store.saveCourse(scope, { name: 'Further maths', focusAreaId: 1 }, course.id);
  await f.store.tagSession(scope, id(70), course.id);
  await f.store.sync(scope, r.transport, () => true);
  assert.deepEqual(r.calls.map(op => op.expectedRevision), [0, 1]);
  assert.equal(r.tags.get(id(70)), course.id);
  const state = f.store.snapshot(scope);
  assert.equal(state.pendingCount, 0); assert.equal(state.courses[0].name, 'Further maths'); assert.equal(state.courses[0].totalSeconds, 600); assert.equal(state.recent.length, 1);
  assert.equal(state.error, null);
});
test('a conflict keeps the other device\'s copy and says so; a session tag waits while the server is full', async () => {
  const f = fixture(), r = remote();
  await f.store.saveCourse(scope, { name: 'Maths', focusAreaId: 1 });
  const course = f.store.snapshot(scope).courses[0];
  r.rows.set(course.id, { kind: 'course', id: course.id, revision: 3, name: 'Maths (other phone)', focusAreaId: 1, deletedAt: null, totalSeconds: 0 });
  await f.store.tagSession(scope, id(71), course.id);
  await f.store.sync(scope, { ...r.transport, tag: async () => ({ status: 'conflict', reason: 'limit' }) }, () => true);
  const state = f.store.snapshot(scope);
  assert.equal(state.courses[0].name, 'Maths (other phone)'); assert.match(state.error, /another device/); assert.equal(state.pendingCount, 1, 'the tag stays queued');
});
test('replies after leaving the account never touch the cache', async () => {
  const f = fixture(), r = remote(); let active = true;
  await f.store.saveCourse(scope, { name: 'Maths', focusAreaId: 1 });
  const before = f.existing.get(domain.studyStorageKey(scope));
  await f.store.sync(scope, { ...r.transport, apply: async op => { active = false; return r.transport.apply(op); } }, () => active);
  assert.equal(f.existing.get(domain.studyStorageKey(scope)), before);
});
test('a start counts only its own new session toward the picked subject', () => {
  studySelection.choose(id(1)); studySelection.arm(id(80), 1000);
  assert.equal(studySelection.take(id(80), 2000), null, 'the old session is not tagged');
  assert.equal(studySelection.take(id(81), 3000), id(1));
  assert.equal(studySelection.get(), id(1), 'the subject stays picked for the next session');
  assert.equal(studySelection.take(id(82), 4000), null, 'one start tags one session');
  studySelection.choose(id(2)); studySelection.arm(null, 0);
  assert.equal(studySelection.take(id(83), 30_000), null, 'too late to belong to that Start');
  studySelection.choose(null); studySelection.arm(null, 0);
  assert.equal(studySelection.take(id(84), 10), null, 'nothing armed without a subject');
});

test('exam reminders: a week before, the evening before and the morning of, never in the past', () => {
  const { examReminderPlan } = load('src/services/examReminders.ts');
  const courses = [{ kind: 'course', id: id(1), revision: 1, name: 'Maths', focusAreaId: 1, deletedAt: null, totalSeconds: 0 }];
  const exam = { kind: 'exam', id: id(2), revision: 1, title: 'Calculus final', courseId: id(1), examDate: '2026-10-30', examMinute: 8 * 60, remind: true, deletedAt: null };
  const plan = examReminderPlan([exam], courses, now.getTime());
  assert.deepEqual(plan.map(r => new Date(r.at).toString().slice(4, 21)), ['Oct 23 2026 19:00', 'Oct 29 2026 19:00', 'Oct 30 2026 07:00']);
  assert.equal(plan[0].body, 'A little Maths each day adds up.'); assert.equal(plan[2].title, 'Calculus final is today at 8:00 AM');
  assert.deepEqual(examReminderPlan([{ ...exam, remind: false }], courses, now.getTime()), []);
  assert.equal(examReminderPlan([{ ...exam, examDate: '2026-10-21', examMinute: null }], courses, now.getTime()).length, 2, 'the week-before reminder already passed');
  assert.ok(plan.every(r => !/LifeRPG/i.test(r.title + r.body)), 'no app name in reminders');
});
test('exam reminders reconcile: stale ones are cancelled, missing ones scheduled once, none without permission', async () => {
  const { createExamReminderCoordinator, examReminderPlan } = load('src/services/examReminders.ts');
  const scheduled = new Map(); let n = 0, allowed = true;
  const coordinator = createExamReminderCoordinator({ allowed: async () => allowed, list: async () => [...scheduled.entries()].map(([i, v]) => ({ id: i, ...v })),
    cancel: async i => { scheduled.delete(i); }, schedule: async (scopeKey, r) => { const i = `n${++n}`; scheduled.set(i, { scopeKey, key: r.key }); return i; } });
  const exam = { kind: 'exam', id: id(2), revision: 1, title: 'Final', courseId: null, examDate: '2026-10-30', examMinute: null, remind: true, deletedAt: null };
  await coordinator.update(scope, examReminderPlan([exam], [], now.getTime()));
  assert.equal(scheduled.size, 3);
  await coordinator.update(scope, examReminderPlan([exam], [], now.getTime()));
  assert.equal(n, 3, 'nothing is scheduled twice');
  await coordinator.update(scope, examReminderPlan([{ ...exam, title: 'Paper 1' }], [], now.getTime()));
  assert.equal(scheduled.size, 3); assert.ok([...scheduled.values()].every(v => v.key.includes('Paper 1')));
  allowed = false; await coordinator.update(scope, examReminderPlan([exam], [], now.getTime()));
  assert.equal(scheduled.size, 0);
});
test('the fetch covers this week and month, and a subject applies only in its own area or Revision', () => {
  const courses = [{ kind: 'course', id: id(1), revision: 1, name: 'Maths', focusAreaId: 1, deletedAt: null, totalSeconds: 0 }, { kind: 'course', id: id(2), revision: 1, name: 'Art', focusAreaId: 1, deletedAt: null, totalSeconds: 0 }];
  assert.equal(new Date(domain.studyListSince(now)).getDate(), 1, 'October 1 is the earliest day needed on 18 October');
  assert.equal(domain.subjectForArea(courses, id(1), 7, 9, 7)?.name, 'Maths', 'a Revision session keeps its subject');
  assert.equal(domain.subjectForArea(courses, id(1), 2, 9), null, 'a subject from another area does not apply');
  assert.equal(domain.subjectForArea([{ ...courses[0], focusAreaId: null }], id(1), null, 9)?.name, 'Maths', 'no area means Everyday focus');
  assert.equal(domain.examTimeLabel(570), '9:30 AM'); assert.equal(domain.examTimeLabel(12 * 60), '12:00 PM');
});
test('exams saved before times existed load with no time and reminders on', async () => {
  const f = fixture(); await f.store.load(scope);
  const key = domain.studyStorageKey(scope);
  f.existing.set(key, JSON.stringify({ version: 1, scope, courses: [], exams: [{ kind: 'exam', id: id(5), revision: 1, title: 'Old', courseId: null, examDate: '2026-10-30', deletedAt: null }], recent: [], pending: [], tags: [] }));
  const again = fixture(f.existing); await again.store.load(scope);
  const exam = again.store.snapshot(scope).exams[0];
  assert.equal(exam.examMinute, null); assert.equal(exam.remind, true);
});
test('a subject named on an exam card is reused by name or created once, ready to pick at once', async () => {
  const f = fixture();
  const first = await f.store.ensureCourse(scope, '  further   maths ', 2);
  assert.ok(first); assert.deepEqual(f.store.snapshot(scope).courses.map(c => [c.id, c.name, c.focusAreaId]), [[first, 'further maths', 2]]);
  assert.equal(await f.store.ensureCourse(scope, 'Further Maths', 2), first, 'the same name in another case is the same subject');
  assert.equal(f.store.snapshot(scope).courses.length, 1);
  assert.equal(await f.store.ensureCourse(scope, '   ', 2), null);
  const again = fixture(f.existing); await again.store.load(scope);
  assert.equal(again.store.snapshot(scope).courses[0].id, first, 'the new subject survives a restart with the same id');
});
test('the subject catalog offers common subjects you have not added, filtered by what you type', () => {
  const all = domain.subjectSuggestions('', [], 500);
  assert.ok(all.length >= 40); assert.equal(new Set(all.map(n => n.toLowerCase())).size, all.length, 'no duplicates');
  for (const name of domain.QUICK_SUBJECTS) assert.ok(all.includes(name), name);
  assert.equal(domain.subjectSuggestions('', ['mathematics']).includes('Mathematics'), false, 'yours are not offered again');
  assert.ok(domain.subjectSuggestions('chem', []).every(n => n.toLowerCase().includes('chem')));
  assert.equal(domain.subjectSuggestions('', [], 5).length, 5);
});
test('the shared setup mode is one value every setup reads and only announces real changes', () => {
  const { setupMode } = load('src/services/setupMode.ts'); let heard = 0;
  const stop = setupMode.subscribe(() => heard++);
  assert.equal(setupMode.get(), 'routine', 'Routine, with any activity, is where everyone starts'); assert.equal(setupMode.routine(), null);
  setupMode.choose('study'); setupMode.choose('study'); setupMode.chooseRoutine('saved:1'); setupMode.chooseRoutine('saved:1');
  assert.equal(setupMode.get(), 'study'); assert.equal(setupMode.routine(), 'saved:1'); assert.equal(heard, 2);
  stop(); setupMode.choose('routine'); assert.equal(heard, 2);
});

test('study time counts as Revision while a subject has an exam coming up, otherwise its own area', () => {
  const maths = { id: id(1), focusAreaId: 2 }, exam = date => ({ kind: 'exam', id: id(9), revision: 1, title: 'Final', courseId: id(1), examDate: date, examMinute: null, remind: true, deletedAt: null });
  const today = new Date(2026, 9, 18, 9);
  assert.equal(domain.studyAreaFor(maths, [exam('2026-10-25')], 7, 1, today), 7, 'an exam next week makes it Revision');
  assert.equal(domain.studyAreaFor(maths, [exam('2026-10-18')], 7, 1, today), 7, 'the day of the exam still counts as Revision');
  assert.equal(domain.studyAreaFor(maths, [exam('2026-10-17')], 7, 1, today), 2, 'a past exam no longer does');
  assert.equal(domain.studyAreaFor(maths, [], 7, 1, today), 2, 'no exam means Learning');
  assert.equal(domain.studyAreaFor({ id: id(1), focusAreaId: null }, [], 7, 1, today), 1, 'no area means Everyday focus');
  assert.equal(domain.studyAreaFor(maths, [exam('2026-10-25')], undefined, 1, today), 2, 'before Revision exists, it falls back');
});
test('subjects with an exam come first, soonest first; the rest keep the order they were added', () => {
  const course = n => ({ kind: 'course', id: id(n), revision: 1, name: `S${n}`, focusAreaId: 1, deletedAt: null, totalSeconds: 0 });
  const exam = (n, courseId, date) => ({ kind: 'exam', id: id(100 + n), revision: 1, title: `E${n}`, courseId, examDate: date, examMinute: null, remind: true, deletedAt: null });
  const today = new Date(2026, 9, 18, 9);
  const sorted = domain.sortCoursesByExam([course(1), course(2), course(3), course(4)], [exam(1, id(3), '2026-11-01'), exam(2, id(2), '2026-10-20'), exam(3, id(4), '2026-10-01')], today);
  assert.deepEqual(sorted.map(item => item.name), ['S2', 'S3', 'S1', 'S4'], 'a past exam does not move a subject up');
});
test('a removed subject comes back by name with the same id and its minutes, on any phone', async () => {
  const f = fixture(), r = remote();
  await f.store.load(scope);
  const first = await f.store.ensureCourse(scope, 'Maths', 1);
  await f.store.sync(scope, r.transport, () => true);
  assert.equal(await f.store.remove(scope, 'course', first), true);
  await f.store.sync(scope, r.transport, () => true);
  assert.deepEqual(f.store.snapshot(scope).courses, []);
  // A fresh phone learns about the removed subject from the server's list.
  const phone = fixture(); await phone.store.load(scope); await phone.store.sync(scope, r.transport, () => true);
  const again = await phone.store.ensureCourse(scope, 'maths', 1);
  assert.equal(again, first, 'the same subject, not a new one');
  assert.deepEqual(phone.store.snapshot(scope).courses.map(course => course.name), ['Maths'], 'shown straight away');
  await phone.store.sync(scope, r.transport, () => true);
  assert.deepEqual(r.calls.filter(call => call.restore), [{ restore: first }]);
  assert.equal(phone.store.snapshot(scope).courses[0].totalSeconds, 600, 'its minutes are back');
  assert.equal(phone.store.snapshot(scope).courses[0].deletedAt, null);
});
test('removing and re-adding before a sync just cancels the removal', async () => {
  const f = fixture(), r = remote();
  await f.store.load(scope);
  const first = await f.store.ensureCourse(scope, 'Physics', 1);
  await f.store.sync(scope, r.transport, () => true);
  await f.store.remove(scope, 'course', first);
  assert.equal(await f.store.ensureCourse(scope, 'Physics', 1), first);
  await f.store.sync(scope, r.transport, () => true);
  assert.equal(r.calls.filter(call => call.deleted).length, 0, 'the removal never reached the server');
  assert.deepEqual(f.store.snapshot(scope).courses.map(course => course.name), ['Physics']);
});
