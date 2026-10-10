/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const modules = new Map();
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = { exports: {} }; modules.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!name.startsWith('.')) return require(name);
    const resolved = path.resolve(path.dirname(filename), name);
    return load(path.relative(path.resolve(__dirname, '..'), resolved.endsWith('.ts') ? resolved : `${resolved}.ts`));
  }, mod, mod.exports);
  return mod.exports;
}
const domain = load('src/utils/sessionJournal.ts');
const recovery = load('src/utils/sessionJournalRecovery.ts');
const storeApi = load('src/services/sessionJournalStore.ts');
const SCOPE = { backendId: 'fixture-backend', ownerId: '11111111-1111-4111-8111-111111111111' };
const OTHER_SCOPE = { ...SCOPE, ownerId: '22222222-2222-4222-8222-222222222222' };
const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CLIENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SERVER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_SERVER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const START = '10000000-0000-4000-8000-000000000001';
const OTHER_START = '10000000-0000-4000-8000-000000000002';
const CANCEL = '10000000-0000-4000-8000-000000000003';
const T0 = 1800000000000;
const SETUP = { targetSeconds: 30, activityType: 'learning', taskId: 7, subjectId: 9, notes: 'Read a chapter', title: 'Learning' };
const clone = value => JSON.parse(JSON.stringify(value));
const clock = elapsedMs => ({ wallTimeMs: T0 + elapsedMs, monotonicTimeMs: 1000 + elapsedMs, bootId: 'boot-a' });
function act(journal, action) {
  return domain.applyJournalAction(journal, { epoch: journal.admission.epoch, expectedRevision: journal.revision, ...action });
}
function prepared() {
  let journal = act(domain.createJournal(SCOPE), { type: 'admit', epoch: 1 });
  return act(journal, { type: 'prepare_start', operationId: START, clientSessionId: CLIENT, setup: clone(SETUP), clock: clock(0) });
}
const unknown = () => act(prepared(), { type: 'mark_unknown', operationId: START });
function candidate(overrides = {}) {
  return {
    scope: clone(SCOPE),
    setup: { targetSeconds: 30, activityType: 'learning', taskId: 7, subjectId: 9, notes: 'Read a chapter' },
    snapshot: { serverSessionId: SERVER, state: 'running', startedAtMs: T0 + 200, elapsedMs: 3800, observedClock: clock(4000) },
    ...overrides,
  };
}
function context(journal, candidates = [candidate()], overrides = {}) {
  return {
    verifiedScope: clone(SCOPE), epoch: journal.admission.epoch, expectedRevision: journal.revision, operationId: START,
    openSessions: { scope: clone(SCOPE), complete: true, sessions: candidates },
    ...overrides,
  };
}
function skipped(journal, request, reason) {
  const before = clone(journal);
  assert.deepEqual(recovery.reconcileLegacyUnknownStart(journal, request), { kind: 'unreconciled', reason });
  assert.deepEqual(journal, before);
}
function memoryStorage() {
  const values = new Map(), commits = [];
  return {
    values, commits,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); commits.push({ key, value }); },
  };
}

test('real store reload recovers a lost legacy start ACK as one existing session', async () => {
  const storage = memoryStorage();
  let store = storeApi.createSessionJournalStore(storage, SCOPE);
  await store.update(journal => act(journal, { type: 'admit', epoch: 1 }));
  await store.update(journal => act(journal, { type: 'prepare_start', operationId: START, clientSessionId: CLIENT, setup: clone(SETUP), clock: clock(0) }));
  await store.update(journal => act(journal, { type: 'mark_unknown', operationId: START }));
  store = storeApi.createSessionJournalStore(storage, SCOPE);
  const loaded = await store.load();
  assert.equal(loaded.kind, 'ready');
  assert.equal(loaded.journal.records[0].state, 'not_started');
  assert.equal(loaded.journal.commands[0].status, 'unknown');
  const match = recovery.reconcileLegacyUnknownStart(loaded.journal, context(loaded.journal));
  assert.equal(match.kind, 'acknowledge');
  assert.equal(match.action.type, 'acknowledge_start');
  assert.equal(match.action.operationId, START);
  await store.update(journal => domain.applyJournalAction(journal, match.action));
  const saved = (await storeApi.createSessionJournalStore(storage, SCOPE).load()).journal;
  assert.equal(saved.records.length, 1);
  assert.equal(saved.commands.length, 1);
  assert.equal(saved.records[0].clientSessionId, CLIENT);
  assert.equal(saved.records[0].serverSessionId, SERVER);
  assert.equal(saved.records[0].state, 'running');
  assert.equal(saved.records[0].elapsedMs, 3800);
  assert.equal(saved.records[0].endsAtMs, T0 + 30200);
  assert.equal(saved.commands[0].operationId, START);
  assert.equal(saved.commands[0].status, 'acknowledged');
  assert.equal(saved.records[0].sync.receipt, null);
  assert.equal(saved.records[0].sync.state, 'idle');
});

