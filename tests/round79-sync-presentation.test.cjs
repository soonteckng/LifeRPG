/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const cache = new Map();
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.')
    ? load(path.relative(path.resolve(__dirname, '..'), `${path.resolve(path.dirname(filename), name)}.ts`)) : require(name), module, module.exports);
  return module.exports;
}
const { createOfflineSyncPresentationStore, offlineSyncPresentationKey } = load('src/services/offlineSyncPresentation.ts');
const scope = { backendId: 'round79-presentation-fixture', ownerId: '11111111-1111-4111-8111-111111111111' };
const id = number => `33333333-3333-4333-8333-${String(number).padStart(12, '0')}`;
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function record(number, extra = {}) {
  const seconds = 60, started = 1_000_000 + number * 60_000;
  return { clientSessionId: id(number), serverSessionId: id(number + 10000), state: 'completed', revision: 3,
    setup: { targetSeconds: seconds, activityType: 'other', taskId: null, subjectId: 1, notes: null, title: `Routine ${number}` },
    completedAtMs: started + seconds * 1000, startedAtMs: started, elapsedMs: seconds * 1000,
    endsAtMs: null, observedAtMs: started + seconds * 1000, clockAnchor: null, clockWarning: false,
    dismissedAtMs: started + seconds * 1000, verification: 'client_reported',
    sync: { state: 'synced', attempts: 0, nextAttemptAtMs: null, reasonCode: null,
      receipt: { sessionId: id(number + 10000), durationSeconds: seconds,
        result: { xp_earned: 1, area_xp_earned: 1, daily_completed_seconds: number * seconds, credited_date: '2026-10-28' } } },
    ...extra };
}
function storage() {
  const values = new Map(), writes = [];
  return { values, writes, getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { writes.push([key, value]); values.set(key, value); } };
}
const clients = snapshot => snapshot.batch?.entries.map(entry => entry.clientSessionId) ?? [];

test('three accepted offline completions publish one immutable batch only when the whole pass finishes', async () => {
  const cache = storage(), store = createOfflineSyncPresentationStore(); await store.bind(scope, cache);
  const states = []; store.subscribe(scope, () => states.push(store.snapshot(scope)));
  const observer = store.begin(scope), records = [record(1), record(2), record(3)];
  assert.equal(store.snapshot(scope).busy, true);
  for (const row of records) observer.accepted(row);
  assert.equal(store.snapshot(scope).batch, null, 'no individual receipt becomes a result between uploads');
  await store.flush(scope);
  assert.equal(JSON.parse(cache.values.get(offlineSyncPresentationKey(scope))).batch.entries.length, 3, 'staged receipts already survive process loss');
  observer.finish();
  const snapshot = store.snapshot(scope); assert.equal(snapshot.busy, false); assert.equal(snapshot.batch.entries.length, 3);
  assert.equal(snapshot.batch.entries.reduce((sum, entry) => sum + entry.receipt.durationSeconds, 0), 180);
  assert.equal(snapshot.batch.entries.reduce((sum, entry) => sum + entry.receipt.result.xp_earned, 0), 3);
  assert.deepEqual(snapshot.batch.entries.map(entry => entry.receipt.result.daily_completed_seconds), [60, 120, 180], 'cumulative values are copied, never summed into another receipt');
  assert.equal(store.snapshot(scope), snapshot, 'subscribed snapshot stays referentially stable without a state change');
  assert.equal(states.filter(state => state.batch !== null).length, 1);
  records[0].setup.title = 'changed later'; records[0].sync.receipt.result.xp_earned = 900;
  assert.equal(snapshot.batch.entries[0].setup.title, 'Routine 1'); assert.equal(snapshot.batch.entries[0].receipt.result.xp_earned, 1);
  assert.equal(Object.isFrozen(snapshot.batch.entries[0].receipt.result), true);
});

