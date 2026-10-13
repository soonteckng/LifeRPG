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
    if (!name.startsWith('.')) throw new Error(`Unexpected external dependency: ${name}`);
    const dependency = path.resolve(path.dirname(filename), name);
    return load(path.relative(path.resolve(__dirname, '..'), dependency.endsWith('.ts') ? dependency : `${dependency}.ts`));
  }, mod, mod.exports);
  return mod.exports;
}
const domain = load('src/utils/sessionJournal.ts');
const countdown = load('src/utils/sessionCountdown.ts');
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/session-journal-v1.json'), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const SCOPE = vectors.scope, CLIENT = vectors.runningRecord.clientSessionId, SERVER = vectors.runningRecord.serverSessionId;
const START = '10000000-0000-4000-8000-000000000001';
const PAUSE = '10000000-0000-4000-8000-000000000002';
const END = '10000000-0000-4000-8000-000000000003';
const COMPLETE = '10000000-0000-4000-8000-000000000004';
const ACTION = '10000000-0000-4000-8000-000000000005';
const clock = elapsed => ({ wallTimeMs: vectors.clock.wallTimeMs + elapsed,
  monotonicTimeMs: vectors.clock.monotonicTimeMs + elapsed, bootId: vectors.clock.bootId });
const act = (journal, action) => domain.applyJournalAction(journal,
  { epoch: journal.admission.epoch, expectedRevision: journal.revision, ...action });
function prepared() {
  return act(act(domain.createJournal(SCOPE), { type: 'admit', epoch: 1 }),
    { type: 'prepare_start', operationId: START, clientSessionId: CLIENT, setup: clone(vectors.setup), clock: clock(0) });
}
function running() {
  return act(prepared(), { type: 'acknowledge_start', operationId: START,
    snapshot: { serverSessionId: SERVER, state: 'running', startedAtMs: vectors.clock.wallTimeMs,
      elapsedMs: 0, observedClock: clock(0) } });
}
function input(journal = running(), observedClock = clock(5000), overrides = {}) {
  return { journal, currentScope: clone(SCOPE), currentAdmissionEpoch: journal.admission.epoch,
    currentClientSessionId: CLIENT, clock: observedClock, ...overrides };
}
const projection = (journal = running(), observedClock = clock(5000)) => countdown.projectSessionCountdown(input(journal, observedClock));
function token(journal = running(), kind = 'end') {
  return { version: 1, identity: projection(journal).identity, operationId: ACTION, kind };
}
function decision(journal = running(), kind = 'end', overrides = {}) {
  return countdown.decideSessionCountdownAction({ ...input(journal), token: token(journal, kind),
    consumedOperationIds: [], ...overrides });
}
function paused() {
  const pending = act(running(), { type: 'prepare_transition', operationId: PAUSE,
    clientSessionId: CLIENT, kind: 'pause', clock: clock(4250) });
  return act(pending, { type: 'acknowledge_transition', operationId: PAUSE,
    snapshot: { serverSessionId: SERVER, state: 'paused', startedAtMs: vectors.clock.wallTimeMs,
      elapsedMs: 4250, observedClock: clock(5000) } });
}
function uncertainPause() {
  return act(act(running(), { type: 'prepare_transition', operationId: PAUSE,
    clientSessionId: CLIENT, kind: 'pause', clock: clock(4000) }), { type: 'mark_unknown', operationId: PAUSE });
}

