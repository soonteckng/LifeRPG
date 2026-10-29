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
  areas: [{ title: 'Learning', color: '#93C5FD', xp: 2 }, { title: 'Wellbeing', color: '#FBBF24', xp: 1 }],
};
async function fixture({ fontScale = 1, height = 844, width = 390, initial = {} } = {}) {
  const celebrations = [], haptics = []; let closed = 0, dismissed = 0, renderer;
  const native = { View: host('View'), StyleSheet: { create: v => v, absoluteFill: {} }, useWindowDimensions: () => ({ width, height, fontScale }) };
  const mocks = {
    'react-native': native, './AppText': { Text: host('Text') }, './MotionPressable': host('Button'),
    '../context/UserContext': { useUser: () => ({ profile: { id: 'fixture-owner', level: 2, current_xp: 10 }, hapticsEnabled: true }) },
    './CompletionDetails': { CompletionHero: host('Hero'), CompletionRows: host('Rows') },
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

test('synced offline sessions have one honest total and the exact duration groups and category XP', async () => {
  const f = await fixture({ initial: { xpEarned: 4, creditVersion: 1, dailyCompletedSeconds: 7200, dailyGoalMinutes: 30, goalReachedNow: true, recovered: true } });
  try {
    const header = f.root().findByProps({ testID: 'session-result-header' });
    assert.equal(text(header), 'Sessions synced');
    assert.equal(header.findByType('Text').props.accessibilityRole, 'header');
    const hero = f.root().findByType('Hero');
    assert.equal(hero.props.seconds, 180); assert.equal(hero.props.title, '3 offline sessions');
    const groups = f.root().findByProps({ testID: 'session-sync-durations' });
    assert.equal(text(groups), '3 × 1 min');
    assert.equal(groups.findByType('Text').props.accessibilityLabel, '3 sessions of 1 min each');
    const xp = f.root().findByProps({ testID: 'session-sync-xp' });
    assert.equal(text(xp), 'Character XP+4Learning+2 XPWellbeing+1 XP', 'use receipt values, never infer XP from minutes');
    assert.equal(f.root().findAllByType('Rows').length, 0, 'cumulative daily/goal fields are not added into batch rows');
    assert.ok(!text(f.root()).includes('This is the session recovered'));
    assert.ok(!text(f.root()).includes('Daily goal reached'));
    assert.deepEqual(f.haptics, ['success']);
    await f.done(); await f.update({ visible: false }); await f.finish();
    assert.deepEqual(f.celebrations, [], 'aggregate duration cannot manufacture a first-session or daily-goal celebration');
  } finally { await f.cleanup(); }
});

test('one sync receipt retains the existing Done-only fade and acknowledges dismissal once', async () => {
  const f = await fixture();
  try {
    const sheet = f.root().findByType('Sheet');
    assert.equal(sheet.props.dismissible, false); assert.equal(sheet.props.closeMotion, 'fade'); assert.equal(sheet.props.closeFadeDuration, 400);
    const done = f.root().findByProps({ testID: 'session-result-done' });
    assert.equal(done.props.accessibilityRole, 'button'); assert.equal(done.props.accessibilityLabel, 'Done');
    await f.done(); await f.done(); assert.equal(f.closed(), 1); assert.equal(f.dismissed(), 0);
    await f.update({ visible: false }); await f.finish(); await f.finish();
    assert.equal(f.dismissed(), 1);
  } finally { await f.cleanup(); }
});

test('sync preparation keeps a named busy action and the host activity identity until its trail is ready', async () => {
  const activityId = Symbol('sync-host');
  const f = await fixture({ initial: { activityId } });
  try {
    assert.equal(f.root().findByType('Sheet').props.activityId, activityId);
    const button = () => f.root().findByProps({ testID: 'session-result-done' });
    assert.equal(button().props.accessibilityLabel, 'Done'); assert.ok(!button().props.disabled);
    await f.update({ syncSummary: { ...summary, preparing: true } });
    assert.equal(button().props.disabled, true); assert.equal(button().props.accessibilityLabel, 'Opening your trail');
    assert.deepEqual(button().props.accessibilityState, { busy: true, disabled: true });
    assert.equal(text(button()), 'Opening…');
    await f.done(); assert.equal(f.closed(), 0, 'a queued accessibility callback cannot re-enter preparation');
    await f.update({ syncSummary: summary }); await f.done(); assert.equal(f.closed(), 1);
    await f.update({ syncSummary: { ...summary, preparing: true } }); await f.done(); assert.equal(f.closed(), 1);
    assert.equal(f.dismissed(), 0, 'the real host keeps the sheet until its map has committed');
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
    for (const row of f.root().findByProps({ testID: 'session-sync-xp' }).findAllByType('View').filter(node => node.props.accessible)) {
      assert.equal(flatten(row.props.style).flexWrap, 'wrap', 'labels and values can wrap rather than clipping at large text');
    }
    await f.done(); assert.equal(f.closed(), 1);
  } finally { await f.cleanup(); }
});

test('mixed durations retain seconds and plural pending copy without invented today totals', async () => {
  const f = await fixture({ initial: { syncSummary: { sessionCount: 3, durations: [{ seconds: 60, count: 1 }, { seconds: 75, count: 2 }], areas: [], pendingCount: 2 }, durationSeconds: 210, xpEarned: 0 } });
  try {
    assert.equal(text(f.root().findByProps({ testID: 'session-sync-durations' })), '1 × 1 min2 × 1 min 15 sec');
    assert.equal(f.root().findByType('Hero').props.seconds, 210);
    assert.equal(text(f.root().findByProps({ testID: 'session-sync-xp' })), 'Character XP+0');
    assert.ok(text(f.root()).includes('2 more sessions are saved on this phone, waiting to sync.'));
  } finally { await f.cleanup(); }
});

test('ordinary single-session presentation and its real celebration stay unchanged without syncSummary', async () => {
  const f = await fixture({ initial: { syncSummary: undefined, recovered: false, durationSeconds: 60, xpEarned: 1, questTitle: 'Review notes', creditVersion: 1 } });
  try {
    assert.equal(text(f.root().findByProps({ testID: 'session-result-header' })), 'Session complete');
    assert.equal(f.root().findByType('Sheet').props.label, 'session completion');
    assert.equal(f.root().findByType('Hero').props.title, 'Review notes');
    assert.equal(f.root().findByType('Rows').props.summary.durationSeconds, 60);
    assert.equal(f.root().findAllByProps({ testID: 'session-sync-xp' }).length, 0);
    await f.done(); await f.update({ visible: false }); await f.finish();
    assert.equal(f.celebrations.length, 1); assert.equal(f.celebrations[0].durationSeconds, 60);
  } finally { await f.cleanup(); }
});

test('developer sync preview opens the actual summary and one three-minute trail without changing real progress', async () => {
  let running = false, tree; const presses = [], routes = [], celebrations = [];
  const profile = Object.freeze({ id: 'dev-fixture', level: 2, current_xp: 11, streak_count: 3 });
  const real = Object.freeze({ today: { date: '2026-10-28', seconds: 0, finds: 0 }, stardust: 7 });
  const rewards = { state: real, owner: profile.id, admissionEpoch: 1, online: true, busy: false, look: {}, equipped: {},
    background: 'bg_dusk', frame: null, today: real.today, nextFindSeconds: 1800, trail: { findSeconds: 1800, stops: 4, complete: false },
    stardust: real.stardust, lab: { active: false, allOwned: false } };
  const native = { View: host('View'), Modal: host('Modal'), ScrollView: host('NativeScroll'),
    StyleSheet: { create: value => value, absoluteFill: {}, hairlineWidth: 1 }, useWindowDimensions: () => ({ width: 360, height: 640, fontScale: 1.8 }),
    AppState: { addEventListener: () => ({ remove() {} }) } };
  const mocks = {
    'react-native': native, './AppText': { Text: host('Text') },
    './MotionPressable': function Press(props) { return React.createElement('Button', { ...props, onPress: () => { if (!props.disabled) { presses.push(props.testID); props.onPress?.(); } } }, props.children); },
    '../context/UserContext': { useUser: () => ({ profile, hapticsEnabled: false }) },
    '../context/TimerContext': { useTimer: () => ({ hasOpenSession: running }) },
    '../hooks/useRewards': { useRewards: () => rewards }, '../hooks/useReducedMotion': { useReducedMotion: () => false },
    'expo-router': { useRouter: () => ({ navigate: value => routes.push(value) }) },
    './CompletionDetails': { CompletionHero: host('Hero'), CompletionRows: host('Rows') },
    './AppSheet': props => React.createElement('Sheet', props, props.header, props.children, props.footer), './SheetHeader': host('Header'),
    './PostSessionCelebration': { DailyAchievementMoment: host('Achievement') }, './RewardMoments': { Moment: host('Moment') },
    './rewards/ChosenReward': {ChosenRewardCard:props=>React.createElement("ChosenCard",props),ChosenRewardSheet:props=>React.createElement("ChosenSheet",props)}, './rewards/RevealScreens': { ExpeditionReveal: host('Expedition'), PackReveal: host('Pack') }, './session/SessionBackdrop': host('Backdrop'),
    '@expo/vector-icons': { Ionicons: host('Icon') }, './CharacterMark': host('Character'), './ProgressRing': host('Ring'),
    '@gorhom/bottom-sheet': { BottomSheetScrollView: React.forwardRef(function Scroll(props, ref) {
      React.useImperativeHandle(ref, () => ({ scrollTo() {} })); return React.createElement('Scroll', props, props.children);
    }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    'react-native-svg': { __esModule: true, default: host('Svg'), Defs: host('Defs'), RadialGradient: host('Gradient'), Stop: host('Stop'), Rect: host('Rect') },
    'expo-haptics': {}, '../services/dailyAchievementQueue': { dailyAchievementQueue: { enqueue: value => celebrations.push(value) } },
  };
  const Component = load('src/components/DeveloperRewardTests.tsx', mocks).default;
  const button = id => tree.root.findAllByType('Button').find(node => node.props.testID === id);
  await act(async () => { tree = create(React.createElement(Component)); });
  try {
    const launch = button('dev-sync-summary'); assert.ok(launch);
    assert.equal(launch.props.accessibilityRole, 'button'); assert.equal(launch.props.accessibilityLabel, 'Offline sync summary');
    await act(async () => launch.props.onPress());
    await act(async () => tree.root.findAllByType('Modal').find(node => node.props.onShow).props.onShow());
    assert.ok(presses.includes('dev-sync-summary'), 'the existing haptic SettingsRow press path is used');
    assert.equal(text(tree.root.findByProps({ testID: 'session-result-header' })), 'Sessions synced');
    assert.equal(tree.root.findByType('Hero').props.seconds, 180);
    assert.equal(text(tree.root.findByProps({ testID: 'session-sync-durations' })), '3 × 1 min');
    assert.equal(text(tree.root.findByProps({ testID: 'session-sync-xp' })), 'Character XP+3Everyday focus+3 XP');
    await act(async () => button('session-result-done').props.onPress());
    // Like the real catch-up: the map is prepared underneath, its walk held, while the card still shows.
    let map = tree.root.findByType('Expedition'); assert.equal(map.props.walkDelay, 60000);
    const result = () => tree.root.findAllByType('Sheet').find(node => node.props.label === 'synced sessions');
    assert.equal(result().props.visible, true, 'the card stays until the map is ready');
    await act(async () => map.props.onReady());
    assert.equal(result().props.visible, false, 'then the card fades straight into the map');
    await act(async () => result().props.onDismiss());
    map = tree.root.findByType('Expedition'); assert.equal(map.props.walkDelay, 650, 'the walk starts once the card is gone');
    const reveal = map.props.reveal;
    assert.equal(reveal.seconds, 180); assert.equal(reveal.trail.seconds, 180); assert.equal(reveal.trail.fromSeconds, 0);
    assert.equal(profile.current_xp, 11); assert.equal(real.today.seconds, 0); assert.equal(real.stardust, 7);
    assert.deepEqual(celebrations, []); assert.deepEqual(routes, []);
    await act(async () => tree.root.findByType('Expedition').props.onClose());
    const celebrate=button('dev-sync-achievements');assert.ok(celebrate);assert.equal(celebrate.props.accessibilityRole,'button');
    await act(async()=>celebrate.props.onPress());
    await act(async()=>tree.root.findAllByType('Modal').find(node=>node.props.onShow).props.onShow());
    await act(async()=>button('session-result-done').props.onPress());
    await act(async()=>tree.root.findByType('Expedition').props.onReady());
    const combined=tree.root.findAllByType('Sheet').find(node=>node.props.label==='synced sessions');
    await act(async()=>combined.props.onDismiss());
    await act(async()=>tree.root.findByType('Expedition').props.onClose());
    assert.deepEqual(tree.root.findByType('Achievement').props.achievements,{firstSession:true,dailyGoal:true});
    assert.deepEqual(celebrations,[],'preview uses the real celebration component without consuming real day ledgers');
    await act(async () => { running = true; tree.update(React.createElement(Component)); });
    assert.equal(tree.root.findAllByType('Expedition').length, 0); assert.equal(button('dev-sync-summary').props.disabled, true);
  } finally { await act(async () => tree.unmount()); }
});
