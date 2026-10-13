/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { create, act } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => function Host(props) { return React.createElement(name, props, props.children); };
function load(file, mocks, modules = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = { exports: {} }; modules.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name), ext = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, '..'), target + ext), mocks, modules);
  }, mod, mod.exports);
  return mod.exports;
}
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');
async function screen(options = {}) {
  const calls = [];
  let timer = { offlineAvailable: true, clientReported: false, offlineControlsAvailable: true, isRunning: false, hasOpenSession: false, endingSession: false, isCompleted: false,
    syncStatus: 'idle', timeLeft: 90, duration: 1800, isRestoring: false, actionBusy: false, actionError: null, unsyncedSessionCount: 0, sessionEnded: false,
    sessionSummary: null, notes: '', targetAttributeId: null, sessionId: 'offline-1',
    startSuggestedTimer: async (focus, area) => { calls.push(['start-suggested', focus.templateId, focus.seconds, area]); return true; }, startFreeTimer: async (seconds, area) => { calls.push(['start-free', seconds, area]); return true; },
    pauseTimer: async () => calls.push(['pause']), resumeTimer: async () => calls.push(['resume']), resetTimer: async () => { calls.push(['end']); return options.endSaved ?? true; },
    clearCompletionModal: () => calls.push(['done']), acknowledgeSummary: () => calls.push(['viewed']), ...options.timer };
  let active = options.active ?? true;
  let preference = options.preference ?? { version: 1, enabled: true, invited: true, need: 'revision', templateId: 'review-topic', smaller: false };
  const duration = { ready: true, selectedSeconds: 1800, value: { customSeconds: 75, presetSeconds: 1800 }, choose: async (...args) => calls.push(['duration', ...args]) };
  const module = load('src/components/OfflineSessionWorkspace.tsx', {
    'react-native': { View: host('View'), Pressable: host('Button'), ScrollView: host('Scroll'), StyleSheet: { create: v => v, hairlineWidth: 0.5 }, useWindowDimensions: () => ({ width: 390 }) },
    'react-native-safe-area-context': { SafeAreaView: host('SafeArea'), useSafeAreaInsets: () => ({ bottom: 16 }) }, '@expo/vector-icons': { Ionicons: host('Icon') },
    'expo-haptics': { selectionAsync: async () => calls.push(['haptic']) },
    '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), TouchableOpacity: host('Button') },
    './AppText': { Text: host('Text') }, './ProgressRing': host('Ring'), './FocusLengthControl': host('DurationControl'),
    './MotionPressable': host('Button'), './ContentReveal': host('Reveal'), './PersonalUI': { p: {} },
    './AppSheet': props => props.visible ? React.createElement('Sheet', props, props.header, props.children, props.footer) : null,
    './SheetConfirmation': host('Confirmation'),
    '../context/TimerContext': { useTimer: () => timer }, '../context/AuthContext': { useAuth: () => ({ localOwner: { id: '11111111-1111-4111-8111-111111111111', backendId: 'workspace' }, retrySessionVerification: async () => calls.push(['verify']) }) },
    '../context/UserContext': { useUser: () => ({ hapticsEnabled: options.haptics ?? true }) },
    '../hooks/useFocusDurationPreference': { useFocusDurationPreference: () => duration },
    '../hooks/useGuidedPreference': { useGuidedPreference: () => ({value:preference, ready:true, busy:false, error:false,
      save: async value => { preference = value; calls.push(['preference', value]); return true; }}) },
    '../services/offlineFocusCatalog': { readOfflineFocusAreas: async () => options.areasPromise ?? options.areas ?? [{ id: 1, title: 'Learning', color_code: '#55aaff' }, { id: 2, title: 'Everyday focus', color_code: '#7777ff' }] },
  });
  let tree; const element = () => React.createElement(module.default, {active});
  await act(async () => { tree = create(element()); });
  return { root: () => tree.root, calls, preference: () => preference,
    button: label => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label),
    press: async label => { await act(async () => { const button = tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label); assert.ok(button, `Missing ${label}`); assert.notEqual(button.props.disabled, true); await button.props.onPress(); }); },
    saveDirection: async () => act(async () => { await tree.root.findAllByType('Button').find(node => node.props.testID === 'save-guided-preferences').props.onPress(); }),
    confirm: async () => act(async () => { await tree.root.findByType('Confirmation').props.onConfirm(); }),
    cancelEnd: async () => act(async () => { tree.root.findByType('Confirmation').props.onCancel(); }),
    update: async next => { timer = { ...timer, ...next }; await act(async () => { tree.update(element()); }); },
    setActive: async next => { active = next; await act(async () => tree.update(element())); },
    cleanup: () => act(async () => tree.unmount()) };
}

