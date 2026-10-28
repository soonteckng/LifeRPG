/* global __dirname */
// Offline presentation parity: the real screen/backdrop own departure, while
// real timer/protection providers, controllers and journal own the saved timer.
// Device, navigation, storage and cloud boundaries are replaced. No requests.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), babel = require('@babel/core');
const React = require('react'), { act, create } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
const flush = () => new Promise(resolve => setImmediate(resolve));

function sourceLoader(mocks, compiled) {
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    let source = fs.readFileSync(filename, 'utf8');
    if (compiled && /(?:SessionScreen|SessionBackdrop)\.tsx$/.test(filename)) {
      source = babel.transformSync(source, { filename, configFile: false, babelrc: false,
        parserOpts: { plugins: ['typescript', 'jsx'] },
        plugins: [[require.resolve('babel-plugin-react-compiler'), { target: '19' }]] }).code;
      assert.match(source, /react\/compiler-runtime/, 'exercise the production React compiler');
    }
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'module', 'exports', js)(name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.endsWith('/SessionProtectionControl')) return () => null;
      const study = require('./helpers/study-stubs.cjs')(name); if (study) return study;
      if (!name.startsWith('.')) return require(name);
      const target = path.resolve(path.dirname(filename), name);
      const suffix = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext) && fs.statSync(target + ext).isFile());
      assert.notEqual(suffix, undefined, `resolve ${name} from ${file}`);
      return load(path.relative(root, target + suffix));
    }, module, module.exports);
    return module.exports;
  }
  return load;
}

