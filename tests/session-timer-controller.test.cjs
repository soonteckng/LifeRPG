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
    async start(draft, clientSessionId) {
      calls.push('start'); assertPrepared('start');
      if (fail.start === 'definitive') throw failure('definitive');
      const row = { id: clientSessionId, setup: clone(draft), status: 'running', startedAtMs: serverTime,
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
    async readStartedSession(clientSessionId) { calls.push('identity'); if (readHook) await readHook(clientSessionId); return rows.has(clientSessionId) ? remote(rows.get(clientSessionId)) : null; },
    async readOpenSessions() {
      calls.push('open'); if (openHook) await openHook();
      return { complete: true, sessions: [...rows.values()].filter(row => ['running', 'paused'].includes(row.status)).map(remote) };
    },
  };
  const authority = { currentScope: () => owner, currentEpoch: () => epoch,
    async verify() { calls.push('verify'); if (verifyHook) await verifyHook(); if (!online) throw failure('auth'); return clone(owner); },
    ...options.operationHooks };
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

test('display scheduler lands on whole-second boundaries without moving expiry or saved timing', async () => {
  const h = harness(), controller = h.create();
  await controller.initialize(); await controller.start(setup);
  const deadline = controller.getSnapshot().record.endsAtMs;
  h.advance(907);
  assert.equal(controller.nextTickDelayMs(), 97);
  h.advance(controller.nextTickDelayMs()); await controller.tick();
  assert.equal(controller.getSnapshot().displayTimeLeft, 2);
  assert.equal(controller.getSnapshot().record.endsAtMs, deadline);
  assert.equal(h.credits, 0);
  h.advance(1995); await controller.tick(); assert.equal(h.credits, 0);
  h.advance(1); await controller.tick(); assert.equal(h.credits, 1);
  await controller.dispose();
});

test('paused and retired timers retain the retry heartbeat without scheduling fractional display changes', async () => {
  const h = harness(), controller = h.create();
  await controller.initialize(); await controller.start(setup);
  h.advance(907); await controller.pause();
  assert.equal(controller.nextTickDelayMs(), 200);
  h.advance(500); assert.equal(controller.nextTickDelayMs(), 200);
  h.switchOwner(); assert.equal(controller.nextTickDelayMs(), 200);
  await controller.dispose();
});

async function unknownStartWithoutRow(h, controller, draft = setup) {
  const originalStart = h.server.start;
  h.server.start = async (requested, clientSessionId) => {
    h.calls.push('start');
    const record = h.persisted().records.at(-1);
    assert.equal(clientSessionId, record.clientSessionId, 'Start must carry its previously saved client identity');
    assert.deepEqual(requested, record.setup);
    throw failure('transient');
  };
  assert.equal(await controller.start(draft), false);
  h.server.start = originalStart;
  const record = clone(controller.getSnapshot().record);
  assert.equal(record.state, 'not_started'); assert.equal(record.serverSessionId, null); assert.equal(h.rows.size, 0);
  return record;
}
async function legacyUnknownStart(h, draft = setup, serverOffset = 0) {
  const clock = h.clock(), clientSessionId = id('3', 999), operationId = id('1', 999);
  await h.store.update(current => journalApi.applyJournalAction(current, { type: 'admit',
    epoch: current.admission.epoch + 1, expectedRevision: current.revision }));
  await h.store.update(current => journalApi.applyJournalAction(current, { type: 'prepare_start', operationId, clientSessionId,
    setup: clone(draft), clock, epoch: current.admission.epoch, expectedRevision: current.revision }));
  await h.store.update(current => journalApi.applyJournalAction(current, { type: 'mark_unknown', operationId,
    epoch: current.admission.epoch, expectedRevision: current.revision }));
  const row = { id: id('4', 1), setup: clone(draft), status: 'running', startedAtMs: clock.wallTimeMs + serverOffset,
    elapsedMs: 0, lastResumedAtMs: clock.wallTimeMs + serverOffset, completedAtMs: null, receipt: null };
  h.rows.set(row.id, row); h.calls.push('start'); // The legacy request was sent before this controller was created.
  h.online = false;
  const controller = h.create(); await controller.initialize(); h.online = true;
  return { controller, row, record: clone(controller.getSnapshot().record) };
}
function stoppedProof(record, overrides = {}) {
  return { scope: clone(scope), clientSessionId: record.clientSessionId, serverSessionId: null,
    status: 'cancelled', legacyStartsFenced: true, ...overrides };
}
function identifiedRow(h, record, status) {
  const startedAtMs = h.clock().wallTimeMs;
  const row = { id: record.clientSessionId, setup: { ...clone(record.setup), title: null }, status,
    startedAtMs, elapsedMs: status === 'completed' ? record.setup.targetSeconds * 1000 : 0,
    lastResumedAtMs: startedAtMs, completedAtMs: status === 'running' ? null : startedAtMs + record.setup.targetSeconds * 1000,
    receipt: null };
  if (status === 'completed') row.receipt = { sessionId: row.id, durationSeconds: record.setup.targetSeconds,
    result: { session_id: row.id, duration_seconds: record.setup.targetSeconds, xp_earned: 1,
      gold_earned: 0, already_completed: true, goal_reached_now: false } };
  h.rows.set(row.id, row);
  return row;
}

test('new Starts persist one identity for the v2 request and its operation, while retaining the v1 wire format', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  let sentId;
  const original = h.server.start;
  h.server.start = async (draft, clientSessionId) => {
    sentId = clientSessionId;
    const journal = h.persisted(), record = journal.records.at(-1), command = journal.commands.at(-1);
    assert.equal(journal.schemaVersion, 1); assert.equal(clientSessionId, record.clientSessionId);
    assert.equal(command.operationId, clientSessionId); assert.equal(command.clientSessionId, clientSessionId);
    return original(draft, clientSessionId);
  };
  assert.equal(await controller.start(setup), true);
  assert.equal(controller.getSnapshot().record.serverSessionId, sentId);
  await controller.dispose();
});

test('slow online Start cannot display zero while End would still be an early cancellation', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  let delayed = false;
  h.verifyHook = async () => { if (!delayed) { delayed = true; h.advance(1200); } };
  assert.equal(await controller.start({ ...setup, targetSeconds: 10 }), true);
  h.verifyHook = null;
  h.advance(8800);
  await controller.tick();
  const before = controller.getSnapshot();
  assert.equal(before.timeLeft, 2, 'canonical session still has server-timed work remaining');
  assert.equal(before.displayTimeLeft, 1, 'presentation must not advertise premature completion');
  h.advance(1200);
  assert.equal(journalApi.deriveJournalTimer(h.persisted().records[0], h.clock()).remainingMs, 0);
  assert.equal(h.persisted().records[0].state, 'running', 'expiry tick has not run yet');
  await controller.end();
  assert.equal(h.persisted().records[0].state, 'completed');
  assert.equal(h.credits, 1);
  assert.equal(h.calls.filter(call => call === 'cancel').length, 0);
  controller.dismissSummary();
  await controller.dispose();
  const restored = h.restart(); await restored.initialize();
  assert.equal(h.credits, 1); assert.equal(restored.getSnapshot().unsyncedSessionCount, 0);
  await restored.dispose();
});

