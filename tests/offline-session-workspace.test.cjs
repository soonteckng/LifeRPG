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
  let timer = { offlineAvailable: true, clientReported: false, isRunning: false, hasOpenSession: false, endingSession: false, isCompleted: false,
    syncStatus: 'idle', timeLeft: 90, duration: 1800, isRestoring: false, actionBusy: false, actionError: null, unsyncedSessionCount: 0,
    startSuggestedTimer: async (focus, area) => { calls.push(['start-learning', focus.seconds, area]); return true; }, startFreeTimer: async (seconds, area) => { calls.push(['start-free', seconds, area]); return true; },
    pauseTimer: async () => calls.push(['pause']), resumeTimer: async () => calls.push(['resume']), resetTimer: async () => calls.push(['end']),
    clearCompletionModal: () => calls.push(['done']), ...options.timer };
  const duration = { ready: true, selectedSeconds: 1800, value: { customSeconds: 75, presetSeconds: 1800 }, choose: async (...args) => calls.push(['duration', ...args]) };
  const module = load('src/components/OfflineSessionWorkspace.tsx', {
    'react-native': { View: host('View'), Pressable: host('Button'), ScrollView: host('Scroll'), StyleSheet: { create: v => v }, useWindowDimensions: () => ({ width: 390 }) },
    'react-native-safe-area-context': { SafeAreaView: host('SafeArea') }, 'expo-haptics': { selectionAsync: async () => calls.push(['haptic']) },
    './AppText': { Text: host('Text') }, './ProgressRing': host('Ring'), './FocusDurationSheet': host('DurationSheet'),
    '../context/TimerContext': { useTimer: () => timer }, '../context/AuthContext': { useAuth: () => ({ localOwner: { id: '11111111-1111-4111-8111-111111111111', backendId: 'workspace' }, retrySessionVerification: async () => calls.push(['verify']) }) },
    '../context/UserContext': { useUser: () => ({ hapticsEnabled: options.haptics ?? true }) },
    '../hooks/useFocusDurationPreference': { useFocusDurationPreference: () => duration },
    '../services/offlineFocusCatalog': { readOfflineFocusAreas: async () => options.areas ?? [{ id: 1, title: 'Learning', color_code: '#55aaff' }, { id: 2, title: 'Everyday focus', color_code: '#7777ff' }] },
  });
  let tree; await act(async () => { tree = create(React.createElement(module.default)); });
  return { root: () => tree.root, calls, button: label => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label),
    press: async label => { await act(async () => { await tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label).props.onPress(); }); },
    update: async next => { timer = { ...timer, ...next }; await act(async () => { tree.update(React.createElement(module.default)); }); },
    cleanup: () => act(async () => tree.unmount()) };
}
test('offline Learning starts with the cached real area and selected duration; no provisional rewards are shown', async () => {
  const ui = await screen();
  try { await ui.press('Start session'); assert.ok(ui.calls.some(call => JSON.stringify(call) === JSON.stringify(['start-learning', 1800, 1]))); assert.doesNotMatch(text(ui.root()), /XP|gold|earned/); }
  finally { await ui.cleanup(); }
});
test('running and paused offline controls call the actual controller controls with a progress ring', async () => {
  const ui = await screen({ timer: { hasOpenSession: true, isRunning: true } });
  try { assert.equal(ui.root().findAllByType('Ring').length, 1); await ui.press('Pause session'); await ui.update({ isRunning: false }); await ui.press('Resume session'); await ui.press('End session'); assert.ok(ui.calls.some(call => call[0] === 'pause')); assert.ok(ui.calls.some(call => call[0] === 'resume')); assert.ok(ui.calls.some(call => call[0] === 'end')); }
  finally { await ui.cleanup(); }
});
test('Done stays available during pending sync and never calls Retry or fabricates a receipt', async () => {
  const ui = await screen({ timer: { isCompleted: true, actionBusy: true, unsyncedSessionCount: 2 } });
  try { assert.notEqual(ui.button('Done').props.disabled, true); await ui.press('Done'); assert.ok(ui.calls.some(call => call[0] === 'done')); assert.match(text(ui.root()), /2 sessions waiting to sync/); assert.doesNotMatch(text(ui.root()), /XP|gold/); }
  finally { await ui.cleanup(); }
});
test('single reconnect button verifies the account; cached missing areas never invent a subject ID', async () => {
  const ui = await screen({ areas: [], haptics: false });
  try { await ui.press('Start session'); await ui.press('Retry connection'); assert.ok(ui.calls.some(call => call[0] === 'start-learning' && call[2] === null)); assert.ok(ui.calls.some(call => call[0] === 'verify')); assert.ok(!ui.calls.some(call => call[0] === 'haptic')); }
  finally { await ui.cleanup(); }
});