test('one exact paused server row can reconcile without resuming or completing it', () => {
  const journal = unknown();
  const server = candidate();
  server.snapshot = { ...server.snapshot, state: 'paused', elapsedMs: 5000, observedClock: clock(6000) };
  const match = recovery.reconcileLegacyUnknownStart(journal, context(journal, [server]));
  assert.equal(match.kind, 'acknowledge');
  const saved = domain.applyJournalAction(journal, match.action);
  assert.equal(saved.records[0].state, 'paused');
  assert.equal(saved.records[0].elapsedMs, 5000);
  assert.equal(saved.records[0].endsAtMs, null);
  assert.equal(saved.records[0].sync.receipt, null);
  assert.equal(saved.commands.length, 1);
});

test('mismatch or ambiguity preserves unknown work and its exact durable bytes', async () => {
  for (const sessions of [
    [candidate({ setup: { ...candidate().setup, targetSeconds: 60 } })],
    [candidate(), candidate({ snapshot: { ...candidate().snapshot, serverSessionId: OTHER_SERVER } })],
    [],
  ]) {
    const storage = memoryStorage();
    const store = storeApi.createSessionJournalStore(storage, SCOPE);
    await store.update(journal => act(journal, { type: 'admit', epoch: 1 }));
    await store.update(journal => act(journal, { type: 'prepare_start', operationId: START, clientSessionId: CLIENT, setup: clone(SETUP), clock: clock(0) }));
    await store.update(journal => act(journal, { type: 'mark_unknown', operationId: START }));
    const before = storage.values.get(store.key), writes = storage.commits.length;
    const loaded = (await store.load()).journal;
    assert.equal(recovery.reconcileLegacyUnknownStart(loaded, context(loaded, sessions)).kind, 'unreconciled');
    assert.equal(storage.values.get(store.key), before);
    assert.equal(storage.commits.length, writes);
    assert.equal((await store.load()).journal.commands[0].status, 'unknown');
    assert.throws(() => act(loaded, { type: 'prepare_start', operationId: OTHER_START, clientSessionId: OTHER_CLIENT, setup: clone(SETUP), clock: clock(5000) }));
  }
});

test('complete-list proof cannot come from a limited or different owner read', () => {
  const journal = unknown();
  const request = context(journal);
  request.openSessions.complete = false;
  skipped(journal, request, 'incomplete_server_read');
  const foreignRead = context(journal);
  foreignRead.openSessions.scope = OTHER_SCOPE;
  skipped(journal, foreignRead, 'server_scope_mismatch');
  skipped(journal, context(journal, [candidate({ scope: OTHER_SCOPE })]), 'server_scope_mismatch');
  skipped(journal, context(journal, [candidate({ scope: { ...SCOPE, backendId: 'other-backend' } })]), 'server_scope_mismatch');
  skipped(journal, context(journal, [], { verifiedScope: OTHER_SCOPE }), 'scope_mismatch');
});

test('prepared requests, stale callbacks and revoked admissions are never reconciled', () => {
  const draft = prepared();
  skipped(draft, context(draft), 'not_unknown_start');
  const journal = unknown();
  skipped(journal, context(journal, [candidate()], { expectedRevision: journal.revision - 1 }), 'stale_revision');
  skipped(journal, context(journal, [candidate()], { epoch: journal.admission.epoch - 1 }), 'stale_epoch');
  skipped(journal, context(journal, [candidate()], { operationId: OTHER_START }), 'unknown_operation');
  const revoked = act(journal, { type: 'revoke' });
  skipped(revoked, context(revoked), 'inactive_admission');
});

test('unknown controls and invalid evidence cannot be mistaken for an unknown start', () => {
  let journal = act(prepared(), { type: 'acknowledge_start', operationId: START, snapshot: candidate().snapshot });
  journal = act(journal, { type: 'prepare_transition', operationId: CANCEL, clientSessionId: CLIENT, kind: 'pause', clock: clock(5000) });
  journal = act(journal, { type: 'mark_unknown', operationId: CANCEL });
  skipped(journal, context(journal, [candidate()], { operationId: CANCEL }), 'not_unknown_start');
  const draft = unknown();
  const invalidScope = context(draft);
  invalidScope.verifiedScope.ownerId = 'invalid-owner';
  skipped(draft, invalidScope, 'invalid_input');
  const corrupt = clone(draft);
  corrupt.commands[0].request = {};
  skipped(corrupt, context(corrupt), 'invalid_journal');
  const unreadable = context(draft);
  unreadable.openSessions.sessions = null;
  skipped(draft, unreadable, 'invalid_input');
});

