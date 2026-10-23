/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => props => React.createElement(name, props, props.children);
function environment(reduced = false) {
  const pending = [], stopped = [], announced = [], configs = []; let back, keyboard = false, dismissals = 0;
  const animation = config => { configs.push(config); return { config, start: callback => pending.push(callback), stop: () => stopped.push(config) }; };
  const Scroll = React.forwardRef((props, ref) => { React.useImperativeHandle(ref, () => ({ scrollTo() {} })); return React.createElement('Scroll', props, props.children); });
  const Native = {
    View: host('View'), ScrollView: Scroll, KeyboardAvoidingView: host('Keyboard'), Platform: { OS: 'android' }, StyleSheet: { create: value => value, hairlineWidth: 1 },
    Keyboard: { dismiss: () => { dismissals++; keyboard = false; }, isVisible: () => keyboard },
    AccessibilityInfo: { announceForAccessibility: title => announced.push(title) },
    BackHandler: { addEventListener: (_, callback) => { back = callback; return { remove() {} }; } },
    Animated: { View: host('Animated'), Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } interpolate(config) { return {source:this,config}; } }, timing: (_, config) => animation(config), parallel: items => animation(items), sequence: items => animation(items), delay: duration => ({ duration }) },
  };
  const base = { 'react-native': Native, 'react-native-safe-area-context': { SafeAreaView: host('Safe') }, '@expo/vector-icons': { Ionicons: host('Icon') } };
  function load(file, extra = {}, cache = new Map()) {
    const filename = path.resolve(__dirname, '..', file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', code)(name => {
      if (Object.hasOwn(extra, name)) return extra[name];
      if (name.endsWith('/SessionProtectionContext')) return { useSessionProtection: () => ({ supported: false, selection: { mode: 'normal', allowed: [] }, capabilities: null, refresh: async () => {}, openPermission: async () => {}, choose: async () => false }) };
      if (name.endsWith('/OnboardingWelcome') && file !== 'src/components/OnboardingWelcome.tsx') return require('./onboarding-mocks.cjs').finish(React);
      if (name.endsWith('/FeatureTour')) return { prepareFeatureTour: async () => {} };
      if (name.endsWith('/SessionProtectionControl')) return { ProtectionSettingsSheet: props => React.createElement('ProtectionSheet', props) };
      if (Object.hasOwn(base, name)) return base[name];
      if (name.endsWith('/AppText')) return { Text: host('Text'), TextInput: host('Input') };
      if (name.endsWith('/MotionPressable')) return host('Button');
      if (name.endsWith('/useReducedMotion')) return { useReducedMotion: () => reduced };
      if (!name.startsWith('.')) return require(name);
      const target = path.resolve(path.dirname(filename), name);
      const extension = ['.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
      return load(path.relative(path.resolve(__dirname, '..'), target + extension), extra, cache);
    }, module, module.exports);
    return module.exports;
  }
  return { load, pending, stopped, configs, announced, back: () => back(), setKeyboard: () => { keyboard = true; }, dismissals: () => dismissals };
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
    await act(async () => tree.update(React.createElement(Frame, { ...props, transitioning: true })));
    const action=tree.root.findAllByType('Button').find(node=>node.props.accessibilityLabel==='Continue');
    assert.equal(action.props.disabled,true);assert.equal(action.props.style.some(style=>style?.opacity===0.6),false);
    await act(async () => env.back());assert.equal(backs,1);
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

