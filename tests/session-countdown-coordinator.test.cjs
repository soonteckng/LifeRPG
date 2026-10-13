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
    assert.ok(name.startsWith('.'), `Unexpected external dependency ${name}`);
    const dependency = path.resolve(path.dirname(filename), name);
    return load(path.relative(path.resolve(__dirname, '..'), `${dependency}.ts`));
  }, mod, mod.exports);
  return mod.exports;
}
const { createSessionCountdownCoordinator } = load('src/services/sessionCountdownCoordinator.ts');
const domain = load('src/utils/sessionJournal.ts');
const { projectSessionCountdown } = load('src/utils/sessionCountdown.ts');
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/session-journal-v1.json'), 'utf8'));
const SCOPE = vectors.scope, CLIENT = vectors.runningRecord.clientSessionId;
const START = '10000000-0000-4000-8000-000000000001';
const ACTION = '10000000-0000-4000-8000-000000000005';
const prefs = { sound: true, haptics: true };
const clock = delta => ({ wallTimeMs: vectors.clock.wallTimeMs + delta,
  monotonicTimeMs: vectors.clock.monotonicTimeMs + delta, bootId: vectors.clock.bootId });
const act = (journal, action) => domain.applyJournalAction(journal,
  { epoch: journal.admission.epoch, expectedRevision: journal.revision, ...action });
function running() {
  let journal = act(domain.createJournal(SCOPE), { type: 'admit', epoch: 1 });
  journal = act(journal, { type: 'prepare_start', operationId: START, clientSessionId: CLIENT,
    setup: vectors.setup, clock: clock(0) });
  return act(journal, { type: 'acknowledge_start', operationId: START,
    snapshot: { serverSessionId: vectors.runningRecord.serverSessionId, state: 'running',
      startedAtMs: vectors.clock.wallTimeMs, elapsedMs: 0, observedClock: clock(0) } });
}
function harness(journal = running()) {
  const state = { journal, scope: { ...SCOPE }, epoch: 8, record: CLIENT, busy: false, clock: clock(5000), token: null, launch: null };
  const calls = [], native = {
    async activate() { calls.push(['activate']); return true; }, ownsNative: () => true,
    async publish(...args) { calls.push(['publish', ...args]); return true; },
    async clear(...args) { calls.push(['clear', ...args]); return true; },
    async consumeAction(nonce) { calls.push(['consume', nonce]); return state.token; },
    async takeForegroundAction() { calls.push(['foreground']); const launch = state.launch; state.launch = null; return launch; },
    async dispose() { calls.push(['dispose']); },
  };
  const store = { async load() { return { kind: 'ready', journal: state.journal }; } };
  const controller = Object.fromEntries(['pause', 'resume', 'tick'].map(kind => [kind, async () => { calls.push([kind]); }]));
  const co = createSessionCountdownCoordinator({ scope: SCOPE, store, controller, native,
    currentScope: () => state.scope, currentEpoch: () => state.epoch,
    currentRecordId: () => state.record, busy: () => state.busy, clock: () => state.clock });
  const token = kind => ({ version: 1, kind, operationId: ACTION,
    identity: projectSessionCountdown({ journal: state.journal, currentScope: state.scope,
      currentAdmissionEpoch: state.journal.admission.epoch, currentClientSessionId: CLIENT, clock: state.clock }).identity });
  return { state, calls, native, store, co, token };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('presentation reads the durable journal and carries preferences without a server mutation', async () => {
  const h = harness(), before = JSON.stringify(h.state.journal);
  await h.co.initialize(); await h.co.refresh('  Review notes  ', prefs, true);
  assert.deepEqual(h.calls.map(c => c[0]), ['activate', 'publish']);
  assert.equal(h.calls[1][1].title, 'Review notes'); assert.equal(h.calls[1][1].remainingMs, 25000);
  assert.deepEqual(h.calls[1][2], prefs); assert.equal(h.calls[1][3], true);
  assert.equal(JSON.stringify(h.state.journal), before);
});
test('a delayed journal read cannot overwrite a newer notification refresh', async () => {
  const h = harness(), gate = deferred(); let reads = 0;
  h.store.load = () => ++reads === 1 ? gate.promise : Promise.resolve({ kind: 'ready', journal: h.state.journal });
  const old = h.co.refresh('Old title', prefs);
  await h.co.refresh('Current title', prefs);
  gate.resolve({ kind: 'ready', journal: h.state.journal }); await old;
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][1].title, 'Current title');
});
test('account revocation while reading prevents native publication and controls', async () => {
  const h = harness(), gate = deferred(); h.store.load = () => gate.promise;
  const refreshing = h.co.refresh('Learning', prefs); h.state.epoch++;
  gate.resolve({ kind: 'ready', journal: h.state.journal }); await refreshing;
  assert.deepEqual(h.calls, []); assert.equal(await h.co.action(ACTION), null);
  assert.equal(await h.co.initialize(), false);
});
test('quarantined or unreadable journal clears presentation without erasing session storage', async () => {
  const h = harness(); h.store.load = async () => ({ kind: 'quarantined' });
  await h.co.refresh('Learning', prefs); assert.deepEqual(h.calls, [['clear']]);
  h.calls.length = 0; h.store.load = async () => { throw new Error('storage unavailable'); };
  await h.co.refresh('Learning', prefs); assert.deepEqual(h.calls, [['clear']]);
});
test('failed native publication removes obsolete presentation without clearing a newer refresh', async () => {
  const h = harness(); h.native.publish = async () => false;
  await h.co.refresh('Learning', prefs); assert.deepEqual(h.calls, [['clear']]);
  h.calls.length = 0;
  const gate = deferred(); let publications = 0;
  h.native.publish = async () => ++publications === 1 ? gate.promise : true;
  const older = h.co.refresh('Old', prefs); await new Promise(done => setImmediate(done));
  await h.co.refresh('New', prefs); gate.resolve(false); await older;
  assert.deepEqual(h.calls, []);
});
test('an arbitrary deep link cannot execute without native-issued action proof', async () => {
  const h = harness(); assert.equal(await h.co.action('invented'), null); assert.deepEqual(h.calls, []);
  assert.equal(await h.co.action(ACTION), null); assert.deepEqual(h.calls, [['consume', ACTION]]);
});
test('warm End opens confirmation only; duplicate nonce never cancels or completes', async () => {
  const h = harness(); h.state.token = h.token('end');
  assert.equal(await h.co.action(ACTION), 'end'); assert.equal(await h.co.action(ACTION), null);
  assert.deepEqual(h.calls.map(c => c[0]), ['consume', 'consume']);
});
test('valid Pause dispatches through the existing controller once', async () => {
  const h = harness(); h.state.token = h.token('pause');
  await h.co.action(ACTION); await h.co.action(ACTION);
  assert.deepEqual(h.calls.map(c => c[0]), ['consume', 'pause', 'consume']);
});
test('End at true full expiry invokes completion tick rather than early cancellation', async () => {
  const h = harness(); h.state.token = h.token('end'); h.state.clock = clock(30000);
  assert.equal(await h.co.action(ACTION), null);
  assert.deepEqual(h.calls.map(c => c[0]), ['consume', 'tick']);
  await h.co.refresh('Learning', prefs); assert.deepEqual(h.calls.at(-1), ['clear', true]);
});
test('durable early End suppresses finish alerts even when its old deadline passes', async () => {
  const h = harness(); h.state.journal = act(h.state.journal, { type: 'prepare_transition', operationId: ACTION,
    clientSessionId: CLIENT, kind: 'cancel', clock: clock(10000) }); h.state.clock = clock(40000);
  await h.co.refresh('Learning', prefs); assert.deepEqual(h.calls, [['clear', false]]);
  h.state.token = h.token('end'); assert.equal(await h.co.action(ACTION), null);
  assert.equal(h.calls.some(c => c[0] === 'tick'), false);
});
test('scope or revision change after consuming a nonce cannot control a different session', async () => {
  for (const change of [h => { h.state.scope = null; }, h => { h.state.epoch++; },
    h => { h.state.record = null; }, h => { h.state.journal = act(h.state.journal, { type: 'admit', epoch: 2 }); }]) {
    const h = harness(); h.state.token = h.token('pause'); const gate = deferred();
    h.native.consumeAction = () => gate.promise;
    const action = h.co.action(ACTION); change(h); gate.resolve(h.state.token); await action;
    assert.deepEqual(h.calls, []);
  }
});
test('disposal during a pending read cannot resurrect a notification', async () => {
  const h = harness(), gate = deferred(); h.store.load = () => gate.promise;
  const refresh = h.co.refresh('Learning', prefs); await h.co.dispose();
  gate.resolve({ kind: 'ready', journal: h.state.journal }); await refresh;
  assert.deepEqual(h.calls, [['dispose']]);
});

