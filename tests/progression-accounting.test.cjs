const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', code)(name => mocks[name] || (name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), name)) + '.ts', mocks) : require(name)), mod, mod.exports);
  return mod.exports;
}
const accounting = load('src/utils/progressionAccounting.ts');
test('explicit exact-credit capability preserves zero and falls back on older/malformed daily rows', () => {
  assert.equal(accounting.creditedDailySeconds({ completed_minutes: 20 }), 1200);
  assert.equal(accounting.creditedDailySeconds({ completed_minutes: 20, completed_seconds: 1450 }), 1200);
  assert.equal(accounting.creditedDailySeconds({ completed_minutes: 20, completed_seconds: 1450, credit_version: 1 }), 1450);
  assert.equal(accounting.creditedDailySeconds({ completed_minutes: 20, completed_seconds: 0, credit_version: 1 }), 0);
  for (const seconds of [null, -1, 2.5, NaN]) {
    assert.equal(accounting.hasExactDailyCredit({ completed_minutes: 20, completed_seconds: seconds, credit_version: 1 }), false);
    assert.equal(accounting.creditedDailySeconds({ completed_minutes: 20, completed_seconds: seconds, credit_version: 1 }), 1200);
  }
});
test('seconds carry across completions with independent character and area banks', () => {
  assert.deepEqual(accounting.bankSeconds(30, 0), { xp: 0, remainder: 30 });
  assert.deepEqual(accounting.bankSeconds(30, 30), { xp: 1, remainder: 0 });
  assert.deepEqual(accounting.bankSeconds(959, 0), { xp: 15, remainder: 59 });
  let bank = 0, xp = 0;
  for (let i = 0; i < 5; i++) { const next = accounting.bankSeconds(290, bank); bank = next.remainder; xp += next.xp; }
  assert.equal(xp, 24); assert.equal(bank, 10);
  assert.equal(accounting.bankSeconds(30, 45).xp, 1);
  assert.equal(accounting.bankSeconds(30, 0).xp, 0);
  for (const pair of [[-1, 0], [1, 60], [0.5, 0]]) assert.throws(() => accounting.bankSeconds(...pair));
});
test('ordinary daily and period reads retain additive fields after reopening without querying missing columns', async () => {
  const row = { user_id: 'fixture', progress_date: '2026-10-04', completed_minutes: 0, completed_seconds: 30, credit_version: 1 };
  const selections = [];
  const query = { select(fields) { selections.push(fields); return this; }, eq() { return this; }, gte() { return this; }, lte() { return this; }, order() { return this; }, range() { return Promise.resolve({ data: [row], error: null }); }, maybeSingle() { return Promise.resolve({ data: row, error: null }); } };
  const mocks = { '../../lib/supabase': { supabase: { from: () => query } }, './dailyGoalService': { getDailyGoalSettings() { throw Error('not needed'); }, missingGoalAPI: () => false } };
  const daily = load('src/services/dailyProgressService.ts', mocks);
  const period = load('src/services/progressService.ts', mocks);
  assert.equal(accounting.creditedDailySeconds(await daily.getTodayProgress()), 30);
  assert.equal(accounting.creditedDailySeconds(await daily.getTodayProgress()), 30);
  assert.equal(accounting.creditedDailySeconds((await period.getProgressGoals('2026-10-01', '2026-10-04'))[0]), 30);
  assert.ok(selections.every(fields => fields === '*'));
});
test('one positive completed second qualifies; invalid and future records do not', () => {
  const { focusDay, bestFocusStreak } = load('src/utils/focusDays.ts');
  const now = new Date('2026-10-04T12:00:00Z');
  assert.equal(focusDay({ duration_seconds: 1, completed_at: '2026-10-03T17:00:00Z' }, 'Asia/Kuala_Lumpur', now), '2026-10-04');
  for (const record of [{ duration_seconds: 0, completed_at: now.toISOString() }, { duration_seconds: 1, completed_at: 'bad' }, { duration_seconds: Infinity, completed_at: now.toISOString() }, { duration_seconds: 1, completed_at: '2026-10-05T00:00:00Z' }]) assert.equal(focusDay(record, 'UTC', now), null);
  assert.equal(bestFocusStreak(['2026-10-01', '2026-10-01', '2026-10-02', '2026-10-04']), 2);
});
