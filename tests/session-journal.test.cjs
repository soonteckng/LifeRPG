/* global __dirname, Buffer */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Load the actual portable TypeScript modules, using the existing repo's CJS pattern.
// Keeping one module cache also preserves error class identity across these imports.
const modules = new Map();
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = { exports: {} };
  modules.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!name.startsWith('.')) return require(name);
    const dependency = path.resolve(path.dirname(filename), name);
    return load(path.relative(path.resolve(__dirname, '..'), dependency.endsWith('.ts') ? dependency : `${dependency}.ts`));
  }, mod, mod.exports);
  return mod.exports;
}

const domain = load('src/utils/sessionJournal.ts');
const schema = load('src/utils/sessionJournalSchema.ts');
const wire = load('src/types/sessionJournal.ts');
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/session-journal-v1.json'), 'utf8'));

const SCOPE = vectors.scope;
const OTHER_SCOPE = { ...SCOPE, ownerId: '22222222-2222-4222-8222-222222222222' };
const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SERVER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_SERVER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const START = '10000000-0000-4000-8000-000000000001';
const PAUSE = '10000000-0000-4000-8000-000000000002';
const RESUME = '10000000-0000-4000-8000-000000000003';
const CANCEL = '10000000-0000-4000-8000-000000000004';
const COMPLETE = '10000000-0000-4000-8000-000000000005';
const SECOND_START = '10000000-0000-4000-8000-000000000006';
const SECOND_CLIENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const T0 = vectors.clock.wallTimeMs;
const SETUP = vectors.setup;
const clone = value => JSON.parse(JSON.stringify(value));
const clock = (elapsedMs = 0, overrides = {}) => ({
  wallTimeMs: T0 + elapsedMs,
  monotonicTimeMs: vectors.clock.monotonicTimeMs + elapsedMs,
  bootId: vectors.clock.bootId,
  ...overrides,
});
const command = (journal, operationId) => journal.commands.find(item => item.operationId === operationId);
const record = (journal, clientSessionId = CLIENT) => journal.records.find(item => item.clientSessionId === clientSessionId);
function act(journal, action) {
  return domain.applyJournalAction(journal, {
    epoch: journal.admission.epoch,
    expectedRevision: journal.revision,
    ...action,
  });
}
function admitted() {
  return act(domain.createJournal(SCOPE), { type: 'admit', epoch: 1 });
}
function preparedStart() {
  return act(admitted(), {
    type: 'prepare_start', operationId: START, clientSessionId: CLIENT,
    setup: clone(SETUP), clock: clock(),
  });
}
function snapshot(state, elapsedMs = 0, observationMs = elapsedMs, serverSessionId = SERVER) {
  return { serverSessionId, state, startedAtMs: T0, elapsedMs, observedClock: clock(observationMs) };
}
function running() {
  return act(preparedStart(), { type: 'acknowledge_start', operationId: START, snapshot: snapshot('running') });
}
function paused(elapsedMs = 4250, observationMs = 5000) {
  let journal = act(running(), {
    type: 'prepare_transition', operationId: PAUSE, clientSessionId: CLIENT, kind: 'pause', clock: clock(4000),
  });
  return act(journal, { type: 'acknowledge_transition', operationId: PAUSE, snapshot: snapshot('paused', elapsedMs, observationMs) });
}
function completed() {
  return act(running(), { type: 'expire', operationId: COMPLETE, clientSessionId: CLIENT, clock: clock(30000) });
}
function receipt(overrides = {}) {
  return {
    sessionId: SERVER, durationSeconds: 30,
    result: { session_id: SERVER, duration_seconds: 30, character_xp_earned: 0, character_remainder_seconds: 30 },
    ...overrides,
  };
}
function acceptedJournalWithRecords(count) {
  const saved = act(completed(), { type: 'acknowledge_completion', operationId: COMPLETE, receipt: receipt() });
  const seed = record(saved);
  return {
    ...saved, commands: [],
    records: Array.from({ length: count }, (_, index) => {
      const item = clone(seed);
      const suffix = String(index + 1).padStart(12, '0');
      item.clientSessionId = `30000000-0000-4000-8000-${suffix}`;
      item.serverSessionId = `40000000-0000-4000-8000-${suffix}`;
      item.sync.receipt.sessionId = item.serverSessionId;
      item.sync.receipt.result.session_id = item.serverSessionId;
      return item;
    }),
  };
}
function rejectsWireMutation(journal, mutate) {
  const value = clone(journal);
  mutate(value);
  throwsCode(() => schema.validateJournalEnvelope(value, SCOPE), 'invalid_record');
  throwsCode(() => schema.parseJournalEnvelope(JSON.stringify(value), SCOPE), 'invalid_record');
}
function throwsCode(fn, code) {
  assert.throws(fn, error => error && error.code === code, `Expected ${code}`);
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('a new journal requires explicit admission before preparing work', () => {
  const journal = domain.createJournal(SCOPE);
  assert.equal(journal.schemaVersion, 1);
  assert.deepEqual(journal.scope, SCOPE);
  assert.equal(journal.revision, 0);
  assert.deepEqual(journal.admission, { epoch: 0, active: false });
  assert.deepEqual(journal.records, []);
  assert.deepEqual(journal.commands, []);
  throwsCode(() => act(journal, {
    type: 'prepare_start', operationId: START, clientSessionId: CLIENT, setup: SETUP, clock: clock(),
  }), 'inactive_admission');
});

test('prepared start is durable intent, never a confirmed running session', () => {
  const before = deepFreeze(admitted());
  const action = deepFreeze({ type: 'prepare_start', operationId: START, clientSessionId: CLIENT, setup: clone(SETUP), clock: clock() });
  const journal = act(before, action);
  assert.equal(record(journal).state, 'not_started');
  assert.equal(record(journal).serverSessionId, null);
  assert.equal(record(journal).endsAtMs, null);
  assert.equal(record(journal).sync.receipt, null);
  assert.equal(command(journal, START).status, 'prepared');
  assert.deepEqual(before.records, []);
  assert.deepEqual(before.commands, []);
  assert.equal(journal.revision, before.revision + 1);
  assert.deepEqual(schema.parseJournalEnvelope(schema.serializeJournalEnvelope(journal), SCOPE), journal);
});

test('authoritative start acknowledgement supplies mapping and the existing deadline', () => {
  const journal = act(preparedStart(), {
    type: 'acknowledge_start', operationId: START,
    snapshot: snapshot('running', 1750, 2500),
  });
  assert.equal(record(journal).state, 'running');
  assert.equal(record(journal).serverSessionId, SERVER);
  assert.equal(record(journal).elapsedMs, 1750);
  assert.equal(record(journal).endsAtMs, T0 + 2500 + 28250);
  assert.equal(command(journal, START).status, 'acknowledged');
  assert.deepEqual(domain.deriveJournalTimer(record(journal), clock(3500)), {
    elapsedMs: 2750, remainingMs: 27250, expired: false, clockWarning: false,
  });
  assert.equal(record(journal).sync.receipt, null);
});

test('preparing pause or cancellation retains the last confirmed running state', () => {
  for (const [kind, operationId] of [['pause', PAUSE], ['cancel', CANCEL]]) {
    const before = running();
    const journal = act(before, { type: 'prepare_transition', operationId, clientSessionId: CLIENT, kind, clock: clock(4000) });
    assert.equal(record(journal).state, 'running');
    assert.equal(record(journal).endsAtMs, record(before).endsAtMs);
    assert.equal(record(journal).elapsedMs, record(before).elapsedMs);
    assert.equal(command(journal, operationId).status, 'prepared');
    assert.equal(record(journal).sync.receipt, null);
    assert.equal(record(before).state, 'running');
  }
});

test('server pause and resume snapshots preserve milliseconds and exclude paused time', () => {
  const pause = paused();
  assert.equal(record(pause).state, 'paused');
  assert.equal(record(pause).elapsedMs, 4250);
  assert.deepEqual(domain.deriveJournalTimer(record(pause), clock(60000)), {
    elapsedMs: 4250, remainingMs: 25750, expired: false, clockWarning: false,
  });
  const prepared = act(pause, { type: 'prepare_transition', operationId: RESUME, clientSessionId: CLIENT, kind: 'resume', clock: clock(60000) });
  assert.equal(record(prepared).state, 'paused');
  assert.equal(record(prepared).elapsedMs, 4250);
  const resumed = act(prepared, {
    type: 'acknowledge_transition', operationId: RESUME,
    snapshot: snapshot('running', 4250, 62000),
  });
  assert.equal(record(resumed).endsAtMs, T0 + 87750);
  assert.deepEqual(domain.deriveJournalTimer(record(resumed), clock(62751)), {
    elapsedMs: 5001, remainingMs: 24999, expired: false, clockWarning: false,
  });
});

test('lost ACK retains confirmed state and prevents timing or completion guesses while End is a safe escape', () => {
  let journal = act(running(), { type: 'prepare_transition', operationId: PAUSE, clientSessionId: CLIENT, kind: 'pause', clock: clock(4000) });
  journal = act(journal, { type: 'mark_unknown', operationId: PAUSE });
  assert.equal(record(journal).state, 'running');
  assert.equal(command(journal, PAUSE).status, 'unknown');
  throwsCode(() => act(journal, { type: 'prepare_transition', operationId: RESUME, clientSessionId: CLIENT, kind: 'resume', clock: clock(6000) }), 'unresolved_command');
  throwsCode(() => act(journal, { type: 'expire', operationId: COMPLETE, clientSessionId: CLIENT, clock: clock(30000) }), 'unresolved_command');
  const resolved = act(journal, { type: 'acknowledge_transition', operationId: PAUSE, snapshot: snapshot('paused', 4250, 5000) });
  assert.equal(record(resolved).state, 'paused');
  assert.equal(command(resolved, PAUSE).status, 'acknowledged');
  const ending = act(journal, { type: 'prepare_transition', operationId: CANCEL, clientSessionId: CLIENT, kind: 'cancel', clock: clock(6000) });
  assert.equal(command(ending, PAUSE).status, 'superseded');
  assert.equal(command(ending, CANCEL).status, 'prepared');
});

test('unknown start is not another start and can reconcile under the original operation ID', () => {
  const journal = act(preparedStart(), { type: 'mark_unknown', operationId: START });
  assert.equal(record(journal).state, 'not_started');
  assert.equal(command(journal, START).status, 'unknown');
  throwsCode(() => act(journal, {
    type: 'prepare_start', operationId: SECOND_START, clientSessionId: SECOND_CLIENT, setup: SETUP, clock: clock(1000),
  }), 'unresolved_command');
  const resolved = act(journal, { type: 'acknowledge_start', operationId: START, snapshot: snapshot('running', 1000, 1000) });
  assert.equal(resolved.records.length, 1);
  assert.equal(resolved.commands.length, 1);
  assert.equal(record(resolved).serverSessionId, SERVER);
});

test('duplicate commands retain one immutable request and reject changed payloads', () => {
  const journal = preparedStart();
  const repeated = act(journal, { type: 'prepare_start', operationId: START, clientSessionId: CLIENT, setup: clone(SETUP), clock: clock() });
  assert.deepEqual(repeated, journal);
  assert.equal(repeated.revision, journal.revision);
  const uncertain = act(journal, { type: 'mark_unknown', operationId: START });
  assert.deepEqual(act(uncertain, { type: 'prepare_start', operationId: START, clientSessionId: CLIENT, setup: clone(SETUP), clock: clock() }), uncertain);
  throwsCode(() => act(uncertain, { type: 'prepare_start', operationId: START, clientSessionId: CLIENT, setup: { ...SETUP, targetSeconds: 60 }, clock: clock() }), 'operation_conflict');
  throwsCode(() => act(uncertain, { type: 'prepare_start', operationId: START, clientSessionId: SECOND_CLIENT, setup: SETUP, clock: clock() }), 'operation_conflict');
  assert.equal(uncertain.records.length, 1);
  assert.equal(uncertain.commands.length, 1);
});

test('returned envelopes and queue views cannot mutate an earlier durable snapshot', () => {
  const before = preparedStart();
  const replay = act(before, { type: 'prepare_start', operationId: START, clientSessionId: CLIENT, setup: clone(SETUP), clock: clock() });
  replay.records[0].setup.title = 'Changed outside the journal';
  replay.commands[0].request.setup.title = 'Changed outside the command';
  assert.equal(before.records[0].setup.title, SETUP.title);
  assert.equal(before.commands[0].request.setup.title, SETUP.title);
  const pending = completed();
  const views = domain.pendingServerCompletions(pending, SCOPE);
  views[0].setup.title = 'Changed queue display';
  views[0].sync.state = 'synced';
  assert.equal(record(pending).setup.title, SETUP.title);
  assert.equal(record(pending).sync.state, 'pending');
});

test('cancel acknowledgements are terminal and never generate a completion receipt', () => {
  let journal = act(running(), { type: 'prepare_transition', operationId: CANCEL, clientSessionId: CLIENT, kind: 'cancel', clock: clock(10000) });
  journal = act(journal, { type: 'acknowledge_transition', operationId: CANCEL, snapshot: snapshot('cancelled', 10000, 10000) });
  assert.equal(record(journal).state, 'cancelled');
  assert.equal(record(journal).sync.receipt, null);
  assert.deepEqual(domain.pendingServerCompletions(journal, SCOPE), []);
  assert.throws(() => act(journal, { type: 'expire', operationId: COMPLETE, clientSessionId: CLIENT, clock: clock(60000) }));
  assert.throws(() => act(journal, { type: 'prepare_transition', operationId: RESUME, clientSessionId: CLIENT, kind: 'resume', clock: clock(20000) }));
});

test('only full-target expiry creates a durable pending completion, once', () => {
  const before = running();
  throwsCode(() => act(before, { type: 'expire', operationId: COMPLETE, clientSessionId: CLIENT, clock: clock(29999) }), 'not_expired');
  const journal = act(before, { type: 'expire', operationId: COMPLETE, clientSessionId: CLIENT, clock: clock(35000) });
  assert.equal(record(journal).state, 'completed');
  assert.equal(record(journal).elapsedMs, 30000);
  assert.equal(record(journal).completedAtMs, T0 + 30000);
  assert.equal(record(journal).observedAtMs, T0 + 35000);
  assert.equal(record(journal).sync.state, 'pending');
  assert.equal(record(journal).sync.receipt, null);
  assert.equal(command(journal, COMPLETE).status, 'prepared');
  const replay = act(journal, { type: 'expire', operationId: COMPLETE, clientSessionId: CLIENT, clock: clock(35000) });
  assert.deepEqual(replay, journal);
  assert.equal(journal.commands.filter(item => item.kind === 'complete').length, 1);
  assert.equal(domain.pendingServerCompletions(journal, SCOPE).length, 1);
  throwsCode(() => act(journal, { type: 'prepare_start', operationId: SECOND_START, clientSessionId: SECOND_CLIENT, setup: SETUP, clock: clock(40000) }), 'unresolved_command');
});

test('an acknowledged pause can complete only when the server snapshot reached the full target', () => {
  const partial = paused(29999, 30000);
  throwsCode(() => act(partial, { type: 'expire', operationId: COMPLETE, clientSessionId: CLIENT, clock: clock(60000) }), 'not_expired');
  const full = paused(30000, 30250);
  const journal = act(full, { type: 'expire', operationId: COMPLETE, clientSessionId: CLIENT, clock: clock(60000) });
  assert.equal(record(journal).state, 'completed');
  assert.equal(record(journal).elapsedMs, 30000);
  assert.equal(record(journal).completedAtMs, T0 + 30250);
  assert.equal(record(journal).sync.receipt, null);
});

test('a wall clock jump cannot create a completed session before monotonic target time', () => {
  const journal = running();
  const jumped = clock(1000, { wallTimeMs: T0 + 60000 });
  assert.equal(domain.deriveJournalTimer(record(journal), jumped).expired, false);
  assert.throws(() => act(journal, { type: 'expire', operationId: COMPLETE, clientSessionId: CLIENT, clock: jumped }));
  assert.equal(record(journal).state, 'running');
  assert.equal(journal.commands.length, 1);
});

test('matching server receipt alone marks completion synced; retries never add work', () => {
  const pending = completed();
  const savedReceipt = receipt();
  const journal = act(pending, { type: 'acknowledge_completion', operationId: COMPLETE, receipt: savedReceipt });
  assert.equal(record(journal).state, 'completed');
  assert.equal(record(journal).sync.state, 'synced');
  assert.deepEqual(record(journal).sync.receipt, savedReceipt);
  assert.equal(command(journal, COMPLETE).status, 'acknowledged');
  assert.deepEqual(domain.pendingServerCompletions(journal, SCOPE), []);
  const replay = act(journal, { type: 'acknowledge_completion', operationId: COMPLETE, receipt: clone(savedReceipt) });
  assert.deepEqual(replay, journal);
  assert.equal(replay.records.length, 1);
  assert.equal(replay.commands.filter(item => item.kind === 'complete').length, 1);
  const next = act(journal, { type: 'prepare_start', operationId: SECOND_START, clientSessionId: SECOND_CLIENT, setup: SETUP, clock: clock(40000) });
  assert.equal(next.records.length, 2);
  assert.equal(record(next).sync.state, 'synced');
  assert.equal(record(next, SECOND_CLIENT).state, 'not_started');
});

test('wrong identity, partial duration or changed saved receipt never settles pending work', () => {
  const journal = completed();
  for (const wrong of [
    receipt({ sessionId: OTHER_SERVER }), receipt({ durationSeconds: 29 }), receipt({ durationSeconds: 31 }),
    receipt({ result: { session_id: OTHER_SERVER, duration_seconds: 30 } }),
    receipt({ result: { session_id: SERVER, duration_seconds: 29 } }),
  ]) {
    throwsCode(() => act(journal, { type: 'acknowledge_completion', operationId: COMPLETE, receipt: wrong }), 'receipt_conflict');
    assert.equal(record(journal).sync.state, 'pending');
    assert.equal(record(journal).sync.receipt, null);
  }
  const saved = act(journal, { type: 'acknowledge_completion', operationId: COMPLETE, receipt: receipt() });
  throwsCode(() => act(saved, { type: 'acknowledge_completion', operationId: COMPLETE, receipt: receipt({ result: { altered: true } }) }), 'receipt_conflict');
});

test('a server retry may change acknowledgement flags but cannot change saved economic credit', () => {
  const firstReceipt = receipt({ result: {
    session_id: SERVER, duration_seconds: 30, already_completed: false, goal_reached_now: true,
    character_xp_earned: 1, character_remainder_seconds: 0, credited_date: '2027-01-15',
  } });
  const saved = act(completed(), { type: 'acknowledge_completion', operationId: COMPLETE, receipt: firstReceipt });
  const retryReceipt = clone(firstReceipt);
  retryReceipt.result.already_completed = true;
  retryReceipt.result.goal_reached_now = false;
  const replay = act(saved, { type: 'acknowledge_completion', operationId: COMPLETE, receipt: retryReceipt });
  assert.deepEqual(record(replay).sync.receipt, firstReceipt);
  assert.equal(replay.revision, saved.revision);
  const changedCredit = clone(retryReceipt);
  changedCredit.result.character_xp_earned = 2;
  assert.throws(() => act(saved, { type: 'acknowledge_completion', operationId: COMPLETE, receipt: changedCredit }));
  const changedDate = clone(retryReceipt);
  changedDate.result.credited_date = '2027-01-16';
  assert.throws(() => act(saved, { type: 'acknowledge_completion', operationId: COMPLETE, receipt: changedDate }));
});

test('non-JSON or credential-bearing receipts cannot be sanitized into accepted results', () => {
  const pending = completed();
  for (const result of [
    { value: undefined }, { value: NaN }, { value: Infinity }, { value() {} },
    { toJSON() { return { accepted: true }; } },
    { nested: { access_token: 'fixture_not_a_credential' } },
  ]) {
    assert.throws(() => act(pending, { type: 'acknowledge_completion', operationId: COMPLETE, receipt: receipt({ result }) }));
    assert.equal(record(pending).sync.state, 'pending');
    assert.equal(record(pending).sync.receipt, null);
  }
});

test('wrong server identity or action state cannot acknowledge a control', () => {
  const journal = act(running(), { type: 'prepare_transition', operationId: PAUSE, clientSessionId: CLIENT, kind: 'pause', clock: clock(4000) });
  throwsCode(() => act(journal, { type: 'acknowledge_transition', operationId: PAUSE, snapshot: snapshot('paused', 4000, 4000, OTHER_SERVER) }), 'snapshot_conflict');
  throwsCode(() => act(journal, { type: 'acknowledge_transition', operationId: PAUSE, snapshot: snapshot('running', 4000, 4000) }), 'snapshot_conflict');
  assert.equal(record(journal).state, 'running');
  assert.equal(command(journal, PAUSE).status, 'prepared');
});

test('rejected requests preserve the record and do not fabricate completion', () => {
  const rejectedStart = act(preparedStart(), { type: 'reject_command', operationId: START, reasonCode: 'server_rejected' });
  assert.equal(record(rejectedStart).state, 'cancelled');
  assert.equal(record(rejectedStart).sync.state, 'rejected');
  assert.equal(record(rejectedStart).sync.receipt, null);
  const prepared = act(running(), { type: 'prepare_transition', operationId: PAUSE, clientSessionId: CLIENT, kind: 'pause', clock: clock(4000) });
  const rejectedPause = act(prepared, { type: 'reject_command', operationId: PAUSE, reasonCode: 'state_conflict' });
  assert.equal(record(rejectedPause).state, 'running');
  assert.equal(record(rejectedPause).endsAtMs, record(prepared).endsAtMs);
  const rejectedComplete = act(completed(), { type: 'reject_command', operationId: COMPLETE, reasonCode: 'server_rejected' });
  assert.equal(record(rejectedComplete).state, 'completed');
  assert.equal(record(rejectedComplete).sync.state, 'rejected');
  assert.equal(record(rejectedComplete).sync.receipt, null);
  assert.deepEqual(domain.pendingServerCompletions(rejectedComplete, SCOPE), []);
});

test('rejected start is retained without a server ID and does not block a fresh start', () => {
  const rejected = act(preparedStart(), { type: 'reject_command', operationId: START, reasonCode: 'server_rejected' });
  const next = act(rejected, {
    type: 'prepare_start', operationId: SECOND_START, clientSessionId: SECOND_CLIENT, setup: SETUP, clock: clock(1000),
  });
  assert.equal(next.records.length, 2);
  assert.equal(record(next).state, 'cancelled');
  assert.equal(record(next).serverSessionId, null);
  assert.equal(record(next).sync.state, 'rejected');
  assert.equal(record(next, SECOND_CLIENT).state, 'not_started');
  assert.equal(command(next, START).status, 'rejected');
  assert.equal(command(next, SECOND_START).status, 'prepared');
});

test('revocation rejects stale callbacks; a later admission can process the same owner queue', () => {
  const pending = completed();
  const oldEpoch = pending.admission.epoch;
  const revoked = act(pending, { type: 'revoke' });
  assert.equal(revoked.admission.active, false);
  assert.ok(revoked.admission.epoch > oldEpoch);
  assert.deepEqual(revoked.records, pending.records);
  assert.deepEqual(revoked.commands, pending.commands);
  assert.throws(() => domain.applyJournalAction(revoked, { type: 'acknowledge_completion', operationId: COMPLETE, receipt: receipt(), epoch: oldEpoch, expectedRevision: revoked.revision }));
  const readmitted = act(revoked, { type: 'admit', epoch: revoked.admission.epoch + 1 });
  assert.deepEqual(readmitted.records, pending.records);
  assert.deepEqual(readmitted.commands, pending.commands);
  assert.equal(domain.pendingServerCompletions(readmitted, SCOPE).length, 1);
  const saved = act(readmitted, { type: 'acknowledge_completion', operationId: COMPLETE, receipt: receipt() });
  assert.equal(record(saved).sync.state, 'synced');
});

test('revision and epoch checks reject races without modifying the durable envelope', () => {
  const journal = running();
  const before = clone(journal);
  const action = { type: 'prepare_transition', operationId: PAUSE, clientSessionId: CLIENT, kind: 'pause', clock: clock(4000) };
  throwsCode(() => domain.applyJournalAction(journal, { ...action, epoch: journal.admission.epoch, expectedRevision: journal.revision - 1 }), 'stale_revision');
  throwsCode(() => domain.applyJournalAction(journal, { ...action, epoch: journal.admission.epoch - 1, expectedRevision: journal.revision }), 'stale_epoch');
  assert.deepEqual(journal, before);
  throwsCode(() => act(journal, { type: 'admit', epoch: journal.admission.epoch }), 'stale_epoch');
});

test('pending completion reads are account and backend isolated', () => {
  const journal = completed();
  throwsCode(() => domain.pendingServerCompletions(journal, OTHER_SCOPE), 'scope_mismatch');
  throwsCode(() => domain.pendingServerCompletions(journal, { ...SCOPE, backendId: 'different-backend' }), 'scope_mismatch');
  const waiting = act(journal, { type: 'defer_sync', clientSessionId: CLIENT, nowMs: T0 + 40000, delayMs: 5000, reasonCode: 'sign_in_required', waitingAuth: true });
  assert.equal(record(waiting).sync.state, 'waiting_auth');
  assert.equal(record(waiting).sync.nextAttemptAtMs, T0 + 45000);
  assert.equal(domain.pendingServerCompletions(waiting, SCOPE).length, 1);
  assert.equal(record(waiting).completedAtMs, record(journal).completedAtMs);
  assert.equal(record(waiting).sync.receipt, null);
});

test('Slice A normal completion queue never sends future client-reported work', () => {
  const journal = completed();
  journal.records[0].verification = 'client_reported';
  schema.validateJournalEnvelope(journal, SCOPE);
  assert.deepEqual(domain.pendingServerCompletions(journal, SCOPE), []);
  assert.equal(record(journal).state, 'completed');
  assert.equal(record(journal).sync.state, 'pending');
  assert.equal(record(journal).sync.receipt, null);
});

for (const vector of vectors.timerVectors) {
  test(`shared timer vector: ${vector.name}`, () => {
    const fixture = { ...clone(vectors.runningRecord), ...clone(vector.recordOverrides || {}) };
    assert.deepEqual(domain.deriveJournalTimer(fixture, vector.clock), vector.expected);
  });
}

for (const vector of vectors.actionVectors) {
  test(`shared action vector: ${vector.name}`, () => {
    let journal = vector.initialJournal
      ? schema.validateJournalEnvelope(clone(vector.initialJournal), vectors.scope)
      : domain.createJournal(vectors.scope);
    for (const step of vector.actions) {
      if (step.expectedErrorCode) {
        throwsCode(() => domain.applyJournalAction(journal, step.action), step.expectedErrorCode);
      } else {
        journal = domain.applyJournalAction(journal, step.action);
      }
    }
    assert.equal(journal.revision, vector.expected.revision);
    assert.deepEqual(journal.admission, vector.expected.admission);
    assert.deepEqual(journal.records.map(item => item.state), vector.expected.recordStates);
    assert.deepEqual(journal.commands.map(item => item.status), vector.expected.commandStatuses);
    if (vector.expected.dismissedAtMs) assert.deepEqual(journal.records.map(item => item.dismissedAtMs), vector.expected.dismissedAtMs);
    if (vector.expected.clientSessionIds) assert.deepEqual(journal.records.map(item => item.clientSessionId), vector.expected.clientSessionIds);
  });
}

for (const vector of vectors.parserVectors) {
  test(`shared parser vector: ${vector.name}`, () => {
    throwsCode(() => schema.parseJournalEnvelope(vector.raw, vectors.scope), vector.expectedErrorCode);
  });
}

test('validated serialization restores both unknown requests and pending completion receipts', () => {
  const pending = act(completed(), { type: 'mark_unknown', operationId: COMPLETE });
  const parsed = schema.parseJournalEnvelope(schema.serializeJournalEnvelope(pending), SCOPE);
  assert.deepEqual(parsed, pending);
  assert.equal(command(parsed, COMPLETE).status, 'unknown');
  assert.equal(domain.pendingServerCompletions(parsed, SCOPE).length, 1);
  const saved = act(parsed, { type: 'acknowledge_completion', operationId: COMPLETE, receipt: receipt() });
  assert.deepEqual(schema.parseJournalEnvelope(schema.serializeJournalEnvelope(saved), SCOPE), saved);
});

test('malformed versions, scopes and unexpected credential-bearing data are rejected', () => {
  const baseline = running();
  const corruptions = [
    { ...baseline, schemaVersion: 2 },
    { ...baseline, unexpected: true },
    { ...baseline, access_token: 'fixture_not_a_credential' },
    { ...baseline, scope: { ...SCOPE, ownerId: 'invalid-uuid' } },
    { ...baseline, revision: 1.5 },
    { ...baseline, revision: -1 },
  ];
  for (const value of corruptions) assert.throws(() => schema.validateJournalEnvelope(value, SCOPE));
  throwsCode(() => schema.validateJournalEnvelope({ ...baseline, scope: OTHER_SCOPE }, SCOPE), 'scope_mismatch');
  const nested = clone(baseline);
  nested.commands[0].request.credentials = { refresh_token: 'fixture_not_a_credential' };
  assert.throws(() => schema.validateJournalEnvelope(nested, SCOPE));
  assert.throws(() => schema.validateJournalScope({ ...SCOPE, backendId: 'x'.repeat(2048) }));
  assert.throws(() => schema.validateJournalScope({ ...SCOPE, password: 'fixture_not_a_credential' }));
});

test('invalid targets, duplicate identities and unsafe wire numbers cannot enter the journal', () => {
  const baseline = running();
  for (const targetSeconds of [0, 28801, 1.5, NaN, Infinity]) {
    const value = clone(baseline);
    value.records[0].setup.targetSeconds = targetSeconds;
    assert.throws(() => schema.validateJournalEnvelope(value, SCOPE));
  }
  const duplicateRecord = clone(baseline);
  duplicateRecord.records.push(clone(duplicateRecord.records[0]));
  assert.throws(() => schema.validateJournalEnvelope(duplicateRecord, SCOPE));
  const duplicateOperation = clone(baseline);
  duplicateOperation.commands.push(clone(duplicateOperation.commands[0]));
  assert.throws(() => schema.validateJournalEnvelope(duplicateOperation, SCOPE));
  const unsafe = clone(baseline);
  unsafe.revision = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => schema.validateJournalEnvelope(unsafe, SCOPE));
  const invalidClock = clone(baseline);
  invalidClock.records[0].clockAnchor.monotonicTimeMs = -1;
  assert.throws(() => schema.validateJournalEnvelope(invalidClock, SCOPE));
});

