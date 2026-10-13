/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.')
    ? load(path.relative(path.resolve(__dirname, '..'), `${path.resolve(path.dirname(filename), name)}.ts`)) : require(name), mod, mod.exports);
  return mod.exports;
}
const domain = load('src/utils/sessionJournal.ts');
const schema = load('src/utils/sessionJournalSchema.ts');
const storageApi = load('src/services/sessionJournalStore.ts');
const scope = { backendId: 'fixture-backend', ownerId: '11111111-1111-4111-8111-111111111111' };
const setup = { targetSeconds: 30, activityType: 'other', taskId: 7, subjectId: 9, notes: 'read', title: 'My title' };
const client = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const server = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const start = '10000000-0000-4000-8000-000000000001';
const pause = '10000000-0000-4000-8000-000000000002';
const complete = '10000000-0000-4000-8000-000000000003';
const T0 = 1800000000000;
const clone = value => JSON.parse(JSON.stringify(value));
const clock = ms => ({ wallTimeMs: T0 + ms, monotonicTimeMs: null, bootId: null });
const snapshot = (state, elapsedMs = 0, ms = elapsedMs) => ({ serverSessionId: server, state, startedAtMs: T0, elapsedMs, observedClock: clock(ms) });
const receipt = () => ({ sessionId: server, durationSeconds: 30, result: { session_id: server, duration_seconds: 30, xp_earned: 0, credited_date: '2026-10-10' } });
const act = (journal, action) => domain.applyJournalAction(journal, { epoch: journal.admission.epoch, expectedRevision: journal.revision, ...action });
function admitted() { return act(domain.createJournal(scope), { type: 'admit', epoch: 1 }); }
function prepared() { return act(admitted(), { type: 'prepare_start', clientSessionId: client, operationId: start, setup, clock: clock(0) }); }
function running() { return act(prepared(), { type: 'acknowledge_start', operationId: start, snapshot: snapshot('running') }); }
function reconcile(journal, evidence) { return act(journal, { type: 'reconcile_server', clientSessionId: client, setup: { ...setup, title: null }, verifiedScope: scope, clock: clock(45000), ...evidence }); }

test('End supersedes an uncertain timing command atomically while preserving its immutable evidence', async () => {
  for (const kind of ['pause', 'resume']) {
    let initial = running();
    if (kind === 'resume') {
      initial = act(initial, { type: 'prepare_transition', operationId: pause, clientSessionId: client, kind: 'pause', clock: clock(1000) });
      initial = act(initial, { type: 'acknowledge_transition', operationId: pause, snapshot: snapshot('paused', 1000) });
    }
    const operation = kind === 'pause' ? pause : complete;
    initial = act(initial, { type: 'prepare_transition', operationId: operation, clientSessionId: client, kind, clock: clock(2000) });
    initial = act(initial, { type: 'mark_unknown', operationId: operation });
    const original = clone(initial.commands.find(command => command.operationId === operation));
    const cancel = '10000000-0000-4000-8000-000000000004';
    const values = new Map(), backend = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value) };
    const store = storageApi.createSessionJournalStore(backend, scope);
    await backend.setItem(store.key, schema.serializeJournalEnvelope(initial));
    const saved = await store.update(journal => act(journal, { type: 'prepare_transition', operationId: cancel, clientSessionId: client, kind: 'cancel', clock: clock(4000) }));
    assert.equal(saved.revision, initial.revision + 1);
    assert.deepEqual(saved.commands.find(command => command.operationId === operation), { ...original, status: 'superseded' });
    assert.equal(saved.commands.filter(command => ['prepared', 'unknown'].includes(command.status)).length, 1);
    const restored = (await store.load()).journal;
    assert.equal(restored.commands.at(-1).kind, 'cancel');
    assert.throws(() => act(restored, { type: 'prepare_transition', operationId: operation, clientSessionId: client, kind, clock: clock(2000) }), /operation_settled/);
    const cancelled = reconcile(restored, { snapshot: snapshot('cancelled', 2000, 5000) });
    assert.equal(cancelled.records[0].state, 'cancelled'); assert.equal(cancelled.records[0].sync.receipt, null);
    assert.equal(cancelled.commands.find(command => command.operationId === operation).status, 'superseded');
  }
});

test('saved End intent blocks expiry even at the deadline and superseded status cannot stand alone', () => {
  const active = running(), cancel = '10000000-0000-4000-8000-000000000004';
  const ended = act(active, { type: 'prepare_transition', operationId: cancel, clientSessionId: client, kind: 'cancel', clock: clock(30000) });
  assert.throws(() => act(ended, { type: 'expire', clientSessionId: client, operationId: complete, clock: clock(45000) }), /unresolved_command/);
  const malformed = clone(ended); malformed.commands[0].status = 'superseded';
  assert.throws(() => schema.validateJournalEnvelope(malformed, scope));
  let waiting = act(active, { type: 'prepare_transition', operationId: pause, clientSessionId: client, kind: 'pause', clock: clock(1000) });
  waiting = act(waiting, { type: 'prepare_transition', operationId: cancel, clientSessionId: client, kind: 'cancel', clock: clock(2000) });
  const orphan = clone(waiting); orphan.commands.pop();
  assert.throws(() => schema.validateJournalEnvelope(orphan, scope));
});