test('offline Learning starts with the cached real area and selected duration; no provisional rewards are shown', async () => {
  const ui = await screen();
  try { await ui.press('Start session'); assert.ok(ui.calls.some(call => JSON.stringify(call) === JSON.stringify(['start-suggested', 'review-topic', 1800, 1]))); assert.doesNotMatch(text(ui.root()), /XP|gold|earned/); }
  finally { await ui.cleanup(); }
});

test('all six offline directions use the same chooser and actual cached IDs, with a persisted starting point', async () => {
  const ui = await screen({ areas: [
    {id:21,title:'General',color_code:null}, {id:22,title:'Knowledge',color_code:null}, {id:23,title:'Work & projects',color_code:null},
    {id:24,title:'Creativity',color_code:null}, {id:25,title:'Life Admin',color_code:null}, {id:26,title:'Grooming & Vitality',color_code:null},
  ] });
  try {
    const cases = [['Learning','review-topic',22], ['Work & projects','project-next-step',23], ['Creativity','creative-first-draft',24], ['Everyday life','life-small-task',25], ['Wellbeing','quiet-screen-free',26], ['Free focus',null,21]];
    for (const [label, template, id] of cases) {
      await ui.press('Choose focus area');
      assert.deepEqual(ui.root().findAllByType('Button').filter(node => node.props.accessibilityRole === 'radio').slice(0,6).map(node => node.props.accessibilityLabel), cases.map(item => item[0]));
      await ui.press(label); await ui.saveDirection(); await ui.press('Start session');
      assert.deepEqual(ui.calls.filter(call => call[0].startsWith('start-')).at(-1), template ? ['start-suggested',template,1800,id] : ['start-free',1800,id]);
    }
    await ui.press('Find your next step'); await ui.press('Work & projects'); await ui.press('Make room for a priority'); await ui.saveDirection();
    assert.equal(ui.preference().templateId, 'work-priority'); assert.match(text(ui.root()), /Make room for a priority/);
    await ui.press('Start session'); assert.deepEqual(ui.calls.filter(call => call[0].startsWith('start-')).at(-1), ['start-suggested','work-priority',1800,23]);
    assert.ok(ui.calls.some(call => call[0] === 'haptic'));
  } finally { await ui.cleanup(); }
});

test('cached duplicate aliases use the canonical real ID while an explicit saved area preserves its real ID', async () => {
  const areas = [{id:50,title:'Fitness & Health',color_code:null}, {id:51,title:'Wellbeing',color_code:null}];
  for (const [areaId,expected] of [[undefined,51],[50,50]]) {
    const ui = await screen({areas,preference:{version:1,enabled:true,invited:true,need:'restore',templateId:'quiet-screen-free',smaller:false,areaId}});
    try { await ui.press('Start session'); assert.deepEqual(ui.calls.find(call => call[0] === 'start-suggested'), ['start-suggested','quiet-screen-free',1800,expected]); }
    finally { await ui.cleanup(); }
  }
});

test('Start waits for the scoped catalogue read so a fast tap cannot lose the cached Learning ID', async () => {
  let resolve;
  const areasPromise = new Promise(done => { resolve = done; });
  const ui = await screen({areasPromise});
  try {
    assert.equal(ui.button('Start session').props.disabled,true);
    await act(async () => resolve([{id:87,title:'Learning',color_code:null}]));
    await ui.press('Start session'); assert.deepEqual(ui.calls.find(call => call[0] === 'start-suggested'), ['start-suggested','review-topic',1800,87]);
  } finally { await ui.cleanup(); }
});

test('running and paused offline controls call the actual controller with the same progress ring and End confirmation', async () => {
  const ui = await screen({ timer: { hasOpenSession: true, isRunning: true } });
  try {
    assert.equal(ui.root().findAllByType('Ring').length, 1); await ui.press('Pause session'); await ui.update({ isRunning: false }); await ui.press('Resume session');
    await ui.press('End session'); assert.ok(!ui.calls.some(call => call[0] === 'end'));
    await ui.cancelEnd(); assert.ok(!ui.calls.some(call => call[0] === 'end'));
    await ui.press('End session'); await ui.confirm();
    assert.ok(ui.calls.some(call => call[0] === 'pause')); assert.ok(ui.calls.some(call => call[0] === 'resume')); assert.ok(ui.calls.some(call => call[0] === 'end'));
    await ui.update({hasOpenSession:false,sessionEnded:true});
    assert.match(text(ui.root()), /Session stopped/); assert.equal(ui.root().findAllByType('Result').length,0);
  } finally { await ui.cleanup(); }
});