test('idle offline account checks never report a corrupt or unreadable local journal', async () => {
  const h = harness(); h.online = false;
  const controller = h.create(); await controller.initialize();
  assert.equal(controller.getSnapshot().record, null);
  assert.equal(controller.getSnapshot().restoring, false);
  assert.equal(controller.getSnapshot().restoreError, false);
  await controller.refresh(true);
  assert.equal(controller.getSnapshot().restoreError, false);
  h.online = true; await controller.refresh(true);
  assert.equal(controller.getSnapshot().error, null); assert.equal(controller.getSnapshot().restoreError, false);
  await controller.dispose();
});

test('v2 unknown Starts never adopt or end another device session with identical setup and timestamps', async () => {
  for (const status of ['running', 'paused', 'cancelled', 'completed']) {
    const h = harness(), controller = h.create(); await controller.initialize();
    const record = await unknownStartWithoutRow(h, controller, { ...setup, targetSeconds: 60 });
    const otherId = id('4', 777), row = identifiedRow(h, { ...record, clientSessionId: otherId }, status);
    const immutableRow = clone(row), before = h.calls.length;
    h.server.readFinishedStart = async () => {
      h.calls.push('finished'); return { complete: true, sessions: [await h.server.readSession(otherId)] };
    };
    assert.equal(await controller.retry(), false, status);
    assert.equal(controller.getSnapshot().record.serverSessionId, null, status);
    assert.equal(controller.getSnapshot().record.state, 'not_started', status);
    assert.equal(controller.getSnapshot().receipt, null, status);
    assert.match(controller.getSnapshot().error, /saved identity/i, status);
    h.server.confirmStartStop = async () => { h.calls.push('confirm-stop'); throw failure('transient'); };
    assert.equal(await controller.end(), false, status);
    assert.equal(controller.getSnapshot().ending, true, status);
    assert.equal(controller.getSnapshot().record.serverSessionId, null, status);
    const calls = h.calls.slice(before);
    assert.equal(calls.filter(call => ['open', 'finished', 'cancel', 'complete', 'start'].includes(call)).length, 0, status);
    assert.equal(calls.filter(call => call === 'confirm-stop').length, 1, status);
    assert.deepEqual(h.rows.get(otherId), immutableRow, status); assert.equal(h.credits, 0, status);
    await controller.dispose();
  }
});

test('server Stop tombstone can settle an unknown v2 Start before its delayed original request arrives', async () => {
  const h = harness({ timeoutMs: 10 }), controller = h.create(); await controller.initialize();
  const entered = deferred(), release = deferred(), settled = deferred(), tombstones = new Set();
  const originalStart = h.server.start;
  h.server.start = async (draft, clientSessionId) => {
    h.calls.push('delayed-start'); entered.resolve(); await release.promise;
    try {
      if (tombstones.has(clientSessionId)) throw failure('definitive');
      return await originalStart(draft, clientSessionId);
    } finally { settled.resolve(); }
  };
  const starting = controller.start({ ...setup, targetSeconds: 60 }); await entered.promise;
  assert.equal(await starting, false); const unknown = clone(controller.getSnapshot().record);
  h.server.confirmStartStop = async (draft, clientSessionId) => {
    assert.deepEqual(draft, unknown.setup); assert.equal(clientSessionId, unknown.clientSessionId);
    tombstones.add(clientSessionId); return stoppedProof(unknown);
  };
  assert.equal(await controller.end(), true);
  assert.equal(controller.getSnapshot().record, null); assert.equal(h.rows.size, 0);
  const confirmed = clone(h.persisted());
  release.resolve(); await settled.promise; await Promise.resolve();
  assert.equal(h.rows.size, 0); assert.equal(h.credits, 0); assert.deepEqual(h.persisted(), confirmed);
  h.server.start = originalStart;
  assert.equal(await controller.start(setup), true);
  assert.notEqual(controller.getSnapshot().record.clientSessionId, unknown.clientSessionId);
  assert.equal(h.rows.size, 1); assert.equal(h.calls.filter(call => call === 'complete' || call === 'cancel').length, 0);
  await controller.dispose();
});

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
  assert.equal(controller.getSnapshot().record, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(h.persisted().records[0].sync.receipt); await controller.dispose();
});

test('Done on an online-started offline finish closes presentation while its completion remains queued across restart', async () => {
  const h = harness(); let c = h.create(); await c.initialize(); await c.start(setup);
  h.online = false; h.advance(3000); await c.tick();
  const original = clone(h.persisted().records[0]), command = clone(h.persisted().commands.find(row => row.kind === 'complete'));
  c.dismissSummary(); assert.equal(c.getSnapshot().record, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.persisted().schemaVersion, 2); assert.notEqual(h.persisted().records[0].dismissedAtMs, null);
  assert.equal(h.persisted().records[0].completedAtMs, original.completedAtMs);
  assert.deepEqual(h.persisted().commands.find(row => row.kind === 'complete'), command);
  assert.equal(c.getSnapshot().unsyncedSessionCount, 1); await c.dispose();
  c = h.restart(); await c.initialize(); assert.equal(c.getSnapshot().record, null);
  h.online = true; await c.refresh(true);
  assert.equal(c.getSnapshot().receipt.sessionId, original.serverSessionId);
  assert.equal(c.getSnapshot().recovered, true); assert.equal(c.getSnapshot().rewardsVisible, false); assert.equal(h.credits, 1);
  c.dismissSummary(); await new Promise(resolve => setImmediate(resolve)); await c.dispose();
  c = h.restart(); await c.initialize(); assert.equal(c.getSnapshot().record, null);
  assert.equal(h.credits, 1); await c.dispose();
});

test('Done persists while the original server completion reply is held, then exposes one calm confirmed receipt', async () => {
  const h = harness(), c = h.create(); await c.initialize(); await c.start(setup);
  const reply = deferred(); h.completeHook = () => reply.promise; h.advance(3000);
  const finishing = c.tick(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.getSnapshot().record.state, 'completed'); c.dismissSummary();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(c.getSnapshot().record, null);
  assert.notEqual(h.persisted().records[0].dismissedAtMs, null); assert.equal(h.persisted().records[0].sync.receipt, null);
  reply.resolve(); await finishing;
  assert.equal(c.getSnapshot().syncStatus, 'saved'); assert.equal(c.getSnapshot().rewardsVisible, false);
  assert.equal(c.getSnapshot().recovered, true); assert.equal(h.credits, 1);
  c.dismissSummary(); await new Promise(resolve => setImmediate(resolve)); await c.refresh(true);
  assert.equal(c.getSnapshot().record, null); assert.equal(h.credits, 1); await c.dispose();
});

test('presentation dismissal cannot conceal an unknown Start or paused legacy operation', async () => {
  const h = harness(), c = h.create(); await c.initialize(); await c.start({ ...setup, targetSeconds: 30 });
  h.fail.pause = 'not_applied'; await c.pause();
  const before = h.values.get(h.store.key), id = c.getSnapshot().record.clientSessionId;
  await assert.rejects(() => h.store.update(journal => journalApi.applyJournalAction(journal, { type: 'dismiss', clientSessionId: id,
    dismissedAtMs: h.clock().wallTimeMs, epoch: journal.admission.epoch, expectedRevision: journal.revision })));
  assert.equal(h.values.get(h.store.key), before); await c.dispose();
});

