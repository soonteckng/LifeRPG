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

test('protected break lasts five minutes, survives restart and imports exactly one completion',async()=>{
 const h=harness();h.online=false;let c=h.create();await c.initialize();assert.equal(await c.start({...setup,targetSeconds:60},true),true);
 h.advance(10000);assert.equal(await c.pause(),true);assert.equal(c.getSnapshot().timeLeft,50);assert.equal(h.persisted().schemaVersion,3);
 h.advance(250000);assert.equal(c.getSnapshot().record.protection.breakEndsAtMs,1310000);await c.dispose();c=h.restart();await c.initialize();assert.equal(c.getSnapshot().timeLeft,50);
 h.advance(70000);await c.tick();assert.equal(c.getSnapshot().timeLeft,30);assert.equal(await c.pause(),false);
 h.advance(30000);await c.tick();assert.equal(c.getSnapshot().record.state,'completed');h.online=true;await c.refresh(true);assert.equal(h.credits,1);
 assert.equal(h.submissions[0].segments.reduce((n,s)=>n+s.endedAtMs-s.startedAtMs,0),60000);await c.refresh(true);assert.equal(h.credits,1);await c.dispose();
});
test('ending a break early preserves remaining effort and never restores break entitlement',async()=>{
 const h=harness();h.online=false;let c=h.create();await c.initialize();await c.start({...setup,targetSeconds:60},true);h.advance(10000);await c.pause();h.advance(20000);assert.equal(await c.resume(),true);
 assert.equal(c.getSnapshot().timeLeft,50);await c.dispose();c=h.restart();await c.initialize();assert.equal(await c.pause(),false);h.advance(50000);await c.tick();assert.equal(c.getSnapshot().record.state,'completed');await c.dispose();
});
test('End during a protected break earns no reward and cannot leave a future active segment',async()=>{
 const h=harness();h.online=false;const c=h.create();await c.initialize();await c.start({...setup,targetSeconds:60},true);h.advance(1000);await c.pause();h.advance(20000);assert.equal(await c.end(),true);
 assert.equal(h.credits,0);assert.equal(h.persisted().records[0].state,'cancelled');assert.equal(h.persisted().records[0].clientTiming.segments.some(s=>s.endedAtMs===null),false);await c.dispose();
});
test('an online protected session uses a verified handoff before break, with unchanged reward quantity',async()=>{
 const h=harness();const c=h.create();await c.initialize();await c.start({...setup,targetSeconds:60},true);h.advance(10000);assert.equal(await c.pause(),true);assert.equal(c.getSnapshot().record.verification,'client_reported');
 h.advance(350000);await c.tick();await c.refresh(true);assert.equal(h.credits,1);assert.equal(h.submissions[0].serverConfirmedMs,0);await c.dispose();
});
test('a break blocks duplicate concurrent taps and cannot pause again at its deadline',async()=>{
 const h=harness();h.online=false;const c=h.create();await c.initialize();await c.start({...setup,targetSeconds:60},true);const replies=await Promise.all([c.pause(),c.pause()]);assert.equal(replies.filter(Boolean).length,1);
 h.advance(300000);assert.equal(await c.pause(),false);assert.equal(c.getSnapshot().timeLeft,60);assert.equal(await c.resume(),false);await c.dispose();
});
test('owner change fences the saved protected break and cannot import another account’s work',async()=>{
 const h=harness();h.online=false;const c=h.create();await c.initialize();await c.start({...setup,targetSeconds:60},true);await c.pause();h.switchOwner();h.advance(400000);assert.equal(await c.resume(),false);assert.equal(await c.tick(),false);assert.equal(h.submissions.length,0);await c.dispose();
});
test('full expiry still wins over End in a protected session',async()=>{
 const h=harness();h.online=false;const c=h.create();await c.initialize();await c.start(setup,true);h.advance(3000);await c.end();assert.equal(h.persisted().records[0].state,'completed');await c.dispose();
});
