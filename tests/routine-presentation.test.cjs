const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function load(name) { const file = path.resolve(__dirname, '..', name); const module = { exports: {} }; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(request => load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), request + '.ts'))), module, module.exports); return module.exports; }
const { routinePresentation } = load('src/utils/routinePresentation.ts');
const task = (id, changes = {}) => ({ id, title: 'Read', target_minutes: 2, subject_id: 2, is_completed_today: false, is_completed: false, is_recurring: false, is_due_today: true, ...changes });
const routine = (id, changes = {}) => ({ id, name: 'Read', durationSeconds: 75, focusAreaId: 2, deletedAt: null, ...changes });
test('unified routine presentation retains same-named records and their storage identities without mutation', () => {
  const tasks = [task(1)], saved = [routine('1')], before = JSON.stringify([tasks, saved]);
  const result = routinePresentation(saved, tasks);
  assert.equal(result.entries.length, 2);
  assert.notEqual(result.entries[0].key, result.entries[1].key);
  assert.equal(result.entries[0].task, tasks[0]);
  assert.equal(result.entries[1].routine, saved[0]);
  assert.equal(result.entries[0].seconds, 120);
  assert.equal(result.entries[1].seconds, 75);
  assert.equal(JSON.stringify([tasks, saved]), before);
});
test('completed one-offs never reappear as actionable routines; completed repeats wait until due again', () => {
  const finishedOnce = task(1, { is_completed: true, is_completed_today: true });
  const finishedRepeat = task(2, { is_recurring: true, is_completed_today: true });
  const previousOneOff = task(3, { is_completed: true });
  const returningRepeat = task(4, { is_recurring: true, is_completed: true });
  const result = routinePresentation([routine('old', { deletedAt: '2026-10-14' })], [finishedOnce, finishedRepeat, previousOneOff, returningRepeat]);
  assert.deepEqual(result.entries.map(entry => entry.task.id), [4]);
  assert.deepEqual(result.done.map(item => item.id), [1, 2]);
});