test('Start exposes immediate screen feedback while verification is pending without inventing a running session', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  const gate = deferred(); h.verifyHook = () => gate.promise;
  const request = controller.start({ ...setup, targetSeconds: 120 });
  assert.deepEqual(controller.getSnapshot().interaction, { kind: 'start', timeLeft: 120 });
  assert.equal(controller.getSnapshot().record, null); assert.deepEqual(h.persisted().records, []);
  h.advance(1000); await controller.tick(); assert.equal(controller.getSnapshot().interaction.timeLeft, 119);
  assert.equal(h.calls.filter(call => call === 'start').length, 0); assert.equal(h.credits, 0);
  gate.resolve(); assert.equal(await request, true);
  assert.equal(controller.getSnapshot().interaction, null); assert.equal(controller.getSnapshot().record.state, 'running');
  await controller.dispose();
});

test('Pause and Resume respond before verification while their timing preview stays outside the journal', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start({ ...setup, targetSeconds: 120 });
  const before = clone(h.persisted()), pauseGate = deferred(); h.verifyHook = () => pauseGate.promise;
  const pausing = controller.pause();
  assert.deepEqual(controller.getSnapshot().interaction, { kind: 'pause', timeLeft: 120 });
  assert.equal(controller.getSnapshot().record.state, 'running');
  h.advance(2000); await controller.tick(); assert.equal(controller.getSnapshot().interaction.timeLeft, 120);
  assert.deepEqual(h.persisted(), before); assert.equal(h.calls.filter(call => call === 'pause').length, 0);
  pauseGate.resolve(); assert.equal(await pausing, true); assert.equal(controller.getSnapshot().interaction, null);
  assert.equal(controller.getSnapshot().record.state, 'paused');
  const paused = clone(h.persisted()), resumeGate = deferred(); h.verifyHook = () => resumeGate.promise;
  const resuming = controller.resume();
  assert.equal(controller.getSnapshot().interaction.kind, 'resume'); assert.equal(controller.getSnapshot().record.state, 'paused');
  const remaining = controller.getSnapshot().interaction.timeLeft;
  h.advance(2000); await controller.tick(); assert.equal(controller.getSnapshot().interaction.timeLeft, remaining - 2);
  assert.deepEqual(h.persisted(), paused); assert.equal(h.credits, 0);
  resumeGate.resolve(); assert.equal(await resuming, true); assert.equal(controller.getSnapshot().interaction, null);
  assert.equal(controller.getSnapshot().record.state, 'running'); await controller.dispose();
});

test('successful delayed Start, Pause and Resume keep a continuous display clock without changing server timing', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  const startGate = deferred(); h.verifyHook = () => startGate.promise;
  const starting = controller.start({ ...setup, targetSeconds: 20 });
  h.advance(1000); await controller.tick();
  assert.equal(controller.getSnapshot().displayTimeLeft, 19);
  startGate.resolve(); assert.equal(await starting, true);
  assert.equal(controller.getSnapshot().displayTimeLeft, 19, 'Start reply cannot restart the visible countdown');
  assert.equal(controller.getSnapshot().timeLeft, 20, 'server timing stays authoritative');
  h.verifyHook = null; h.advance(3000); await controller.tick();
  assert.equal(controller.getSnapshot().displayTimeLeft, 16);
  const pauseGate = deferred(); h.verifyHook = () => pauseGate.promise;
  const pausing = controller.pause();
  h.advance(2000); await controller.tick(); assert.equal(controller.getSnapshot().displayTimeLeft, 16);
  pauseGate.resolve(); assert.equal(await pausing, true);
  assert.equal(controller.getSnapshot().displayTimeLeft, 16, 'paused numeral cannot drop when the reply arrives');
  assert.equal(controller.getSnapshot().timeLeft, 15);
  h.advance(1000); await controller.tick(); assert.equal(controller.getSnapshot().displayTimeLeft, 16);
  const resumeGate = deferred(); h.verifyHook = () => resumeGate.promise;
  const resuming = controller.resume();
  h.advance(2000); await controller.tick(); assert.equal(controller.getSnapshot().displayTimeLeft, 14);
  resumeGate.resolve(); assert.equal(await resuming, true);
  assert.equal(controller.getSnapshot().displayTimeLeft, 14, 'Resume reply cannot bounce the countdown back to 15');
  assert.equal(controller.getSnapshot().timeLeft, 15);
  h.advance(1000); await controller.tick(); assert.equal(controller.getSnapshot().displayTimeLeft, 13);
  await controller.dispose();
});

test('the display stays above zero until the later server deadline is eligible for completion', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  const gate = deferred(); h.verifyHook = () => gate.promise;
  const starting = controller.start({ ...setup, targetSeconds: 3 });
  h.advance(2000); await controller.tick(); gate.resolve(); await starting; h.verifyHook = null;
  h.advance(1000); await controller.tick();
  assert.equal(controller.getSnapshot().displayTimeLeft, 1); assert.equal(controller.getSnapshot().timeLeft, 2);
  assert.equal(controller.getSnapshot().record.state, 'running'); assert.equal(h.credits, 0);
  h.advance(2000); await controller.tick(); assert.equal(h.credits, 1);
  assert.equal(controller.getSnapshot().displayTimeLeft, null); await controller.dispose();
});

test('a failed or uncertain timing action drops its preview and retains the established recovery rules', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
  const before = clone(h.persisted()); h.online = false;
  const unsent = controller.pause(); assert.equal(controller.getSnapshot().interaction.kind, 'pause');
  assert.equal(await unsent, false); assert.equal(controller.getSnapshot().interaction, null);
  assert.deepEqual(h.persisted(), before); assert.equal(controller.getSnapshot().record.state, 'running');
  h.online = true; h.fail.pause = 'not_applied';
  assert.equal(await controller.pause(), false); assert.equal(controller.getSnapshot().interaction, null);
  const count = h.calls.filter(call => call === 'pause').length;
  h.advance(5000); await controller.tick(); await controller.retry();
  assert.equal(h.calls.filter(call => call === 'pause').length, count); assert.equal(h.credits, 0);
  assert.equal(controller.getSnapshot().receipt, null); assert.equal(controller.getSnapshot().syncStatus, 'waiting');
  await controller.dispose(); assert.equal(controller.getSnapshot().interaction, null);
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
    const unsafeRewards = [];
    controller.subscribe(snapshot => { if (snapshot.rewardsVisible && !snapshot.receipt) unsafeRewards.push(snapshot); });
    if (mode === 'write') {
      h.backend.beforeWrite = async (_, value) => {
        if (JSON.parse(value).records[0]?.sync.receipt) { h.backend.beforeWrite = null; throw failure('transient'); }
      };
    } else { h.fail.complete = 'lost'; h.completeHook = () => { h.online = false; }; }
    h.advance(3000); await controller.tick();
    assert.equal(h.credits, 1); assert.deepEqual(unsafeRewards, []); assert.equal(controller.getSnapshot().rewardsVisible, false);
    if (mode === 'reply') assert.equal(controller.getSnapshot().receipt, null);
    else assert.ok(controller.getSnapshot().receipt, 'fresh server proof can recover a transient receipt write failure immediately');
    h.online = true;
    await controller.retry();
    assert.equal(h.credits, 1); assert.ok(controller.getSnapshot().receipt);
    assert.equal(controller.getSnapshot().rewardsVisible, false, 'a reconciled saved result cannot celebrate again');
    await controller.dispose();
  }
});

