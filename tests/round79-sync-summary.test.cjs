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
const { summarizeOfflineSync, offlineSyncReturn } = load('src/utils/offlineSyncSummary.ts');
const id = number => `11111111-1111-4111-8111-${String(number).padStart(12, '0')}`;
const TODAY = '2026-10-29', YESTERDAY = '2026-10-28';
const subjects = [{ id: 1, title: 'Learning', color_code: '#64D2FF' }, { id: 2, title: 'Wellbeing', color_code: '#FF9F0A' },
  { id: 3, title: 'Grooming & Vitality', color_code: '#30D158' }, { id: 4, title: 'Practice', color_code: '#BF5AF2' }];
function entry(number, seconds = 60, day = TODAY, total = seconds * number, extra = {}) {
  return { clientSessionId: id(number), setup: { targetSeconds: seconds, subjectId: 1, taskId: null, notes: null, title: 'Study', activityType: 'learning' },
    receipt: { sessionId: id(1000 + number), durationSeconds: seconds,
      result: { xp_earned: Math.floor(seconds / 60), area_xp_earned: Math.floor(seconds / 60), credited_date: day, daily_completed_seconds: total, ...extra } }, completedAtMs: number * 60000 };
}
const batch = entries => ({ id: 'offline-sync:fixture', entries });
function state(seconds, day = TODAY, extra = {}) {
  return { stardust: 100, nextFindSeconds: 1800 - seconds % 1800, owned: [], earned: [], avatar: {},
    today: { date: day, seconds, finds: Math.min(4, Math.floor(seconds / 1800)) }, trail: { findSeconds: 1800, stops: 4, complete: false }, pack: { date: day }, ...extra };
}
function claimed(entry, extra = {}) {
  return { sessionId: entry.receipt.sessionId, seconds: entry.receipt.durationSeconds,
    creditedDate: entry.receipt.result.credited_date, daySecondsBefore: entry.receipt.result.daily_completed_seconds - entry.receipt.durationSeconds,
    daySecondsAfter: entry.receipt.result.daily_completed_seconds, finds: [], minutesStardust: 0, trailStardust: 0, ...extra };
}
function returned(sessions, seconds, day = TODAY, fromSeconds = 0) {
  return { id: 'return:' + sessions.map(session => session.sessionId).join(','), kind: 'expedition', sessions,
    seconds: sessions.reduce((sum, session) => sum + session.seconds, 0), finds: sessions.flatMap(session => session.finds), stardust: 9999,
    trail: { findSeconds: 1800, stops: 4, complete: false, date: day, seconds, fromSeconds, finds: Math.min(4, Math.floor(seconds / 1800)), nextFindSeconds: 1800 - seconds % 1800 } };
}
const gift = (fresh, amount = 0) => ({ item: 'canvas_tote', rarity: 'common', new: fresh, stardust: amount });
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

test('three confirmed one-minute receipts produce one accurate sync summary without adding cumulative counters', () => {
  const b = batch([entry(1, 60, TODAY, 300), entry(2, 60, TODAY, 360), entry(3, 60, TODAY, 420)]);
  const summary = summarizeOfflineSync(b, subjects);
  assert.equal(summary.seconds, 180); assert.equal(summary.xpEarned, 3);
  assert.deepEqual(summary.syncSummary, { sessionCount: 3, durations: [{ seconds: 60, count: 3 }], areas: [{ title: 'Learning', color: '#64D2FF', xp: 3 }] });
  assert.equal(b.entries[2].receipt.result.daily_completed_seconds, 420);
});

test('summaries dedupe both stable client identities and confirmed server receipts', () => {
  const first = entry(1), other = entry(2), sharedClient = entry(3);
  other.receipt.sessionId = first.receipt.sessionId; sharedClient.clientSessionId = first.clientSessionId;
  const summary = summarizeOfflineSync(batch([first, first, other, sharedClient]), subjects);
  assert.equal(summary.syncSummary.sessionCount, 1); assert.equal(summary.seconds, 60); assert.equal(summary.xpEarned, 1);
});