test('start command wire payload must retain the actual setup and its original clock', () => {
  const journal = preparedStart();
  for (const mutate of [
    value => { value.commands[0].request = {}; },
    value => { value.commands[0].request.operationId = START; },
    value => { delete value.commands[0].request.clock; },
    value => { value.commands[0].request.setup.targetSeconds = 60; },
    value => { value.commands[0].request.setup.subjectId = 1; },
    value => { value.commands[0].request.clock.wallTimeMs += 1; },
    value => { value.commands[0].request.clock.monotonicTimeMs = null; },
  ]) rejectsWireMutation(journal, mutate);
});

test('control command wire payload has exactly the same server identity and captured clock', () => {
  const journal = act(running(), {
    type: 'prepare_transition', operationId: PAUSE, clientSessionId: CLIENT, kind: 'pause', clock: clock(4000),
  });
  for (const mutate of [
    value => { command(value, PAUSE).request = { serverSessionId: SERVER }; },
    value => { command(value, PAUSE).request.targetSeconds = 30; },
    value => { command(value, PAUSE).request.serverSessionId = OTHER_SERVER; },
    value => { command(value, PAUSE).request.clock.wallTimeMs += 1; },
    value => { command(value, PAUSE).request.clock.bootId = null; },
  ]) rejectsWireMutation(journal, mutate);
});

