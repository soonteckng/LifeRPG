/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const modules = new Map();
const environment = { os: 'android', api: 36, expoGo: false, packageName: 'com.soonteck.liferpg', native: null, lookups: 0 };
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = { exports: {} }; modules.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react-native') return { Platform: { OS: environment.os, Version: environment.api } };
    if (name === 'expo') return { isRunningInExpoGo: () => environment.expoGo };
    if (name === 'expo-constants') return { __esModule: true, default: { expoConfig: { android: { package: environment.packageName } } } };
    if (name === 'expo-modules-core') return { requireOptionalNativeModule: moduleName => {
      assert.equal(moduleName, 'LifeRPGSessionCountdown'); environment.lookups++; return environment.native;
    } };
    if (!name.startsWith('.')) throw new Error(`Unexpected dependency ${name}`);
    const dependency = path.resolve(path.dirname(filename), name);
    return load(path.relative(path.resolve(__dirname, '..'), dependency.endsWith('.ts') ? dependency : `${dependency}.ts`));
  }, mod, mod.exports);
  return mod.exports;
}
const service = load('src/services/nativeSessionCountdown.ts');
const domain = load('src/utils/sessionJournal.ts');
const countdown = load('src/utils/sessionCountdown.ts');
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/session-journal-v1.json'), 'utf8'));
const SCOPE = vectors.scope, CLIENT = vectors.runningRecord.clientSessionId;
const clone = value => JSON.parse(JSON.stringify(value));
const prefs = { sound: true, haptics: true };
let leaseSequence = 1;
const nextLease = () => `90000000-0000-4000-8000-${String(leaseSequence++).padStart(12, '0')}`;
const clock = delta => ({ wallTimeMs: vectors.clock.wallTimeMs + delta,
  monotonicTimeMs: vectors.clock.monotonicTimeMs + delta, bootId: vectors.clock.bootId });
const act = (journal, action) => domain.applyJournalAction(journal,
  { epoch: journal.admission.epoch, expectedRevision: journal.revision, ...action });
