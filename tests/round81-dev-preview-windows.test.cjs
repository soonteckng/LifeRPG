/* global __dirname */
// Android opens a Modal's window as soon as its native view is created, and
// Fabric creates a child's views before its parent's. A card Modal mounted in
// the same commit as the scenery Modal around it therefore opens first and
// ends up underneath. This models that rule: each Modal opens its window when
// it is first committed visible (children first), and the latest one is on top.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(root, file); if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const suffix = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
    return load(path.relative(root, target + suffix), mocks, cache);
  }, module, module.exports);
  return module.exports;
}

function windows({ reportShown = true } = {}) {
  const stack = []; let next = 0;
  function Modal(props) {
    const [id] = React.useState(() => ++next);
    const name = props.testID ?? (props.children && props.label) ?? `modal-${id}`;
    // Layout effects run children first, like Fabric creating native views.
    React.useLayoutEffect(() => {
      if (!props.visible) return;
      stack.push(name);
      const shown = setTimeout(() => { if (reportShown) props.onShow?.(); }, 0);
      return () => { clearTimeout(shown); stack.splice(stack.lastIndexOf(name), 1); };
    }, [props.visible]); // eslint-disable-line
    return props.visible ? React.createElement('Window', { name }, props.children) : null;
  }
  return { Modal, top: () => stack.at(-1), stack };
}

async function setup(variantButton, options) {
  const w = windows(options);
  const profile = { id: 'dev', level: 2, current_xp: 11, streak_count: 3 };
  const rewards = { state: {}, owner: 'dev', admissionEpoch: 1, online: true, busy: false, look: {}, equipped: {}, background: 'bg_dusk', frame: null,
    today: { date: '2026-10-28', seconds: 0, finds: 0 }, nextFindSeconds: 1800, trail: { findSeconds: 1800, stops: 4, complete: false }, stardust: 7,
    lab: { active: false, allOwned: false } };
  const mocks = {
    'react-native': { View: host('View'), Modal: w.Modal, ScrollView: host('NativeScroll'), StyleSheet: { create: v => v, absoluteFill: {}, hairlineWidth: 1 },
      useWindowDimensions: () => ({ width: 360, height: 640, fontScale: 1 }), AppState: { addEventListener: () => ({ remove() {} }) } },
    './AppText': { Text: host('Text') },
    './MotionPressable': props => React.createElement('Button', props, props.children),
    '../context/UserContext': { useUser: () => ({ profile, hapticsEnabled: false }) },
    '../context/TimerContext': { useTimer: () => ({ hasOpenSession: false }) },
    '../hooks/useRewards': { useRewards: () => rewards }, '../hooks/useReducedMotion': { useReducedMotion: () => false },
    'expo-router': { useRouter: () => ({ navigate() {} }) },
    './CompletionDetails': { CompletionHero: host('Hero'), CompletionRows: host('Rows') },
    // The result card is a real Modal inside AppSheet, mounted while visible.
    './AppSheet': function Sheet(props) {
      const [mounted, setMounted] = React.useState(props.visible);
      if (props.visible && !mounted) setMounted(true);
      return mounted ? React.createElement(w.Modal, { visible: true, testID: `sheet:${props.label}` }, React.createElement('Sheet', props, props.header, props.children)) : null;
    },
    './SheetHeader': host('Header'), './PostSessionCelebration': { DailyAchievementMoment: host('Achievement') }, './RewardMoments': { Moment: host('Moment') },
    './rewards/RevealScreens': { ExpeditionReveal: host('Expedition'), PackReveal: host('Pack') }, './session/SessionBackdrop': host('Backdrop'),
    '@expo/vector-icons': { Ionicons: host('Icon') }, './CharacterMark': host('Character'), './ProgressRing': host('Ring'),
    '@gorhom/bottom-sheet': { BottomSheetScrollView: React.forwardRef(function Scroll(props, ref) { React.useImperativeHandle(ref, () => ({ scrollTo() {} })); return React.createElement('Scroll', props, props.children); }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    'react-native-svg': { __esModule: true, default: host('Svg'), Defs: host('Defs'), RadialGradient: host('Gradient'), Stop: host('Stop'), Rect: host('Rect') },
    'expo-haptics': {}, '../services/dailyAchievementQueue': { dailyAchievementQueue: { enqueue() {} } },
  };
  const Component = load('src/components/DeveloperRewardTests.tsx', mocks).default;
  let tree; await act(async () => { tree = create(React.createElement(Component)); });
  const button = id => tree.root.findAllByType('Button').find(node => node.props.testID === id);
  await act(async () => button(variantButton).props.onPress());
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return { w, tree, cleanup: () => act(async () => tree.unmount()) };
}

for (const [id, label] of [['dev-sync-summary', 'synced sessions'], ['dev-sync-achievements', 'synced sessions'], ['dev-ended-result', 'session ended'],
  ['dev-offline-result', 'session completion'], ['dev-rejected-result', 'session completion']]) {
  test(`developer preview "${id}": the card's window opens above the scenery, never underneath it`, async () => {
    const ui = await setup(id);
    try {
      assert.equal(ui.w.top(), `sheet:${label}`, `windows bottom to top: ${ui.w.stack.join(' > ')}`);
      assert.equal(ui.w.stack.length, 2);
    } finally { await ui.cleanup(); }
  });
}

test('if Android never reports the scenery window as shown, the card still opens shortly after, above it', async () => {
  const ui = await setup('dev-sync-summary', { reportShown: false });
  try {
    assert.equal(ui.w.top(), 'modal-1', 'at first only the scenery');
    await act(async () => { await new Promise(r => setTimeout(r, 450)); });
    assert.equal(ui.w.top(), 'sheet:synced sessions', `windows bottom to top: ${ui.w.stack.join(' > ')}`);
  } finally { await ui.cleanup(); }
});