test('completion wire request cannot substitute identity, deadline or a partial target', () => {
  const journal = completed();
  assert.deepEqual(command(journal, COMPLETE).request, {
    serverSessionId: SERVER, completedAtMs: T0 + 30000, targetSeconds: 30,
  });
  for (const mutate of [
    value => { command(value, COMPLETE).request = {}; },
    value => { command(value, COMPLETE).request.clock = clock(30000); },
    value => { command(value, COMPLETE).request.serverSessionId = OTHER_SERVER; },
    value => { command(value, COMPLETE).request.completedAtMs -= 1; },
    value => { command(value, COMPLETE).request.targetSeconds = 29; },
  ]) rejectsWireMutation(journal, mutate);
  const runningJournal = running();
  rejectsWireMutation(runningJournal, value => { value.records[0].endsAtMs += 1; });
});

test('a single unresolved command must match the recorded activity state', () => {
  const start = preparedStart();
  rejectsWireMutation(start, value => { value.commands = []; });
  const pause = act(running(), {
    type: 'prepare_transition', operationId: PAUSE, clientSessionId: CLIENT, kind: 'pause', clock: clock(4000),
  });
  rejectsWireMutation(pause, value => { command(value, PAUSE).kind = 'resume'; });
  rejectsWireMutation(pause, value => {
    const second = clone(command(value, PAUSE));
    second.operationId = CANCEL;
    second.kind = 'cancel';
    value.commands.push(second);
  });
  const pending = completed();
  rejectsWireMutation(pending, value => { value.commands = value.commands.filter(item => item.kind !== 'complete'); });
  rejectsWireMutation(pending, value => { command(value, COMPLETE).status = 'acknowledged'; });
  rejectsWireMutation(pending, value => {
    const draft = preparedStart();
    draft.records[0].clientSessionId = SECOND_CLIENT;
    draft.commands[0].clientSessionId = SECOND_CLIENT;
    draft.commands[0].operationId = SECOND_START;
    value.records.push(draft.records[0]);
    value.commands.push(draft.commands[0]);
  });
});