test('lost import replies and replayed receipts do not duplicate a batch member or an acknowledged result', async () => {
  const cache = storage(), store = createOfflineSyncPresentationStore(); await store.bind(scope, cache);
  const first = store.begin(scope); first.accepted(record(1)); first.accepted(record(1)); first.finish();
  const batch = store.snapshot(scope).batch;
  const retry = store.begin(scope); retry.accepted(record(1)); retry.finish();
  assert.equal(store.snapshot(scope).batch.id, batch.id); assert.deepEqual(clients(store.snapshot(scope)), [id(1)]);
  store.acknowledge(scope, batch.id, [id(1)]);
  assert.equal(store.snapshot(scope).batch, null);
  assert.equal(store.hasAcknowledgedReceipt(scope, id(10001)), true);
  assert.deepEqual(store.snapshot(scope).acknowledgedReceiptIds, [id(10001)]);
  const late = store.begin(scope); late.accepted(record(1)); late.finish();
  assert.equal(store.snapshot(scope).batch, null);
  await store.flush(scope);
  const restarted = createOfflineSyncPresentationStore(); await restarted.bind(scope, cache);
  assert.equal(restarted.hasAcknowledgedReceipt(scope, id(10001)), true);
  assert.deepEqual(restarted.snapshot(scope).acknowledgedReceiptIds, [id(10001)]);
  const afterRestart = restarted.begin(scope); afterRestart.accepted(record(1)); afterRestart.finish();
  assert.equal(restarted.snapshot(scope).batch, null);
});

test('a partial pass can append a successful retry while retaining one stable summary identity', async () => {
  const store = createOfflineSyncPresentationStore();
  const first = store.begin(scope); first.accepted(record(1)); first.accepted(record(2)); first.finish();
  const initial = store.snapshot(scope).batch;
  const retry = store.begin(scope); retry.accepted(record(2)); retry.accepted(record(3));
  assert.equal(store.snapshot(scope).busy, true); assert.equal(store.snapshot(scope).batch, initial, 'already-visible batch snapshot is unchanged during the next pass');
  retry.finish();
  assert.equal(store.snapshot(scope).batch.id, initial.id); assert.deepEqual(clients(store.snapshot(scope)), [id(1), id(2), id(3)]);
});

test('Done acknowledges exact outgoing members; late additions and stale callbacks cannot disappear', () => {
  const store = createOfflineSyncPresentationStore();
  const first = store.begin(scope); first.accepted(record(1)); first.finish(); const outgoing = store.snapshot(scope).batch;
  const later = store.begin(scope); later.accepted(record(2)); later.finish();
  store.acknowledge(scope, outgoing.id, outgoing.entries.map(entry => entry.clientSessionId));
  const next = store.snapshot(scope).batch;
  assert.notEqual(next.id, outgoing.id); assert.deepEqual(clients(store.snapshot(scope)), [id(2)]);
  store.acknowledge(scope, outgoing.id, [id(2)]);
  assert.deepEqual(clients(store.snapshot(scope)), [id(2)], 'outgoing native callback cannot acknowledge a replacement presentation');
  assert.equal(store.hasAcknowledgedReceipt(scope, id(10001)), true);
  assert.equal(store.hasAcknowledgedReceipt(scope, id(10002)), false);
});

test('overlapping passes remain busy until the last observer finishes; repeated old finish is harmless', () => {
  const store = createOfflineSyncPresentationStore(), first = store.begin(scope), second = store.begin(scope);
  first.accepted(record(1)); second.accepted(record(2)); first.finish(); first.finish();
  assert.equal(store.snapshot(scope).busy, true); assert.equal(store.snapshot(scope).batch, null);
  const newer = store.begin(scope); first.finish(); second.finish();
  assert.equal(store.snapshot(scope).busy, true); assert.equal(store.snapshot(scope).batch, null);
  newer.accepted(record(3)); newer.finish();
  assert.equal(store.snapshot(scope).busy, false); assert.deepEqual(clients(store.snapshot(scope)), [id(1), id(2), id(3)]);
  first.accepted(record(4)); assert.equal(store.snapshot(scope).batch.entries.length, 3, 'finished observer cannot append later');
});

