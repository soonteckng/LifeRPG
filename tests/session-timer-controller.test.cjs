/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const cache = new Map();
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.')
    ? load(path.relative(path.resolve(__dirname, '..'), `${path.resolve(path.dirname(filename), name)}.ts`)) : require(name), module, module.exports);
  return module.exports;
}
const api = load('src/services/sessionTimerController.ts');
const storageApi = load('src/services/sessionJournalStore.ts');
const journalApi = load('src/utils/sessionJournal.ts');
const scope = { backendId: 'controller-fixture', ownerId: '11111111-1111-4111-8111-111111111111' };
const otherScope = { ...scope, ownerId: '22222222-2222-4222-8222-222222222222' };
const setup = { targetSeconds: 3, activityType: 'other', taskId: null, subjectId: 2, notes: 'Learning notes', title: 'Learning' };
const clone = value => JSON.parse(JSON.stringify(value));
const id = (prefix, number) => `${prefix}0000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const failure = kind => Object.assign(new Error('private fixture error: do not expose'), { failureKind: kind });

function harness(options = {}) {
  const values = new Map(), rows = new Map(), calls = [];
  let time = 1000000, serverTime = time, epoch = 1, owner = scope, online = true, sequence = 0;
  let credits = 0, verifyHook = null, startHook = null, completeHook = null, readHook = null, openHook = null;
  const fail = { start: null, pause: null, complete: null };
  const backend = {
    beforeWrite: null,
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { if (backend.beforeWrite) await backend.beforeWrite(key, value); values.set(key, value); },
  };
  const store = storageApi.createSessionJournalStore(backend, scope);
  const clock = () => ({ wallTimeMs: time, monotonicTimeMs: time, bootId: 'fixture-boot' });
  const elapsed = row => row.elapsedMs + (row.status === 'running' ? Math.max(0, serverTime - row.lastResumedAtMs) : 0);
  const remote = row => ({
    scope: clone(scope), serverSessionId: row.id, setup: clone(row.setup), status: row.status,
    snapshot: row.status === 'completed' ? null : { serverSessionId: row.id, state: row.status,
      startedAtMs: row.startedAtMs, elapsedMs: elapsed(row), observedClock: clock() },
    receipt: row.receipt ? { ...clone(row.receipt), result: { ...clone(row.receipt.result), already_completed: true, goal_reached_now: false } } : null,
    startedAtMs: row.startedAtMs, completedAtMs: row.completedAtMs, clockWarning: false,
  });
  const persisted = () => JSON.parse(values.get(store.key));
  const assertPrepared = kind => {
    assert.ok(persisted().commands.some(command => command.kind === kind && ['prepared', 'unknown'].includes(command.status)), `${kind} must be durable before RPC`);
  };
  const server = {
    async start(draft) {
      calls.push('start'); assertPrepared('start');
      if (fail.start === 'definitive') throw failure('definitive');
      const row = { id: id('4', rows.size + 1), setup: clone(draft), status: 'running', startedAtMs: serverTime,
        elapsedMs: 0, lastResumedAtMs: serverTime, completedAtMs: null, receipt: null };
      rows.set(row.id, row);
      if (startHook) await startHook(row);
      if (fail.start === 'lost') { fail.start = null; throw failure('transient'); }
      return row.id;
    },
    async pause(serverId) {
      calls.push('pause'); assertPrepared('pause'); const row = rows.get(serverId);
      if (fail.pause === 'not_applied') throw failure('transient');
      if (row.status !== 'running') throw failure('definitive');
      row.elapsedMs = elapsed(row); row.status = 'paused';
      if (fail.pause === 'lost') { fail.pause = null; throw failure('transient'); }
    },
    async resume(serverId) {
      calls.push('resume'); assertPrepared('resume'); const row = rows.get(serverId);
      if (row.status !== 'paused') throw failure('definitive');
      row.status = 'running'; row.lastResumedAtMs = serverTime;
    },
    async cancel(serverId) {
      calls.push('cancel'); assertPrepared('cancel'); const row = rows.get(serverId);
      if (!['running', 'paused'].includes(row.status)) throw failure('definitive');
      row.elapsedMs = elapsed(row); row.status = 'cancelled'; row.completedAtMs = serverTime;
    },
    async complete(serverId) {
      calls.push('complete'); const row = rows.get(serverId);
      if (row.status === 'completed') return { ...clone(row.receipt), result: { ...clone(row.receipt.result), already_completed: true, goal_reached_now: false } };
      assertPrepared('complete');
      if (elapsed(row) < row.setup.targetSeconds * 1000 || row.status === 'cancelled') throw failure('transient');
      credits++; row.elapsedMs = row.setup.targetSeconds * 1000; row.status = 'completed'; row.completedAtMs = serverTime;
      row.receipt = { sessionId: row.id, durationSeconds: row.setup.targetSeconds,
        result: { session_id: row.id, duration_seconds: row.setup.targetSeconds, xp_earned: 0, gold_earned: 0,
          already_completed: false, goal_reached_now: false, credited_date: '2026-10-10' } };
      if (completeHook) await completeHook(row);
      if (fail.complete === 'lost') { fail.complete = null; throw failure('transient'); }
      return clone(row.receipt);
    },
    async readSession(serverId) { calls.push('read'); if (readHook) await readHook(serverId); return rows.has(serverId) ? remote(rows.get(serverId)) : null; },
    async readOpenSessions() {
      calls.push('open'); if (openHook) await openHook();
      return { complete: true, sessions: [...rows.values()].filter(row => ['running', 'paused'].includes(row.status)).map(remote) };
    },
  };
  const authority = { currentScope: () => owner, currentEpoch: () => epoch,
    async verify() { calls.push('verify'); if (verifyHook) await verifyHook(); if (!online) throw failure('auth'); return clone(owner); } };
  const create = () => api.createSessionTimerController({ scope, store, server, authority, clock,
    uuid: () => id('3', ++sequence), timeoutMs: options.timeoutMs ?? 100,
    ...(options.mutationTimeoutMs === undefined ? {} : { mutationTimeoutMs: options.mutationTimeoutMs }) });
  return {
    create, store, server, backend, values, rows, calls, fail, persisted, clock,
    advance(amount, serverAmount = amount) { time += amount; serverTime += serverAmount; },
    get credits() { return credits; }, set online(value) { online = value; },
    set verifyHook(value) { verifyHook = value; }, set startHook(value) { startHook = value; },
    set completeHook(value) { completeHook = value; }, set readHook(value) { readHook = value; }, set openHook(value) { openHook = value; },
    restart() { epoch++; return create(); }, switchOwner() { epoch++; owner = otherScope; },
  };
}

test('start, pause, resume and completion persist before their RPC and use saved server snapshots', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  h.startHook = async () => h.advance(1000);
  assert.equal(await controller.start(setup), true);
  assert.equal(controller.getSnapshot().timeLeft, 2);
  assert.equal(controller.getSnapshot().record.endsAtMs, 1003000, 'reply latency must not restart a full target');
  assert.equal(await controller.pause(), true);
  h.advance(5000); await controller.tick(); assert.equal(controller.getSnapshot().timeLeft, 2);
  assert.equal(await controller.resume(), true); assert.equal(controller.getSnapshot().record.endsAtMs, 1008000);
  h.advance(2000); await controller.tick();
  assert.equal(h.credits, 1); assert.equal(controller.getSnapshot().syncStatus, 'saved');
  assert.equal(controller.getSnapshot().rewardsVisible, true);
  controller.dismissSummary(); assert.equal(controller.getSnapshot().rewardsVisible, false);
  assert.ok(controller.getSnapshot().receipt); await controller.dispose();
});

test('a failed prepare write never reaches start RPC', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  h.backend.beforeWrite = async (_, value) => { if (JSON.parse(value).records.length) throw failure('transient'); };
  assert.equal(await controller.start(setup), false);
  assert.equal(h.calls.filter(call => call === 'start').length, 0);
  assert.deepEqual(h.persisted().records, []); assert.match(controller.getSnapshot().error, /phone/);
  await controller.dispose();
});

test('successful start ID survives a failed timing read and is recovered exactly after restart', async () => {
  const h = harness(), first = h.create(); await first.initialize();
  h.readHook = async () => { throw failure('transient'); };
  assert.equal(await first.start(setup), false);
  assert.ok(h.persisted().records[0].serverSessionId); assert.equal(h.persisted().records[0].clockAnchor, null);
  h.readHook = null;
  const second = h.restart(); await second.initialize();
  assert.equal(second.getSnapshot().record.state, 'running');
  assert.equal(h.calls.filter(call => call === 'start').length, 1); await second.dispose();
});

test('a lost start reply reconciles one matching owned row without a second start', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); h.fail.start = 'lost';
  assert.equal(await controller.start(setup), false); assert.equal(h.persisted().records[0].serverSessionId, null);
  await controller.retry();
  assert.equal(controller.getSnapshot().record.state, 'running');
  assert.equal(h.calls.filter(call => call === 'start').length, 1); await controller.dispose();
});

test('unknown pause reading old state stays blocking and never retries timing mutation or expires', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
  h.fail.pause = 'not_applied'; assert.equal(await controller.pause(), false);
  h.advance(5000); await controller.tick(); await controller.retry(); await controller.retry();
  assert.equal(h.calls.filter(call => call === 'pause').length, 1);
  assert.equal(h.calls.filter(call => call === 'complete').length, 0);
  assert.equal(h.persisted().records[0].state, 'running');
  assert.equal(h.persisted().commands.at(-1).status, 'unknown'); await controller.dispose();
});

test('a lost successful pause reply resolves the persisted paused state once', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup); h.advance(1000);
  h.fail.pause = 'lost'; await controller.pause(); h.advance(1000); await controller.retry();
  assert.equal(controller.getSnapshot().record.state, 'paused'); assert.equal(controller.getSnapshot().timeLeft, 2);
  assert.equal(h.calls.filter(call => call === 'pause').length, 1); await controller.dispose();
});

test('offline expiry survives restart with original end time and syncs one reward on reconnect', async () => {
  const h = harness(), first = h.create(); await first.initialize(); await first.start(setup);
  h.online = false; h.advance(5000); await first.tick();
  const end = h.persisted().records[0].completedAtMs;
  assert.equal(end, 1003000); assert.equal(h.persisted().records[0].observedAtMs, 1005000);
  assert.equal(first.getSnapshot().receipt, null); assert.equal(h.credits, 0);
  const second = h.restart(); await second.initialize(); assert.equal(second.getSnapshot().timeLeft, 0);
  assert.equal(h.persisted().records[0].completedAtMs, end);
  h.online = true; await second.refresh(true); await second.refresh(); await second.tick();
  assert.equal(h.credits, 1); assert.equal(second.getSnapshot().receipt.durationSeconds, 3); await second.dispose();
});

test('End at zero before the next tick completes the full target instead of cancelling it', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
  h.advance(3000);
  assert.equal(journalApi.deriveJournalTimer(h.persisted().records[0], h.clock()).remainingMs, 0);
  assert.equal(h.persisted().records[0].state, 'running', 'the tick has not marked expiry yet');
  assert.equal(await controller.end(), false);
  const record = h.persisted().records[0];
  assert.equal(record.state, 'completed'); assert.equal(record.completedAtMs, 1003000);
  assert.equal(record.elapsedMs, 3000); assert.equal(record.sync.receipt.durationSeconds, setup.targetSeconds);
  assert.equal(h.calls.filter(call => call === 'cancel').length, 0);
  assert.equal(h.calls.filter(call => call === 'complete').length, 1);
  assert.equal(h.credits, 1); assert.equal(controller.getSnapshot().rewardsVisible, true);
  await controller.tick(); await controller.refresh(true);
  assert.equal(h.credits, 1); assert.equal(h.calls.filter(call => call === 'complete').length, 1);
  await controller.dispose();
});

test('offline End at zero before the next tick preserves full completion through restart and reconnect', async () => {
  const h = harness(), first = h.create(); await first.initialize(); await first.start(setup);
  h.online = false; h.advance(3000);
  assert.equal(journalApi.deriveJournalTimer(h.persisted().records[0], h.clock()).remainingMs, 0);
  assert.equal(h.persisted().records[0].state, 'running');
  assert.equal(await first.end(), false);
  const record = h.persisted().records[0];
  assert.equal(record.state, 'completed'); assert.equal(record.sync.state, 'waiting_auth');
  assert.equal(record.completedAtMs, 1003000); assert.equal(record.elapsedMs, 3000);
  assert.equal(record.sync.receipt, null); assert.equal(first.getSnapshot().ending, false);
  assert.equal(h.calls.filter(call => call === 'cancel').length, 0);
  assert.equal(h.calls.filter(call => call === 'complete').length, 0); assert.equal(h.credits, 0);
  const second = h.restart(); await second.initialize();
  assert.equal(second.getSnapshot().record.state, 'completed');
  assert.equal(h.persisted().records[0].completedAtMs, record.completedAtMs);
  h.online = true; await second.refresh(true); await second.refresh(true); await second.tick();
  assert.equal(second.getSnapshot().receipt.durationSeconds, setup.targetSeconds);
  assert.equal(h.credits, 1); assert.equal(h.calls.filter(call => call === 'complete').length, 1);
  assert.equal(h.calls.filter(call => call === 'cancel').length, 0);
  await second.dispose();
});

test('server cancellation keeps a locally finished record until explicit acknowledgement permits another session', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
  h.online = false; h.advance(3000); await controller.tick();
  const record = controller.getSnapshot().record;
  const remote = h.rows.get(record.serverSessionId); remote.status = 'cancelled'; remote.completedAtMs = 1003000;
  h.online = true; await controller.refresh(true);
  assert.equal(controller.getSnapshot().syncStatus, 'rejected'); assert.equal(controller.getSnapshot().receipt, null);
  assert.equal(h.credits, 0); assert.equal(controller.getSnapshot().record.completedAtMs, record.completedAtMs);
  assert.equal(await controller.end(), true); assert.equal(controller.getSnapshot().record, null);
  assert.ok(h.persisted().records[0].dismissedAtMs); assert.equal(h.persisted().records[0].state, 'completed');
  assert.equal(await controller.start(setup), true); assert.equal(h.credits, 0); await controller.dispose();
});

test('completion write failure or lost reply never shows rewards before durable receipt and never awards twice', async () => {
  for (const mode of ['write', 'reply']) {
    const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
    if (mode === 'write') {
      h.backend.beforeWrite = async (_, value) => {
        if (JSON.parse(value).records[0]?.sync.receipt) { h.backend.beforeWrite = null; throw failure('transient'); }
      };
    } else h.fail.complete = 'lost';
    h.advance(3000); await controller.tick();
    assert.equal(h.credits, 1); assert.equal(controller.getSnapshot().receipt, null); assert.equal(controller.getSnapshot().rewardsVisible, false);
    await controller.retry();
    assert.equal(h.credits, 1); assert.ok(controller.getSnapshot().receipt);
    assert.equal(controller.getSnapshot().rewardsVisible, false, 'a reconciled saved result cannot celebrate again');
    await controller.dispose();
  }
});

test('fresh owner mismatch fences late start replies and returning owner journal keeps unknown work', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  const entered = deferred(), release = deferred(); h.startHook = async () => { entered.resolve(); await release.promise; };
  const starting = controller.start(setup); await entered.promise;
  h.switchOwner(); release.resolve(); assert.equal(await starting, false);
  assert.equal(controller.getSnapshot().record, null);
  assert.equal(h.persisted().records[0].serverSessionId, null);
  assert.equal(h.persisted().commands[0].status, 'prepared'); await controller.dispose();
});

test('persisted completion backoff survives restart and automatic ticks respect retry dates', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
  h.online = false; h.advance(3000); await controller.tick();
  const next = h.persisted().records[0].sync.nextAttemptAtMs, verifications = h.calls.filter(call => call === 'verify').length;
  const restarted = h.restart(); await restarted.initialize();
  await restarted.tick(); await restarted.tick();
  assert.equal(h.calls.filter(call => call === 'verify').length, verifications);
  assert.equal(h.persisted().records[0].sync.nextAttemptAtMs, next);
  h.advance(1000); h.online = true; await restarted.tick(); assert.equal(h.credits, 1); await restarted.dispose();
});

test('hanging verification releases the lock while restored local countdown remains available', async () => {
  const h = harness({ timeoutMs: 10 }), first = h.create(); await first.initialize(); await first.start(setup);
  const hanging = deferred(); h.verifyHook = () => hanging.promise;
  const second = h.restart(), rendered = deferred();
  second.subscribe(snapshot => { if (snapshot.record && !snapshot.restoring) rendered.resolve(snapshot); });
  const restoring = second.initialize(); const local = await rendered.promise;
  assert.equal(local.record.serverSessionId, h.persisted().records[0].serverSessionId);
  await restoring; assert.equal(second.getSnapshot().busy, false);
  h.advance(3000); await second.tick(); assert.equal(h.persisted().records[0].state, 'completed');
  assert.equal(second.getSnapshot().receipt, null); hanging.resolve(); await second.dispose();
});

test('hanging start times out into unknown work; late reply is reconciled without replaying start', async () => {
  const h = harness({ timeoutMs: 10 }), controller = h.create(); await controller.initialize();
  const release = deferred(); h.startHook = () => release.promise;
  assert.equal(await controller.start(setup), false);
  assert.equal(controller.getSnapshot().busy, false); assert.equal(h.persisted().commands[0].status, 'unknown');
  release.resolve(); await controller.retry();
  assert.equal(controller.getSnapshot().record.state, 'running');
  assert.equal(h.calls.filter(call => call === 'start').length, 1); await controller.dispose();
});

test('server early-target rejection keeps exact pending completion until normal server gate passes', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
  h.advance(3000, 2000); await controller.tick();
  assert.equal(h.credits, 0); assert.equal(h.persisted().records[0].sync.state, 'pending');
  const deadline = h.persisted().records[0].completedAtMs;
  h.advance(1000); await controller.tick();
  assert.equal(h.credits, 1); assert.equal(h.persisted().records[0].completedAtMs, deadline);
  assert.equal(controller.getSnapshot().receipt.durationSeconds, 3); await controller.dispose();
});

test('a hanging timing read releases recovery lock and its late snapshot cannot overwrite a later pause', async () => {
  const h = harness({ timeoutMs: 10 }), first = h.create(); await first.initialize(); await first.start(setup);
  const originalRead = h.server.readSession.bind(h.server);
  const oldSnapshot = await originalRead(h.persisted().records[0].serverSessionId), release = deferred();
  h.server.readSession = async () => { await release.promise; return clone(oldSnapshot); };
  const second = h.restart(); await second.initialize(); assert.equal(second.getSnapshot().busy, false);
  h.server.readSession = originalRead; h.advance(1000); assert.equal(await second.pause(), true);
  const revision = h.persisted().revision;
  release.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(second.getSnapshot().record.state, 'paused'); assert.equal(h.persisted().revision, revision);
  await second.dispose();
});

test('restart during completion and a late completion reply preserve one receipt and one reward', async () => {
  const h = harness(), first = h.create(); await first.initialize(); await first.start(setup);
  const entered = deferred(), release = deferred(); h.completeHook = async () => { entered.resolve(); await release.promise; };
  h.advance(3000); const completing = first.tick(); await entered.promise;
  assert.equal(h.credits, 1); assert.equal(first.getSnapshot().receipt, null);
  const second = h.restart(); await second.initialize(); assert.ok(second.getSnapshot().receipt);
  const revision = h.persisted().revision;
  release.resolve(); await completing;
  assert.equal(h.persisted().revision, revision); assert.equal(h.credits, 1);
  assert.equal(second.getSnapshot().rewardsVisible, false); await second.dispose();
});

test('an empty local journal adopts an existing owned server timer and early End records no credit', async () => {
  const h = harness(), first = h.create(); await first.initialize(); await first.start(setup);
  h.values.clear(); const second = h.restart(); h.advance(1000); await second.initialize();
  assert.equal(second.getSnapshot().record.state, 'running'); assert.equal(second.getSnapshot().timeLeft, 2);
  assert.equal(h.calls.filter(call => call === 'start').length, 1);
  assert.equal(await second.end(), true); assert.equal(second.getSnapshot().record.state, 'cancelled');
  assert.equal(h.credits, 0); assert.equal(second.getSnapshot().receipt, null); await second.dispose();
});

test('offline start creates no unsent queue, while a definitive rejected start allows a fresh safe retry', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); h.online = false;
  assert.equal(await controller.start(setup), false); assert.deepEqual(h.persisted().records, []);
  h.online = true; h.fail.start = 'definitive'; assert.equal(await controller.start(setup), false);
  assert.equal(h.persisted().records[0].sync.state, 'rejected');
  h.fail.start = null; assert.equal(await controller.retry(), true);
  assert.equal(h.calls.filter(call => call === 'start').length, 2);
  assert.equal(controller.getSnapshot().record.state, 'running'); await controller.dispose();
});

test('a transport guard proving a mutating request was never sent permits a fresh safe retry', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  const originalStart = h.server.start.bind(h.server);
  h.server.start = async () => { throw Object.assign(failure('auth'), { requestSent: false }); };
  assert.equal(await controller.start(setup), false);
  assert.equal(h.calls.filter(call => call === 'start').length, 0);
  assert.equal(h.persisted().commands[0].status, 'rejected');
  assert.equal(h.persisted().records[0].sync.reasonCode, 'request_not_sent');
  h.server.start = originalStart; assert.equal(await controller.retry(), true);
  const originalPause = h.server.pause.bind(h.server);
  h.server.pause = async () => { throw Object.assign(failure('auth'), { requestSent: false }); };
  assert.equal(await controller.pause(), false); assert.equal(h.persisted().commands.at(-1).status, 'rejected');
  h.server.pause = originalPause; assert.equal(await controller.retry(), true);
  assert.equal(h.calls.filter(call => call === 'pause').length, 1); await controller.dispose();
});

test('a later read failure cannot claim an earlier successful timing mutation was unsent', async () => {
  for (const kind of ['auth', 'definitive']) {
    const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup); h.advance(1000);
    h.readHook = async () => { throw Object.assign(failure(kind), { requestSent: false }); };
    assert.equal(await controller.pause(), false);
    assert.equal(h.persisted().commands.at(-1).status, 'unknown');
    h.readHook = null; await controller.retry();
    assert.equal(controller.getSnapshot().record.state, 'paused');
    assert.equal(h.calls.filter(call => call === 'pause').length, 1); await controller.dispose();
  }
});

test('offline End is durable before verification, survives restart and prevents automatic completion', async () => {
  const h = harness(), first = h.create(); await first.initialize(); await first.start(setup);
  h.online = false; h.advance(1000);
  h.verifyHook = async () => assert.equal(h.persisted().commands.at(-1).kind, 'cancel');
  assert.equal(await first.end(), false);
  assert.equal(first.getSnapshot().ending, true); assert.equal(first.getSnapshot().unsyncedSessionCount, 1);
  assert.equal(h.persisted().commands.at(-1).status, 'prepared');
  h.advance(5000); await first.tick(); assert.equal(h.persisted().records[0].state, 'running');
  const second = h.restart(); await second.initialize(); await second.tick();
  assert.equal(second.getSnapshot().ending, true); assert.equal(h.credits, 0);
  assert.equal(h.calls.filter(call => call === 'complete').length, 0);
  h.online = true; h.verifyHook = null; await second.refresh(true);
  assert.equal(second.getSnapshot().record.state, 'cancelled'); assert.equal(second.getSnapshot().ending, false);
  assert.equal(second.getSnapshot().unsyncedSessionCount, 0); assert.equal(h.credits, 0);
  await second.dispose();
});

test('an unsent or rejected cancel retains the saved End intent until terminal state is read', async () => {
  for (const mode of ['not_sent', 'definitive']) {
    const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
    const original = h.server.cancel.bind(h.server);
    h.server.cancel = async () => { throw Object.assign(failure(mode === 'not_sent' ? 'auth' : 'definitive'),
      mode === 'not_sent' ? { requestSent: false } : { requestSent: true }); };
    assert.equal(await controller.end(), false);
    assert.ok(['prepared', 'unknown'].includes(h.persisted().commands.at(-1).status));
    assert.equal(controller.getSnapshot().ending, true);
    h.advance(5000); await controller.tick(); assert.equal(h.credits, 0);
    h.server.cancel = original; await controller.retry();
    assert.equal(h.persisted().records[0].state, 'cancelled'); assert.equal(h.credits, 0);
    await controller.dispose();
  }
});

test('a delayed original cancel and immediate retry have one terminal effect on the same server ID', async () => {
  const h = harness({ timeoutMs: 10 }), controller = h.create(); await controller.initialize(); await controller.start(setup);
  const release = deferred(); let requests = 0, effects = 0;
  const serverId = h.persisted().records[0].serverSessionId;
  h.server.cancel = async receivedId => {
    assert.equal(receivedId, serverId); h.calls.push('cancel');
    if (++requests === 1) await release.promise;
    const row = h.rows.get(receivedId);
    if (!['running', 'paused'].includes(row.status)) throw failure('definitive');
    effects++; row.status = 'cancelled'; row.completedAtMs = 1000000;
  };
  assert.equal(await controller.end(), false);
  const operationId = h.persisted().commands.at(-1).operationId;
  await controller.refresh(true);
  assert.equal(h.persisted().commands.at(-1).operationId, operationId);
  assert.equal(controller.getSnapshot().record.state, 'cancelled');
  release.resolve(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests, 2); assert.equal(effects, 1); assert.equal(h.credits, 0);
  assert.equal(h.calls.filter(call => call === 'complete').length, 0); await controller.dispose();
});

test('End supersedes unknown pause and resume without letting delayed originals revive a cancelled session', async () => {
  for (const kind of ['pause', 'resume']) {
    const h = harness({ timeoutMs: 10 }), controller = h.create(); await controller.initialize(); await controller.start(setup);
    if (kind === 'resume') assert.equal(await controller.pause(), true);
    const release = deferred(); let lateEffects = 0;
    h.server[kind] = async serverId => {
      h.calls.push(kind); await release.promise; const row = h.rows.get(serverId);
      if (row.status !== (kind === 'pause' ? 'running' : 'paused')) throw failure('definitive');
      lateEffects++; row.status = kind === 'pause' ? 'paused' : 'running';
    };
    assert.equal(await controller[kind](), false);
    const oldOperation = h.persisted().commands.at(-1).operationId;
    assert.equal(h.persisted().commands.at(-1).status, 'unknown');
    assert.equal(await controller.end(), true);
    assert.equal(h.persisted().commands.find(command => command.operationId === oldOperation).status, 'superseded');
    release.resolve(); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(lateEffects, 0); assert.equal(h.persisted().records[0].state, 'cancelled');
    assert.equal(h.credits, 0); await controller.dispose();
  }
});

test('a sixty-second settle window never authorizes replaying an unknown reversible control', async () => {
  for (const kind of ['pause', 'resume']) {
    const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
    if (kind === 'resume') assert.equal(await controller.pause(), true);
    let requests = 0;
    h.server[kind] = async () => { requests++; throw failure('transient'); };
    await controller[kind](); h.advance(61_000);
    await controller.retry(); await controller.refresh(true); await controller.tick();
    assert.equal(requests, 1); assert.equal(h.persisted().commands.at(-1).status, 'unknown');
    assert.equal(h.calls.filter(call => call === 'complete').length, 0);
    assert.equal(await controller.end(), true); assert.equal(h.persisted().records[0].state, 'cancelled');
    await controller.dispose();
  }
});

test('End accepts an existing completed receipt but never requests completion repair when the receipt is missing', async () => {
  for (const readable of [true, false]) {
    const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
    h.advance(1000); const row = h.rows.get(h.persisted().records[0].serverSessionId);
    row.status = 'completed'; row.completedAtMs = 1001000; row.elapsedMs = 3000;
    row.receipt = readable ? { sessionId: row.id, durationSeconds: 3,
      result: { session_id: row.id, duration_seconds: 3, already_completed: true, xp_earned: 0, gold_earned: 0 } } : null;
    await controller.end(); h.advance(5000); await controller.tick(); await controller.refresh(true);
    assert.equal(h.calls.filter(call => call === 'complete').length, 0);
    assert.equal(controller.getSnapshot().rewardsVisible, false);
    assert.equal(controller.getSnapshot().ending, !readable);
    assert.equal(!!controller.getSnapshot().receipt, readable);
    if (!readable) {
      assert.equal(h.persisted().records[0].state, 'running');
      assert.equal(controller.getSnapshot().error,
        'Your account reports this session as completed, but its saved result isn’t available yet. Your local record is kept while we check again. No new completion will be submitted.');
      assert.ok(h.persisted().commands.some(command => command.kind === 'cancel' && ['prepared', 'unknown'].includes(command.status)));
    }
    await controller.dispose();
  }
});

test('failed End persistence sends no cancellation and reports a storage problem before network verification', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
  const verifications = h.calls.filter(call => call === 'verify').length;
  h.backend.beforeWrite = async (_, value) => {
    if (JSON.parse(value).commands.some(command => command.kind === 'cancel')) throw failure('transient');
  };
  assert.equal(await controller.end(), false);
  assert.equal(h.calls.filter(call => call === 'verify').length, verifications);
  assert.equal(h.calls.filter(call => call === 'cancel').length, 0);
  assert.equal(h.persisted().commands.some(command => command.kind === 'cancel'), false);
  assert.match(controller.getSnapshot().error, /phone/); h.backend.beforeWrite = null; await controller.dispose();
});

test('owner revocation fences a delayed cancel response and hides pending session counts from the new owner', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
  const entered = deferred(), release = deferred(), original = h.server.cancel.bind(h.server);
  h.server.cancel = async serverId => { entered.resolve(); await release.promise; return original(serverId); };
  const ending = controller.end(); await entered.promise;
  h.switchOwner(); release.resolve(); assert.equal(await ending, false);
  assert.equal(controller.getSnapshot().record, null); assert.equal(controller.getSnapshot().ending, false);
  assert.equal(controller.getSnapshot().unsyncedSessionCount, 0);
  assert.equal(h.persisted().commands.at(-1).kind, 'cancel');
  assert.equal(h.persisted().commands.at(-1).status, 'prepared'); await controller.dispose();
});

test('an explicit mutation timeout can exceed read timeout without extending recovery reads', async () => {
  const h = harness({ timeoutMs: 10, mutationTimeoutMs: 100 }), controller = h.create(); await controller.initialize();
  h.startHook = () => new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await controller.start(setup), true);
  const release = deferred(); h.readHook = () => release.promise;
  await controller.refresh(true); assert.equal(controller.getSnapshot().busy, false);
  assert.ok(controller.getSnapshot().error); release.resolve(); h.readHook = null; await controller.dispose();
});