test('Done while a completion reply is pending keeps the result and suppresses a late celebration', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
  const entered = deferred(), release = deferred();
  h.completeHook = async () => { entered.resolve(); await release.promise; };
  h.advance(3000); const finishing = controller.tick(); await entered.promise;
  const completedId = controller.getSnapshot().record.clientSessionId;
  assert.equal(controller.getSnapshot().record.state, 'completed');
  assert.equal(controller.getSnapshot().receipt, null);
  controller.dismissSummary();
  assert.equal(h.persisted().records[0].clientSessionId, completedId);
  assert.equal(h.persisted().records[0].sync.state, 'pending');
  release.resolve(); await finishing;
  assert.equal(h.credits, 1); assert.ok(controller.getSnapshot().receipt);
  assert.equal(controller.getSnapshot().rewardsVisible, false);
  await controller.dispose();
  const reopened = h.restart(); await reopened.initialize(); await reopened.refresh(true);
  assert.equal(h.credits, 1); assert.equal(h.calls.filter(call => call === 'complete').length, 1);
  assert.equal(reopened.getSnapshot().record, null); assert.equal(reopened.getSnapshot().rewardsVisible, false);
  assert.ok(h.persisted().records[0].sync.receipt);
  await reopened.dispose();
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

test('cold launches keep historical synced receipts without restoring a completion surface or submitting completion again', async () => {
  for (const dismissed of [false, true]) {
    const h = harness(), first = h.create(); await first.initialize(); await first.start(setup);
    h.advance(3000); await first.tick();
    assert.equal(first.getSnapshot().rewardsVisible, true);
    if (dismissed) first.dismissSummary();
    const history = clone(h.persisted().records), commands = clone(h.persisted().commands);
    assert.equal(history[0].dismissedAtMs, null, 'successful receipts retain the existing v1 journal shape');
    await first.dispose();
    for (let launch = 0; launch < 3; launch++) {
      const restored = h.restart(), snapshots = [];
      restored.subscribe(snapshot => snapshots.push(snapshot));
      await restored.initialize(); await restored.refresh(true); await restored.tick();
      assert.equal(restored.getSnapshot().record, null);
      assert.equal(restored.getSnapshot().receipt, null);
      assert.equal(restored.getSnapshot().rewardsVisible, false);
      assert.equal(restored.getSnapshot().recovered, false);
      assert.equal(restored.getSnapshot().syncStatus, 'idle');
      assert.ok(snapshots.every(snapshot => snapshot.record === null && !snapshot.rewardsVisible), 'no historical result flashes during admission or refresh');
      assert.deepEqual(h.persisted().records, history, 'receipt and terminal timing remain durable');
      assert.deepEqual(h.persisted().commands, commands);
      assert.equal(h.credits, 1); assert.equal(h.calls.filter(call => call === 'complete').length, 1);
      await restored.dispose();
    }
  }
});

test('an older synced receipt cannot hide a recovered offline completion, which saves exactly once on reconnect', async () => {
  const h = harness(), first = h.create(); await first.initialize(); await first.start(setup);
  h.advance(3000); await first.tick();
  first.dismissSummary(); await new Promise(resolve => setImmediate(resolve));
  const historical = clone(h.persisted().records[0]);
  assert.equal(await first.start({ ...setup, title: 'Second learning block' }), true);
  h.online = false; h.advance(3000); await first.tick();
  const pending = clone(first.getSnapshot().record);
  assert.equal(pending.state, 'completed'); assert.equal(pending.sync.receipt, null);
  await first.dispose();
  const restored = h.restart(); await restored.initialize();
  assert.equal(restored.getSnapshot().record.clientSessionId, pending.clientSessionId);
  assert.equal(restored.getSnapshot().record.completedAtMs, pending.completedAtMs);
  assert.equal(restored.getSnapshot().recovered, true);
  assert.equal(restored.getSnapshot().receipt, null); assert.equal(h.credits, 1);
  h.online = true; await restored.refresh(true);
  assert.equal(restored.getSnapshot().record.clientSessionId, pending.clientSessionId);
  assert.equal(restored.getSnapshot().record.setup.title, 'Second learning block');
  assert.equal(restored.getSnapshot().recovered, true);
  assert.equal(restored.getSnapshot().receipt.sessionId, pending.serverSessionId);
  assert.equal(restored.getSnapshot().rewardsVisible, false);
  await restored.refresh(true); await restored.tick();
  assert.equal(h.credits, 2); assert.equal(h.calls.filter(call => call === 'complete').length, 2);
  assert.deepEqual(h.persisted().records.find(record => record.clientSessionId === historical.clientSessionId), historical);
  const saved = clone(h.persisted().records);
  restored.dismissSummary(); await new Promise(resolve => setImmediate(resolve)); await restored.dispose();
  const reopened = h.restart(); await reopened.initialize();
  assert.equal(reopened.getSnapshot().record, null); assert.equal(reopened.getSnapshot().rewardsVisible, false);
  assert.deepEqual(h.persisted().records.map(row => row.sync.receipt), saved.map(row => row.sync.receipt)); assert.equal(h.credits, 2);
  await reopened.dispose();
});

test('ending a newer session never falls back to a previous saved completion', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
  h.advance(3000); await controller.tick();
  controller.dismissSummary(); await new Promise(resolve => setImmediate(resolve));
  const historical = clone(h.persisted().records[0]);
  assert.equal(await controller.start({ ...setup, targetSeconds: 120, title: 'New work' }), true);
  const newerId = controller.getSnapshot().record.clientSessionId;
  h.advance(1000); assert.equal(await controller.end(), true);
  assert.equal(controller.getSnapshot().record.clientSessionId, newerId);
  assert.equal(controller.getSnapshot().record.state, 'cancelled');
  assert.equal(controller.getSnapshot().receipt, null); assert.equal(controller.getSnapshot().rewardsVisible, false);
  assert.equal(await controller.end(), true);
  await controller.refresh(true); await controller.tick();
  assert.equal(controller.getSnapshot().record, null);
  assert.equal(controller.getSnapshot().receipt, null); assert.equal(controller.getSnapshot().rewardsVisible, false);
  assert.deepEqual(h.persisted().records.find(record => record.clientSessionId === historical.clientSessionId), historical);
  assert.equal(h.calls.filter(call => call === 'cancel').length, 1);
  assert.equal(h.calls.filter(call => call === 'complete').length, 1); assert.equal(h.credits, 1);
  await controller.dispose();
});

test('fresh completion remains visible in its current run while historical restore suppression leaves its receipt unchanged', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
  assert.equal(controller.getSnapshot().recovered, false);
  h.advance(3000); await controller.tick();
  const saved = clone(h.persisted().records[0]);
  assert.equal(controller.getSnapshot().record.clientSessionId, saved.clientSessionId);
  assert.equal(controller.getSnapshot().receipt.sessionId, saved.serverSessionId);
  assert.equal(controller.getSnapshot().rewardsVisible, true); assert.equal(controller.getSnapshot().recovered, false);
  await controller.refresh(true); await controller.tick();
  assert.equal(controller.getSnapshot().rewardsVisible, true);
  controller.dismissSummary();
  assert.equal(controller.getSnapshot().rewardsVisible, false);
  assert.equal(controller.getSnapshot().record, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.persisted().records[0].sync.receipt, saved.sync.receipt);
  assert.equal(h.persisted().records[0].completedAtMs, saved.completedAtMs);
  assert.equal(h.credits, 1); assert.equal(h.calls.filter(call => call === 'complete').length, 1);
  await controller.dispose();
});

