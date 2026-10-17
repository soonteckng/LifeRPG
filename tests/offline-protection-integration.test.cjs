/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name), ext = ['.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, '..'), target + ext), mocks, cache);
  }, module, module.exports);
  return module.exports;
}

// Both React providers, preflight, controller and durable journal are production
// code. Only device/storage/cloud boundaries are replaced; outbound calls throw.
async function fixture({ usage = true } = {}) {
  const scope = { backendId: 'offline-protection-fixture', ownerId: '11111111-1111-4111-8111-111111111111' };
  const values = new Map(), commands = [], cloud = [], listeners = new Set();
  let sequence = 0, timer, protection, renderer;
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value) };
  const idle = { id: null, scope: null, status: 'idle', secondsLeft: 0, covers: 0 };
  let state = idle;
  const native = {
    formatVersion: 3,
    capabilities: async () => ({ supported: true, usage, overlay: true, notifications: true }),
    state: async () => state, apps: async () => [],
    start: async raw => { const v = JSON.parse(raw); commands.push(['start', v]); return state = { id: v.id, scope: v.scope, status: 'active', secondsLeft: v.seconds, covers: 0 }; },
    takeBreak: async (id, ms) => { commands.push(['break', id, ms]); return state; },
    endBreak: async id => { commands.push(['return', id]); return state; },
    stop: async id => { commands.push(['stop', id]); return state = { ...state, id: null, status: 'stopped' }; },
    pause: async id => { commands.push(['pause', id]); return state = { ...state, id: null, status: 'paused' }; },
  };
  const forbidden = async () => { cloud.push('request'); throw Error('No network is available in this fixture'); };
  const auth = { user: null, localOwner: { id: scope.ownerId, backendId: scope.backendId }, accessMode: 'local-only', admissionEpoch: 1, verifyCurrentOwner: forbidden };
  const grant = { scope, policyVersion: 1, grantedAtMs: 1, serverTimeMs: 1, expiresAtMs: Date.now() + 86400000, lastSeenAtMs: Date.now() };
  const noop = async () => {};
  const mocks = {
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: (_, callback) => { listeners.add(callback); return { remove: () => listeners.delete(callback) }; } } },
    '@react-native-async-storage/async-storage': storage,
    'expo-modules-core': { uuid: { v4: () => `33333333-3333-4333-8333-${String(++sequence).padStart(12, '0')}` } },
    'expo-haptics': { notificationAsync: noop, NotificationFeedbackType: { Success: 'success' } },
    './AuthContext': { useAuth: () => auth }, './UserContext': { useUser: () => ({ reloadProfile: noop }) },
    '../utils/sessionBackend': { sessionBackendIdentity: () => ({ backendId: scope.backendId }) },
    '../utils/sessionNotifications': { getSessionNotifications: () => null },
    '../utils/countdownTicker': { createCountdownTicker: () => ({ reschedule() {}, dispose() {} }) },
    '../services/sessionService': { createJournalSessionTransport: () => new Proxy({}, { get: () => forbidden }) },
    '../services/offlineSessionService': {
      createOfflineCapabilityCache: () => ({ load: noop, refresh: noop, readFreshGrant: () => grant }),
      createOfflineSessionTransport: () => ({ readSnapshot: forbidden, submit: forbidden }),
    },
    '../services/sessionNotificationService': { createSessionNotificationLifecycle: () => ({ activate() {}, setPreferences() {}, dispose: noop, schedule: noop, clear: noop }) },
    '../services/nativeSessionCountdown': { createNativeSessionCountdownLifecycle: () => ({}) },
    '../services/sessionCountdownCoordinator': { createSessionCountdownCoordinator: () => ({ initialize: async () => false, ownsNative: () => false, refresh: noop, dispose: noop, action: async () => null }) },
    './nativeFocusProtection': { getSessionProtectionModule: async () => native, idleProtection: idle },
    '../services/nativeFocusProtection': { getSessionProtectionModule: async () => native, idleProtection: idle },
  };
  const timerApi = load('src/context/JournalTimerProvider.tsx', mocks);
  const protectionApi = load('src/context/SessionProtectionContext.tsx', { ...mocks, './TimerContext': timerApi });
  function Capture() { timer = timerApi.useTimer(); protection = protectionApi.useSessionProtection(); return null; }
  await act(async () => { renderer = create(React.createElement(timerApi.TimerProvider, null,
    React.createElement(protectionApi.SessionProtectionProvider, null, React.createElement(Capture)))); });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await act(async () => { await flush(); });
  return { commands, cloud, native, values, timer: () => timer, protection: () => protection,
    run: async callback => act(async () => { await callback(timer); await flush(); }),
    cleanup: () => act(async () => { renderer.unmount(); }) };
}

test('fresh offline Start performs native preflight, writes protected journal and starts coverage without any cloud request', async () => {
  const f = await fixture();
  try {
    assert.equal(f.timer().offlineAvailable, true);
    await f.run(async timer => assert.equal(await timer.startFreeTimer(60, 1), true));
    assert.equal(f.timer().protectedSession, true); assert.equal(f.timer().clientReported, true);
    assert.equal(f.timer().isRunning, true); assert.equal(f.protection().active, true);
    const lease = f.protection().state.id, client = f.timer().protectionSessionId;
    assert.equal(f.timer().sessionId, client); assert.ok(lease);
    assert.equal(JSON.parse(f.commands[0][1].scope)[1], client);
    const saved = JSON.parse([...f.values].find(([key]) => key.startsWith('liferpg:session-journal:v1:'))[1]);
    assert.equal(saved.schemaVersion, 3); assert.ok(saved.records[0].protection);
    assert.equal(saved.records[0].serverSessionId, null); assert.deepEqual(f.cloud, []);
    await f.run(timer => timer.pauseTimer()); assert.equal(f.timer().breakSecondsLeft, 300);
    assert.equal(f.protection().state.id, lease); assert.equal(f.commands.filter(([kind]) => kind === 'break').length, 1);
    await f.run(timer => timer.resumeTimer());
    assert.equal(f.timer().isRunning, true); assert.equal(f.protection().active, true);
    assert.equal(f.commands.filter(([kind]) => kind === 'start').length, 1);
    assert.equal(f.commands.filter(([kind]) => kind === 'return').length, 1);
    assert.equal(f.commands.some(([kind]) => ['stop', 'pause'].includes(kind)), false);
    assert.deepEqual(f.cloud, []);
    await f.run(timer => timer.resetTimer());
    assert.equal(f.commands.filter(([kind]) => kind === 'stop').length, 1);
    assert.equal(f.timer().sessionEnded, true); assert.deepEqual(f.cloud, []);
  } finally { await f.cleanup(); }
});

test('fresh offline Start with missing native permission cannot create a fake protected session', async () => {
  const f = await fixture({ usage: false });
  try {
    await f.run(async timer => assert.equal(await timer.startFreeTimer(60, 1), false));
    assert.equal(f.timer().hasOpenSession, false); assert.equal(f.timer().protectionSetupRequired, true);
    assert.equal(f.protection().active, false); assert.deepEqual(f.commands, []); assert.deepEqual(f.cloud, []);
  } finally { await f.cleanup(); }
});