for (const vector of vectors.timerVectors) {
  test(`projection uses portable clock behavior: ${vector.name}`, () => {
    const journal = running();
    journal.records[0] = { ...clone(vectors.runningRecord), ...clone(vector.recordOverrides ?? {}) };
    const before = clone(journal), value = projection(journal, vector.clock);
    assert.equal(value.remainingMs, vector.expected.remainingMs);
    assert.equal(value.elapsedMs, vector.expected.elapsedMs);
    assert.equal(value.clockWarning, vector.expected.clockWarning);
    if (vector.expected.expired) {
      assert.equal(value.phase, 'finished'); assert.equal(value.scheduleFinishAlert, false);
    }
    if (!vector.expected.expired && value.phase === 'running') assert.equal(value.scheduleFinishAlert, true);
    assert.deepEqual(journal, before);
  });
}
test('projection contains only detached presentation, not setup notes, commands or receipts', () => {
  const journal = running(), before = clone(journal), value = projection(journal);
  assert.equal(value.phase, 'running'); assert.equal(value.deadlineMs, vectors.runningRecord.endsAtMs);
  assert.equal(value.scheduleFinishAlert, true); assert.equal(value.showOngoing, true);
  assert.deepEqual(value.foregroundActions, ['pause', 'end']);
  assert.equal(value.notes, undefined); assert.equal(value.commands, undefined); assert.equal(value.receipt, undefined);
  value.identity.scope.ownerId = 'changed'; value.observedClock.wallTimeMs = 0; value.foregroundActions.push('resume');
  assert.deepEqual(journal, before);
});
test('confirmed pause is fixed across time and exposes only foreground resume/end', () => {
  const value = projection(paused(), clock(90000));
  assert.equal(value.phase, 'paused'); assert.equal(value.remainingMs, 25750);
  assert.equal(value.deadlineMs, null); assert.equal(value.scheduleFinishAlert, false);
  assert.deepEqual(value.foregroundActions, ['resume', 'end']);
  assert.equal(decision(paused(), 'resume').foregroundAction, 'resume');
  assert.deepEqual(decision(paused(), 'pause'), { accepted: false, reason: 'invalid_state' });
});
test('unknown pause suppresses alerts and toggling while End can supersede the uncertainty', () => {
  const journal = uncertainPause(), value = projection(journal);
  assert.equal(value.phase, 'checking'); assert.equal(value.showOngoing, false);
  assert.equal(value.scheduleFinishAlert, false); assert.deepEqual(value.foregroundActions, ['end']);
  assert.deepEqual(decision(journal, 'pause'), { accepted: false, reason: 'unresolved' });
  assert.deepEqual(decision(journal, 'resume'), { accepted: false, reason: 'unresolved' });
  assert.equal(decision(journal, 'end').foregroundAction, 'end');
  assert.equal(decision(journal, 'end', { clock: clock(40000) }).foregroundAction, 'end');
});
test('an unknown resume cannot become a confirmed running notification or a second resume', () => {
  const journal = act(act(paused(), { type: 'prepare_transition', operationId: END,
    clientSessionId: CLIENT, kind: 'resume', clock: clock(6000) }), { type: 'mark_unknown', operationId: END });
  const value = projection(journal, clock(20000));
  assert.equal(value.phase, 'checking'); assert.equal(value.remainingMs, 25750);
  assert.equal(value.scheduleFinishAlert, false);
  assert.deepEqual(decision(journal, 'resume'), { accepted: false, reason: 'unresolved' });
});
test('durable End suppresses every alert and cannot turn into completion after expiry', () => {
  const journal = act(uncertainPause(), { type: 'prepare_transition', operationId: END,
    clientSessionId: CLIENT, kind: 'cancel', clock: clock(6000) });
  const value = projection(journal, clock(40000));
  assert.equal(value.phase, 'ending'); assert.equal(value.showOngoing, false);
  assert.equal(value.scheduleFinishAlert, false); assert.deepEqual(value.foregroundActions, []);
  assert.deepEqual(decision(journal, 'end', { clock: clock(40000) }), { accepted: false, reason: 'ending' });
});
test('End before an uncertain start acknowledgement remains an unconfirmed stop, with no alerts', () => {
  const journal = act(prepared(), { type: 'request_start_end', clientSessionId: CLIENT });
  const value = projection(journal, clock(40000));
  assert.equal(value.phase, 'ending'); assert.equal(value.showOngoing, false); assert.equal(value.scheduleFinishAlert, false);
  assert.deepEqual(decision(journal, 'end'), { accepted: false, reason: 'ending' });
});
test('End on the confirmed exact target goes through completion without changing the journal', () => {
  const journal = running(), before = clone(journal);
  assert.equal(decision(journal, 'end', { clock: clock(29999) }).foregroundAction, 'end');
  assert.equal(decision(journal, 'end', { clock: clock(30000) }).foregroundAction, 'complete');
  assert.equal(decision(journal, 'pause', { clock: clock(35000) }).foregroundAction, 'complete');
  assert.deepEqual(journal, before);
});
test('a locally finished record with no receipt does not claim saved rewards or schedule another alert', () => {
  const journal = act(running(), { type: 'expire', operationId: COMPLETE, clientSessionId: CLIENT, clock: clock(30000) });
  const value = projection(journal, clock(40000));
  assert.equal(value.phase, 'finished'); assert.equal(value.remainingMs, 0);
  assert.equal(value.showOngoing, false); assert.equal(value.scheduleFinishAlert, false);
  assert.deepEqual(decision(journal, 'end'), { accepted: false, reason: 'invalid_state' });
});
test('revocation, missing admission, switched owner, epoch and selection remove the projection', () => {
  const journal = running();
  for (const override of [{ currentScope: null }, { currentScope: { ...SCOPE, ownerId: '22222222-2222-4222-8222-222222222222' } },
    { currentScope: { ...SCOPE, backendId: 'other-backend' } }, { currentAdmissionEpoch: 2 }, { currentClientSessionId: null }]) {
    assert.equal(countdown.projectSessionCountdown(input(journal, clock(0), override)), null);
  }
  assert.equal(projection(act(journal, { type: 'revoke' })), null);
});
test('stale scoped tokens are rejected without mutating any current state', () => {
  const journal = running(), before = clone(journal), original = token(journal);
  const mutations = [
    ['stale_scope', value => { value.identity.scope.ownerId = '22222222-2222-4222-8222-222222222222'; }],
    ['stale_scope', value => { value.identity.scope.backendId = 'other-backend'; }],
    ['stale_epoch', value => { value.identity.admissionEpoch++; }],
    ['stale_session', value => { value.identity.clientSessionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; }],
    ['stale_session', value => { value.identity.serverSessionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; }],
    ['stale_revision', value => { value.identity.journalRevision++; }],
    ['stale_revision', value => { value.identity.recordRevision++; }],
  ];
  for (const [reason, mutate] of mutations) {
    const value = clone(original); mutate(value);
    assert.deepEqual(decision(journal, 'end', { token: value }), { accepted: false, reason });
  }
  assert.deepEqual(journal, before);
});
test('a token from before revoke/re-admit cannot act for a fresh admission', () => {
  const previous = running(), oldToken = token(previous);
  const journal = act(act(previous, { type: 'revoke' }), { type: 'admit', epoch: 3 });
  assert.deepEqual(decision(journal, 'end', { token: oldToken }), { accepted: false, reason: 'stale_epoch' });
  const revoked = act(previous, { type: 'revoke' });
  assert.deepEqual(decision(previous, 'end', { journal: revoked, currentAdmissionEpoch: revoked.admission.epoch }),
    { accepted: false, reason: 'inactive' });
});
test('consumed action IDs and existing durable command IDs cannot be replayed', () => {
  const journal = running();
  assert.deepEqual(decision(journal, 'end', { consumedOperationIds: [ACTION] }), { accepted: false, reason: 'duplicate' });
  assert.deepEqual(decision(journal, 'end', { token: { ...token(journal), operationId: START } }),
    { accepted: false, reason: 'duplicate' });
});
test('malformed, unsupported and credential-bearing action tokens fail closed', () => {
  const journal = running(), original = token(journal);
  const mutations = [value => { value.version = 2; }, value => { value.kind = 'complete'; },
    value => { value.operationId = 'bad'; }, value => { value.identity.recordRevision = 0.5; },
    value => { value.identity.admissionEpoch = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.credentials = 'must never be accepted'; }, value => { value.identity.extra = true; }];
  for (const mutate of mutations) {
    const value = clone(original); mutate(value);
    assert.deepEqual(decision(journal, 'end', { token: value }), { accepted: false, reason: 'invalid_token' });
  }
  assert.deepEqual(decision(journal, 'end', { token: null }), { accepted: false, reason: 'invalid_token' });
});
test('malformed persisted state is rejected instead of projecting an invented empty timer', () => {
  const journal = running(); journal.records[0].setup.targetSeconds = 0;
  assert.throws(() => projection(journal), error => error.code === 'invalid_record');
});