test('a recovered lost completion reply identifies earlier work without another award or celebration', async () => {
  const h = harness(), first = h.create(); await first.initialize(); await first.start(setup);
  h.fail.complete = 'lost'; h.completeHook = () => { h.online = false; }; h.advance(3000); await first.tick();
  const pending = clone(first.getSnapshot().record);
  assert.equal(h.credits, 1); assert.equal(pending.sync.receipt, null);
  await first.dispose();
  h.online = true;
  const restored = h.restart(); await restored.initialize(); await restored.refresh(true);
  const snapshot = restored.getSnapshot();
  assert.equal(snapshot.record.clientSessionId, pending.clientSessionId);
  assert.equal(snapshot.record.setup.title, setup.title);
  assert.equal(snapshot.record.completedAtMs, pending.completedAtMs);
  assert.equal(snapshot.recovered, true);
  assert.equal(snapshot.receipt.sessionId, pending.serverSessionId);
  assert.equal(snapshot.receipt.result.already_completed, true);
  assert.equal(snapshot.rewardsVisible, false);
  await restored.refresh(true); await restored.tick();
  assert.equal(h.credits, 1); assert.equal(h.calls.filter(call => call === 'complete').length, 2);
  await restored.dispose();
  const reopened = h.restart(); await reopened.initialize();
  assert.equal(reopened.getSnapshot().record, null); assert.equal(reopened.getSnapshot().rewardsVisible, false);
  assert.equal(h.persisted().records[0].sync.receipt.sessionId, pending.serverSessionId);
  await reopened.dispose();
});

test('a unique matching owned session resolves a lost start reply even when device and server start times differ by a minute', async () => {
  for (const serverOffset of [-60000, 60000]) {
    const h = harness(); h.advance(0, serverOffset);
    const { controller } = await legacyUnknownStart(h, { ...setup, targetSeconds: 120 }, serverOffset);
    assert.equal(controller.getSnapshot().record.state, 'not_started');
    assert.equal(controller.getSnapshot().record.serverSessionId, null);
    assert.equal(await controller.retry(), true);
    const restored = controller.getSnapshot();
    assert.equal(restored.record.state, 'running'); assert.equal(restored.record.clockWarning, true);
    assert.equal(restored.recovered, true); assert.equal(restored.error, null);
    assert.equal(h.calls.filter(call => call === 'start').length, 1, 'restore account state without replaying Start');
    assert.equal(await controller.pause(), true); assert.equal(await controller.resume(), true);
    assert.equal(await controller.end(), true); assert.equal(h.credits, 0);
    await controller.dispose();
  }
});

test('End during a lost start acknowledgement saves its intent before verification, survives restart and cancels before recovered expiry', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  h.fail.start = 'lost'; assert.equal(await controller.start({ ...setup, targetSeconds: 60 }), false);
  const originalCommand = clone(h.persisted().commands[0]);
  h.online = false; const verifications = h.calls.filter(call => call === 'verify').length;
  let durableBeforeVerification = false;
  h.verifyHook = async () => {
    durableBeforeVerification = controller.getSnapshot().ending && /end_requested/.test(h.persisted().records[0].sync.reasonCode);
  };
  assert.equal(await controller.end(), false);
  assert.equal(durableBeforeVerification, true);
  assert.equal(h.calls.filter(call => call === 'verify').length, verifications + 1);
  assert.equal(controller.getSnapshot().ending, true); assert.match(controller.getSnapshot().error, /request to end.*saved/i);
  assert.deepEqual(h.persisted().commands[0].request, originalCommand.request);
  await controller.dispose(); h.verifyHook = null;
  h.advance(90000);
  const restored = h.restart(); await restored.initialize();
  assert.equal(restored.getSnapshot().ending, true); assert.equal(h.credits, 0);
  h.online = true; await restored.refresh(true); await restored.tick();
  assert.equal(restored.getSnapshot().record.state, 'cancelled'); assert.equal(restored.getSnapshot().ending, false);
  assert.equal(restored.getSnapshot().receipt, null);
  assert.equal(h.calls.filter(call => call === 'cancel').length, 1);
  assert.equal(h.calls.filter(call => call === 'complete').length, 0); assert.equal(h.credits, 0);
  assert.equal(h.calls.filter(call => call === 'start').length, 1);
  await restored.dispose();
});

test('End also escapes a remembered start UUID whose timing read failed, without requiring Pause or Resume first', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  h.readHook = async () => { throw failure('transient'); };
  assert.equal(await controller.start({ ...setup, targetSeconds: 60 }), false);
  const record = controller.getSnapshot().record;
  assert.equal(record.state, 'not_started'); assert.ok(record.serverSessionId);
  h.readHook = null;
  assert.equal(await controller.end(), true);
  assert.equal(controller.getSnapshot().record.state, 'cancelled');
  assert.equal(h.calls.filter(call => call === 'start').length, 1);
  assert.equal(h.calls.filter(call => call === 'cancel').length, 1);
  assert.equal(h.calls.filter(call => call === 'complete').length, 0); assert.equal(h.credits, 0);
  await controller.dispose();
});

test('an interrupted start-stop conversion preserves the marker and never expires or drops the stop on retry', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  h.readHook = async () => { throw failure('transient'); };
  assert.equal(await controller.start({ ...setup, targetSeconds: 60 }), false); h.readHook = null;
  h.backend.beforeWrite = async (_, value) => {
    if (JSON.parse(value).commands.some(command => command.kind === 'cancel')) throw failure('transient');
  };
  assert.equal(await controller.end(), false);
  assert.equal(controller.getSnapshot().record.state, 'running');
  assert.equal(controller.getSnapshot().ending, true);
  assert.match(h.persisted().records[0].sync.reasonCode, /end_requested/);
  assert.equal(h.persisted().commands.some(command => command.kind === 'cancel'), false);
  const storageError = controller.getSnapshot().error;
  h.advance(90000); await controller.tick();
  assert.equal(h.calls.filter(call => call === 'complete').length, 0); assert.equal(h.credits, 0);
  assert.equal(controller.getSnapshot().error, storageError, 'expired ticks must not erase a pending stop persistence error');
  assert.equal(controller.getSnapshot().busy, false);
  h.backend.beforeWrite = null;
  assert.equal(await controller.end(), true);
  assert.equal(controller.getSnapshot().record.state, 'cancelled');
  assert.equal(h.calls.filter(call => call === 'cancel').length, 1); assert.equal(h.credits, 0);
  await controller.dispose();
});

test('an empty owner read preserves an unknown Start and saved End until a delayed original session appears, without another Start', async () => {
  const h = harness({ timeoutMs: 10 }), controller = h.create(); await controller.initialize();
  const entered = deferred(), release = deferred();
  h.server.start = async (draft, serverId) => {
    h.calls.push('start'); entered.resolve(); await release.promise;
    const startedAtMs = h.clock().wallTimeMs;
    h.rows.set(serverId, { id: serverId, setup: clone(draft), status: 'running', startedAtMs,
      elapsedMs: 0, lastResumedAtMs: startedAtMs, completedAtMs: null, receipt: null });
    return serverId;
  };
  const starting = controller.start({ ...setup, targetSeconds: 60 }); await entered.promise;
  assert.equal(await starting, false); assert.equal(h.rows.size, 0);
  assert.equal(await controller.retry(), false);
  assert.match(controller.getSnapshot().error, /No matching session was found/);
  assert.equal(await controller.end(), false); assert.equal(controller.getSnapshot().ending, true);
  assert.equal(await controller.retry(), false);
  assert.equal(controller.getSnapshot().record.state, 'not_started');
  assert.equal(h.calls.filter(call => call === 'start').length, 1);
  h.advance(90000); release.resolve(); await Promise.resolve(); await Promise.resolve();
  await controller.refresh(true);
  assert.equal(controller.getSnapshot().record.state, 'cancelled');
  assert.equal(h.calls.filter(call => call === 'start').length, 1);
  assert.equal(h.calls.filter(call => call === 'cancel').length, 1);
  assert.equal(h.calls.filter(call => call === 'complete').length, 0); assert.equal(h.credits, 0);
  await controller.dispose();
});

