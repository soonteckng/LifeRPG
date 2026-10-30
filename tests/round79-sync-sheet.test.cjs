/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');
const flatten = style => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style ?? {};

function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(root, file); if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const suffix = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
    return load(path.relative(root, target + suffix), mocks, cache);
  }, module, module.exports);
  return module.exports;
}

const summary = {
  sessionCount: 3, durations: [{ seconds: 60, count: 3 }],
  areas: [{ title: 'Learning', color: '#93C5FD' }, { title: 'Wellbeing', color: '#FBBF24' }],
};
async function fixture({ fontScale = 1, height = 844, width = 390, initial = {} } = {}) {
  const celebrations = [], haptics = []; let closed = 0, dismissed = 0, renderer;
  const native = { View: host('View'), StyleSheet: { create: v => v, absoluteFill: {} }, useWindowDimensions: () => ({ width, height, fontScale }) };
  const mocks = {
    'react-native': native, './AppText': { Text: host('Text') }, './MotionPressable': host('Button'),
    '../context/UserContext': { useUser: () => ({ profile: { id: 'fixture-owner', level: 2, current_xp: 10 }, hapticsEnabled: true }) },
    './CompletionDetails': { CompletionHero: host('Hero'), CompletionRows: host('Rows'), CompletionCard: host('Card'), CompletionTiles: host('Tiles') },
    './AppSheet': props => React.createElement('Sheet', props, props.header, React.createElement('Body', null, props.children), React.createElement('Footer', null, props.footer)),
    '@expo/vector-icons': { Ionicons: host('Icon') }, './CharacterMark': host('Character'), './ProgressRing': host('Ring'),
    '@gorhom/bottom-sheet': { BottomSheetScrollView: React.forwardRef(function Scroll(props, ref) {
      React.useImperativeHandle(ref, () => ({ scrollTo() {} })); return React.createElement('Scroll', props, props.children);
    }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    'react-native-svg': { __esModule: true, default: host('Svg'), Defs: host('Defs'), RadialGradient: host('Gradient'), Stop: host('Stop'), Rect: host('Rect') },
    'expo-haptics': { NotificationFeedbackType: { Success: 'success' }, notificationAsync: async value => { haptics.push(value); } },
    '../services/dailyAchievementQueue': { dailyAchievementQueue: { enqueue: evidence => celebrations.push(evidence) } },
  };
  const Component = load('src/components/SessionResultSheet.tsx', mocks).default;
  let props = { visible: true, sessionId: 'sync-fixture', durationSeconds: 180, xpEarned: 3, syncSummary: summary,
    onClose: () => closed++, onDismiss: () => dismissed++, ...initial };
  await act(async () => { renderer = create(React.createElement(Component, props)); });
  return { root: () => renderer.root, celebrations, haptics, closed: () => closed, dismissed: () => dismissed,
    update: async next => { props = { ...props, ...next }; await act(async () => renderer.update(React.createElement(Component, props))); },
    done: () => act(async () => renderer.root.findByProps({ testID: 'session-result-done' }).props.onPress()),
    finish: () => act(async () => renderer.root.findByType('Sheet').props.onDismiss()),
    cleanup: () => act(async () => renderer.unmount()),
  };
}

test('synced offline sessions have one honest total, the exact duration groups and their categories, with no XP', async () => {
  const f = await fixture({ initial: { dailyCompletedSeconds: 7200, dailyGoalMinutes: 30, goalReachedNow: true, recovered: true } });
  try {
    const header = f.root().findByProps({ testID: 'session-result-header' });
    // Round 85: a small label sits over the title (mockup 07); the title stays the header.
    assert.equal(text(header), 'WELCOME BACKSessions synced');
    assert.equal(header.findAllByType('Text').find(node => node.props.accessibilityRole === 'header').props.children, 'Sessions synced');
    const card = f.root().findByType('Card');
    assert.equal(card.props.seconds, 180); assert.equal(card.props.label, '3 offline sessions'); assert.equal(card.props.sync, true, 'no invented daily total on a sync card');
    const groups = f.root().findByProps({ testID: 'session-sync-durations' });
    assert.equal(text(groups), '3 × 1 min');
    assert.equal(groups.findByType('Text').props.accessibilityLabel, '3 sessions of 1 min each');
    const areas = f.root().findByProps({ testID: 'session-sync-areas' });
    assert.equal(text(areas), 'LearningRecorded ✓WellbeingRecorded ✓');
    assert.doesNotMatch(text(f.root()), /XP/);
    assert.equal(f.root().findAllByType('Rows').length, 0, 'cumulative daily/goal fields are not added into batch rows');
    assert.ok(!text(f.root()).includes('This is the session recovered'));
    assert.ok(!text(f.root()).includes('Daily goal reached'));
    assert.deepEqual(f.haptics, ['success']);
    await f.done(); await f.update({ visible: false }); await f.finish();
    assert.deepEqual(f.celebrations, [], 'there are no celebrations any more');
  } finally { await f.cleanup(); }
});

test('one sync receipt retains the existing Done-only fade and acknowledges dismissal once', async () => {
  const f = await fixture();
  try {
    const sheet = f.root().findByType('Sheet');
    assert.equal(sheet.props.dismissible, false); assert.equal(sheet.props.closeMotion, 'fade'); assert.equal(sheet.props.closeFadeDuration, 400);
    const done = f.root().findByProps({ testID: 'session-result-done' });
    assert.equal(done.props.accessibilityRole, 'button'); assert.equal(done.props.accessibilityLabel, 'Back to today');
    await f.done(); await f.done(); assert.equal(f.closed(), 1); assert.equal(f.dismissed(), 0);
    await f.update({ visible: false }); await f.finish(); await f.finish();
    assert.equal(f.dismissed(), 1);
  } finally { await f.cleanup(); }
});


for (const fontScale of [1, 1.8]) test(`sync details scroll above the existing pinned Done on a small phone at font scale ${fontScale}`, async () => {
  const durations = Array.from({ length: 12 }, (_, i) => ({ seconds: 60 + 15 * i, count: 1 }));
  const f = await fixture({ height: 640, width: 360, fontScale, initial: {
    syncSummary: { ...summary, sessionCount: 12, durations, pendingCount: 1 }, durationSeconds: durations.reduce((sum, group) => sum + group.seconds, 0),
    saveAction: React.createElement('UnrelatedSaveAction'),
  } });
  try {
    const sheet = f.root().findByType('Sheet');
    assert.equal(sheet.props.expanded, true); assert.ok(sheet.props.heightRatio <= 0.85);
    const scroll = f.root().findByType('Scroll'); assert.equal(scroll.props.enableFooterMarginAdjustment, true);
    assert.equal(scroll.findAllByType('Button').length, 0);
    assert.equal(f.root().findByType('Footer').findAllByType('Button').length, 1);
    assert.equal(f.root().findAllByType('UnrelatedSaveAction').length, 0, 'there is no single routine to save for the whole batch');
    assert.equal(f.root().findByProps({ testID: 'session-sync-durations' }).findAllByType('Text').length, 12);
    assert.ok(text(f.root()).includes('1 more session is saved on this phone, waiting to sync.'));
    for (const row of f.root().findByProps({ testID: 'session-sync-areas' }).findAllByType('View').filter(node => node.props.accessible)) {
      assert.equal(flatten(row.props.style).flexWrap, 'wrap', 'labels and values can wrap rather than clipping at large text');
    }
    await f.done(); assert.equal(f.closed(), 1);
  } finally { await f.cleanup(); }
});

test('mixed durations retain seconds and plural pending copy without invented today totals', async () => {
  const f = await fixture({ initial: { syncSummary: { sessionCount: 3, durations: [{ seconds: 60, count: 1 }, { seconds: 75, count: 2 }], areas: [], pendingCount: 2 }, durationSeconds: 210 } });
  try {
    assert.equal(text(f.root().findByProps({ testID: 'session-sync-durations' })), '1 × 1 min2 × 1 min 15 sec');
    assert.equal(f.root().findByType('Card').props.seconds, 210);
    assert.equal(f.root().findAllByProps({ testID: 'session-sync-areas' }).length, 0, 'no category rows when no category is known');
    assert.ok(text(f.root()).includes('2 more sessions are saved on this phone, waiting to sync.'));
  } finally { await f.cleanup(); }
});

test('ordinary single-session presentation stays unchanged without syncSummary, and Done never queues a celebration', async () => {
  const f = await fixture({ initial: { syncSummary: undefined, recovered: false, durationSeconds: 60, questTitle: 'Review notes', goalReachedNow: true } });
  try {
    assert.equal(text(f.root().findByProps({ testID: 'session-result-header' })), 'SESSION COMPLETEYou made room.');
    assert.equal(f.root().findByType('Sheet').props.label, 'session completion');
    assert.equal(f.root().findByType('Card').props.line, 'Review notes');
    assert.equal(f.root().findByType('Card').props.goalReachedNow, true);
    assert.equal(f.root().findByType('Card').props.sync, undefined);
    assert.equal(f.root().findAllByProps({ testID: 'session-sync-areas' }).length, 0);
    await f.done(); await f.update({ visible: false }); await f.finish();
    assert.equal(f.celebrations.length, 0);
  } finally { await f.cleanup(); }
});

