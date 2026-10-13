/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
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
const { createSessionTimerController } = load('src/services/sessionTimerController.ts');
const { createSessionJournalStore } = load('src/services/sessionJournalStore.ts');
const clone = value => JSON.parse(JSON.stringify(value));
const scope = { backendId: 'offline-controller', ownerId: '11111111-1111-4111-8111-111111111111' };
const other = { ...scope, ownerId: '22222222-2222-4222-8222-222222222222' };
const id = number => `33333333-3333-4333-8333-${String(number).padStart(12, '0')}`;
const setup = { targetSeconds: 3, activityType: 'learning', taskId: null, subjectId: 1, notes: null, title: 'Study' };
const failure = () => Object.assign(new Error('network fixture'), { failureKind: 'transient' });
function harness() {
  const values = new Map(), rows = new Map(), submissions = [], receipts = new Map(), calls = [];
  let time = 1000000, epoch = 1, owner = scope, online = true, grant = true, sequence = 0, credits = 0, loseReply = false, submitHook = null, snapshotWarning = false;
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value) };
  const store = createSessionJournalStore(storage, scope);
  const clock = () => ({ wallTimeMs: time, monotonicTimeMs: null, bootId: null });
  const ensure = async () => { if (!online) throw failure(); return owner; };
  const elapsed = row => Math.min(row.setup.targetSeconds * 1000, row.elapsed + (row.status === 'running' ? time - row.resumed : 0));
  const remote = row => ({ scope, serverSessionId: row.id, setup: clone(row.setup), status: row.status,
    snapshot: row.status === 'completed' ? null : { serverSessionId: row.id, state: row.status, startedAtMs: row.started,
      elapsedMs: elapsed(row), observedClock: clock() }, startedAtMs: row.started, completedAtMs: row.ended ?? null, receipt: row.receipt ?? null });
  const server = {
    async start(draft, clientId) { calls.push('start'); await ensure(); rows.set(clientId, { id: clientId, setup: clone(draft), status: 'running', started: time, elapsed: 0, resumed: time, revision: 1 }); return clientId; },
    async pause(sessionId) { calls.push('pause'); await ensure(); const row = rows.get(sessionId); row.elapsed = elapsed(row); row.status = 'paused'; row.revision++; },
    async resume(sessionId) { calls.push('resume'); await ensure(); const row = rows.get(sessionId); row.status = 'running'; row.resumed = time; row.revision++; },
    async cancel(sessionId) { calls.push('cancel'); await ensure(); const row = rows.get(sessionId); row.status = 'cancelled'; row.ended = time; row.revision++; },
    async complete(sessionId) { calls.push('complete'); await ensure(); const row = rows.get(sessionId); if (elapsed(row) < row.setup.targetSeconds * 1000) throw failure(); if (!row.receipt) { credits++; row.receipt = receipt(sessionId, row.setup.targetSeconds); } row.status = 'completed'; row.ended = time; return clone(row.receipt); },
    async readSession(sessionId) { await ensure(); return rows.has(sessionId) ? remote(rows.get(sessionId)) : null; },
    async readOpenSessions() { await ensure(); return { complete: true, sessions: [...rows.values()].filter(row => ['running', 'paused'].includes(row.status)).map(remote) }; },
  };
  function receipt(sessionId, seconds) { return { sessionId, durationSeconds: seconds, result: { session_id: sessionId, duration_seconds: seconds, already_completed: false, xp_earned: 0, goal_reached_now: false } }; }
  const offline = {
    async load() {}, async refresh() {}, isLocalOnly: () => !online,
    readFreshGrant: () => grant && owner === scope ? { scope, policyVersion: 1, grantedAtMs: 1, serverTimeMs: 1, expiresAtMs: 999999999, lastSeenAtMs: time } : null,
    async readSnapshot(sessionId, clientId) { await ensure(); const row = rows.get(sessionId); if (clientId && clientId !== row.id) throw failure(); return { session: { ...remote(row), clockWarning: snapshotWarning }, revision: row.revision, clientSessionId: row.id, serverTimeMs: time,
      handoff: { revision: row.revision, observedAtMs: time, confirmedMs: elapsed(row) } }; },
    async submit(clientId, payload) {
      await ensure(); submissions.push(clone(payload));
      if (submitHook) await submitHook(clientId, payload);
      const saved = receipts.get(clientId);
      if (saved) return saved.outcome === 'rejected' ? clone(saved) : { ...clone(saved), outcome: 'already_saved' };
      const sessionId = payload.serverSessionId ?? id(9000 + submissions.length);
      if (payload.serverSessionId && rows.get(sessionId).revision !== payload.expectedRevision) return { outcome: 'rejected', clientSessionId: clientId, serverSessionId: sessionId, revision: 99, verification: 'client_reported', reasonCode: 'revision_conflict' };
      const result = { outcome: 'accepted', clientSessionId: clientId, serverSessionId: sessionId, revision: 2, verification: 'client_reported', ending: payload.ending, receipt: payload.ending === 'completed' ? receipt(sessionId, payload.setup.targetSeconds) : null };
      if (result.receipt) credits++;
      receipts.set(clientId, clone(result));
      if (rows.has(sessionId)) { rows.get(sessionId).status = payload.ending; rows.get(sessionId).ended = payload.endedAtMs; }
      if (loseReply) { loseReply = false; throw failure(); }
      return result;
    },
  };
  const create = () => createSessionTimerController({ scope, store, server, offline, clock, uuid: () => id(++sequence), timeoutMs: 100,
    authority: { currentScope: () => owner, currentEpoch: () => epoch, verify: ensure } });
  return { create, store, storage, values, rows, submissions, receipts, calls, server, get credits() { return credits; },
    set online(value) { online = value; }, set grant(value) { grant = value; }, set loseReply(value) { loseReply = value; },
    set submitHook(value) { submitHook = value; },
    set snapshotWarning(value) { snapshotWarning = value; },
    advance(ms) { time += ms; }, switchOwner() { owner = other; epoch++; }, restart() { epoch++; return create(); },
    persisted() { return JSON.parse(values.get(store.key)); } };
}
test('cached scoped capability starts, pauses and resumes offline without a server mutation or provisional reward', async () => {
  const h = harness(); h.online = false; const c = h.create(); await c.initialize();
  assert.equal(await c.start(setup), true); h.advance(1000); assert.equal(await c.pause(), true);
  assert.equal(c.getSnapshot().timeLeft, 2); h.advance(5000); assert.equal(c.getSnapshot().timeLeft, 2);
  assert.equal(await c.resume(), true); h.advance(2000); await c.tick();
  assert.equal(c.getSnapshot().record.state, 'completed'); assert.equal(c.getSnapshot().receipt, null);
  assert.equal(c.getSnapshot().unsyncedSessionCount, 1); assert.deepEqual(h.calls, []); assert.equal(h.credits, 0);
  assert.equal(h.persisted().records[0].completedAtMs, 1008000); await c.dispose();
});
test('no granted capability retains the existing offline-start refusal and v1 journal', async () => {
  const h = harness(); h.online = false; h.grant = false; const c = h.create(); await c.initialize();
  assert.equal(await c.start(setup), false); assert.equal(h.persisted().schemaVersion, 1); assert.equal(h.persisted().records.length, 0); await c.dispose();
});
test('offline completion survives cold restart and imports exactly once under a distinct server UUID', async () => {
  const h = harness(); h.online = false; let c = h.create(); await c.initialize(); await c.start(setup); h.advance(3000); await c.tick();
  const clientId = c.getSnapshot().record.clientSessionId; await c.dispose(); c = h.restart(); await c.initialize();
  assert.equal(c.getSnapshot().record.completedAtMs, 1003000); h.online = true; await c.refresh(true);
  assert.equal(c.getSnapshot().syncStatus, 'saved'); assert.notEqual(c.getSnapshot().receipt.sessionId, clientId);
  assert.equal(c.getSnapshot().rewardsVisible, false); await c.refresh(true); assert.equal(h.credits, 1); await c.dispose();
});
test('lost import reply retries the identical original payload and never credits twice', async () => {
  const h = harness(); h.online = false; const c = h.create(); await c.initialize(); await c.start(setup); h.advance(3000); await c.tick();
  h.online = true; h.loseReply = true; await c.refresh(true); assert.equal(h.credits, 1);
  h.advance(90000); await c.refresh(true); assert.equal(h.credits, 1); assert.deepEqual(h.submissions[0], h.submissions[1]); assert.equal(c.getSnapshot().syncStatus, 'saved'); await c.dispose();
});
test('Done preserves pending work but allows another offline session; both sync in canonical order', async () => {
  const h = harness(); h.online = false; const c = h.create(); await c.initialize(); await c.start(setup); h.advance(3000); await c.tick();
  c.dismissSummary(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.getSnapshot().record, null); assert.equal(h.persisted().records[0].dismissedAtMs, 1003000);
  h.advance(1); assert.equal(await c.start(setup), true); h.advance(3000); await c.tick();
  assert.equal(c.getSnapshot().unsyncedSessionCount, 2); h.online = true; await c.refresh(true);
  assert.equal(h.credits, 2); assert.ok(h.submissions[0].endedAtMs < h.submissions[1].endedAtMs); await c.dispose();
});
test('pure offline early End has no import, XP or future completion after restart', async () => {
  const h = harness(); h.online = false; let c = h.create(); await c.initialize(); await c.start(setup); h.advance(500); await c.end();
  assert.equal(c.getSnapshot().record.state, 'cancelled'); assert.equal(c.getSnapshot().syncStatus, 'saved');
  await c.dispose(); c = h.restart(); await c.initialize(); h.online = true; h.advance(30000); await c.refresh(true);
  assert.equal(h.submissions.length, 0); assert.equal(h.credits, 0); await c.dispose();
});
test('End at exact local deadline queues completion, not cancellation', async () => {
  const h = harness(); h.online = false; const c = h.create(); await c.initialize(); await c.start(setup); h.advance(3000); await c.end();
  assert.equal(c.getSnapshot().record.state, 'completed'); h.online = true; await c.refresh(true);
  assert.equal(h.submissions[0].ending, 'completed'); assert.equal(h.credits, 1); await c.dispose();
});
test('online Start then offline controls use the protected baseline and finalize the same row', async () => {
  const h = harness(); const c = h.create(); await c.initialize(); await c.start(setup); const serverId = c.getSnapshot().record.serverSessionId;
  assert.ok(c.getSnapshot().record.serverCheckpoint); h.advance(1000); h.online = false; await c.pause(); h.advance(2000); await c.resume(); h.advance(2000); await c.tick();
  h.online = true; await c.refresh(true); assert.equal(h.submissions[0].serverSessionId, serverId);
  assert.equal(h.submissions[0].expectedRevision, 1); assert.equal(h.credits, 1); assert.equal(h.calls.filter(name => name === 'pause').length, 0); await c.dispose();
});
test('mixed offline End stores actual stop span and remains cancellation after reconnect', async () => {
  const h = harness(); const c = h.create(); await c.initialize(); await c.start(setup); h.advance(1000); h.online = false; await c.end();
  assert.equal(c.getSnapshot().record.state, 'cancelled'); assert.equal(c.getSnapshot().ending, true);
  h.advance(20000); h.online = true; await c.refresh(true); assert.equal(h.submissions[0].ending, 'cancelled');
  assert.equal(h.submissions[0].endedAtMs, 1001000); assert.equal(h.credits, 0); await c.dispose();
});
test('a newer server revision rejects mixed local timing and keeps the local record for review', async () => {
  const h = harness(); const c = h.create(); await c.initialize(); await c.start(setup); h.online = false; h.advance(1000); await c.pause(); await c.resume(); h.advance(2000); await c.tick();
  h.rows.get(c.getSnapshot().record.serverSessionId).revision++; h.online = true; await c.refresh(true);
  assert.equal(c.getSnapshot().syncStatus, 'rejected'); assert.equal(c.getSnapshot().record.sync.reasonCode, 'revision_conflict'); assert.equal(h.credits, 0); await c.dispose();
});
test('account changes fence cached capability, local controls and uploads immediately', async () => {
  const h = harness(); h.online = false; const c = h.create(); await c.initialize(); await c.start(setup); h.advance(3000); await c.tick();
  h.switchOwner(); h.online = true; assert.equal(await c.refresh(true), false); assert.equal(c.getSnapshot().offlineAvailable, false);
  assert.equal(c.getSnapshot().record, null); assert.equal(h.submissions.length, 0); await c.dispose();
});
test('immediate Pause and Resume do not leave zero-length intervals that prevent upload', async () => {
  const h = harness(); h.online = false; const c = h.create(); await c.initialize(); await c.start(setup);
  assert.equal(await c.pause(), true); assert.equal(await c.resume(), true); h.advance(3000); await c.tick(); h.online = true; await c.refresh(true);
  assert.equal(h.submissions[0].segments.length, 1); assert.ok(h.submissions[0].segments.every(segment => segment.endedAtMs > segment.startedAtMs)); assert.equal(h.credits, 1); await c.dispose();
});
test('a mixed session left paused longer than the completion span limit can still End without rewards', async () => {
  const h = harness(); const c = h.create(); await c.initialize(); await c.start(setup); h.online = false; h.advance(1000); await c.pause();
  h.advance(25 * 3600000); assert.equal(await c.end(), true); assert.equal(c.getSnapshot().record.state, 'cancelled');
  h.online = true; await c.refresh(true); assert.equal(h.submissions[0].ending, 'cancelled'); assert.equal(h.credits, 0); assert.equal(c.getSnapshot().ending, false); await c.dispose();
});
test('acknowledging a rejected mixed result restores newer server controls without erasing the rejected record', async () => {
  const h = harness(); const c = h.create(); await c.initialize(); await c.start(setup); const serverId = c.getSnapshot().record.serverSessionId;
  h.online = false; h.advance(1000); await c.pause(); await c.resume(); h.advance(2000); await c.tick();
  const remote = h.rows.get(serverId); remote.revision++; remote.status = 'paused'; remote.elapsed = 1000;
  h.online = true; await c.refresh(true); assert.equal(c.getSnapshot().syncStatus, 'rejected'); c.dismissSummary();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(c.getSnapshot().record.state, 'paused'); assert.equal(c.getSnapshot().record.verification, 'server_timed');
  assert.equal(h.persisted().records.filter(row => row.sync.state === 'rejected').length, 1);
  assert.equal(await c.end(), true); assert.equal(remote.status, 'cancelled'); assert.equal(h.credits, 0); await c.dispose();
});
test('temporary disabled admission keeps the original result pending until the server permits retry', async () => {
  const h = harness(); h.online = false; const c = h.create(); await c.initialize(); await c.start(setup); h.advance(3000); await c.tick();
  const clientId = c.getSnapshot().record.clientSessionId;
  h.receipts.set(clientId, { outcome: 'rejected', clientSessionId: clientId, serverSessionId: null, revision: null, verification: null, reasonCode: 'policy_disabled' });
  h.online = true; await c.refresh(true); assert.equal(c.getSnapshot().record.sync.state, 'pending'); assert.equal(c.getSnapshot().record.sync.reasonCode, 'policy_disabled'); assert.equal(h.credits, 0);
  h.receipts.delete(clientId); await c.refresh(true); assert.equal(c.getSnapshot().syncStatus, 'saved'); assert.equal(h.credits, 1); await c.dispose();
});
test('an existing server completion settles a pending local End without changing its gesture or replaying rewards', async () => {
  const h = harness(); const c = h.create(); await c.initialize(); await c.start(setup); h.online = false; h.advance(1000); await c.end();
  const record = c.getSnapshot().record;
  h.receipts.set(record.clientSessionId, { outcome: 'accepted', clientSessionId: record.clientSessionId, serverSessionId: record.serverSessionId,
    revision: 4, verification: 'server_timed', ending: 'completed', receipt: { sessionId: record.serverSessionId, durationSeconds: 3, result: { already_completed: true, goal_reached_now: false } } });
  h.online = true; await c.refresh(true); assert.equal(c.getSnapshot().ending, false); assert.equal(c.getSnapshot().record.state, 'cancelled');
  assert.equal(c.getSnapshot().record.sync.reasonCode, 'server_completed_before_end'); assert.equal(c.getSnapshot().rewardsVisible, false); assert.equal(h.credits, 0); await c.dispose();
});