test('a returned start identity survives failed timing read and restart without inventing a clock', async () => {
  const values = new Map();
  const backend = { async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { values.set(key, value); } };
  const store = storageApi.createSessionJournalStore(backend, scope);
  await store.update(journal => act(journal, { type: 'admit', epoch: 1 }));
  await store.update(journal => act(journal, { type: 'prepare_start', clientSessionId: client, operationId: start, setup, clock: clock(0) }));
  await store.update(journal => act(journal, { type: 'remember_start_identity', operationId: start, serverSessionId: server, verifiedScope: scope }));
  const restored = (await storageApi.createSessionJournalStore(backend, scope).load()).journal;
  assert.equal(restored.records[0].serverSessionId, server);
  assert.equal(restored.records[0].state, 'not_started');
  assert.equal(restored.records[0].endsAtMs, null);
  assert.equal(restored.records[0].clockAnchor, null);
  assert.equal(restored.commands[0].status, 'unknown');
  const saved = act(restored, { type: 'acknowledge_start', operationId: start, snapshot: snapshot('running', 5000, 5000) });
  assert.equal(saved.records[0].endsAtMs, T0 + 30000);
  assert.equal(saved.commands[0].status, 'acknowledged');
  assert.equal(saved.records.length, 1);
});

test('adopting a verified server session uses its timing and refuses a second open session', () => {
  const adopted = act(admitted(), { type: 'adopt_server', clientSessionId: client, setup, verifiedScope: scope, snapshot: snapshot('paused', 4000, 5000) });
  assert.equal(adopted.records[0].state, 'paused');
  assert.equal(adopted.records[0].elapsedMs, 4000);
  assert.equal(adopted.records[0].endsAtMs, null);
  schema.validateJournalEnvelope(adopted, scope);
  const action = { type: 'adopt_server', clientSessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', setup, verifiedScope: scope, snapshot: snapshot('running') };
  assert.throws(() => act(adopted, action));
  assert.throws(() => act(admitted(), { ...action, verifiedScope: { ...scope, backendId: 'other-backend' } }));
  assert.throws(() => act(admitted(), { ...action, snapshot: snapshot('cancelled') }));
});

test('old-state reads do not settle or replay an unknown control', () => {
  let journal = act(running(), { type: 'prepare_transition', operationId: pause, clientSessionId: client, kind: 'pause', clock: clock(4000) });
  journal = act(journal, { type: 'mark_unknown', operationId: pause });
  const before = clone(journal);
  assert.deepEqual(reconcile(journal, { snapshot: snapshot('running', 6000, 6000) }), before);
  assert.equal(journal.commands.at(-1).status, 'unknown');
  const paused = reconcile(journal, { snapshot: snapshot('paused', 5000, 6000) });
  assert.equal(paused.records[0].state, 'paused');
  assert.equal(paused.commands.at(-1).status, 'acknowledged');
  assert.equal(paused.records[0].setup.title, 'My title');
});

test('a remote completion receipt resolves an unknown control without a new reward request', () => {
  let journal = act(running(), { type: 'prepare_transition', operationId: pause, clientSessionId: client, kind: 'pause', clock: clock(4000) });
  journal = act(journal, { type: 'mark_unknown', operationId: pause });
  const saved = reconcile(journal, { receipt: receipt(), startedAtMs: T0, completedAtMs: T0 + 44000, operationId: complete });
  assert.equal(saved.records[0].state, 'completed');
  assert.equal(saved.records[0].sync.state, 'synced');
  assert.equal(saved.commands.find(item => item.operationId === pause).status, 'rejected');
  assert.equal(saved.commands.find(item => item.operationId === complete).status, 'acknowledged');
  assert.deepEqual(saved.records[0].sync.receipt, receipt());
  assert.deepEqual(domain.pendingServerCompletions(saved, scope), []);
});

test('server completion preserves the original locally finished timing and receipt replay identity', async () => {
  const pending = act(running(), { type: 'expire', operationId: complete, clientSessionId: client, clock: clock(31000) });
  const values = new Map();
  const backend = { async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { values.set(key, value); } };
  const store = storageApi.createSessionJournalStore(backend, scope);
  values.set(store.key, schema.serializeJournalEnvelope(pending));
  const saved = await store.update(journal => reconcile(journal, { receipt: receipt(), startedAtMs: T0, completedAtMs: T0 + 44000, clockWarning: true }));
  for (const field of ['completedAtMs', 'observedAtMs', 'endsAtMs', 'elapsedMs', 'clockWarning']) assert.equal(saved.records[0][field], pending.records[0][field]);
  assert.equal(saved.commands.length, 2);
  assert.deepEqual(reconcile(saved, { receipt: receipt(), startedAtMs: T0, completedAtMs: T0 + 45000 }), saved);
});

test('remote cancellation preserves a locally finished record as a visible rejection', () => {
  const pending = act(running(), { type: 'expire', operationId: complete, clientSessionId: client, clock: clock(31000) });
  const saved = reconcile(pending, { snapshot: snapshot('cancelled', 10000, 10000) });
  assert.equal(saved.records[0].state, 'completed');
  assert.equal(saved.records[0].completedAtMs, pending.records[0].completedAtMs);
  assert.equal(saved.records[0].sync.state, 'rejected');
  assert.equal(saved.records[0].sync.reasonCode, 'server_cancelled');
  assert.equal(saved.commands.at(-1).status, 'rejected');
  assert.equal(saved.records[0].sync.receipt, null);
});

test('server reconciliation refuses changed identity, setup, start anchor or receipt duration', () => {
  const journal = running(), before = clone(journal);
  for (const bad of [
    { snapshot: { ...snapshot('paused'), serverSessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } },
    { snapshot: { ...snapshot('paused'), startedAtMs: T0 + 1 } },
    { snapshot: snapshot('paused'), setup: { ...setup, subjectId: null } },
    { receipt: { ...receipt(), durationSeconds: 29 }, startedAtMs: T0, completedAtMs: T0 + 40000, operationId: complete },
    { receipt: receipt(), startedAtMs: T0, completedAtMs: T0 - 1, operationId: complete },
  ]) assert.throws(() => reconcile(journal, bad));
  assert.deepEqual(journal, before);
});