async function fixture({ compiled = true, reduced = false, usage = true } = {}) {
  let now = Date.UTC(2026, 9, 28, 6), timer, protection, renderer, tick, sequence = 0;
  const oldNow = Date.now; Date.now = () => now;
  const scope = { backendId: 'round78-offline-start-fixture', ownerId: '11111111-1111-4111-8111-111111111111' };
  const animations = [], commands = [], cloud = [], values = new Map(), listeners = new Set();
  const idle = { id: null, scope: null, status: 'idle', secondsLeft: 0, covers: 0 };
  let protectionState = idle;
  const nativeProtection = {
    formatVersion: 3,
    capabilities: async () => ({ supported: true, usage, overlay: true, notifications: true }),
    state: async () => protectionState, apps: async () => [],
    start: async raw => { const value = JSON.parse(raw); commands.push(['start', value]);
      return protectionState = { id: value.id, scope: value.scope, status: 'active', secondsLeft: value.seconds, covers: 0 }; },
    takeBreak: async (id, ms) => { commands.push(['break', id, ms]); return protectionState; },
    endBreak: async id => { commands.push(['return', id]); return protectionState; },
    stop: async id => { commands.push(['stop', id]); return protectionState = { ...protectionState, id: null, status: 'stopped' }; },
    pause: async id => { commands.push(['pause', id]); return protectionState = { ...protectionState, id: null, status: 'paused' }; },
  };
  const forbidden = async () => { cloud.push('request'); throw Error('Network forbidden for offline departure'); };
  const auth = { user: null, localOwner: { id: scope.ownerId, backendId: scope.backendId },
    accessMode: 'local-only', admissionEpoch: 1, verifyCurrentOwner: forbidden };
  const grant = { scope, policyVersion: 1, grantedAtMs: now, serverTimeMs: now,
    expiresAtMs: now + 86400000, lastSeenAtMs: now };
  const noop = async () => {};
  const user = { reloadProfile: noop, soundEnabled: false, hapticsEnabled: false };
  const app = { currentState: 'active', addEventListener(_event, listener) {
    listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const navigation = { canGoBack: () => true, getState: () => ({ routes: [{ key: 'home' }, { key: 'session' }], index: 1 }),
    isFocused: () => true, addListener: () => () => {}, goBack() {} };
  const native = { AppState: app, View: host('View'), ScrollView: host('Scroll'), KeyboardAvoidingView: host('KeyboardView'),
    Pressable: host('Button'), ActivityIndicator: host('Spinner'), Platform: { OS: 'android' },
    StyleSheet: { create: value => value, hairlineWidth: 1 }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
    Keyboard: { isVisible: () => false, dismiss() {}, addListener: () => ({ remove() {} }) },
    BackHandler: { addEventListener: () => ({ remove() {} }) }, PanResponder: { create: handlers => ({ panHandlers: handlers }) }, Easing: { linear: 0 },
    Animated: { View: host('Motion'), Value: class { setValue() {} stopAnimation() {} interpolate() { return this; } },
      timing: () => ({ start(callback) { callback?.({ finished: true }); }, stop() {} }) } };
  const reanimated = { __esModule: true, default: { View: host('AnimatedView') }, Easing: { inOut: value => value, quad: 0 },
    cancelAnimation() {}, runOnJS: callback => callback, useSharedValue: value => React.useState(() => ({ value }))[0],
    useAnimatedStyle: () => ({}), interpolate() {},
    withDelay: (delay, value) => { value.delay = delay; return value; },
    withTiming: (to, config, done) => { const animation = { to, config, done }; animations.push(animation); return animation; } };
  const mocks = {
    'react-native': native, 'react-native-reanimated': reanimated,
    'expo-router': { Stack: { Screen: host('Options') }, useNavigation: () => navigation,
      useFocusEffect: effect => React.useEffect(effect, [effect]) },
    'expo-router/react-navigation': { usePreventRemove() {} },
    '@react-native-async-storage/async-storage': { getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value) },
    'expo-modules-core': { uuid: { v4: () => `33333333-3333-4333-8333-${String(++sequence).padStart(12, '0')}` } },
    'expo-haptics': { notificationAsync: noop, NotificationFeedbackType: { Success: 'success' } },
    './AuthContext': { useAuth: () => auth }, '../context/AuthContext': { useAuth: () => auth },
    './UserContext': { useUser: () => user }, '../context/UserContext': { useUser: () => user },
    '../utils/sessionBackend': { sessionBackendIdentity: () => scope },
    '../utils/sessionNotifications': { getSessionNotifications: () => null },
    '../utils/countdownTicker': { createCountdownTicker: callback => { tick = callback; return { reschedule() {}, dispose() {} }; } },
    '../services/sessionService': { createJournalSessionTransport: () => new Proxy({}, { get: () => forbidden }) },
    '../services/offlineSessionService': {
      createOfflineCapabilityCache: () => ({ load: noop, refresh: noop, refreshIfStale: noop, readFreshGrant: () => grant }),
      createOfflineSessionTransport: () => ({ readSnapshot: forbidden, submit: forbidden }),
    },
    '../services/sessionNotificationService': { createSessionNotificationLifecycle: () => ({ activate() {}, setPreferences() {}, dispose: noop, schedule: noop, clear: noop }) },
    '../services/nativeSessionCountdown': { createNativeSessionCountdownLifecycle: () => ({}) },
    '../services/sessionCountdownCoordinator': { createSessionCountdownCoordinator: () => ({ initialize: async () => false,
      ownsNative: () => false, refresh: noop, dispose: noop, action: async () => null }) },
    './nativeFocusProtection': { getSessionProtectionModule: async () => nativeProtection, idleProtection: idle },
    '../services/nativeFocusProtection': { getSessionProtectionModule: async () => nativeProtection, idleProtection: idle },
    '../context/QuestContext': { useQuests: () => ({ tasks: [], subjects: [{ id: 1, title: 'Learning' }], loading: false, error: null }) },
    '../hooks/useSavedRoutines': { useSavedRoutines: () => ({ ready: true, routines: [], online: false, scope }) },
    '../hooks/useReducedMotion': { useReducedMotion: () => reduced }, '../../hooks/useReducedMotion': { useReducedMotion: () => reduced },
    './SessionCountdown': host('Countdown'), './AppHeader': host('Header'), './AppSheet': host('Sheet'),
    './SheetConfirmation': host('Confirm'), './MotionPressable': host('Button'), './SheetTouchable': host('Button'),
    './AppText': { Text: host('Text') }, '../AppText': { Text: host('Text') },
    './FocusLengthControl': host('Length'), './FocusDurationSheet': host('Duration'), './ProgressRing': host('Ring'),
    './OfflineStatus': host('OfflineStatus'), './session/SessionReveal': host('SessionReveal'),
    '@expo/vector-icons': { Ionicons: host('Icon') }, '@gorhom/bottom-sheet': { BottomSheetScrollView: host('SheetScroll') },
    'react-native-safe-area-context': { SafeAreaView: host('SafeArea'), useSafeAreaInsets: () => ({ top: 24, bottom: 20 }) },
    '../adventurer/AdventurerBack': host('Walker'), './TrailScenes': { FireGlow: host('Glow'), Fireflies: host('Fireflies'), TrailScene: host('Scene') },
    '../../hooks/useRewards': { useRewards: () => ({ look: {}, equipped: {}, today: { seconds: 0 }, trail: { findSeconds: 1800, stops: 4 } }) },
    '../hooks/useRewards': require('./helpers/rewards-store-mock.cjs'),
    '../utils/afterTransition': { afterTransition: () => () => {} }, '../utils/sessionTransition': { traceSession() {} },
    '../utils/tapHaptics': { tapHaptic() {} },
  };
  const load = sourceLoader(mocks, compiled);
  const timerApi = load('src/context/JournalTimerProvider.tsx');
  mocks['./TimerContext'] = mocks['../context/TimerContext'] = timerApi;
  const protectionApi = load('src/context/SessionProtectionContext.tsx');
  mocks['../context/SessionProtectionContext'] = protectionApi;
  const Screen = load('src/components/SessionScreen.tsx').default;
  const { encodeRoutineSession } = load('src/utils/routineSession.ts');
  const { setupMode } = load('src/services/setupMode.ts');
  function Capture() { timer = timerApi.useTimer(); protection = protectionApi.useSessionProtection(); return null; }
  function Tree() { return React.createElement(timerApi.TimerProvider, null,
    React.createElement(protectionApi.SessionProtectionProvider, null, React.createElement(Capture), React.createElement(Screen))); }
  try {
    await act(async () => { renderer = create(React.createElement(Tree)); await flush(); await flush(); });
    await act(async () => { timer.setTargetAttributeId(1); timer.setDurationInSeconds(60);
      timer.setNotes(encodeRoutineSession('Offline revision')); setupMode.chooseRoutine('routine:offline-revision'); await flush(); });
  } catch (error) { await act(async () => renderer?.unmount()); Date.now = oldNow; throw error; }
  const records = () => { const raw = [...values].find(([key]) => key.startsWith('liferpg:session-journal:v1:'))?.[1];
    return raw ? JSON.parse(raw).records : []; };
  const press = label => act(async () => {
    const button = renderer.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label);
    assert.ok(button, `the real screen exposes ${label}`); assert.ok(!button.props.disabled, `${label} is enabled`);
    button.props.onPress(); await flush();
  });
  return { timer: () => timer, protection: () => protection, root: () => renderer.root,
    records, commands, cloud, animations, press,
    now: () => now,
    advance: milliseconds => act(async () => { now += milliseconds; tick?.(); await flush(); await flush(); }),
    finish: animation => act(async () => { assert.equal(typeof animation?.done, 'function'); animation.done(true); await flush(); await flush(); }),
    cleanup: () => act(async () => { renderer.unmount(); await flush(); Date.now = oldNow; }),
  };
}