function projection(delta = 5000) {
  let journal = act(domain.createJournal(SCOPE), { type: 'admit', epoch: 1 });
  journal = act(journal, { type: 'prepare_start', operationId: '10000000-0000-4000-8000-000000000001',
    clientSessionId: CLIENT, setup: vectors.setup, clock: clock(0) });
  journal = act(journal, { type: 'acknowledge_start', operationId: journal.commands[0].operationId,
    snapshot: { serverSessionId: vectors.runningRecord.serverSessionId, state: 'running',
      startedAtMs: vectors.clock.wallTimeMs, elapsedMs: 0, observedClock: clock(0) } });
  return countdown.projectSessionCountdown({ journal, currentScope: SCOPE, currentAdmissionEpoch: 1,
    currentClientSessionId: CLIENT, clock: clock(delta) });
}
function fakeNative() {
  const calls = [], retired = new Set();
  let currentLease = null;
  return { calls, formatVersion: 1,
    async activate(lease, scope) { calls.push(['activate', lease, JSON.parse(scope)]); currentLease = lease; return true; },
    async publish(lease, value, settings) {
      calls.push(['publish', lease, JSON.parse(value), JSON.parse(settings)]); return currentLease === lease;
    },
    async refresh(lease, settings) {
      calls.push(['refresh', lease, JSON.parse(settings)]); return currentLease === lease;
    },
    async clear(lease) {
      calls.push(['clear', lease]);
      if (currentLease === lease) { currentLease = null; retired.add(lease); return true; }
      return retired.has(lease);
    },
    async capabilities() { return { supported: true, notificationsGranted: true, exactAlarms: false }; },
  };
}
function lifecycle(native, overrides = {}) {
  return service.createNativeSessionCountdownLifecycle({ scope: SCOPE, newLeaseId: nextLease,
    clearLegacy: async () => { native?.calls.push(['legacy-cleared']); }, resolveModule: async () => native, ...overrides });
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('optional lookup never loads a custom module outside installed Android API26+', async () => {
  const saved = { ...environment };
  for (const override of [{ os: 'ios' }, { os: 'web' }, { api: 25 }, { expoGo: true }, { packageName: undefined }]) {
    Object.assign(environment, saved, override); environment.lookups = 0;
    assert.equal(await service.getNativeSessionCountdownModule(), null); assert.equal(environment.lookups, 0);
  }
  Object.assign(environment, saved, { lookups: 0, native: fakeNative() });
  assert.equal(await service.getNativeSessionCountdownModule(), environment.native); assert.equal(environment.lookups, 1);
  environment.native = null;
  assert.equal(await service.getNativeSessionCountdownModule(), null);
  Object.assign(environment, saved);
});
test('missing native binary keeps fallback available and sends no native work', async () => {
  let clears = 0;
  const life = lifecycle(null, { clearLegacy: async () => { clears++; } });
  assert.equal(await life.activate(), false); assert.equal(life.ownsNative(), false);
  assert.equal(await life.publish(projection(), prefs), false); assert.equal(clears, 0);
  await life.dispose();
});
test('activation clears both legacy alerts before the first committed native projection', async () => {
  const api = fakeNative(), life = lifecycle(api);
  assert.equal(await life.publish(projection(), prefs), true);
  assert.deepEqual(api.calls.map(item => item[0]), ['activate', 'legacy-cleared', 'publish']);
  assert.deepEqual(api.calls[0][2], SCOPE); assert.equal(life.ownsNative(), true); assert.equal(life.isActive(), true);
  assert.deepEqual(await life.capabilities(), { supported: true, notificationsGranted: true, exactAlarms: false });
  await life.dispose();
});
test('clock-only samples do not post each second; background force and preferences can refresh', async () => {
  const api = fakeNative(), life = lifecycle(api);
  await life.publish(projection(5000), prefs); await life.publish(projection(6000), prefs);
  assert.equal(api.calls.filter(item => item[0] === 'publish').length, 1);
  await life.publish(projection(7000), prefs, true);
  await life.publish(projection(8000), { ...prefs, sound: false });
  assert.equal(api.calls.filter(item => item[0] === 'publish').length, 1);
  assert.equal(api.calls.filter(item => item[0] === 'refresh').length, 2);
  await life.dispose();
});
test('a confirmed terminal clear retires its lease and the next timer gets a fresh lease', async () => {
  const api = fakeNative(), life = lifecycle(api);
  await life.publish(projection(), prefs); const firstLease = api.calls[0][1];
  assert.equal(await life.clear(), true); assert.equal(life.isActive(), false); assert.equal(life.ownsNative(), true);
  assert.equal(await life.publish(projection(), prefs), true);
  const activations = api.calls.filter(item => item[0] === 'activate');
  assert.equal(activations.length, 2); assert.notEqual(activations[1][1], firstLease);
  assert.equal(api.calls.filter(item => item[0] === 'legacy-cleared').length, 1);
  await life.dispose();
});
test('an outgoing account cannot clear, publish or reclaim its successor', async () => {
  const api = fakeNative(), oldLife = lifecycle(api), newScope = { ...SCOPE, ownerId: '22222222-2222-4222-8222-222222222222' };
  await oldLife.publish(projection(), prefs);
  const newLife = lifecycle(api, { scope: newScope });
  const value = projection(); value.identity.scope = clone(newScope);
  await newLife.publish(value, prefs); const before = api.calls.length;
  assert.equal(await oldLife.clear(), false); assert.equal(await oldLife.publish(projection(), prefs), false);
  await oldLife.dispose(); assert.equal(api.calls.length, before);
  assert.equal(newLife.isActive(), true); await newLife.dispose();
});
test('clear during a slow lookup prevents an abandoned timer from claiming a lease', async () => {
  const api = fakeNative(), lookup = deferred(), life = lifecycle(api, { resolveModule: async () => lookup.promise });
  const activating = life.activate(); await Promise.resolve();
  await life.clear(); lookup.resolve(api);
  assert.equal(await activating, false); assert.equal(life.ownsNative(), true);
  assert.equal(api.calls.length, 0);
  assert.equal(await life.publish(projection(), prefs), true); await life.dispose();
});
test('supersession while an old activation is in flight does not publish or clear for the old owner', async () => {
  const api = fakeNative(), gate = deferred(), entered = deferred();
  const originalActivate = api.activate;
  api.activate = async (...args) => { await originalActivate(...args); entered.resolve(); await gate.promise; return true; };
  const oldLife = lifecycle(api), oldActivation = oldLife.activate(); await entered.promise;
  const newLife = lifecycle(api), newActivation = newLife.activate(); gate.resolve();
  assert.equal(await oldActivation, false); assert.equal(await newActivation, true);
  assert.equal(api.calls.filter(item => item[0] === 'legacy-cleared').length, 1);
  await oldLife.dispose(); assert.equal(newLife.isActive(), true); await newLife.dispose();
});
test('publish failure never selects Expo fallback, and another committed publish can recover', async () => {
  const api = fakeNative(), original = api.publish;
  let fail = true;
  api.publish = async (...args) => { if (fail) { fail = false; throw new Error('lost reply'); } return original(...args); };
  const life = lifecycle(api);
  assert.equal(await life.publish(projection(), prefs), false); assert.equal(life.ownsNative(), true);
  assert.equal(await life.publish(projection(), prefs), true); await life.dispose();
});
test('an uncertain clear blocks reactivation until the same lease is confirmed cleared', async () => {
  const api = fakeNative(), original = api.clear;
  let fail = true;
  api.clear = async lease => { const accepted = await original(lease); if (fail) { fail = false; throw new Error('lost clear reply'); } return accepted; };
  const life = lifecycle(api); await life.publish(projection(), prefs);
  assert.equal(await life.clear(), false); assert.equal(life.ownsNative(), true); assert.equal(life.isActive(), false);
  assert.equal(await life.publish(projection(), prefs), false);
  assert.equal(api.calls.filter(item => item[0] === 'activate').length, 1);
  assert.equal(await life.clear(), true); assert.equal(await life.publish(projection(), prefs), true);
  await life.dispose();
});
test('failed legacy cancellation blocks native publication and can retry without another native claim', async () => {
  const api = fakeNative(); let clears = 0;
  const life = lifecycle(api, { clearLegacy: async () => { if (++clears === 1) throw new Error('cancel failed'); } });
  assert.equal(await life.publish(projection(), prefs), false); assert.equal(life.ownsNative(), true);
  assert.equal(api.calls.filter(item => item[0] === 'publish').length, 0);
  assert.equal(await life.publish(projection(), prefs), true);
  assert.equal(api.calls.filter(item => item[0] === 'activate').length, 1); await life.dispose();
});
test('projection validation rejects cross-owner, extra secrets and invented alert eligibility before activation', async () => {
  const api = fakeNative(), life = lifecycle(api);
  const mutations = [value => { value.identity.scope.backendId = 'wrong-backend'; },
    value => { value.secretKey = 'do not serialize'; }, value => { value.phase = 'ending'; },
    value => { value.deadlineMs++; }, value => { value.identity.recordRevision = 0.5; }];
  for (const mutate of mutations) {
    const value = projection(); mutate(value); assert.equal(await life.publish(value, prefs), false);
  }
  assert.equal(api.calls.length, 0); await life.dispose();
});
test('notification display normalizes multiline quest titles without changing the saved projection', async () => {
  const api = fakeNative(), life = lifecycle(api), value = projection();
  value.title = '  Read\nchapter\u0000two  '; const before = clone(value);
  assert.equal(await life.publish(value, prefs), true);
  assert.equal(api.calls.find(item => item[0] === 'publish')[2].title, 'Read chapter two');
  assert.deepEqual(value, before); await life.dispose();
});
test('the first native action surface may safely be absent; cold/retired nonces do nothing', async () => {
  const api = fakeNative(), life = lifecycle(api), nonce = nextLease();
  assert.equal(await life.consumeAction(nonce), null);
  await life.publish(projection(), prefs); assert.equal(await life.consumeAction(nonce), null);
  await life.clear(); assert.equal(await life.consumeAction(nonce), null); await life.dispose();
});
test('warm nonce consumption returns only current scope tokens and does not decide or dispatch a command', async () => {
  const api = fakeNative(), value = projection(), token = { version: 1, identity: value.identity, operationId: nextLease(), kind: 'pause' };
  let calls = 0;
  api.consumeAction = async () => { calls++; return token; };
  const life = lifecycle(api); await life.publish(value, prefs);
  const returned = await life.consumeAction(nextLease()); assert.deepEqual(returned, token);
  returned.identity.scope.backendId = 'changed'; assert.equal(token.identity.scope.backendId, SCOPE.backendId);
  token.identity.scope.ownerId = '22222222-2222-4222-8222-222222222222';
  assert.equal(await life.consumeAction(nextLease()), null);
  assert.equal(await life.consumeAction('invalid'), null); assert.equal(calls, 2); await life.dispose();
});
test('disposed instances cannot reactivate or publish', async () => {
  const api = fakeNative(), life = lifecycle(api);
  await life.publish(projection(), prefs); await life.dispose(); const count = api.calls.length;
  assert.equal(await life.activate(), false); assert.equal(await life.publish(projection(), prefs), false);
  assert.equal(await life.consumeAction(nextLease()), null); assert.equal(api.calls.length, count);
});