test('a cancelled draft without a server identity requires its rejected start evidence', () => {
  const rejected = act(preparedStart(), { type: 'reject_command', operationId: START, reasonCode: 'server_rejected' });
  schema.validateJournalEnvelope(rejected, SCOPE);
  rejectsWireMutation(rejected, value => { value.commands = []; });
  rejectsWireMutation(rejected, value => { value.commands[0].status = 'acknowledged'; });
  rejectsWireMutation(rejected, value => { value.commands[0].clientSessionId = SECOND_CLIENT; });
});

test('stored synced receipts validate nested identity, full duration and boolean retry flags', () => {
  const saved = act(completed(), { type: 'acknowledge_completion', operationId: COMPLETE, receipt: receipt() });
  for (const mutate of [
    value => { value.records[0].sync.receipt.result.session_id = OTHER_SERVER; },
    value => { value.records[0].sync.receipt.result.duration_seconds = 29; },
    value => { value.records[0].sync.receipt.result.already_completed = 'true'; },
    value => { value.records[0].sync.receipt.result.goal_reached_now = 0; },
    value => { value.records[0].sync.receipt.result.already_completed = null; },
  ]) rejectsWireMutation(saved, mutate);
});

test('the named receipt validator rejects malformed JSON before replay flags are ignored', () => {
  schema.validateJournalReceipt(receipt());
  for (const wrong of [
    receipt({ result: { session_id: OTHER_SERVER } }),
    receipt({ result: { duration_seconds: 29 } }),
    receipt({ result: { already_completed: 'true' } }),
    receipt({ result: { goal_reached_now: undefined } }),
    receipt({ result: { access_token: 'fixture_not_a_credential' } }),
    receipt({ result: new Date(T0) }),
    { ...receipt(), extra: 'unexpected' },
  ]) throwsCode(() => schema.validateJournalReceipt(wrong), 'invalid_record');
});

