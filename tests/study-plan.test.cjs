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
      return { courses: live.filter(row => row.kind === 'course').map(row => ({ ...row, totalSeconds: 600 })), exams: live.filter(row => row.kind === 'exam'), recent: [{ courseId: id(1), completedAt: now.getTime(), seconds: 600 }] };
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
test('the picked subject goes only to the session that starts right after Start', () => {
  studySelection.choose(id(1)); studySelection.arm(id(80), 1000);
  assert.equal(studySelection.take(id(80), 2000), null, 'the old session is not tagged');
  assert.equal(studySelection.take(id(81), 3000), id(1));
  assert.equal(studySelection.get(), null);
  assert.equal(studySelection.take(id(82), 4000), null, 'used once');
  studySelection.choose(id(2)); studySelection.arm(null, 0);
  assert.equal(studySelection.take(id(83), 30_000), null, 'too late to belong to that Start');
  studySelection.choose(null); studySelection.arm(null, 0);
  assert.equal(studySelection.take(id(84), 10), null, 'nothing armed without a subject');
});