test('a failed durable End does not announce that the session stopped', async () => {
  const ui = await screen({ endSaved:false, timer: {hasOpenSession:true,isRunning:true} });
  try { await ui.press('End session'); await ui.confirm(); assert.doesNotMatch(text(ui.root()), /Session stopped/); assert.ok(ui.button('Pause session')); }
  finally { await ui.cleanup(); }
});

test('expiry closes an obsolete End confirmation and it cannot reopen on the next session', async () => {
  const ui = await screen({timer:{hasOpenSession:true,isRunning:true}});
  try {
    await ui.press('End session'); assert.equal(ui.root().findAllByType('Confirmation').length,1);
    await ui.update({hasOpenSession:false,isCompleted:true,isRunning:false,timeLeft:0});
    assert.equal(ui.root().findAllByType('Confirmation').length,0); assert.ok(!ui.calls.some(call => call[0] === 'end'));
    await ui.update({hasOpenSession:true,isCompleted:false,isRunning:true,sessionId:'next-offline'});
    assert.equal(ui.root().findAllByType('Confirmation').length,0);
  } finally { await ui.cleanup(); }
});

test('pending completion delegates to the global result owner without local duplicate sheets or summary buttons', async () => {
  const ui = await screen({ timer: { isCompleted: true, actionBusy: true, unsyncedSessionCount: 2 } });
  try {
    assert.equal(ui.root().findAllByType('Result').length,0); assert.equal(ui.button('Done'),undefined);
    assert.ok(!ui.calls.some(call => call[0] === 'verify')); assert.match(text(ui.root()), /2 sessions waiting to sync/); assert.doesNotMatch(text(ui.root()), /View summary|New session|XP|gold/);
  } finally { await ui.cleanup(); }
});

test('a synced receipt never creates a second workspace result or View summary detour', async () => {
  const ui = await screen({timer:{isCompleted:true,rewardsVisible:false}});
  try {
    await ui.update({syncStatus:'saved',sessionSummary:{sessionId:'offline-1',durationSeconds:60,xpEarned:1,areaXpEarned:1,questTitle:'Review your notes',recovered:true}});
    assert.equal(ui.root().findAllByType('Result').length,0); assert.equal(ui.button('Done'),undefined); assert.doesNotMatch(text(ui.root()), /View summary|New session/);
  } finally { await ui.cleanup(); }
});

test('single reconnect button verifies the account; missing cached areas never invent a subject ID', async () => {
  const ui = await screen({ areas: [], haptics: false });
  try { await ui.press('Start session'); await ui.press('Retry connection'); assert.ok(ui.calls.some(call => call[0] === 'start-suggested' && call[3] === null)); assert.ok(ui.calls.some(call => call[0] === 'verify')); assert.ok(!ui.calls.some(call => call[0] === 'haptic')); }
  finally { await ui.cleanup(); }
});

test('uncertain server controls are visibly disabled while End can persist the stop after confirmation', async () => {
  const ui = await screen({ timer: { hasOpenSession: true, isRunning: true, syncStatus: 'waiting', clientReported: false, offlineControlsAvailable: false } });
  try { assert.equal(ui.button('Pause session').props.disabled, true); assert.notEqual(ui.button('End session').props.disabled, true); assert.match(text(ui.root()), /Reconnect to confirm/); await ui.press('End session'); await ui.confirm(); assert.ok(ui.calls.some(call => call[0] === 'end')); }
  finally { await ui.cleanup(); }
});

test('hidden offline overlay cannot present direction, duration or confirmation portals', async () => {
  const ui = await screen();
  try {
    await ui.press('Choose focus area'); assert.equal(ui.root().findAllByType('Sheet').length,1);
    await ui.setActive(false); assert.equal(ui.root().findAllByType('Sheet').length,0); assert.equal(ui.root().findAllByType('DurationControl').length,0);
    await ui.setActive(true); assert.equal(ui.root().findAllByType('Sheet').length,0); await ui.setActive(false);
    await ui.update({isCompleted:true}); assert.equal(ui.root().findAllByType('Sheet').length,0);
    await ui.update({isCompleted:false,hasOpenSession:true,isRunning:true}); await ui.setActive(true); await ui.press('End session');
    assert.equal(ui.root().findAllByType('Confirmation').length,1); await ui.setActive(false); assert.equal(ui.root().findAllByType('Confirmation').length,0);
    await ui.setActive(true); assert.equal(ui.root().findAllByType('Confirmation').length,0);
  } finally { await ui.cleanup(); }
});