test('mixed durations and legacy focus-area names retain authoritative area XP with one canonical row', () => {
  const a = entry(1, 120, TODAY, 120, { area_xp_earned: 3 }), b = entry(2, 60, TODAY, 180, { area_xp_earned: 2 });
  a.setup.subjectId = 3; b.setup.subjectId = 2;
  const summary = summarizeOfflineSync(batch([a, b, entry(3, 120, TODAY, 300)]), subjects);
  assert.deepEqual(summary.syncSummary.durations, [{ seconds: 60, count: 1 }, { seconds: 120, count: 2 }]);
  assert.deepEqual(summary.syncSummary.areas, [{ title: 'Learning', color: '#64D2FF', xp: 2 }, { title: 'Wellbeing', color: '#FF9F0A', xp: 5 }]);
  assert.equal(summary.xpEarned, 5, 'area XP is not copied into character XP');
});

test('missing XP never becomes an estimate from minutes, profile totals or daily counters', () => {
  const e = entry(1, 300, TODAY, 9000, { xp_earned: null, area_xp_earned: null, current_xp: 5000, level: 12 });
  const summary = summarizeOfflineSync(batch([e]), subjects);
  assert.equal(summary.seconds, 300); assert.equal(summary.xpEarned, 0); assert.deepEqual(summary.syncSummary.areas, []);
});

test('a single return combines the three minutes and walks from four to seven minutes once', () => {
  const entries = [entry(1, 60, TODAY, 300), entry(2, 60, TODAY, 360), entry(3, 60, TODAY, 420)];
  const first = returned([claimed(entries[0])], 300, TODAY, 240), second = returned(entries.slice(1).map(e => claimed(e)), 420, TODAY, 300);
  const output = offlineSyncReturn(batch(entries), [first, second], state(420));
  assert.equal(output.reveal.id, 'sync-return:offline-sync:fixture'); assert.equal(output.reveal.seconds, 180);
  assert.deepEqual(output.consumedIds, [first.id, second.id]);
  assert.deepEqual([output.reveal.trail.fromSeconds, output.reveal.trail.seconds, output.reveal.trail.nextFindSeconds], [240, 420, 1380]);
  assert.equal(output.reveal.finds.length, 0); assert.equal(output.reveal.stardust, 0, 'structured claim evidence wins over aggregate Stardust');
});

test('overlapping structured claims dedupe sessions while preserving two legitimate finds of the same item', () => {
  const entries = [entry(1), entry(2), entry(3)], one = claimed(entries[0], { finds: [gift(true)], minutesStardust: 2 });
  const two = claimed(entries[1], { finds: [gift(false, 5)], minutesStardust: 3 }), three = claimed(entries[2], { minutesStardust: 4 });
  const a = returned([one, two], 120), b = returned([two, three], 180);
  const output = offlineSyncReturn(batch(entries), [a, b, a], state(180));
  assert.equal(output.reveal.sessions.length, 3); assert.deepEqual(output.reveal.finds, [gift(true), gift(false, 5)]);
  assert.equal(output.reveal.stardust, 14); assert.deepEqual(output.consumedIds, [a.id, b.id]);
});

test('more than fifty sessions merge across overlapping claim chunks without losing earned currency', () => {
  const entries = Array.from({ length: 66 }, (_, index) => entry(index + 1));
  const sessions = entries.map((e, index) => claimed(e, { minutesStardust: (index + 1) % 5 === 0 ? 1 : 0 }));
  const a = returned(sessions.slice(0, 50), 3000), b = returned(sessions.slice(40), 3960, TODAY, 2400);
  const output = offlineSyncReturn(batch(entries), [a, b], state(3960));
  assert.equal(output.reveal.sessions.length, 66); assert.equal(output.reveal.seconds, 3960); assert.equal(output.reveal.stardust, 13);
  assert.equal(output.reveal.trail.fromSeconds, 0); assert.equal(output.reveal.trail.seconds, 3960);
});

