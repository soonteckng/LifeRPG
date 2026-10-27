/* global __dirname */
// Production React compilation + real provider/controller/journal. Only device,
// storage, navigation and cloud boundaries are replaced. No live requests.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), babel = require('@babel/core');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
const flush = () => new Promise(resolve => setImmediate(resolve));
function loader(mocks, compiled) {
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file); if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    let source = fs.readFileSync(filename, 'utf8');
    if (compiled && /(?:GlobalRewardListener|SessionScreen|SessionBackdrop)\.tsx$/.test(filename)) {
      source = babel.transformSync(source, { filename, configFile: false, babelrc: false,
        parserOpts: { plugins: ['typescript', 'jsx'] }, plugins: [[require.resolve('babel-plugin-react-compiler'), { target: '19' }]] }).code;
      if (filename.endsWith('GlobalRewardListener.tsx')) assert.match(source, /react\/compiler-runtime/, 'the production compiler is enabled in the regression');
    }
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'module', 'exports', js)(name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.endsWith('/SessionProtectionControl')) return Object.assign(() => null, { ProtectionSettingsSheet: () => null });
      if (name.endsWith('/SessionProtectionContext')) return { SessionProtectionProvider: props => props.children };
      const study = require('./helpers/study-stubs.cjs')(name); if (study) return study;
      if (!name.startsWith('.')) return require(name);
      const target = path.resolve(path.dirname(filename), name), suffix = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext) && fs.statSync(target + ext).isFile());
      return load(path.relative(root, target + suffix));
    }, module, module.exports); return module.exports;
  }
  return load;
}
async function fixture({ compiled = true, delayReceipt = false } = {}) {
  let now = Date.UTC(2026, 9, 26, 6), tick, timer, renderer, pathname = '/session', counter = 0, serverSetup, startedAt, receipt = null, releaseReceipt, cancelled = false;
  let reduced = false; const animations = [], events = [], listeners = new Set(), values = new Map();
  const oldNow = Date.now; Date.now = () => now;
  const scope = { ownerId: '11111111-1111-4111-8111-111111111111', backendId: 'round68-result-fixture' };
  const serverId = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
  const auth = { accessMode: 'online', user: { id: scope.ownerId }, localOwner: { id: scope.ownerId, backendId: scope.backendId }, admissionEpoch: 1,
    verifyCurrentOwner: async () => ({ id: scope.ownerId, backendId: scope.backendId }) };
  const reloadProfile = async () => true;
  const profile = { id: scope.ownerId, level: 1, current_xp: 1, streak_count: 1 };
  const user = { profile, reloadProfile, soundEnabled: false, hapticsEnabled: false };
  const noop = async () => {};
  const app = { currentState: 'active', addEventListener(_event, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const transport = {
    async start(setup) { serverSetup = setup; startedAt = now; return serverId; },
    async readOpenSessions() { return { complete: true, sessions: [] }; },
    async readSession() { return { scope, serverSessionId: serverId, setup: serverSetup, status: receipt ? 'completed' : cancelled ? 'cancelled' : 'running',
      startedAtMs: startedAt, completedAtMs: receipt ? now : null, receipt,
      snapshot: receipt ? null : { serverSessionId: serverId, state: cancelled ? 'cancelled' : 'running', startedAtMs: startedAt, elapsedMs: now - startedAt,
        observedClock: { wallTimeMs: now, monotonicTimeMs: null, bootId: null } } }; },
    async complete() {
      if (delayReceipt) await new Promise(resolve => { releaseReceipt = resolve; });
      return receipt = { sessionId: serverId, durationSeconds: 60, result: { xp_earned: 1, minutes: 1, duration_seconds: 60, credit_version: 1, area_xp_earned: 1 } };
    }, pause: noop, resume: noop, cancel: async () => { cancelled = true; },
  };
  const native = { AppState: app, Modal: host('Modal'), View: host('View'), ScrollView: host('Scroll'), KeyboardAvoidingView: host('KeyboardView'), ActivityIndicator: host('Spinner'),
    Platform: { OS: 'android' }, StyleSheet: { create: value => value, hairlineWidth: 1 }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
    Keyboard: { isVisible: () => false, dismiss() {}, addListener: () => ({ remove() {} }) }, BackHandler: { addEventListener: () => ({ remove() {} }) },
    PanResponder: { create: handlers => ({ panHandlers: handlers }) }, Easing: { linear: 0 },
    Animated: { View: host('Motion'), Value: class { setValue() {} stopAnimation() {} interpolate() { return this; } }, timing: () => ({ start(callback) { callback?.({ finished: true }); }, stop() {} }) } };
  const reanimated = { __esModule: true, default: { View: host('AnimatedView') }, Easing: { inOut: value => value, quad: 0 }, cancelAnimation() {}, runOnJS: callback => callback,
    useSharedValue: value => React.useState(() => ({ value }))[0], useAnimatedStyle: () => ({}), interpolate() {},
    withDelay: (_delay, value) => value, withTiming: (to, config, done) => { const animation = { to, config, done }; animations.push(animation); return animation; } };
  const navigation = { canGoBack: () => true, getState: () => ({ routes: [{ key: 'home' }, { key: 'session' }], index: 1 }), isFocused: () => pathname === '/session',
    addListener: () => () => {}, goBack() { events.push('route-close'); pathname = '/'; } };
  const mocks = {
    'react-native': native, 'react-native-reanimated': reanimated,
    'expo-router': { usePathname: () => pathname, Stack: { Screen: host('Options') }, useNavigation: () => navigation, useFocusEffect: effect => React.useEffect(effect, [effect]) },
    'expo-router/react-navigation': { usePreventRemove() {} },
    '@react-native-async-storage/async-storage': { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value) },
    'expo-modules-core': { uuid: { v4: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++counter).padStart(12, '0')}` } },
    'expo-haptics': { notificationAsync: noop, NotificationFeedbackType: { Success: 'success' } },
    '../utils/sessionBackend': { sessionBackendIdentity: () => scope },
    '../utils/sessionNotifications': { getSessionNotifications: () => null },
    '../utils/countdownTicker': { createCountdownTicker: callback => { tick = callback; return { reschedule() {}, dispose() {} }; } },
    '../services/protectedSessionStart': { prepareProtectedSession: async () => false },
    '../services/sessionService': { createJournalSessionTransport: () => transport },
    '../services/offlineSessionService': { createOfflineCapabilityCache: () => ({ load: noop, refreshIfStale: noop, readFreshGrant: () => null }), createOfflineSessionTransport: () => ({ readSnapshot: noop, submit: noop }) },
    '../services/sessionNotificationService': { createSessionNotificationLifecycle: () => ({ activate() {}, setPreferences() {}, dispose: noop, schedule: noop, clear: noop }) },
    '../services/nativeSessionCountdown': { createNativeSessionCountdownLifecycle: () => ({}) },
    '../services/sessionCountdownCoordinator': { createSessionCountdownCoordinator: () => ({ initialize: async () => false, ownsNative: () => false, dispose: noop, action: noop }) },
    './AuthContext': { useAuth: () => auth }, '../context/AuthContext': { useAuth: () => auth }, './UserContext': { useUser: () => user }, '../context/UserContext': { useUser: () => user },
    '../context/QuestContext': { useQuests: () => ({ tasks: [], subjects: [{ id: 1, title: 'Learning' }] }) },
    '../hooks/useSavedRoutines': { useSavedRoutines: () => ({ ready: true, routines: [], scope }) },
    '../hooks/useReducedMotion': { useReducedMotion: () => reduced }, '../../hooks/useReducedMotion': { useReducedMotion: () => reduced },
    './SessionResultSheet': host('Result'), './SessionSavingOverlay': host('Saving'), './SaveSuggestedQuest': host('SaveQuest'), './PostSessionCelebration': host('Celebration'), './RewardMoments': host('Rewards'),
    './SessionCountdown': host('Countdown'), './SessionIntroWords': host('Intro'), './AppHeader': host('Header'), './AppSheet': host('Sheet'), './SheetConfirmation': host('Confirm'),
    './ArrivalBanner': require('./helpers/arrival-banner-mock.cjs'), './MotionPressable': host('Button'), './AppText': { Text: host('Text') }, '../AppText': { Text: host('Text') },
    './FocusLengthControl': host('Length'), './FocusDurationSheet': host('Duration'), './ProgressRing': host('Ring'), './session/SessionReveal': host('SessionReveal'),
    '@expo/vector-icons': { Ionicons: host('Icon') }, '@gorhom/bottom-sheet': { BottomSheetScrollView: host('SheetScroll'), TouchableOpacity: host('Button') },
    'react-native-safe-area-context': { SafeAreaView: host('SafeArea'), useSafeAreaInsets: () => ({ top: 24, bottom: 20 }) },
    '../adventurer/AdventurerBack': host('Walker'), './TrailScenes': { FireGlow: host('Glow'), Fireflies: host('Fireflies'), TrailScene: host('Scene') },
    '../../hooks/useRewards': { useRewards: () => ({ look: {}, equipped: {}, today: { seconds: 0 }, trail: { findSeconds: 1800, stops: 4 } }) },
    '../hooks/useRewards': require('./helpers/rewards-store-mock.cjs'),
    '../utils/afterTransition': { afterTransition: () => () => {} }, '../utils/sessionTransition': { traceSession() {} }, '../utils/tapHaptics': { tapHaptic() {} },
  };
  const load = loader(mocks, compiled), api = load('src/context/JournalTimerProvider.tsx');
  mocks['../context/TimerContext'] = api;
  const Presenter = load('src/components/GlobalRewardListener.tsx').default, Screen = load('src/components/SessionScreen.tsx').default;
  const returns = load('src/services/sessionReturn.ts').sessionReturn;
  function Capture() { timer = api.useTimer(); return null; }
  function Tree() { return React.createElement(api.TimerProvider, null, React.createElement(Capture), pathname === '/session' && React.createElement(Screen), React.createElement(Presenter)); }
  try { await act(async () => { renderer = create(React.createElement(Tree)); await flush(); }); } catch(error) { await act(async () => renderer?.unmount()); Date.now = oldNow; throw error; }
  const update = () => act(async () => { renderer.update(React.createElement(Tree)); });
  return { timer: () => timer, root: () => renderer.root, events, returns, animations, result: () => renderer.root.findByType('Result'),
    start: () => act(async () => { assert.equal(await timer.startFreeTimer(60, 1), true); await flush(); }),
    end: () => act(async () => { now += 15000; assert.equal(await timer.resetTimer(), true); await flush(); }),
    done: () => act(async () => { renderer.root.findByType('Result').props.onClose(); await flush(); }),
    dismiss: () => act(async () => { renderer.root.findByType('Result').props.onDismiss(); await flush(); renderer.update(React.createElement(Tree)); await flush(); }),
    complete: () => act(async () => { now += 60000; tick(); await flush(); await flush(); }),
    confirm: () => act(async () => { releaseReceipt?.(); await flush(); await flush(); }),
    finishWalk: () => act(async () => { const walk = animations.findLast(animation => animation.config?.duration === 1800 && animation.to === 0); assert.ok(walk, 'real SessionBackdrop scheduled the return walk'); walk.done(true); }),
    leave: async () => { pathname = '/'; await update(); },
    reduce: async () => { reduced = true; await update(); },
    background: () => act(async () => { app.currentState = 'background'; for (const listener of listeners) listener('background'); await flush(); }),
    cleanup: () => act(async () => { renderer.unmount(); await flush(); Date.now = oldNow; }),
  };
}

for (const compiled of [false, true]) test(`Round 77: real cancelled journal result stays dismissed after its summary identity clears (${compiled ? 'production compiled' : 'uncompiled control'})`, async () => {
  const f = await fixture({ compiled });
  try {
    await f.start(); await f.end();
    assert.equal(f.timer().sessionEnded, true, 'a confirmed cancellation remains selected until Done');
    assert.equal(f.timer().endingSession, false, 'the server has confirmed the stop');
    assert.equal(f.timer().summaryViewed, false);
    assert.ok(f.timer().sessionId);
    assert.equal(f.result().props.visible, true); assert.equal(f.result().props.ending, true);
    await f.done(); assert.equal(f.result().props.visible, false);
    assert.ok(f.timer().sessionId, 'Done retains the canonical identity until the sheet has faded');
    await f.dismiss();
    assert.equal(f.timer().sessionId, null);
    assert.equal(f.timer().sessionEnded, false);
    assert.equal(f.timer().summaryViewed, false, 'the real provider has no summary to mark viewed after clearing selection');
    assert.equal(f.events.filter(event => event === 'route-close').length, 1);
    assert.equal(f.result().props.visible, false, 'Home must not resurrect the retained cancelled result');
    await f.leave(); assert.equal(f.result().props.visible, false, 'a later Home render must also stay dismissed');
  } finally { await f.cleanup(); }
});

for (const compiled of [false, true]) test(`actual journal completion opens its result after the real backdrop callback (${compiled ? 'production compiled' : 'uncompiled control'})`, async () => {
  const f = await fixture({ compiled });
  try {
    await f.start(); await f.complete();
    assert.equal(f.timer().isCompleted, true); assert.equal(f.timer().hasOpenSession, false);
    assert.equal(f.timer().sessionSummary.durationSeconds, 60); assert.equal(f.timer().rewardsVisible, true);
    const id = f.timer().sessionId; assert.ok(f.returns.snapshot()); assert.equal(f.result().props.visible, false);
    await f.finishWalk();
    assert.equal(f.returns.snapshot(), null, 'the real backdrop finished the presentation');
    assert.equal(f.timer().sessionId, id, 'the confirmed journal identity did not change');
    assert.equal(f.result().props.visible, true, 'Done must appear without leaving the timer');
  } finally { await f.cleanup(); }
});

test('compiled completion also opens its result when the native callback is lost', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture();
  try {
    await f.start(); await f.complete();
    assert.equal(f.result().props.visible, false);
    await act(async () => t.mock.timers.tick(2150));
    assert.equal(f.returns.snapshot(), null);
    assert.equal(f.result().props.visible, true, 'the bounded fallback releases the compiled result');
  } finally { await f.cleanup(); }
});


test('compiled return keeps its completed gate open when the receipt arrives later', async () => {
  const f = await fixture({ delayReceipt: true });
  try {
    await f.start(); await f.complete();
    assert.equal(f.timer().isCompleted, true); assert.equal(f.timer().sessionSummary, null);
    await f.finishWalk(); assert.equal(f.returns.snapshot(), null);
    await f.confirm();
    assert.equal(f.timer().sessionSummary.durationSeconds, 60);
    assert.equal(f.result().props.visible, true);
    assert.equal(f.animations.filter(animation => animation.config?.duration === 1800).length, 1, 'confirmation never replays the walk');
  } finally { await f.cleanup(); }
});

for (const interruption of ['background', 'reduce']) test(`compiled return releases the result after ${interruption}`, async () => {
  const f = await fixture();
  try {
    await f.start(); await f.complete(); assert.ok(f.returns.snapshot());
    await f[interruption]();
    assert.equal(f.returns.snapshot(), null);
    assert.equal(f.result().props.visible, true);
  } finally { await f.cleanup(); }
});

test('return snapshots stay immutable and an old callback cannot complete the next walk', () => {
  const store = loader({}, false)('src/services/sessionReturn.ts').sessionReturn;
  const before = store.stateSnapshot(); assert.equal(store.stateSnapshot(), before);
  store.begin('first'); const running = store.stateSnapshot();
  store.finish('first'); const done = store.stateSnapshot();
  assert.equal(before.active, null); assert.deepEqual(before.completed, []);
  assert.equal(running.active, 'first'); assert.deepEqual(running.completed, []);
  assert.equal(done.active, null); assert.deepEqual(done.completed, ['first']);
  assert.equal(store.begin('first'), false);
  store.begin('next'); store.finish('first'); assert.equal(store.snapshot(), 'next');
  for (let i = 0; i < 70; i++) store.begin(`bounded-${i}`);
  assert.equal(store.stateSnapshot().completed.length, 64);
});