test('End while a remembered Start is remotely completed never invokes completion repair without an existing receipt', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  h.readHook = async () => { throw failure('transient'); };
  assert.equal(await controller.start({ ...setup, targetSeconds: 60 }), false); h.readHook = null;
  const row = h.rows.get(controller.getSnapshot().record.serverSessionId);
  row.status = 'completed'; row.completedAtMs = h.clock().wallTimeMs;
  assert.equal(await controller.end(), false);
  assert.equal(controller.getSnapshot().ending, true);
  assert.match(controller.getSnapshot().error, /No new completion will be submitted/);
  await controller.refresh(true);
  assert.equal(h.calls.filter(call => call === 'complete').length, 0);
  assert.equal(h.calls.filter(call => call === 'cancel').length, 0); assert.equal(h.credits, 0);
  await controller.dispose();
});

test('operation verification hooks wrap initialization and mutations, clear on timeout and disposal, and do not replace epoch fences', async () => {
  let active = false, begins = 0;
  const hooks = { beginOperation: () => { assert.equal(active, false); active = true; begins++; }, endOperation: () => { active = false; } };
  const h = harness({ timeoutMs: 10, operationHooks: hooks }), controller = h.create();
  h.verifyHook = async () => assert.equal(active, true);
  await controller.initialize(); assert.equal(active, false); assert.equal(begins, 1);
  assert.equal(await controller.start(setup), true); assert.equal(active, false); assert.equal(begins, 2);
  const hanging = deferred(); h.verifyHook = () => hanging.promise;
  assert.equal(await controller.pause(), false); assert.equal(active, false); assert.equal(begins, 3);
  hanging.resolve(); h.verifyHook = null;
  const entered = deferred(), release = deferred();
  h.readHook = async () => { entered.resolve(); await release.promise; };
  const refreshing = controller.refresh(true); await entered.promise;
  assert.equal(active, true); await controller.dispose(); assert.equal(active, false);
  h.switchOwner(); release.resolve(); await refreshing;
  assert.equal(active, false); assert.equal(controller.getSnapshot().record, null);
});

test('known running refresh reads its UUID once and does not perform unrelated open-session discovery', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start({ ...setup, targetSeconds: 120 });
  const before = h.calls.length;
  await controller.refresh(true);
  const reads = h.calls.slice(before);
  assert.equal(reads.filter(call => call === 'read').length, 1);
  assert.equal(reads.filter(call => call === 'open').length, 0);
  assert.equal(controller.getSnapshot().record.state, 'running'); assert.equal(controller.getSnapshot().busy, false);
  await controller.dispose();
});

test('known completion retry uses the guarded idempotent completion without a redundant discovery read', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start(setup);
  h.online = false; h.advance(3000); await controller.tick();
  h.online = true; const before = h.calls.length;
  await controller.refresh(true);
  const reads = h.calls.slice(before);
  assert.equal(reads.filter(call => call === 'read').length, 0);
  assert.equal(reads.filter(call => call === 'complete').length, 1);
  assert.equal(reads.filter(call => call === 'open').length, 0);
  assert.equal(controller.getSnapshot().syncStatus, 'saved'); assert.equal(controller.getSnapshot().busy, false);
  assert.equal(h.credits, 1); await controller.dispose();
});

test('known cancellation retry reads only before and after Cancel, without an extra discovery read', async () => {
  const h = harness(), controller = h.create(); await controller.initialize(); await controller.start({ ...setup, targetSeconds: 120 });
  h.online = false; assert.equal(await controller.end(), false);
  h.online = true; const before = h.calls.length;
  await controller.refresh(true);
  const reads = h.calls.slice(before);
  assert.equal(reads.filter(call => call === 'read').length, 2);
  assert.equal(reads.filter(call => call === 'cancel').length, 1);
  assert.equal(reads.filter(call => call === 'open').length, 0);
  assert.equal(controller.getSnapshot().record.state, 'cancelled'); assert.equal(controller.getSnapshot().busy, false);
  assert.equal(h.credits, 0); await controller.dispose();
});

test('legacy unknown Start still uses complete owned-open proof once without a redundant known-session read', async () => {
  const h = harness(), { controller } = await legacyUnknownStart(h, { ...setup, targetSeconds: 120 });
  const before = h.calls.length;
  await controller.refresh(true);
  const reads = h.calls.slice(before);
  assert.equal(reads.filter(call => call === 'open').length, 1);
  assert.equal(reads.filter(call => call === 'read').length, 0);
  assert.equal(reads.filter(call => call === 'start').length, 0);
  assert.equal(controller.getSnapshot().record.state, 'running');
  assert.equal(controller.getSnapshot().busy, false); await controller.dispose();
});

test('Retry confirming an expired unknown Start saves that original session without starting its setup again', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  h.fail.start = 'lost'; assert.equal(await controller.start(setup), false);
  const originalClientId = controller.getSnapshot().record.clientSessionId;
  h.advance(3000);
  assert.equal(await controller.retry(), true);
  assert.equal(controller.getSnapshot().record.clientSessionId, originalClientId);
  assert.equal(controller.getSnapshot().record.state, 'completed');
  assert.equal(controller.getSnapshot().receipt.durationSeconds, setup.targetSeconds);
  assert.equal(controller.getSnapshot().recovered, true);
  assert.equal(h.calls.filter(call => call === 'start').length, 1);
  assert.equal(h.calls.filter(call => call === 'complete').length, 1); assert.equal(h.credits, 1);
  await controller.dispose();
});

test('lost Start reply with an already cancelled server row clears the stuck local timer without any new mutation', async () => {
  const h=harness(),{controller,row}=await legacyUnknownStart(h);h.advance(1000);row.status='cancelled';row.completedAtMs=h.clock().wallTimeMs;
  h.server.readFinishedStart=async(draft,requestedAt)=>{h.calls.push('finished');assert.deepEqual(draft,setup);assert.equal(requestedAt,1000000);return{complete:true,sessions:[await h.server.readSession(row.id)]};};
  const before=h.calls.length;await controller.retry();
  assert.equal(controller.getSnapshot().record.state,'cancelled');assert.equal(controller.getSnapshot().syncStatus,'saved');assert.equal(controller.getSnapshot().unsyncedSessionCount,0);
  assert.deepEqual(h.calls.slice(before).filter(call=>['start','complete','cancel'].includes(call)),[]);assert.equal(h.credits,0);
  await controller.dispose();const reopened=h.restart();await reopened.initialize();assert.equal(reopened.getSnapshot().record,null);await reopened.dispose();
});

test('lost Start with an existing finished receipt restores its saved result without celebrating or awarding again',async()=>{
  const h=harness(),{controller,row}=await legacyUnknownStart(h);h.advance(4000);row.status='completed';row.completedAtMs=h.clock().wallTimeMs;
  row.receipt={sessionId:row.id,durationSeconds:setup.targetSeconds,result:{session_id:row.id,duration_seconds:setup.targetSeconds,xp_earned:0,gold_earned:0,already_completed:true}};
  h.server.readFinishedStart=async()=>({complete:true,sessions:[await h.server.readSession(row.id)]});await controller.retry();
  assert.equal(controller.getSnapshot().record.state,'completed');assert.equal(controller.getSnapshot().receipt.sessionId,row.id);assert.equal(controller.getSnapshot().recovered,true);assert.equal(controller.getSnapshot().rewardsVisible,false);
  assert.equal(controller.getSnapshot().unsyncedSessionCount,0);assert.equal(h.calls.filter(call=>call==='start').length,1);assert.equal(h.calls.filter(call=>call==='complete').length,0);
  await controller.dispose();
});

