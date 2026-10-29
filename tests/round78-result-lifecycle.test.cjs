/* global __dirname */
// Real provider/controller/journal AND real Result/AppSheet/FadingSheetSurface.
// Native boundaries remain controlled, including their callback ordering.
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
    if (compiled && /(?:JournalTimerProvider|SessionResultHost|SessionScreen|SessionBackdrop|SessionResultSheet|AppSheet)\.tsx$/.test(filename)) {
      source = babel.transformSync(source, { filename, configFile: false, babelrc: false,
        parserOpts: { plugins: ['typescript', 'jsx'] }, plugins: [[require.resolve('babel-plugin-react-compiler'), { target: '19' }]] }).code;
      if (filename.endsWith('SessionResultHost.tsx')) assert.match(source, /react\/compiler-runtime/, 'the production compiler is enabled in the regression');
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
async function fixture({ compiled = true, delayReceipt = false, delayCancel = false, delayNextProtection = false, flushAtRouteExit = false, flushInDismissal = false } = {}) {
  let now = Date.UTC(2026, 9, 26, 6), tick, timer, renderer, pathname = '/session', counter = 0, serverSetup, startedAt, receipt = null, releaseReceipt, releaseCancel, endInFlight, cancelled = false;
  let reduced = false, protectionChecks = 0, rejectProtection, nextStart; const animations = [], events = [], listeners = new Set(), values = new Map();
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
    }, pause: noop, resume: noop, cancel: async () => { if (delayCancel) await new Promise(resolve => { releaseCancel = resolve; }); cancelled = true; },
  };
  const native = { AppState: app, Modal: host('Modal'), View: host('View'), ScrollView: host('Scroll'), KeyboardAvoidingView: host('KeyboardView'), ActivityIndicator: host('Spinner'),
    Platform: { OS: 'android' }, StyleSheet: { create: value => value, hairlineWidth: 1, absoluteFill: {} }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
    Keyboard: { isVisible: () => false, dismiss() {}, addListener: () => ({ remove() {} }) }, BackHandler: { addEventListener: () => ({ remove() {} }) },
    PanResponder: { create: handlers => ({ panHandlers: handlers }) }, Easing: { linear: 0 },
    Animated: { View: host('Motion'), Value: class { setValue() {} stopAnimation() {} interpolate() { return this; } }, timing: () => ({ start(callback) { callback?.({ finished: true }); }, stop() {} }) } };
  const reanimated = { __esModule: true, default: { View: host('AnimatedView') }, Easing: { inOut: value => value, quad: 0, out: value => value, cubic: 0 }, ReduceMotion: { System: 'system' }, cancelAnimation() {}, runOnJS: callback => callback,
    useSharedValue: value => React.useState(() => ({ value }))[0], useAnimatedStyle: () => ({}), interpolate() {},
    withDelay: (_delay, value) => value, withTiming: (to, config, done) => { const animation = { to, config, done }; animations.push(animation); return animation; } };
  const navigation = { canGoBack: () => true, getState: () => ({ routes: [{ key: 'home' }, { key: 'session' }], index: 1 }), isFocused: () => pathname === '/session',
    addListener: () => () => {}, goBack() { events.push('route-close'); pathname = '/'; if (flushAtRouteExit) renderer.unstable_flushSync(() => renderer.update(React.createElement(Tree))); } };
  const mocks = {
    'react-native': { ...native, Pressable: host('Pressable') }, 'react-native-reanimated': reanimated,
    'expo-router': { usePathname: () => pathname, Stack: { Screen: host('Options') }, useNavigation: () => navigation, useFocusEffect: effect => React.useEffect(effect, [effect]) },
    'expo-router/react-navigation': { usePreventRemove() {} },
    '@react-native-async-storage/async-storage': { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value) },
    'expo-modules-core': { uuid: { v4: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++counter).padStart(12, '0')}` } },
    'expo-haptics': { notificationAsync: noop, NotificationFeedbackType: { Success: 'success' } },
    '../utils/sessionBackend': { sessionBackendIdentity: () => scope },
    '../utils/sessionNotifications': { getSessionNotifications: () => null },
    '../utils/countdownTicker': { createCountdownTicker: callback => { tick = callback; return { reschedule() {}, dispose() {} }; } },
    '../services/protectedSessionStart': { prepareProtectedSession: async () => {
      if (++protectionChecks > 1 && delayNextProtection) await new Promise((_resolve, reject) => { rejectProtection = reject; });
      return false;
    } },
    '../services/sessionService': { createJournalSessionTransport: () => transport },
    '../services/offlineSessionService': { createOfflineCapabilityCache: () => ({ load: noop, refreshIfStale: noop, readFreshGrant: () => null }), createOfflineSessionTransport: () => ({ readSnapshot: noop, submit: noop }) },
    '../services/sessionNotificationService': { createSessionNotificationLifecycle: () => ({ activate() {}, setPreferences() {}, dispose: noop, schedule: noop, clear: noop }) },
    '../services/nativeSessionCountdown': { createNativeSessionCountdownLifecycle: () => ({}) },
    '../services/sessionCountdownCoordinator': { createSessionCountdownCoordinator: () => ({ initialize: async () => false, ownsNative: () => false, dispose: noop, action: noop }) },
    './AuthContext': { useAuth: () => auth }, '../context/AuthContext': { useAuth: () => auth }, './UserContext': { useUser: () => user }, '../context/UserContext': { useUser: () => user },
    '../context/QuestContext': { useQuests: () => ({ tasks: [], subjects: [{ id: 1, title: 'Learning' }] }) },
    '../hooks/useSavedRoutines': { useSavedRoutines: () => ({ ready: true, routines: [], scope }) },
    '../hooks/useReducedMotion': { useReducedMotion: () => reduced }, '../../hooks/useReducedMotion': { useReducedMotion: () => reduced },
    './SessionSavingOverlay': host('Saving'), './SaveSuggestedQuest': host('SaveQuest'), './PostSessionCelebration': host('Celebration'), './RewardMoments': host('Rewards'),
    './SessionCountdown': host('Countdown'), './SessionIntroWords': host('Intro'), './AppHeader': host('Header'), './SheetConfirmation': host('Confirm'),
    './ArrivalBanner': require('./helpers/arrival-banner-mock.cjs'), './MotionPressable': host('Button'), './AppText': { Text: host('Text') }, '../AppText': { Text: host('Text') },
    './FocusLengthControl': host('Length'), './FocusDurationSheet': host('Duration'), './ProgressRing': host('Ring'), './session/SessionReveal': host('SessionReveal'),
    '@expo/vector-icons': { Ionicons: host('Icon') }, '@gorhom/bottom-sheet': { __esModule: true,
      default: React.forwardRef(function Sheet(props, ref) {
        React.useImperativeHandle(ref, () => ({ close() {}, snapToIndex() {} }));
        return React.createElement('NativeSheet', props, props.handleComponent && React.createElement(props.handleComponent), props.children,
          props.footerComponent && React.createElement(props.footerComponent, { animatedFooterPosition: { value: 0 } }));
      }),
      BottomSheetScrollView: React.forwardRef(function Scroll(props, ref) {
        React.useImperativeHandle(ref, () => ({ scrollTo() {} })); return React.createElement('SheetScroll', props, props.children);
      }), TouchableOpacity: host('Button'), BottomSheetFooter: host('Footer'), BottomSheetBackdrop: host('Backdrop'),
      useBottomSheetSpringConfigs: value => value, useBottomSheetTimingConfigs: value => value,
    },
    'react-native-svg': { __esModule: true, default: host('Svg'), Defs: host('Defs'), RadialGradient: host('RadialGradient'), Stop: host('Stop'), Rect: host('Rect') },
    'react-native-gesture-handler': { GestureHandlerRootView: host('GestureRoot') },
    './CompletionDetails': { CompletionHero: host('Hero'), CompletionRows: host('Rows') }, './CharacterMark': host('Character'),
    'react-native-safe-area-context': { SafeAreaView: host('SafeArea'), useSafeAreaInsets: () => ({ top: 24, bottom: 20 }) },
    '../adventurer/AdventurerBack': host('Walker'), './TrailScenes': { FireGlow: host('Glow'), Fireflies: host('Fireflies'), TrailScene: host('Scene') },
    '../../hooks/useRewards': { useRewards: () => ({ look: {}, equipped: {}, today: { seconds: 0 }, trail: { findSeconds: 1800, stops: 4 } }) },
    '../hooks/useRewards': require('./helpers/rewards-store-mock.cjs'),
    '../utils/afterTransition': { afterTransition: () => () => {} }, '../utils/sessionTransition': { traceSession() {} }, '../utils/tapHaptics': { tapHaptic() {} },
  };
  const load = loader(mocks, compiled), api = load('src/context/JournalTimerProvider.tsx');
  mocks['../context/TimerContext'] = api;
  const Presenter = load('src/components/SessionResultHost.tsx').default, Screen = load('src/components/SessionScreen.tsx').default;
  const removeDismissalProbe = flushInDismissal ? load('src/services/globalSessionLifecycle.ts').globalSessionLifecycle.subscribe(() => { renderer.unstable_flushSync(() => renderer.update(React.createElement(Tree))); }) : () => {};
  const Result = load('src/components/SessionResultSheet.tsx').default;
  function Capture() { timer = api.useTimer(); return null; }
  function Tree() { return React.createElement(api.TimerProvider, null, React.createElement(Capture), pathname === '/session' && React.createElement(Screen), React.createElement(Presenter)); }
  try { await act(async () => { renderer = create(React.createElement(Tree)); await flush(); }); } catch(error) { await act(async () => renderer?.unmount()); Date.now = oldNow; throw error; }
  const update = () => act(async () => { renderer.update(React.createElement(Tree)); });
  return { timer: () => timer, root: () => renderer.root, events, animations, result: () => renderer.root.findByType(Result), visible: () => renderer.root.findByType(Result).props.visible,
    start: () => act(async () => { assert.equal(await timer.startFreeTimer(60, 1), true); await flush(); }),
    startPending: () => act(async () => { nextStart = timer.startFreeTimer(60, 1); await flush(); }),
    failProtection: () => act(async () => { rejectProtection(Error('Protection permission is unavailable.')); assert.equal(await nextStart, false); await flush(); }),
    prepareRoutine: () => act(async () => { timer.setLinkedTaskId(null); timer.setTargetAttributeId(1); timer.setNotes('liferpg:routine:v1:{"name":"Next routine"}'); timer.setDurationInSeconds(60); timer.reviewSummary(); await flush(); }),
    end: () => act(async () => { now += 15000; assert.equal(await timer.resetTimer(), true); await flush(); }),
    endPending: () => act(async () => { now += 15000; endInFlight = timer.resetTimer(); await flush(); await flush(); }),
    confirmEnd: () => act(async () => { releaseCancel?.(); await endInFlight; await flush(); await flush(); }),
    done: () => act(async () => { renderer.root.findAllByType('Button').find(button => button.props.testID === 'session-result-done').props.onPress(); await flush(); }),
    dismiss: () => act(async () => { const fade = animations.findLast(animation => animation.to === 0 && animation.config?.duration === 400); assert.ok(fade, 'the actual AppSheet starts its native fade'); fade.done(true); await flush(); renderer.update(React.createElement(Tree)); await flush(); }),
    complete: () => act(async () => { now += 60000; tick(); await flush(); await flush(); }),
    confirm: () => act(async () => { releaseReceipt?.(); await flush(); await flush(); }),
    finishWalk: () => act(async () => { const walk = animations.findLast(animation => animation.config?.duration === 1800 && animation.to === 0); assert.ok(walk, 'real SessionBackdrop scheduled the return walk'); walk.done(true); }),
    leave: async () => { pathname = '/'; await update(); },
    offline: async () => { auth.accessMode = 'local-only'; await update(); },
    reconnect: async () => { auth.accessMode = 'online'; await update(); },
    reduce: async () => { reduced = true; await update(); },
    background: () => act(async () => { app.currentState = 'background'; for (const listener of listeners) listener('background'); await flush(); }),
    cleanup: () => act(async () => { removeDismissalProbe(); renderer.unmount(); await flush(); Date.now = oldNow; }),
  };
}

for (const compiled of [false, true]) test(`Round 78: actual result/sheet fade keeps a cancelled result dismissed (${compiled ? 'production compiled' : 'uncompiled'})`, async () => {
  const f = await fixture({ compiled });
  try {
    await f.start(); await f.end();
    assert.equal(f.timer().sessionEnded, true); assert.equal(f.visible(), true);
    await f.done(); assert.equal(f.visible(), false);
    await f.dismiss();
    assert.equal(f.timer().sessionId, null); assert.equal(f.visible(), false);
    assert.equal(f.events.filter(event => event === 'route-close').length, 1);
    await f.leave(); assert.equal(f.visible(), false);
  } finally { await f.cleanup(); }
});

for (const compiled of [false, true]) test(`Round 78: a new protection check cannot revive an End dismissed before HTTP confirmation (${compiled ? 'production compiled' : 'uncompiled'})`, async () => {
  const f = await fixture({ compiled, delayCancel: true, delayNextProtection: true });
  try {
    await f.start(); await f.endPending(); await f.done(); await f.dismiss(); await f.confirmEnd(); await f.leave();
    assert.equal(f.timer().summaryViewed, true); assert.equal(f.visible(), false);
    await f.startPending();
    assert.equal(f.visible(), false, 'the acknowledged End must stay closed while native protection is being checked');
    await f.failProtection(); assert.equal(f.visible(), false, 'a failed start does not undo Done on an earlier session');
  } finally { await f.cleanup(); }
});

for (const compiled of [false, true]) test(`Round 78: preparing another routine cannot reopen an already acknowledged late End (${compiled ? 'production compiled' : 'uncompiled'})`, async () => {
  const f = await fixture({ compiled, delayCancel: true });
  try {
    await f.start(); await f.endPending(); await f.done(); await f.dismiss(); await f.confirmEnd(); await f.leave();
    await f.prepareRoutine();
    assert.equal(f.visible(), false, 'routine setup must not review the cancelled previous session');
    assert.equal(f.timer().sessionId, null, 'only the new draft remains selected');
  } finally { await f.cleanup(); }
});

test('Round 78: pending completion Done still permits one real confirmed receipt after reconnection', async () => {
  const f = await fixture({ delayReceipt: true });
  try {
    await f.start(); await f.complete(); await f.offline(); await f.background();
    assert.equal(f.timer().isCompleted, true); assert.equal(f.visible(), true); assert.equal(f.result().props.pending, true);
    await f.done(); await f.dismiss(); await f.leave();
    assert.equal(f.visible(), false, 'Done closes the local pending result');
    await f.reconnect(); await f.confirm();
    assert.equal(f.visible(), true, 'the genuine server receipt is a new result, not the old End');
    assert.equal(f.result().props.pending, false); assert.equal(f.result().props.ending, false);
    assert.equal(f.result().props.xpEarned, undefined, 'no XP on the card'); assert.equal(f.result().props.durationSeconds, 60);
    await f.done(); await f.dismiss(); await f.leave(); await f.confirm();
    assert.equal(f.visible(), false, 'the confirmed receipt cannot repeat after its Done');
  } finally { await f.cleanup(); }
});

for (const compiled of [false, true]) test(`Round 78: actual result Done while End confirmation waits (${compiled ? 'production compiled' : 'uncompiled'})`, async () => {
  const f = await fixture({ compiled, delayCancel: true });
  try {
    await f.start(); await f.endPending();
    assert.equal(f.visible(), true); assert.equal(f.result().props.ending, true);
    await f.done(); assert.equal(f.visible(), false); await f.dismiss();
    assert.equal(f.visible(), false); await f.confirmEnd();
    assert.equal(f.visible(), false, 'late confirmed End never republishes its dismissed notice');
    await f.leave(); assert.equal(f.visible(), false);
  } finally { await f.cleanup(); }
});

for (const compiled of [false, true]) test(`Round 78: native route exit flushes before the result dismissal callback completes (${compiled ? 'production compiled' : 'uncompiled'})`, async () => {
  const f = await fixture({ compiled, flushAtRouteExit: true });
  try {
    await f.start(); await f.end(); await f.done(); await f.dismiss();
    assert.equal(f.timer().sessionId, null); assert.equal(f.visible(), false);
    await f.leave(); assert.equal(f.visible(), false);
  } finally { await f.cleanup(); }
});

for (const compiled of [false, true]) test(`Round 78: synchronous dismissal observer flushes the retained result (${compiled ? 'production compiled' : 'uncompiled'})`, async () => {
  const f = await fixture({ compiled, flushInDismissal: true });
  try {
    await f.start(); await f.end(); await f.done(); await f.dismiss();
    assert.equal(f.timer().sessionId, null); assert.equal(f.visible(), false);
    await f.leave(); assert.equal(f.visible(), false);
  } finally { await f.cleanup(); }
});