function heldReply() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
test('uploading an earlier result never blocks local Pause, Resume, End or the next Start', async () => {
  const h = harness(); h.online = false; const c = h.create(); await c.initialize(); await c.start(setup);
  h.advance(3000); await c.tick(); c.dismissSummary(); await new Promise(resolve => setImmediate(resolve));
  h.advance(1); await c.start({ ...setup, targetSeconds: 300 });
  const currentId = c.getSnapshot().record.clientSessionId;
  const reply = heldReply(), entered = heldReply();
  h.submitHook = async () => { entered.resolve(); await reply.promise; };
  h.online = true; const upload = c.refresh(true); await entered.promise;
  try {
    assert.equal(c.getSnapshot().busy, false);
    h.advance(1000); assert.equal(await c.pause(), true); assert.equal(c.getSnapshot().record.state, 'paused');
    h.advance(1000); assert.equal(await c.resume(), true); assert.equal(c.getSnapshot().record.state, 'running');
    assert.equal(await c.end(), true, JSON.stringify(c.getSnapshot())); assert.equal(c.getSnapshot().record.state, 'cancelled');
    c.dismissSummary(); await new Promise(resolve => setImmediate(resolve));
    assert.notEqual(h.persisted().records.find(row => row.clientSessionId === currentId).dismissedAtMs, null);
    h.advance(1); assert.equal(await c.start({ ...setup, targetSeconds: 60 }), true);
    assert.equal(c.getSnapshot().record.clientTiming.offlineOrigin, true);
    assert.equal(c.getSnapshot().busy, false);
  } finally { h.submitHook = null; reply.resolve(); await upload; }
  assert.equal(h.credits, 1); assert.equal(c.getSnapshot().record.state, 'running');
  assert.equal(c.getSnapshot().record.setup.targetSeconds, 60); await c.dispose();
});
test('expiry and Done persist while an earlier result is waiting for its upload reply', async () => {
  const h = harness(); h.online = false; const c = h.create(); await c.initialize(); await c.start(setup);
  h.advance(3000); await c.tick(); c.dismissSummary(); await new Promise(resolve => setImmediate(resolve));
  h.advance(1); await c.start(setup); const secondId = c.getSnapshot().record.clientSessionId;
  const reply = heldReply(), entered = heldReply(); h.submitHook = async () => { entered.resolve(); await reply.promise; };
  h.online = true; const upload = c.refresh(true); await entered.promise;
  try {
    h.advance(3000); await c.tick(); assert.equal(c.getSnapshot().record.state, 'completed');
    c.dismissSummary(); await new Promise(resolve => setImmediate(resolve));
    const persisted = h.persisted().records.find(row => row.clientSessionId === secondId);
    assert.equal(persisted.state, 'completed'); assert.notEqual(persisted.dismissedAtMs, null);
    assert.equal(c.getSnapshot().record, null);
  } finally { h.submitHook = null; reply.resolve(); await upload; }
  await c.refresh(true); assert.equal(h.credits, 2); assert.equal(c.getSnapshot().rewardsVisible, false); await c.dispose();
});
test('cold discovery adopts the server client identity and retains its trusted offline-control baseline', async () => {
  const h = harness(), serverId = id(7000); await h.server.start(setup, serverId);
  const c = h.create(); await c.initialize();
  assert.equal(c.getSnapshot().record.clientSessionId, serverId);
  assert.equal(c.getSnapshot().record.serverCheckpoint.clientSessionId, serverId);
  h.online = false; h.advance(1000); assert.equal(await c.pause(), true);
  assert.equal(c.getSnapshot().record.state, 'paused'); assert.equal(await c.resume(), true);
  h.advance(2000); await c.tick(); h.online = true; await c.refresh(true);
  assert.equal(h.credits, 1); await c.dispose();
});
test('cold reopening permits local Start before an earlier dismissed upload replies', async () => {
  const h = harness(); h.online = false; let c = h.create(); await c.initialize(); await c.start(setup);
  h.advance(3000); await c.tick(); c.dismissSummary(); await new Promise(resolve => setImmediate(resolve)); await c.dispose();
  h.online = true; const reply = heldReply(), entered = heldReply(); h.submitHook = async () => { entered.resolve(); await reply.promise; };
  c = h.restart(); const reopening = c.initialize(); await entered.promise;
  try { assert.equal(c.getSnapshot().busy, false); assert.equal(await c.start({ ...setup, targetSeconds: 60 }), true); }
  finally { h.submitHook = null; reply.resolve(); await reopening; }
  assert.equal(c.getSnapshot().record.state, 'running'); assert.equal(h.credits, 1); await c.dispose();
});
test('cold adoption preserves the authoritative snapshot clock warning', async () => {
  const h = harness(); await h.server.start(setup, id(7001)); h.snapshotWarning = true;
  const c = h.create(); await c.initialize(); assert.equal(c.getSnapshot().record.clockWarning, true); await c.dispose();
});