test('account and backend scopes have separate queues, subscribers, acknowledged receipts and disk keys', async () => {
  const otherOwner = { ...scope, ownerId: '22222222-2222-4222-8222-222222222222' }, otherBackend = { ...scope, backendId: 'another-backend' };
  const cache = storage(), store = createOfflineSyncPresentationStore();
  await Promise.all([scope, otherOwner, otherBackend].map(owner => store.bind(owner, cache)));
  let ownerNotifications = 0; store.subscribe(otherOwner, () => ownerNotifications++);
  const pass = store.begin(scope); pass.accepted(record(1)); pass.finish();
  assert.equal(store.snapshot(otherOwner).batch, null); assert.equal(store.snapshot(otherBackend).batch, null); assert.equal(ownerNotifications, 0);
  const batch = store.snapshot(scope).batch; store.acknowledge(otherOwner, batch.id, [id(1)]);
  assert.equal(store.snapshot(scope).batch.id, batch.id); store.acknowledge(scope, batch.id, [id(1)]);
  assert.equal(store.hasAcknowledgedReceipt(otherOwner, id(10001)), false); assert.equal(store.hasAcknowledgedReceipt(otherBackend, id(10001)), false);
  assert.equal(store.snapshot(null).batch, null); assert.equal(store.hasAcknowledgedReceipt(null, id(10001)), false);
  await Promise.all([scope, otherOwner, otherBackend].map(owner => store.flush(owner)));
  assert.equal(new Set(cache.writes.map(([key]) => key)).size, 3);
});

test('process recovery restores full staged receipts even before the interrupted pass finishes', async () => {
  const cache = storage(), store = createOfflineSyncPresentationStore(); await store.bind(scope, cache);
  const interrupted = store.begin(scope); interrupted.accepted(record(1)); interrupted.accepted(record(2)); await store.flush(scope);
  const restarted = createOfflineSyncPresentationStore(); await restarted.bind(scope, cache);
  assert.equal(restarted.snapshot(scope).ready, true); assert.equal(restarted.snapshot(scope).busy, false);
  assert.deepEqual(clients(restarted.snapshot(scope)), [id(1), id(2)]);
  const retry = restarted.begin(scope); retry.accepted(record(1)); retry.accepted(record(2)); retry.accepted(record(3)); retry.finish();
  assert.deepEqual(clients(restarted.snapshot(scope)), [id(1), id(2), id(3)]);
});

test('acknowledgement before hydration wins over the old disk copy, while a new local receipt survives', async () => {
  const cache = storage(), initial = createOfflineSyncPresentationStore(); await initial.bind(scope, cache);
  const old = initial.begin(scope); old.accepted(record(1)); old.finish(); await initial.flush(scope);
  const read = deferred(), delayed = { ...cache, getItem: () => read.promise };
  const store = createOfflineSyncPresentationStore(), binding = store.bind(scope, delayed);
  assert.equal(store.snapshot(scope).ready, false);
  const local = store.begin(scope); local.accepted(record(1)); local.accepted(record(2)); local.finish();
  store.acknowledge(scope, store.snapshot(scope).batch.id, [id(1)]);
  read.resolve(cache.values.get(offlineSyncPresentationKey(scope))); await binding; await store.flush(scope);
  assert.equal(store.snapshot(scope).ready, true); assert.deepEqual(clients(store.snapshot(scope)), [id(2)]);
  assert.equal(store.hasAcknowledgedReceipt(scope, id(10001)), true);
  const again = createOfflineSyncPresentationStore(); await again.bind(scope, cache);
  assert.deepEqual(clients(again.snapshot(scope)), [id(2)]); assert.equal(again.hasAcknowledgedReceipt(scope, id(10001)), true);
});