test('foreground before consuming a warm action skips only its incidental reconciliation', async () => {
  const h = harness(); h.state.token = h.token('pause'); h.state.launch = ACTION;
  assert.equal(await h.co.shouldRefreshOnForeground(), false);
  await h.co.action(ACTION);
  assert.equal(await h.co.shouldRefreshOnForeground(), true);
  assert.deepEqual(h.calls.map(c => c[0]), ['foreground', 'consume', 'pause', 'foreground']);
});
test('consuming the warm action before foreground still preserves its one-shot refresh notice', async () => {
  const h = harness(); h.state.token = h.token('end'); h.state.launch = ACTION;
  assert.equal(await h.co.action(ACTION), 'end');
  assert.equal(await h.co.shouldRefreshOnForeground(), false);
  assert.equal(await h.co.shouldRefreshOnForeground(), true);
  assert.deepEqual(h.calls.map(c => c[0]), ['consume', 'foreground', 'foreground']);
});
test('ordinary or cold launches reconcile, and account revocation during the native query cannot refresh the old controller', async () => {
  const h = harness(); assert.equal(await h.co.shouldRefreshOnForeground(), true);
  const gate = deferred(); h.native.takeForegroundAction = () => gate.promise;
  const refreshing = h.co.shouldRefreshOnForeground(); h.state.epoch++; gate.resolve(null);
  assert.equal(await refreshing, false); assert.equal(await h.co.shouldRefreshOnForeground(), false);
});