for (const compiled of [false, true]) test(`offline setup starts through real departure before the protected journal (${compiled ? 'production compiled' : 'uncompiled control'})`, async () => {
  const f = await fixture({ compiled });
  try {
    assert.equal(f.timer().offlineAvailable, true);
    assert.equal(f.timer().duration, 60); assert.deepEqual(f.records(), []);
    await f.press('Start');
    assert.equal(f.root().findAllByType('Motion').filter(node => node.props.testID === 'session-setting-off').length, 1);
    assert.ok(f.root().findAllByType('Scene').some(node => node.props.light === 'dusk'));
    assert.ok(f.animations.some(animation => animation.config?.duration === 2400 && animation.to === 1));
    const night = f.animations.findLast(animation => animation.config?.duration === 2000 && animation.to === 0 && animation.done);
    assert.equal(night.delay, 2400, 'night follows the real walk-away');
    await f.advance(15000);
    assert.equal(f.timer().hasOpenSession, false, 'the walk never spends focus time');
    assert.deepEqual(f.records(), [], 'no durable session exists during departure');
    assert.deepEqual(f.commands, [], 'coverage does not start while the setup is still departing');
    const startAt = f.now(); await f.finish(night);
    assert.equal(f.timer().hasOpenSession, true); assert.equal(f.timer().isRunning, true);
    assert.equal(f.timer().timeLeft, 60); assert.equal(f.timer().clientReported, true);
    assert.equal(f.timer().protectedSession, true); assert.equal(f.protection().active, true);
    assert.equal(f.root().findAllByProps({ testID: 'session-setting-off' }).length, 0);
    const [saved] = f.records();
    assert.equal(saved.startedAtMs, startAt); assert.equal(saved.serverSessionId, null);
    assert.equal(saved.setup.targetSeconds, 60); assert.equal(saved.setup.subjectId, 1);
    assert.equal(saved.setup.notes, 'liferpg:routine:v1:{"name":"Offline revision"}');
    assert.equal(f.commands.filter(([kind]) => kind === 'start').length, 1);
    await f.finish(night);
    assert.equal(f.records().length, 1, 'a repeated animation callback cannot create a second timer');
    assert.equal(f.commands.filter(([kind]) => kind === 'start').length, 1);
    await f.advance(60000);
    assert.equal(f.timer().isCompleted, true); assert.equal(f.timer().hasOpenSession, false);
    assert.equal(f.timer().sessionSummary, null, 'offline completion cannot invent a server receipt or reward');
    assert.equal(f.timer().syncStatus, 'waiting'); assert.equal(f.timer().unsyncedSessionCount, 1);
    assert.equal(f.records()[0].state, 'completed'); assert.equal(f.records()[0].sync.receipt, null);
    assert.equal(f.records()[0].completedAtMs, startAt + 60000);
    assert.equal(f.commands.filter(([kind]) => kind === 'stop').length, 1);
    assert.deepEqual(f.cloud, [], 'departure, native protection and pending completion use no network');
  } finally { await f.cleanup(); }
});