test('wire dismissal metadata cannot conceal running, pending or unresolved work', () => {
  const rejected = act(preparedStart(), { type: 'reject_command', operationId: START, reasonCode: 'server_rejected' });
  const dismissed = act(rejected, { type: 'dismiss', clientSessionId: CLIENT, dismissedAtMs: T0 + 1000 });
  assert.equal(record(dismissed).dismissedAtMs, T0 + 1000);
  assert.deepEqual(schema.parseJournalEnvelope(schema.serializeJournalEnvelope(dismissed), SCOPE), dismissed);
  for (const value of [running(), completed(), preparedStart()])
    rejectsWireMutation(value, journal => { record(journal).dismissedAtMs = T0; });
  for (const wrong of [-1, 1.5, 'now', 8640000000000001])
    rejectsWireMutation(dismissed, journal => { record(journal).dismissedAtMs = wrong; });
  rejectsWireMutation(rejected, journal => { delete record(journal).dismissedAtMs; });
});

test('rejected completed records retain their matching rejection evidence after dismissal', () => {
  const rejected = act(completed(), { type: 'reject_command', operationId: COMPLETE, reasonCode: 'not_accepted' });
  const dismissed = act(rejected, { type: 'dismiss', clientSessionId: CLIENT, dismissedAtMs: T0 + 35000 });
  for (const journal of [rejected, dismissed]) {
    schema.validateJournalEnvelope(journal, SCOPE);
    rejectsWireMutation(journal, value => { value.commands = value.commands.filter(item => item.kind !== 'complete'); });
    rejectsWireMutation(journal, value => { command(value, COMPLETE).status = 'acknowledged'; });
  }
});