test('terminal Start matching keeps ambiguous, unrelated, missing-receipt and missing-row outcomes protected',async()=>{
  for(const kind of ['ambiguous','setup','time','identity','receipt','empty','incomplete','foreign']) {
    const h=harness(),{controller,row}=await legacyUnknownStart(h);row.status='cancelled';row.completedAtMs=h.clock().wallTimeMs;
    const candidate=await h.server.readSession(row.id);
    if(kind==='setup')candidate.setup.notes='Different session';
    if(kind==='time')candidate.startedAtMs+=15001;
    if(kind==='receipt'){candidate.status='completed';candidate.snapshot=null;candidate.receipt=null;}
    if(kind==='foreign')candidate.scope=otherScope;
    if(kind==='identity')candidate.serverSessionId=h.persisted().records[0].clientSessionId; // rejected snapshot identity conflict
    h.server.readFinishedStart=async()=>({complete:kind!=='incomplete',sessions:kind==='empty'?[]:kind==='ambiguous'?[candidate,clone(candidate)]:[candidate]});
    await controller.retry();assert.equal(controller.getSnapshot().record.state,'not_started',kind);assert.equal(controller.getSnapshot().rewardsVisible,false,kind);
    assert.equal(h.calls.filter(call=>call==='start').length,1,kind);assert.equal(h.calls.filter(call=>call==='complete').length,0,kind);await controller.dispose();
  }
});

test('server tombstone proof settles an absent legacy Start and saved End atomically, then Home can start another session', async () => {
  const h = harness(), { controller, record } = await legacyUnknownStart(h, { ...setup, targetSeconds: 60 });
  h.rows.clear();
  const originalCommand = clone(h.persisted().commands[0]);
  h.server.confirmStartStop = async (requested, clientSessionId) => {
    h.calls.push('confirm-stop'); assert.deepEqual(requested, record.setup); assert.equal(clientSessionId, record.clientSessionId);
    assert.equal(controller.getSnapshot().ending, true, 'local End is durable before server confirmation');
    return stoppedProof(record);
  };
  assert.equal(await controller.end(), true);
  assert.equal(controller.getSnapshot().record, null); assert.equal(controller.getSnapshot().ending, false);
  assert.equal(controller.getSnapshot().unsyncedSessionCount, 0); assert.equal(controller.getSnapshot().error, null);
  const stopped = h.persisted().records[0];
  assert.equal(stopped.state, 'cancelled'); assert.equal(stopped.serverSessionId, null);
  assert.equal(stopped.sync.state, 'rejected'); assert.equal(stopped.sync.reasonCode, 'server_start_stop_confirmed');
  assert.equal(stopped.dismissedAtMs, h.clock().wallTimeMs); assert.equal(stopped.elapsedMs, 0);
  assert.equal(stopped.startedAtMs, null); assert.equal(stopped.completedAtMs, null); assert.equal(stopped.sync.receipt, null);
  assert.deepEqual(h.persisted().commands[0], { ...originalCommand, status: 'rejected' });
  assert.equal(h.calls.filter(call => call === 'complete' || call === 'cancel').length, 0); assert.equal(h.credits, 0);
  await controller.dispose();
  const restored = h.restart(); await restored.initialize();
  assert.equal(restored.getSnapshot().record, null); assert.equal(restored.getSnapshot().unsyncedSessionCount, 0);
  assert.equal(h.calls.filter(call => call === 'confirm-stop').length, 1, 'cold restore does not re-confirm a saved tombstone');
  const originalStart = h.server.start;
  h.server.start = async (requested, clientSessionId) => {
    assert.notEqual(clientSessionId, record.clientSessionId);
    assert.equal(clientSessionId, h.persisted().records.at(-1).clientSessionId);
    return originalStart(requested, clientSessionId);
  };
  assert.equal(await restored.start(setup), true); assert.equal(restored.getSnapshot().record.state, 'running');
  assert.equal(h.credits, 0); await restored.dispose();
});

test('legacy terminal time mismatch cannot strand a saved End after authenticated fence proof confirms no session identity', async () => {
  const h = harness(), { controller, record } = await legacyUnknownStart(h);
  h.rows.clear();
  const oldId = id('4', 1);
  h.rows.set(oldId, { id: oldId, setup: clone(record.setup), status: 'cancelled', startedAtMs: h.clock().wallTimeMs - 60000,
    elapsedMs: 0, lastResumedAtMs: null, completedAtMs: h.clock().wallTimeMs - 50000, receipt: null });
  h.server.readFinishedStart = async () => ({ complete: true, sessions: [await h.server.readSession(oldId)] });
  h.server.confirmStartStop = async () => { h.calls.push('confirm-stop'); return stoppedProof(record); };
  assert.equal(await controller.end(), true);
  assert.equal(controller.getSnapshot().record, null); assert.equal(controller.getSnapshot().error, null);
  assert.equal(h.persisted().records[0].serverSessionId, null, 'do not falsely bind an unrelated historical row');
  assert.equal(h.rows.get(oldId).status, 'cancelled');
  assert.equal(h.calls.filter(call => call === 'confirm-stop').length, 1); assert.equal(h.credits, 0);
  await controller.dispose();
});

test('lost tombstone reply retains original End evidence and reconnect retries that same identity before permitting a new Start', async () => {
  const h = harness(), first = h.create(); await first.initialize();
  const record = await unknownStartWithoutRow(h, first);
  let attempts = 0, serverStopped = false;
  h.server.confirmStartStop = async (requested, clientSessionId) => {
    h.calls.push('confirm-stop'); assert.equal(clientSessionId, record.clientSessionId); assert.deepEqual(requested, record.setup);
    serverStopped = true;
    if (++attempts === 1) throw failure('transient');
    return stoppedProof(record);
  };
  assert.equal(await first.end(), false); assert.equal(serverStopped, true);
  assert.equal(first.getSnapshot().ending, true); assert.equal(h.persisted().commands[0].status, 'unknown');
  assert.equal(h.persisted().records[0].dismissedAtMs, null);
  h.online = false; await first.dispose();
  const restored = h.restart(); await restored.initialize(); assert.equal(restored.getSnapshot().ending, true);
  h.online = true; assert.equal(await restored.retry(), true);
  assert.equal(restored.getSnapshot().record, null); assert.equal(restored.getSnapshot().unsyncedSessionCount, 0);
  assert.equal(attempts, 2); assert.equal(h.calls.filter(call => call === 'start').length, 1); assert.equal(h.credits, 0);
  await restored.dispose();
});

