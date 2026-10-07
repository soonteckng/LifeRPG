/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => props => React.createElement(name, props, props.children);
function environment(reduced = false) {
  const pending = [], stopped = [], announced = []; let back, keyboard = false, dismissals = 0;
  const animation = config => ({ config, start: callback => pending.push(callback), stop: () => stopped.push(config) });
  const Scroll = React.forwardRef((props, ref) => { React.useImperativeHandle(ref, () => ({ scrollTo() {} })); return React.createElement('Scroll', props, props.children); });
  const Native = {
    View: host('View'), ScrollView: Scroll, KeyboardAvoidingView: host('Keyboard'), Platform: { OS: 'android' }, StyleSheet: { create: value => value, hairlineWidth: 1 },
    Keyboard: { dismiss: () => { dismissals++; keyboard = false; }, isVisible: () => keyboard },
    AccessibilityInfo: { announceForAccessibility: title => announced.push(title) },
    BackHandler: { addEventListener: (_, callback) => { back = callback; return { remove() {} }; } },
    Animated: { View: host('Animated'), Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } }, timing: (_, config) => animation(config), parallel: items => animation(items), sequence: items => animation(items), delay: duration => ({ duration }) },
  };
  const base = { 'react-native': Native, 'react-native-safe-area-context': { SafeAreaView: host('Safe') }, '@expo/vector-icons': { Ionicons: host('Icon') } };
  function load(file, extra = {}, cache = new Map()) {
    const filename = path.resolve(__dirname, '..', file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', code)(name => {
      if (Object.hasOwn(extra, name)) return extra[name];
      if (Object.hasOwn(base, name)) return base[name];
      if (name.endsWith('/AppText')) return { Text: host('Text') };
      if (name.endsWith('/MotionPressable')) return host('Button');
      if (name.endsWith('/useReducedMotion')) return { useReducedMotion: () => reduced };
      if (!name.startsWith('.')) return require(name);
      const target = path.resolve(path.dirname(filename), name);
      const extension = ['.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
      return load(path.relative(path.resolve(__dirname, '..'), target + extension), extra, cache);
    }, module, module.exports);
    return module.exports;
  }
  return { load, pending, stopped, announced, back: () => back(), setKeyboard: () => { keyboard = true; }, dismissals: () => dismissals };
}
test('the real onboarding frame pins actions outside scroll and keeps progress/back/keyboard behavior consistent', async () => {
  const env = environment(), Frame = env.load('src/components/OnboardingFrame.tsx').default; let backs = 0, next = 0, tree;
  const props = { step: 2, total: 7, title: 'Your default focus', subtitle: 'Choose one.', opacity: 1, onNext: () => next++, onBack: () => backs++ };
  await act(async () => { tree = create(React.createElement(Frame, props, React.createElement('Choice'))); });
  try {
    assert.equal(tree.root.findByType('Scroll').findAllByType('Button').length, 0);
    assert.equal(tree.root.findByProps({ testID: 'onboarding-footer' }).findAllByType('Button').length, 2);
    assert.equal(tree.root.findAllByType('View').find(node => node.props.accessibilityRole === 'progressbar').props.accessibilityValue.now, 2);
    env.setKeyboard(); await act(async () => env.back()); assert.equal(backs, 0); assert.equal(env.dismissals(), 1);
    await act(async () => env.back()); assert.equal(backs, 1);
    await act(async () => tree.update(React.createElement(Frame, { ...props, busy: true })));
    await act(async () => env.back()); assert.equal(backs, 1); assert.equal(next, 0);
  } finally { await act(async () => tree.unmount()); }
});
test('step transitions retain outgoing content until faded and synchronously reject repeated taps', async () => {
  const env = environment(), api = env.load('src/components/OnboardingFrame.tsx'); let transition, tree, swaps = 0;
  function Harness() { transition = api.useOnboardingTransition(); return null; }
  await act(async () => { tree = create(React.createElement(Harness)); });
  await act(async () => { transition.change(() => swaps++); transition.change(() => swaps++); });
  assert.equal(swaps, 0); assert.equal(env.pending.length, 1);
  await act(async () => env.pending.shift()({ finished: true })); assert.equal(swaps, 1); assert.equal(transition.moving, true);
  await act(async () => env.pending.shift()({ finished: true })); assert.equal(transition.moving, false);
  await act(async () => tree.unmount());
});
test('reduced motion changes steps without delayed animations', async () => {
  const env = environment(true), api = env.load('src/components/OnboardingFrame.tsx'); let transition, tree, swaps = 0;
  function Harness() { transition = api.useOnboardingTransition(); return null; }
  await act(async () => { tree = create(React.createElement(Harness)); });
  await act(async () => transition.change(() => swaps++)); assert.equal(swaps, 1); assert.equal(env.pending.length, 0);
  await act(async () => tree.unmount());
});
test('completion waits for its animation before Home, and retries a failed refresh without repeating the saved RPC', async () => {
  const env = environment(); let writes = 0, refreshes = 0, tree; const routes = [], router = { replace: route => routes.push(route) };
  const Screen = env.load('src/app/tutorial.tsx', {
    '../components/OnboardingFrame': require('./onboarding-mocks.cjs').frame(React),
    'expo-router': { useRouter: () => router },
    '../context/UserContext': { useUser: () => ({ profile: { onboarding_completed: false }, reloadProfile: async () => ++refreshes > 1 }) },
    '../services/onboardingService': { finishOnboarding: async () => writes++ },
  }).default;
  await act(async () => { tree = create(React.createElement(Screen)); });
  const press = label => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label).props.onPress();
  await act(async () => { press('Skip introduction'); press('Skip introduction'); });
  assert.equal(writes, 1); assert.equal(refreshes, 0); assert.deepEqual(routes, []);
  await act(async () => env.pending.shift()({ finished: true })); assert.equal(refreshes, 1); assert.deepEqual(routes, []);
  await act(async () => press('Skip introduction')); assert.equal(writes, 1);
  await act(async () => env.pending.shift()({ finished: true })); assert.deepEqual(routes, ['/']);
  await act(async () => tree.unmount());
});

test('dismounting completion stops its animation and ignores a late success callback', async () => {
  const env = environment(), Finish = env.load('src/components/OnboardingFinish.tsx').default; let done = 0, tree;
  await act(async () => { tree = create(React.createElement(Finish, { onDone: () => done++ })); });
  assert.equal(env.back(), true);
  const callback = env.pending.shift();
  await act(async () => tree.unmount());
  callback({ finished: true }); assert.equal(done, 0); assert.equal(env.stopped.length, 1);
});