test('safe integers beyond the JavaScript date range are invalid wire timestamps', () => {
  const beyondDateRange = 8640000000000001;
  assert.ok(Number.isSafeInteger(beyondDateRange));
  assert.ok(Number.isNaN(new Date(beyondDateRange).getTime()));
  const pending = completed();
  for (const mutate of [
    value => { value.records[0].startedAtMs = beyondDateRange; },
    value => { value.records[0].observedAtMs = beyondDateRange; },
    value => { value.records[0].sync.nextAttemptAtMs = beyondDateRange; },
    value => {
      value.records[0].completedAtMs = beyondDateRange;
      command(value, COMPLETE).request.completedAtMs = beyondDateRange;
    },
    value => {
      command(value, START).createdAtMs = beyondDateRange;
      command(value, START).request.clock.wallTimeMs = beyondDateRange;
    },
  ]) rejectsWireMutation(pending, mutate);
});

test('journal byte and collection bounds fail before silently losing records', () => {
  throwsCode(() => schema.parseJournalEnvelope(' '.repeat(wire.JOURNAL_MAX_BYTES + 1), SCOPE), 'too_large');
  const multibyte = acceptedJournalWithRecords(wire.JOURNAL_MAX_RECORDS);
  for (const item of multibyte.records) item.setup.notes = 'é'.repeat(3000);
  schema.validateJournalEnvelope(multibyte, SCOPE);
  const raw = JSON.stringify(multibyte);
  assert.ok(raw.length < wire.JOURNAL_MAX_BYTES);
  assert.ok(Buffer.byteLength(raw, 'utf8') > wire.JOURNAL_MAX_BYTES);
  throwsCode(() => schema.parseJournalEnvelope(raw, SCOPE), 'too_large');
  schema.validateJournalEnvelope(acceptedJournalWithRecords(wire.JOURNAL_MAX_RECORDS), SCOPE);
  throwsCode(() => schema.validateJournalEnvelope(acceptedJournalWithRecords(wire.JOURNAL_MAX_RECORDS + 1), SCOPE), 'too_large');
  const historical = acceptedJournalWithRecords(1);
  historical.commands = Array.from({ length: wire.JOURNAL_MAX_COMMANDS }, (_, index) => ({
    operationId: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    clientSessionId: historical.records[0].clientSessionId,
    kind: index % 2 === 0 ? 'pause' : 'resume', status: 'acknowledged', createdAtMs: T0 + index,
    request: { serverSessionId: historical.records[0].serverSessionId, clock: clock(index) },
  }));
  schema.validateJournalEnvelope(historical, SCOPE);
  const extra = clone(historical.commands[0]);
  extra.operationId = '50000000-0000-4000-8000-000000001001';
  historical.commands.push(extra);
  throwsCode(() => schema.validateJournalEnvelope(historical, SCOPE), 'too_large');
});