test('every original setup identity field must match, rather than just target or title', () => {
  const journal = unknown();
  for (const mismatch of [
    { targetSeconds: 60 }, { activityType: 'work' }, { taskId: null }, { subjectId: null },
    { notes: 'A different chapter' },
  ]) {
    const server = candidate();
    server.setup = { ...server.setup, ...mismatch };
    skipped(journal, context(journal, [server]), 'setup_mismatch');
  }
  const missingNotes = candidate();
  delete missingNotes.setup.notes;
  skipped(journal, context(journal, [missingNotes]), 'invalid_server_snapshot');
});

test('start matching is bounded to fifteen seconds and never adopts a delayed candidate', () => {
  const journal = unknown();
  assert.equal(recovery.LEGACY_START_MATCH_WINDOW_MS, 15000);
  for (const offset of [-15000, 15000]) {
    const server = candidate();
    server.snapshot.startedAtMs = T0 + offset;
    server.snapshot.observedClock = clock(30000);
    assert.equal(recovery.reconcileLegacyUnknownStart(journal, context(journal, [server])).kind, 'acknowledge');
  }
  for (const offset of [-15001, 15001, 60000]) {
    const server = candidate();
    server.snapshot.startedAtMs = T0 + offset;
    skipped(journal, context(journal, [server]), 'start_time_mismatch');
  }
});

test('a known server identity is not adopted again under a fresh local start', () => {
  let journal = act(domain.createJournal(SCOPE), { type: 'admit', epoch: 1 });
  journal = act(journal, { type: 'prepare_start', operationId: OTHER_START, clientSessionId: OTHER_CLIENT, setup: clone(SETUP), clock: clock(0) });
  journal = act(journal, { type: 'acknowledge_start', operationId: OTHER_START, snapshot: { ...candidate().snapshot, startedAtMs: T0, elapsedMs: 0, observedClock: clock(0) } });
  journal = act(journal, { type: 'prepare_transition', operationId: CANCEL, clientSessionId: OTHER_CLIENT, kind: 'cancel', clock: clock(1000) });
  journal = act(journal, { type: 'acknowledge_transition', operationId: CANCEL, snapshot: { serverSessionId: SERVER, state: 'cancelled', startedAtMs: T0, elapsedMs: 1000, observedClock: clock(1000) } });
  journal = act(journal, { type: 'prepare_start', operationId: START, clientSessionId: CLIENT, setup: clone(SETUP), clock: clock(0) });
  journal = act(journal, { type: 'mark_unknown', operationId: START });
  skipped(journal, context(journal), 'server_session_already_known');
});

test('large clock changes and invalid server timing remain unreconciled without rewards', () => {
  const journal = unknown();
  const jumped = candidate();
  jumped.snapshot.observedClock = { ...clock(4000), wallTimeMs: T0 + 60000 };
  skipped(journal, context(journal, [jumped]), 'clock_changed');
  const reversed = candidate();
  reversed.snapshot.observedClock.monotonicTimeMs = 999;
  skipped(journal, context(journal, [reversed]), 'clock_changed');
  for (const bad of [
    { state: 'cancelled' }, { elapsedMs: -1 }, { elapsedMs: NaN }, { startedAtMs: 8640000000000001 },
  ]) {
    const server = candidate();
    server.snapshot = { ...server.snapshot, ...bad };
    skipped(journal, context(journal, [server]), 'invalid_server_snapshot');
  }
  assert.equal(journal.records[0].sync.receipt, null);
  assert.equal(journal.records[0].state, 'not_started');
});

test('recovery output is detached and an old result cannot cross a new epoch', () => {
  const journal = unknown();
  const server = candidate();
  const request = context(journal, [server]);
  const result = recovery.reconcileLegacyUnknownStart(journal, request);
  assert.equal(result.kind, 'acknowledge');
  const originalAction = clone(result.action);
  result.action.snapshot.observedClock.wallTimeMs += 1;
  assert.equal(server.snapshot.observedClock.wallTimeMs, T0 + 4000);
  const readmitted = act(journal, { type: 'admit', epoch: 2 });
  assert.throws(() => domain.applyJournalAction(readmitted, originalAction));
  assert.equal(readmitted.commands[0].status, 'unknown');
  assert.equal(readmitted.records[0].serverSessionId, null);
});