test('only actual return reveals intersecting receipt IDs are consumed; shared owner rewards are preserved', () => {
  const e = entry(1), other = entry(2), shared = returned([claimed(e), claimed(other, { finds: [gift(true)], minutesStardust: 2 })], 120);
  const unrelated = returned([claimed(entry(9))], 540), developer = { ...shared, id: 'find:developer' };
  const pack = { id: 'pack:today', kind: 'pack', tier: 1, daysInARow: 1, items: [], stardust: 10 };
  const result = offlineSyncReturn(batch([e]), [pack, unrelated, developer, shared], state(120));
  assert.deepEqual(result.consumedIds, [shared.id]); assert.equal(result.reveal.seconds, 60);
  assert.equal(result.reveal.sessions.length, 2); assert.equal(result.reveal.stardust, 2); assert.deepEqual(result.reveal.finds, [gift(true)]);
});

test('opaque older return replies match UUID lists and repeated membership sets count once', () => {
  const e = entry(1), a = { id: `return:${e.receipt.sessionId}`, kind: 'expedition', seconds: 60, finds: [gift(false, 5)], stardust: 8 };
  const output = offlineSyncReturn(batch([e]), [a, a], state(60));
  assert.deepEqual(output.consumedIds, [a.id]); assert.equal(output.reveal.stardust, 8); assert.deepEqual(output.reveal.finds, [gift(false, 5)]);
});

test('a structured claim supersedes the same opaque return without double counting it', () => {
  const e = entry(1), a = returned([claimed(e, { minutesStardust: 2 })], 60);
  const opaque = { id: a.id, kind: 'expedition', seconds: 60, finds: [], stardust: 2 };
  const output = offlineSyncReturn(batch([e]), [opaque, a], state(60));
  assert.equal(output.reveal.stardust, 2); assert.equal(output.reveal.sessions.length, 1);
});

test('an older opaque return with an empty optional sessions list still preserves its real gifts', () => {
  const e = entry(1), opaque = { id: `return:${e.receipt.sessionId}`, kind: 'expedition', sessions: [], seconds: 60, finds: [gift(true)], stardust: 2 };
  const output = offlineSyncReturn(batch([e]), [opaque], state(60));
  assert.deepEqual(output.consumedIds, [opaque.id]); assert.deepEqual(output.reveal.finds, [gift(true)]); assert.equal(output.reveal.stardust, 2);
});

test('older-day rewards remain owned while only the current day advances its map or shows its trail bonus', () => {
  const old = entry(1, 3600, YESTERDAY, 7200), today = entry(2, 60, TODAY, 420);
  const source = returned([claimed(old, { trailStardust: 50, minutesStardust: 12, finds: [gift(true)] }), claimed(today)], 420, TODAY, 360);
  const output = offlineSyncReturn(batch([old, today]), [source], state(420));
  assert.equal(output.reveal.seconds, 3660); assert.equal(output.reveal.stardust, 62); assert.equal(output.reveal.trailStardust, 0);
  assert.deepEqual([output.reveal.trail.fromSeconds, output.reveal.trail.seconds, output.reveal.trail.date], [360, 420, TODAY]);
});

test('midnight chooses the current server day instead of replaying yesterday on today\'s trail', () => {
  const e = entry(1, 60, YESTERDAY, 600), source = returned([claimed(e)], 600, YESTERDAY, 540);
  const output = offlineSyncReturn(batch([e]), [source], state(0));
  assert.equal(output.reveal.seconds, 60); assert.equal(output.reveal.trail.date, TODAY);
  assert.deepEqual([output.reveal.trail.fromSeconds, output.reveal.trail.seconds, output.reveal.trail.finds], [0, 0, 0]);
});

