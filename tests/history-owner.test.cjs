/* global __dirname */
// History reads name the account they are for, on every page, so a sign-in
// change part way through can't mix two accounts' rows (ChatGPT review, P1).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function load(file, mocks) {
  const filename = path.resolve(__dirname, '..', file), mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}
function fakeSupabase(pages) {
  const queries = [];
  const builder = table => {
    const q = { table, filters: [] };
    queries.push(q);
    const chain = {
      select() { return chain; }, order() { return chain; }, gte() { return chain; }, lt() { return chain; }, lte() { return chain; }, gt() { return chain; },
      eq(column, value) { q.filters.push([column, value]); return chain; },
      range(from) { q.from = from; return Promise.resolve({ data: pages(q), error: null }); },
    };
    return chain;
  };
  return { supabase: { from: builder }, queries };
}
const rows = n => Array.from({ length: n }, (_, i) => ({ id: String(i), completed_at: '2026-10-20T10:00:00Z', duration_seconds: 60 }));

test('every page of completed sessions is filtered to the expected account', async () => {
  const fake = fakeSupabase(q => q.from === 0 ? rows(500) : rows(3));
  const api = load('src/services/progressService.ts', { '../../lib/supabase': fake, './taskService': { getSubjects: async () => [] }, '../utils/progressAnalytics': { dateKey: () => '2026-10-20', shiftDay: d => d, daysBetween: () => 0 }, '../utils/focusDays': { focusDay: () => null, bestFocusStreak: () => 0, focusStreakWithRest: () => ({ current: 0, longest: 0, restDays: 0, rested: [] }), REST_MAX: 2 } });
  const result = await api.getCompletedSessions('1970-01-01T00:00:00Z', '2026-10-21T00:00:00Z', 'owner-a');
  assert.equal(result.length, 503);
  assert.equal(fake.queries.length, 2, 'two pages');
  for (const q of fake.queries) assert.deepEqual(q.filters.filter(([c]) => c === 'user_id'), [['user_id', 'owner-a']]);
});

test('goals and both streak reads name the account too', async () => {
  const fake = fakeSupabase(() => []);
  const api = load('src/services/progressService.ts', { '../../lib/supabase': fake, './taskService': { getSubjects: async owner => { fake.subjectsOwner = owner; return []; } }, '../utils/progressAnalytics': { dateKey: () => '2026-10-20', shiftDay: d => d, daysBetween: () => 0 }, '../utils/focusDays': { focusDay: () => null, bestFocusStreak: () => 0, focusStreakWithRest: () => ({ current: 0, longest: 0, restDays: 0, rested: [] }), REST_MAX: 2 } });
  await api.getProgressGoals('2026-10-14', '2026-10-20', 'owner-a');
  await api.getFocusStreak('Asia/Kuala_Lumpur', new Date('2026-10-20T12:00:00Z'), 'owner-a');
  await api.getLongestFocusStreak('Asia/Kuala_Lumpur', new Date('2026-10-20T12:00:00Z'), 'owner-a');
  await api.getProgressSubjects('owner-a');
  assert.equal(fake.queries.length, 3);
  for (const q of fake.queries) assert.ok(q.filters.some(([c, v]) => c === 'user_id' && v === 'owner-a'), `${q.table} is filtered`);
  assert.equal(fake.subjectsOwner, 'owner-a');
});

test('Profile and Progress pass the account into every history read', () => {
  const character = fs.readFileSync(path.resolve(__dirname, '../src/hooks/useCharacterData.ts'), 'utf8');
  assert.match(character, /getProgressSubjects\(userId\)/);
  assert.match(character, /getCompletedSessions\("1970-01-01T00:00:00Z", new Date\(\)\.toISOString\(\), userId\)/);
  const progress = fs.readFileSync(path.resolve(__dirname, '../src/hooks/useProgressData.ts'), 'utf8');
  for (const call of ['getCompletedSessions(bounds.since, bounds.until, who)', 'getProgressGoals(period.start, period.end, who)', 'getProgressSubjects(who)', 'getFocusStreak(timeZone, now, who)', 'getLongestFocusStreak(timeZone, now, who)'])
    assert.ok(progress.includes(call), call);
});

test('the ideas grid shows every unsaved idea, odd count or not', () => {
  const card = fs.readFileSync(path.resolve(__dirname, '../src/components/SavedRoutinesCard.tsx'), 'utf8');
  assert.match(card, /const suggestions = filtered;/);
});