test('every page shares Back navigation, keeps choices and saves only at the final step', async () => {
  const env = environment(); let tree, finishes = 0; const routes = [], profiles = [], preferences = [];
  const Screen = env.load('src/components/OnboardingJourney.tsx', {
    './OnboardingFrame': require('./onboarding-mocks.cjs').frame(React),
    'expo-router': { useRouter: () => ({ replace: route => routes.push(route) }) },
    '../context/UserContext': { useUser: () => ({ profile: { id: 'new-user', username: 'Hero', daily_goal_minutes: 60, avatar: '🌱' }, reloadProfile: async () => true }) },
    '../hooks/useGuidedPreference': { useGuidedPreference: () => ({ ready: true, value: { enabled: false, need: 'revision', templateId: 'review-topic', smaller: false }, save: async value => { preferences.push(value); return true; } }) },
    '../services/onboardingService': { usernameAvailable: async () => true, saveOnboardingProfile: async (...args) => profiles.push(args), finishOnboarding: async () => finishes++ },
  }).default;
  await act(async () => { tree = create(React.createElement(Screen)); });
  const button = label => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label);
  const press = async label => act(async () => button(label).props.onPress());
  try {
    const frame = () => tree.root.findByType('Frame').props;
    assert.equal(frame().title, 'What would you like to make time for?'); assert.equal(frame().total, 6);
    await press('Skip for now'); assert.equal(frame().step, 2);
    const input = () => tree.root.findByType('Input'); assert.equal(input().props.maxLength, 15);
    await press('Continue');assert.equal(frame().step,2);assert.ok(tree.root.findByProps({testID:'onboarding-name-error'}));assert.equal(frame().error,'');
    await act(async () => input().props.onChangeText('A'.repeat(25))); await press('Continue'); assert.equal(frame().step, 2);
    await act(async () => input().props.onChangeText('Soon')); await press('Continue'); await press('90 min'); await press('Continue');
    assert.equal(frame().step, 4); assert.equal(profiles.length, 0);
    for (let expected = 3; expected >= 1; expected--) {
      await press('Previous step'); assert.equal(frame().step, expected);
      if (expected === 3) assert.equal(button('90 min').props.accessibilityState.checked, true);
      if (expected === 2) assert.equal(input().props.value, 'Soon');
    }
    // The first page is a calm choice of areas; nothing is created there.
    await press('Learning'); assert.equal(frame().primary, 'Continue');
    await press('Continue'); assert.equal(frame().step, 2);
    for (let expected = 3; expected <= 6; expected++) { await press('Continue'); assert.equal(frame().step, expected); }
    assert.equal(profiles.length, 0); assert.equal(finishes, 0);
    await act(async () => { button('Start my journey').props.onPress(); button('Start my journey').props.onPress(); });
    assert.deepEqual(profiles, [['Soon', '🌱', 90]]); assert.equal(preferences[0].invited, true); assert.deepEqual(preferences[0].ideaAreas, ['learning']); assert.equal(finishes, 1); assert.deepEqual(routes, []);
    await act(async () => env.pending.shift()({ finished: true })); assert.deepEqual(routes, ['/']);
  } finally { await act(async () => tree.unmount()); }
});
test('completion waits for its animation before Home, and retries a failed refresh without repeating the saved RPC', async () => {
  const env = environment(); let writes = 0, refreshes = 0, tree; const routes = [], router = { replace: route => routes.push(route) };
  const Screen = env.load('src/app/tutorial.tsx', {
    './OnboardingFrame': require('./onboarding-mocks.cjs').frame(React),
    'expo-router': { useRouter: () => router },
    '../context/UserContext': { useUser: () => ({ profile: { id: 'new-user', username: 'Soon', onboarding_completed: false }, reloadProfile: async () => ++refreshes > 1 }) },
    '../hooks/useGuidedPreference': { useGuidedPreference: () => ({ ready: true, value: {}, save: async () => true }) },
    '../services/onboardingService': { usernameAvailable: async () => true, saveOnboardingProfile: async () => {}, finishOnboarding: async () => writes++ },
  }).default;
  await act(async () => { tree = create(React.createElement(Screen)); });
  const press = label => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label).props.onPress();
  assert.equal(tree.root.findAllByType('Button').some(node=>node.props.accessibilityLabel==='Skip introduction'),false);
  await act(async () => press('Continue'));
  await act(async () => press('Continue'));
  await act(async () => { press('Start my journey'); press('Start my journey'); });
  assert.equal(writes, 1); assert.equal(refreshes, 0); assert.deepEqual(routes, []);
  await act(async () => env.pending.shift()({ finished: true })); assert.equal(refreshes, 1); assert.deepEqual(routes, []);
  await act(async () => press('Start my journey')); assert.equal(writes, 1);
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

test('the welcome sequence finishes once per account, respects stored receipts and cancels late animation callbacks',async()=>{
 const env=environment(), receipts=new Map();let done=0,tree;
 const storage={getItem:async key=>receipts.get(key),setItem:async(key,value)=>receipts.set(key,value)};
 const Welcome=env.load('src/components/OnboardingWelcome.tsx',{'@react-native-async-storage/async-storage':storage}).default;
 const props={owner:'alice',onDone:()=>done++};
 await act(async()=>{tree=create(React.createElement(Welcome,props));});
 assert.equal(done,0);assert.equal(env.back(),true);
 const sequence=env.configs.find(Array.isArray);assert.deepEqual(sequence.slice(0,3).map(item=>item.config.duration),[480,480,480]);assert.equal(sequence[4].duration,2200);
 const finish=env.pending.shift();await act(async()=>{finish({finished:true});finish({finished:true});});
 assert.equal(done,1);assert.equal(receipts.get('liferpg:welcome:v1:alice'),'seen');
 await act(async()=>tree.unmount());await act(async()=>{tree=create(React.createElement(Welcome,props));});
 assert.equal(done,2);assert.equal(env.pending.length,0,'do not replay welcome for a returning draft');
 await act(async()=>tree.unmount());await act(async()=>{tree=create(React.createElement(Welcome,{...props,owner:'bob'}));});
 const stale=env.pending.shift();await act(async()=>tree.unmount());stale({finished:true});assert.equal(done,2);assert.equal(receipts.has('liferpg:welcome:v1:bob'),false);
});

test('setup sections fade upwards in order without animating layout or the pinned footer',async()=>{
 const env=environment(),Frame=env.load('src/components/OnboardingFrame.tsx').default;let tree;
 await act(async()=>{tree=create(React.createElement(Frame,{step:1,total:7,title:'Your rhythm',subtitle:'Choose a direction',opacity:1,onNext(){}},React.createElement('Choices')));});
 try{
  const reveals=env.configs.filter(c=>c.duration===620);assert.deepEqual(reveals.map(c=>c.delay),[0,160,320]);assert.ok(reveals.every(c=>c.useNativeDriver&&c.isInteraction===false));
  assert.equal(tree.root.findByProps({testID:'onboarding-footer'}).findAllByType('Animated').length,0);
 }finally{await act(async()=>tree.unmount());}
});

test('Android setup asks about app protection with Allow buttons, names what can never be blocked and saves the allow list once ready', async () => {
  const env = environment(true); const calls = []; let caps = { usage: false, overlay: false, notifications: false }, tree;
  const protection = () => ({ supported: true, selection: { mode: 'normal', allowed: [] }, capabilities: caps, apps: [{ packageName: 'notes.app', label: 'Notes' }, { packageName: 'music.app', label: 'Music' }],
    refresh: async () => { calls.push('refresh'); }, openPermission: async kind => { calls.push(['open', kind]); }, choose: async (...args) => { calls.push(['choose', ...args]); return true; } });
  const Journey = env.load('src/components/OnboardingJourney.tsx', {
    'react-native': { View: props => React.createElement('View', props, props.children), StyleSheet: { create: value => value, hairlineWidth: 1 }, Keyboard: { dismiss() {} }, AppState: { addEventListener: () => ({ remove() {} }) } },
    './OnboardingFrame': require('./onboarding-mocks.cjs').frame(React), './Segmented': props => React.createElement('Segmented', props),
    '../context/SessionProtectionContext': { useSessionProtection: () => protection() },
    'expo-router': { useRouter: () => ({ replace() {} }) },
    '../context/UserContext': { useUser: () => ({ profile: { id: 'new-user', username: 'Soon', onboarding_completed: false }, reloadProfile: async () => true }) },
    '../hooks/useGuidedPreference': { useGuidedPreference: () => ({ ready: true, value: {}, save: async () => true }) },
    '../services/onboardingService': { usernameAvailable: async () => true, saveOnboardingProfile: async () => {}, finishOnboarding: async () => {} },
  }).default;
  await act(async () => { tree = create(React.createElement(Journey, { initialStep: 3 })); });
  const button = label => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label);
  try {
    assert.equal(tree.root.findByType('Frame').props.title, 'Keep distractions away');
    assert.equal(tree.root.findByType('Frame').props.total, 7);
    assert.ok(button('Maybe later'), 'protection stays optional');
    await act(async () => button('Allow Usage Access').props.onPress());
    assert.deepEqual(calls.filter(call => Array.isArray(call)), [['open', 'usage']]);
    const copy = JSON.stringify(tree.toJSON());
    assert.match(copy, /you can change it in Settings/); assert.match(copy, /Calls and Settings can never be blocked/);
    assert.match(copy, /One 5-minute break per session/, 'the break is explained before the first protected session');
    assert.doesNotMatch(copy, /During a session, only the apps you allow/, 'no long paragraph to read');
    assert.doesNotMatch(copy, /Protection on Home/, 'protection lives in Settings now');
    assert.equal(tree.root.findAllByType('Segmented').length, 0, 'allow list is the one mode, so there is nothing to pick');
    assert.match(JSON.stringify(tree.toJSON()), /Allow all three to turn protection on/);
    caps = { usage: true, overlay: true, notifications: true };
    await act(async () => tree.update(React.createElement(Journey, { initialStep: 3 })));
    assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Allow all three/);
    // Page two: once all three are allowed, Continue opens the app list instead of moving on.
    await act(async () => button('Continue').props.onPress());
    assert.equal(tree.root.findByType('Frame').props.title, 'Choose your apps');
    assert.ok(calls.includes('refresh'), 'the app list is loaded');
    assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === 'choose'), [], 'nothing is saved yet');
    const app = pkg => tree.root.findAll(node => node.props.testID === `onboarding-app-${pkg}` && typeof node.props.onPress === 'function')[0];
    assert.ok(app('notes.app') && app('music.app'));
    await act(async () => app('notes.app').props.onPress());
    assert.equal(app('notes.app').props.accessibilityState.checked, true);
    // Back returns to the permissions page, and forward again keeps your ticks.
    await act(async () => tree.root.findByType('Frame').props.onBack());
    assert.equal(tree.root.findByType('Frame').props.title, 'Keep distractions away');
    await act(async () => button('Continue').props.onPress());
    await act(async () => app('notes.app').props.onPress());
    await act(async () => app('music.app').props.onPress());
    await act(async () => button('Continue').props.onPress());
    assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === 'choose'), [['choose', 'allow-list', ['music.app']]]);
    assert.equal(tree.root.findByType('Frame').props.step, 5);
  } finally { await act(async () => tree.unmount()); }
});