test('when claim fails, confirmed receipts advance the map without inventing finds, currency or a bonus', () => {
  const e = entry(1, 60, TODAY, 1800), stale = state(7200, YESTERDAY, { trail: { findSeconds: 1800, stops: 4, complete: true } });
  const output = offlineSyncReturn(batch([e]), [], stale);
  assert.equal(output.reveal.trail.date, TODAY); assert.equal(output.reveal.trail.seconds, 1800); assert.equal(output.reveal.trail.fromSeconds, 1740);
  assert.equal(output.reveal.trail.finds, 0); assert.equal(output.reveal.trail.pendingFinds, 1); assert.equal(output.reveal.trail.nextFindSeconds, 0);
  assert.equal(output.reveal.trail.complete, false); assert.equal(output.reveal.trailStardust, 0);
  assert.equal(output.reveal.stardust, 0); assert.deepEqual(output.reveal.finds, []); assert.deepEqual(output.consumedIds, []);
});

test('receipt counters newer than same-day cache win and update remaining minutes', () => {
  const e = entry(1, 60, TODAY, 420), output = offlineSyncReturn(batch([e]), [], state(120));
  assert.deepEqual([output.reveal.trail.seconds, output.reveal.trail.fromSeconds, output.reveal.trail.nextFindSeconds], [420, 360, 1380]);
});

test('without state or daily evidence the helper keeps progress unknown rather than inventing today\'s walk', () => {
  const e = entry(1); delete e.receipt.result.credited_date; delete e.receipt.result.daily_completed_seconds;
  const output = offlineSyncReturn(batch([e]), [], null);
  assert.equal(output.reveal.seconds, 60); assert.equal(output.reveal.trail.date, undefined);
  assert.deepEqual([output.reveal.trail.seconds, output.reveal.trail.fromSeconds, output.reveal.trail.finds, output.reveal.stardust], [0, 0, 0, 0]);
});

test('past the four-stop trail, actual focus totals stay accurate without an extra find or bonus', () => {
  const e = entry(1, 9000, TODAY, 9000), current = state(9000, TODAY, { nextFindSeconds: 0, trail: { findSeconds: 1800, stops: 4, complete: true } });
  const output = offlineSyncReturn(batch([e]), [], current);
  assert.equal(output.reveal.seconds, 9000); assert.equal(output.reveal.trail.seconds, 9000);
  assert.equal(output.reveal.trail.findSeconds * output.reveal.trail.stops, 7200);
  assert.equal(output.reveal.trail.finds, 4); assert.equal(output.reveal.trail.pendingFinds, 0); assert.equal(output.reveal.trailStardust, 0);
});

test('a session after today\'s completed trail keeps the character at the end without repeating a walk', () => {
  const e = entry(1, 60, TODAY, 9060), current = state(9060, TODAY, { nextFindSeconds: 0, trail: { findSeconds: 1800, stops: 4, complete: true } });
  const output = offlineSyncReturn(batch([e]), [], current);
  assert.equal(output.reveal.trail.fromSeconds, 9000); assert.equal(output.reveal.trail.seconds, 9060);
  const location = seconds => Math.min(output.reveal.trail.stops, seconds / output.reveal.trail.findSeconds);
  assert.equal(location(output.reveal.trail.fromSeconds), location(output.reveal.trail.seconds));
  assert.equal(output.reveal.trail.complete, true); assert.equal(output.reveal.trailStardust, 0);
});

test('summary and return calculations leave frozen receipts, claims and account state untouched', () => {
  const e = entry(1), b = freeze(batch([e])), source = freeze(returned([claimed(e, { finds: [gift(true)] })], 60)), current = freeze(state(60));
  const before = JSON.stringify([b, source, current]); summarizeOfflineSync(b, subjects);
  const output = offlineSyncReturn(b, [source], current); output.reveal.finds[0].stardust = 99;
  assert.equal(JSON.stringify([b, source, current]), before); assert.equal(source.finds[0].stardust, 0);
});