test('hydrated acknowledged receipts suppress a locally observed retry while its disk read was pending', async () => {
  const cache = storage(), initial = createOfflineSyncPresentationStore(); await initial.bind(scope, cache);
  const old = initial.begin(scope); old.accepted(record(1)); old.finish(); initial.acknowledge(scope, initial.snapshot(scope).batch.id, [id(1)]); await initial.flush(scope);
  const read = deferred(), store = createOfflineSyncPresentationStore();
  const binding = store.bind(scope, { ...cache, getItem: () => read.promise });
  const retry = store.begin(scope); retry.accepted(record(1)); retry.accepted(record(2)); retry.finish();
  read.resolve(cache.values.get(offlineSyncPresentationKey(scope))); await binding;
  assert.deepEqual(clients(store.snapshot(scope)), [id(2)]); assert.equal(store.hasAcknowledgedReceipt(scope, id(10001)), true);
});

test('serialized persistence writes the acknowledgement after a slow older write, never over it', async () => {
  const cache = storage(), store = createOfflineSyncPresentationStore(); await store.bind(scope, cache); await store.flush(scope);
  const write = deferred(); let blocked = true;
  cache.setItem = async (key, value) => { if (blocked) { blocked = false; await write.promise; } cache.values.set(key, value); };
  const pass = store.begin(scope); pass.accepted(record(1)); pass.finish();
  store.acknowledge(scope, store.snapshot(scope).batch.id, [id(1)]);
  assert.equal(store.snapshot(scope).batch, null, 'Done does not wait on disk');
  write.resolve(); await store.flush(scope);
  const persisted = JSON.parse(cache.values.get(offlineSyncPresentationKey(scope)));
  assert.equal(persisted.batch, null); assert.deepEqual(persisted.seen, [[id(1), id(10001)]]);
});

test('an acknowledgement queued between writer completion and finally is persisted by a new writer', async () => {
  const cache = storage(), store = createOfflineSyncPresentationStore(), write = deferred();
  const pass = store.begin(scope); pass.accepted(record(1)); pass.finish();
  let block = true;
  cache.setItem = (key, value) => { cache.values.set(key, value); if (block) { block = false; return write.promise; } return Promise.resolve(); };
  await store.bind(scope, cache);
  const batch = store.snapshot(scope).batch;
  write.resolve();
  // The writer's await continuation runs first and completes its loop. This
  // task then lands before its finally callback releases bucket.writing.
  queueMicrotask(() => store.acknowledge(scope, batch.id, [id(1)]));
  await tick(); await store.flush(scope);
  const persisted = JSON.parse(cache.values.get(offlineSyncPresentationKey(scope)));
  assert.equal(persisted.batch, null, 'Done cannot be lost in the writer-finalization window');
  assert.deepEqual(persisted.seen, [[id(1), id(10001)]]);
});

test('writer rescheduling does not turn a storage rejection into an automatic retry loop', async () => {
  const store = createOfflineSyncPresentationStore(); let writes = 0;
  await store.bind(scope, { getItem: async () => null, setItem: async () => { writes++; throw Error('storage fixture'); } });
  await store.flush(scope); const before = writes;
  const pass = store.begin(scope); pass.accepted(record(1)); pass.finish(); await store.flush(scope);
  const after = writes; await tick(); await tick();
  assert.equal(writes, after); assert.ok(after > before && after <= before + 2, 'only new presentation changes justify another write');
  assert.equal(store.snapshot(scope).ready, true); assert.equal(store.snapshot(scope).busy, false);
});