function journey(env, overrides = {}) {
  const calls = { profiles: [], preferences: [], cleared: 0, checks: [] };
  const Screen = env.load('src/components/OnboardingJourney.tsx', {
    './OnboardingFrame': require('./onboarding-mocks.cjs').frame(React),
    'expo-router': { useRouter: () => ({ replace() {} }) },
    '../context/UserContext': { useUser: () => ({ profile: { id: 'new-user', username: 'Hero', daily_goal_minutes: 60, avatar: '🌱' }, reloadProfile: async () => true }) },
    '../hooks/useGuidedPreference': { useGuidedPreference: () => ({ ready: true, value: { enabled: false, need: 'revision', templateId: 'review-topic', smaller: false }, save: async value => { calls.preferences.push(value); return true; } }) },
    '../services/introHandoff': { introHandoff: { peek: () => overrides.handoff ?? null, clear: () => { calls.cleared++; }, restore: async () => null, set() {} } },
    '../services/onboardingService': {
      usernameAvailable: async name => { calls.checks.push(name); return overrides.available ? overrides.available(name) : true; },
      saveOnboardingProfile: async (...args) => { if (overrides.saveError) { const error = overrides.saveError; overrides.saveError = null; throw error; } calls.profiles.push(args); },
      finishOnboarding: async () => {},
    },
  }).default;
  return { Screen, calls };
}
test('after creating an account in the intro, it carries on from the name step with the earlier picks', async () => {
  const env = environment(); let tree;
  const { Screen, calls } = journey(env, { handoff: { areas: ['learning', 'wellbeing'] } });
  await act(async () => { tree = create(React.createElement(Screen)); });
  const frame = () => tree.root.findByType('Frame').props;
  const press = async label => act(async () => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label).props.onPress());
  try {
    assert.equal(frame().title, 'What should we call you?', 'no welcome or area choice again');
    assert.equal(frame().step, 3, 'areas and the account step came first'); assert.equal(frame().total, 7);
    await act(async () => tree.root.findByType('Input').props.onChangeText('Soon'));
    await press('Continue'); assert.equal(frame().step, 4);
    for (let expected = 5; expected <= 7; expected++) { await press('Continue'); assert.equal(frame().step, expected); }
    await act(async () => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === 'Start my journey').props.onPress());
    assert.deepEqual(calls.preferences[0].ideaAreas, ['learning', 'wellbeing']);
    assert.equal(calls.profiles[0][0], 'Soon'); assert.equal(calls.cleared, 1, 'the draft is cleared once saved');
  } finally { await act(async () => tree.unmount()); }
});
test('the name step checks a name is free, refuses "@", and a name taken meanwhile brings you back to choose', async () => {
  const env = environment(); let tree;
  const { Screen, calls } = journey(env, { handoff: { areas: [] }, available: name => name !== 'Taken', saveError: { code: '23505' } });
  await act(async () => { tree = create(React.createElement(Screen)); });
  const frame = () => tree.root.findByType('Frame').props;
  const input = () => tree.root.findByType('Input');
  const error = () => tree.root.findAllByProps({ testID: 'onboarding-name-error' }).map(node => node.props.children).join('');
  const press = async label => act(async () => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label).props.onPress());
  try {
    await act(async () => input().props.onChangeText('me@mail'));
    await press('Continue'); assert.equal(frame().step, 3); assert.match(error(), /@/); assert.deepEqual(calls.checks, [], 'no server check for an invalid name');
    await act(async () => input().props.onChangeText('Taken'));
    await press('Continue'); assert.equal(frame().step, 3); assert.match(error(), /That name is taken/);
    await act(async () => input().props.onChangeText('Free'));
    await press('Continue'); assert.equal(frame().step, 4);
    for (let i = 0; i < 3; i++) await press('Continue');
    await press('Start my journey');
    assert.equal(frame().step, 3, 'someone took it meanwhile: back to the name, nothing lost');
    assert.match(error(), /That name is taken/); assert.equal(input().props.value, 'Free');
  } finally { await act(async () => tree.unmount()); }
});