test('offline Skip finishes the actual quick night fade, then starts exactly once', async () => {
  const f = await fixture();
  try {
    await f.press('Start');
    const natural = f.animations.findLast(animation => animation.config?.duration === 2000 && animation.done);
    await f.press('Skip');
    const skipped = f.animations.findLast(animation => animation.config?.duration === 700 && animation.done);
    assert.ok(skipped); assert.deepEqual(f.records(), []); assert.deepEqual(f.commands, []);
    await f.finish(natural);
    assert.equal(f.timer().hasOpenSession, false, 'the cancelled natural completion cannot bypass the quick fade');
    await f.advance(950); await f.finish(skipped);
    assert.equal(f.timer().isRunning, true); assert.equal(f.timer().timeLeft, 60);
    await f.finish(natural); await f.finish(skipped);
    assert.equal(f.records().length, 1); assert.equal(f.commands.filter(([kind]) => kind === 'start').length, 1);
    assert.deepEqual(f.cloud, []);
  } finally { await f.cleanup(); }
});

test('offline Reduce Motion skips departure and starts the same durable protected timer immediately', async () => {
  const f = await fixture({ reduced: true });
  try {
    await f.press('Start');
    assert.equal(f.root().findAllByProps({ testID: 'session-setting-off' }).length, 0);
    assert.equal(f.animations.some(animation => animation.config?.duration === 2400 || animation.config?.duration === 2000), false);
    assert.equal(f.timer().isRunning, true); assert.equal(f.timer().timeLeft, 60);
    assert.equal(f.timer().protectedSession, true); assert.equal(f.protection().active, true);
    assert.equal(f.records().length, 1); assert.equal(f.commands.filter(([kind]) => kind === 'start').length, 1);
    assert.deepEqual(f.cloud, []);
  } finally { await f.cleanup(); }
});

test('offline departure cannot bypass the existing protection permission gate', async () => {
  const f = await fixture({ usage: false });
  try {
    await f.press('Start');
    const night = f.animations.findLast(animation => animation.config?.duration === 2000 && animation.done);
    await f.finish(night);
    assert.equal(f.timer().hasOpenSession, false); assert.equal(f.timer().protectionSetupRequired, true);
    assert.deepEqual(f.records(), []); assert.deepEqual(f.commands, []); assert.deepEqual(f.cloud, []);
  } finally { await f.cleanup(); }
});