test('unavailable, damaged or wrong-owner storage never blocks ready/busy or loses new in-memory confirmations', async () => {
  for (const raw of [null, '{bad json', JSON.stringify({ version: 9 }), JSON.stringify({ version: 1, scope: { ...scope, backendId: 'wrong' }, batch: null, seen: [] })]) {
    const store = createOfflineSyncPresentationStore(); await store.bind(scope, { getItem: async () => raw, setItem: async () => { throw Error('storage fixture'); } });
    const pass = store.begin(scope); pass.accepted(record(1)); pass.finish(); await store.flush(scope);
    assert.equal(store.snapshot(scope).ready, true); assert.equal(store.snapshot(scope).busy, false); assert.deepEqual(clients(store.snapshot(scope)), [id(1)]);
  }
  const failed = createOfflineSyncPresentationStore(); await failed.bind(scope, { getItem: async () => { throw Error('storage fixture'); }, setItem: async () => {} });
  assert.equal(failed.snapshot(scope).ready, true);
  const hung = createOfflineSyncPresentationStore({ loadTimeoutMs: 5 }); await hung.bind(scope, { getItem: () => new Promise(() => {}), setItem: async () => {} });
  assert.equal(hung.snapshot(scope).ready, true, 'an unresolved cache read is bounded');
});

test('large passes retain every full receipt after the source journal keeps only its latest twenty', async () => {
  const cache = storage(), store = createOfflineSyncPresentationStore(); await store.bind(scope, cache);
  const journal = [], pass = store.begin(scope);
  for (let number = 1; number <= 75; number++) { const saved = record(number); journal.push(saved); pass.accepted(saved); if (journal.length > 20) journal.shift(); }
  assert.equal(journal.length, 20); pass.finish(); await store.flush(scope);
  assert.equal(store.snapshot(scope).batch.entries.length, 75);
  assert.equal(store.snapshot(scope).batch.entries[0].setup.title, 'Routine 1');
  const restarted = createOfflineSyncPresentationStore(); await restarted.bind(scope, cache);
  assert.equal(restarted.snapshot(scope).batch.entries.length, 75); assert.equal(restarted.snapshot(scope).batch.entries[0].receipt.result.xp_earned, 1);
});

test('only validated confirmed completions enter the presentation queue, without mutating input records', () => {
  const store = createOfflineSyncPresentationStore(), pass = store.begin(scope), valid = record(1), before = clone(valid);
  for (const rejected of [record(2, { state: 'cancelled' }), record(3, { state: 'running' }), record(4, { sync: { state: 'pending', receipt: null } }),
    record(5, { serverSessionId: id(99999) }), record(6, { clientSessionId: 'invalid' }), record(7, { completedAtMs: NaN })]) pass.accepted(rejected);
  pass.accepted(valid); pass.finish(); assert.deepEqual(clients(store.snapshot(scope)), [id(1)]); assert.deepEqual(valid, before);
});

test('seen receipt history is bounded and still contains the most recently acknowledged batches after restart', async () => {
  const cache = storage(), store = createOfflineSyncPresentationStore(); await store.bind(scope, cache);
  for (let number = 1; number <= 520; number++) {
    const pass = store.begin(scope); pass.accepted(record(number)); pass.finish();
    const batch = store.snapshot(scope).batch; store.acknowledge(scope, batch.id, [id(number)]);
  }
  await store.flush(scope); assert.equal(store.snapshot(scope).acknowledgedReceiptIds.length, 512);
  assert.equal(store.hasAcknowledgedReceipt(scope, id(10001)), false); assert.equal(store.hasAcknowledgedReceipt(scope, id(10520)), true);
  const restarted = createOfflineSyncPresentationStore(); await restarted.bind(scope, cache);
  assert.equal(restarted.snapshot(scope).acknowledgedReceiptIds.length, 512); assert.equal(restarted.hasAcknowledgedReceipt(scope, id(10520)), true);
});

test('unsubscribed and failing listeners cannot block independently subscribed presentation consumers', async () => {
  const store = createOfflineSyncPresentationStore(); let calls = 0;
  store.subscribe(scope, () => { throw Error('observer fixture'); }); const remove = store.subscribe(scope, () => calls++);
  const pass = store.begin(scope); pass.accepted(record(1)); pass.finish(); assert.equal(calls, 2); remove();
  const later = store.begin(scope); later.finish(); await tick(); assert.equal(calls, 2);
});
