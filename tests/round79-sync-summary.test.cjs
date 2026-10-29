/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(file) {
  const filename = path.resolve(root, file); if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name.startsWith('.'), `aggregation has no platform, auth or network runtime import: ${name}`);
    return load(path.relative(root, path.resolve(path.dirname(filename), name) + '.ts'));
  }, module, module.exports);
  return module.exports;
}
const { summarizeOfflineSync } = load('src/utils/offlineSyncSummary.ts');
const id = number => `11111111-1111-4111-8111-${String(number).padStart(12, '0')}`;
const TODAY = '2026-10-29';
const subjects = [{ id: 1, title: 'Learning', color_code: '#64D2FF' }, { id: 2, title: 'Wellbeing', color_code: '#FF9F0A' },
  { id: 3, title: 'Grooming & Vitality', color_code: '#30D158' }, { id: 4, title: 'Practice', color_code: '#BF5AF2' }];
function entry(number, seconds = 60, day = TODAY, total = seconds * number, extra = {}) {
  return { clientSessionId: id(number), setup: { targetSeconds: seconds, subjectId: 1, taskId: null, notes: null, title: 'Study', activityType: 'learning' },
    receipt: { sessionId: id(1000 + number), durationSeconds: seconds,
      result: { xp_earned: Math.floor(seconds / 60), area_xp_earned: Math.floor(seconds / 60), credited_date: day, daily_completed_seconds: total, ...extra } }, completedAtMs: number * 60000 };
}
const batch = entries => ({ id: 'offline-sync:fixture', entries });
test('three confirmed one-minute receipts produce one accurate sync summary without adding cumulative counters', () => {
  const b = batch([entry(1, 60, TODAY, 300), entry(2, 60, TODAY, 360), entry(3, 60, TODAY, 420)]);
  const summary = summarizeOfflineSync(b, subjects);
  assert.equal(summary.seconds, 180); assert.equal('xpEarned' in summary, false, 'the card shows no XP');
  assert.deepEqual(summary.syncSummary, { sessionCount: 3, durations: [{ seconds: 60, count: 3 }], areas: [{ title: 'Learning', color: '#64D2FF' }] });
  assert.equal(b.entries[2].receipt.result.daily_completed_seconds, 420);
});

test('summaries dedupe both stable client identities and confirmed server receipts', () => {
  const first = entry(1), other = entry(2), sharedClient = entry(3);
  other.receipt.sessionId = first.receipt.sessionId; sharedClient.clientSessionId = first.clientSessionId;
  const summary = summarizeOfflineSync(batch([first, first, other, sharedClient]), subjects);
  assert.equal(summary.syncSummary.sessionCount, 1); assert.equal(summary.seconds, 60);
});

test('mixed durations and legacy focus-area names give one canonical category row each', () => {
  const a = entry(1, 120, TODAY, 120, { area_xp_earned: 3 }), b = entry(2, 60, TODAY, 180, { area_xp_earned: 2 });
  a.setup.subjectId = 3; b.setup.subjectId = 2;
  const summary = summarizeOfflineSync(batch([a, b, entry(3, 120, TODAY, 300)]), subjects);
  assert.deepEqual(summary.syncSummary.durations, [{ seconds: 60, count: 1 }, { seconds: 120, count: 2 }]);
  assert.deepEqual(summary.syncSummary.areas, [{ title: 'Learning', color: '#64D2FF' }, { title: 'Wellbeing', color: '#FF9F0A' }]);
});

test('a session without a known category adds its time but no category row', () => {
  const e = entry(1, 300, TODAY, 9000, { xp_earned: null, area_xp_earned: null });
  e.setup.subjectId = 99;
  const summary = summarizeOfflineSync(batch([e]), subjects);
  assert.equal(summary.seconds, 300); assert.deepEqual(summary.syncSummary.areas, []);
});