test('failed local tombstone acknowledgement cannot lose the saved End; restart repeats proof and saves settlement in one write', async () => {
  const h = harness(), first = h.create(); await first.initialize();
  const record = await unknownStartWithoutRow(h, first);
  let proofs = 0;
  h.server.confirmStartStop = async () => { proofs++; return stoppedProof(record); };
  h.backend.beforeWrite = async (_, value) => {
    if (JSON.parse(value).records[0].sync.reasonCode === 'server_start_stop_confirmed') throw failure('transient');
  };
  assert.equal(await first.end(), false); assert.equal(first.getSnapshot().ending, true);
  assert.equal(h.persisted().records[0].state, 'not_started'); assert.equal(h.persisted().records[0].dismissedAtMs, null);
  assert.equal(h.persisted().commands[0].status, 'unknown');
  h.backend.beforeWrite = null; await first.dispose();
  const restored = h.restart(); await restored.initialize();
  assert.equal(restored.getSnapshot().record, null); assert.equal(restored.getSnapshot().error, null);
  assert.equal(restored.getSnapshot().unsyncedSessionCount, 0); assert.equal(proofs, 2);
  assert.equal(h.persisted().records[0].state, 'cancelled'); assert.notEqual(h.persisted().records[0].dismissedAtMs, null);
  assert.equal(h.credits, 0); await restored.dispose();
});

test('malformed, foreign, unfenced or mismatched stop proofs never retire an unconfirmed Start', async () => {
  for (const change of [{ scope: otherScope }, { clientSessionId: id('5', 1) }, { legacyStartsFenced: false },
    { serverSessionId: 'invalid' }, { status: 'running' }, { status: 'completed' }, { serverSessionId: id('4', 99) }]) {
    const h = harness(), controller = h.create(); await controller.initialize();
    const record = await unknownStartWithoutRow(h, controller);
    h.server.confirmStartStop = async () => stoppedProof(record, change);
    assert.equal(await controller.end(), false);
    assert.equal(controller.getSnapshot().record.state, 'not_started'); assert.equal(controller.getSnapshot().ending, true);
    assert.equal(h.persisted().records[0].serverSessionId, null); assert.equal(h.persisted().records[0].dismissedAtMs, null);
    assert.equal(h.persisted().commands[0].status, 'unknown'); assert.equal(h.credits, 0);
    await controller.dispose();
  }
});

test('an unrelated open account session and server conflict cannot be cancelled or adopted as proof for another Start', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  const record = await unknownStartWithoutRow(h, controller);
  const unrelated = identifiedRow(h, { ...record, clientSessionId: id('4', 2), setup: { ...record.setup, notes: 'Unrelated work' } }, 'running');
  h.server.confirmStartStop = async () => { h.calls.push('confirm-stop'); throw failure('definitive'); };
  assert.equal(await controller.end(), false);
  assert.equal(h.rows.get(unrelated.id).status, 'running'); assert.equal(h.persisted().records[0].serverSessionId, null);
  assert.equal(controller.getSnapshot().ending, true); assert.equal(h.persisted().commands[0].status, 'unknown');
  assert.equal(h.calls.filter(call => call === 'cancel' || call === 'complete').length, 0); assert.equal(h.credits, 0);
  await controller.dispose();
});

test('owner changes fence a delayed stop proof before it can settle the previous account journal', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  const record = await unknownStartWithoutRow(h, controller), entered = deferred(), release = deferred();
  h.server.confirmStartStop = async () => { entered.resolve(); await release.promise; return stoppedProof(record); };
  const ending = controller.end(); await entered.promise;
  const before = clone(h.persisted()); h.switchOwner(); release.resolve();
  assert.equal(await ending, false); assert.equal(controller.getSnapshot().record, null);
  assert.deepEqual(h.persisted(), before); assert.equal(h.credits, 0);
  await controller.dispose();
});

test('missing stop capability explicitly preserves the record instead of suggesting endless connection retries', async () => {
  for (const endpoint of [false, true]) {
    const h = harness(), controller = h.create(); await controller.initialize();
    await unknownStartWithoutRow(h, controller);
    if (endpoint) h.server.confirmStartStop = async () => { throw Object.assign(failure('transient'), { code: 'repair_unavailable' }); };
    assert.equal(await controller.end(), false);
    assert.match(controller.getSnapshot().error, /recovery update on the server/);
    assert.equal(controller.getSnapshot().ending, true); assert.equal(h.persisted().commands[0].status, 'unknown');
    assert.equal(h.persisted().records[0].dismissedAtMs, null); assert.equal(h.credits, 0);
    await controller.dispose();
  }
});

test('client identity lookup resolves a lost identified Start without legacy timestamp matching or a second Start request', async () => {
  const h = harness(), controller = h.create(); await controller.initialize();
  const record = await unknownStartWithoutRow(h, controller, { ...setup, targetSeconds: 60 });
  identifiedRow(h, record, 'running');
  h.server.readStartedSession = async clientId => { h.calls.push('identity'); return h.server.readSession(clientId); };
  const before = h.calls.length; assert.equal(await controller.retry(), true);
  assert.equal(controller.getSnapshot().record.serverSessionId, record.clientSessionId);
  assert.equal(controller.getSnapshot().record.state, 'running'); assert.equal(controller.getSnapshot().recovered, true);
  assert.equal(h.calls.slice(before).filter(call => call === 'identity').length, 1);
  assert.equal(h.calls.slice(before).filter(call => call === 'open').length, 0);
  assert.equal(h.calls.filter(call => call === 'start').length, 1); assert.equal(h.credits, 0);
  await controller.dispose();
});

test('canonical terminal stop proofs reconcile their exact UUID and receipt without cancel or completion repair', async () => {
  for (const status of ['cancelled', 'completed']) {
    const h = harness(), controller = h.create(); await controller.initialize();
    const record = await unknownStartWithoutRow(h, controller);
    h.server.confirmStartStop = async () => {
      h.calls.push('confirm-stop'); identifiedRow(h, record, status);
      return stoppedProof(record, { serverSessionId: record.clientSessionId, status });
    };
    assert.equal(await controller.end(), true);
    assert.equal(controller.getSnapshot().record.serverSessionId, record.clientSessionId);
    assert.equal(controller.getSnapshot().record.state, status); assert.equal(controller.getSnapshot().ending, false);
    assert.equal(controller.getSnapshot().rewardsVisible, false);
    assert.equal(controller.getSnapshot().unsyncedSessionCount, 0);
    assert.equal(h.calls.filter(call => call === 'cancel' || call === 'complete').length, 0); assert.equal(h.credits, 0);
    await controller.dispose();
  }
});

test('terminal proof preflight rejects mismatched canonical status, payload and missing receipts before binding a UUID', async () => {
  for (const kind of ['status', 'setup', 'receipt', 'snapshot']) {
    const h = harness(), controller = h.create(); await controller.initialize();
    const record = await unknownStartWithoutRow(h, controller);
    h.server.confirmStartStop = async () => {
      const status = kind === 'receipt' ? 'completed' : 'cancelled';
      const row = identifiedRow(h, record, kind === 'status' ? 'running' : status);
      if (kind === 'setup') row.setup.notes = 'Different block';
      if (kind === 'receipt') row.receipt = null;
      return stoppedProof(record, { serverSessionId: record.clientSessionId, status });
    };
    const read = h.server.readSession;
    if (kind === 'snapshot') h.server.readSession = async serverId => { const remote = await read(serverId); remote.snapshot = null; return remote; };
    assert.equal(await controller.end(), false);
    assert.equal(h.persisted().records[0].serverSessionId, null, kind);
    assert.equal(controller.getSnapshot().record.state, 'not_started', kind); assert.equal(controller.getSnapshot().ending, true, kind);
    assert.equal(h.calls.filter(call => call === 'complete' || call === 'cancel').length, 0, kind);
    assert.equal(h.credits, 0); await controller.dispose();
  }
});
