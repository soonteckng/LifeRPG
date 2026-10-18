const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer'); global.IS_REACT_ACT_ENVIRONMENT = true;
const host = type => props => React.createElement(type, props, props.children);
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    const key = Object.keys(mocks).find(k => k === name || k.startsWith('/') && name.endsWith(k));
    if (key) return mocks[key];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name), suffix = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, '..'), target + suffix), mocks, cache);
  }, mod, mod.exports);
  return mod.exports;
}
const utils = load('src/utils/squads.ts'), { createSquadStore } = load('src/services/squadStore.ts');
const scope = { backendId: 'squad-fixture', ownerId: '11111111-1111-4111-8111-111111111111' };
const member = (n, week, extra = {}) => ({ id: `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`, isYou: n === 1, isOwner: n === 1, name: `User ${n}`, avatar: '🌱', level: 2, streak: 1, weekSeconds: week, focusingNow: false, ...extra });
const squad = (n = 1, members = [member(1, 600), member(2, 1800, { focusingNow: true })]) => ({ id: `ffffffff-ffff-4fff-8fff-${String(n).padStart(12, '0')}`, name: 'Calc crew', code: 'K7Q4PX', ownerIsYou: true, members });

test('codes are cleaned, weeks start on Monday and members rank by focus time', () => {
  assert.equal(utils.cleanSquadCode(' k7q-4px0o '), 'K7Q4PX', 'look-alike characters and separators drop out');
  assert.equal(new Date(utils.weekStart(new Date(2026, 9, 18, 15))).getDate(), 12, 'Sunday 18 Oct belongs to the week of Monday 12 Oct');
  assert.equal(new Date(utils.weekStart(new Date(2026, 9, 19, 1))).getDate(), 19);
  const s = squad();
  assert.deepEqual(utils.ranked(s).map(m => m.name), ['User 2', 'User 1']);
  assert.equal(utils.squadTotal(s), 2400); assert.equal(utils.focusingCount(s), 1);
  assert.equal(utils.validSquad({ ...s, code: 'K7Q4P0' }), false);
  assert.equal(utils.validSquadName(' Crew'), false);
});

test('the squad list shows the remembered copy offline and refreshes when online', async () => {
  const saved = new Map(), storage = { getItem: async k => saved.get(k) ?? null, setItem: async (k, v) => { saved.set(k, v); } };
  const store = createSquadStore(storage, () => 'dddddddd-dddd-4ddd-8ddd-000000000001');
  const calls = [];
  const transport = { list: async since => { calls.push(since); return [squad()]; }, create: async () => ({ status: 'saved', squad: squad(2) }),
    join: async code => code === 'K7Q4PX' ? { status: 'saved', squad: squad(3) } : { status: 'not_found' }, leave: async () => ({ status: 'saved' }), remove: async () => ({ status: 'saved' }) };
  await store.load(scope, transport);
  assert.equal(store.snapshot(scope).squads.length, 1); assert.equal(calls.length, 1);
  const again = createSquadStore(storage, () => 'x');
  await again.load(scope, null);
  assert.equal(again.snapshot(scope).squads[0].name, 'Calc crew', 'offline shows the last list');
  await again.load(scope, { ...transport, list: async () => { throw Error('offline'); } });
  assert.match(again.snapshot(scope).error, /connection/); assert.equal(again.snapshot(scope).squads.length, 1, 'a failed refresh keeps what was there');
  assert.equal(await store.join(scope, transport, 'AAAAAA'), utils.squadMessage.not_found);
  assert.equal(await store.join(scope, transport, 'K7Q4PX'), null); assert.equal(store.snapshot(scope).squads.length, 2);
  assert.equal(await store.create(scope, transport, 'New'), null); assert.equal(store.snapshot(scope).squads.length, 3);
  assert.equal(await store.remove(scope, transport, squad().id, member(2).id), null);
  assert.equal(store.snapshot(scope).squads[0].members.length, 1);
  assert.equal(await store.leave(scope, transport, squad().id), null);
  assert.equal(store.snapshot(scope).squads.some(s => s.id === squad().id), false);
  assert.equal(await store.join(scope, { ...transport, join: async () => ({ status: 'saved', squad: { ...squad(), code: 'bad' } }) }, 'K7Q4PX'), "Couldn't reach your squads. Check your connection and try again.", 'malformed replies are refused');
});

const rn = { View: host('View'), StyleSheet: { create: v => v, hairlineWidth: 1 }, Keyboard: { dismiss: () => {} }, Share: { share: async message => { rn.shared = message; } } };
const sheets = () => load('src/components/SquadSheets.tsx', {
  'react-native': rn, '@expo/vector-icons': { Ionicons: host('Icon') }, '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), BottomSheetTextInput: host('Input'), TouchableOpacity: host('Press') },
  '/AppText': { Text: host('Text') }, '/AppSheet': props => props.visible ? React.createElement('Sheet', props, props.header, props.children, props.overlay) : null,
  '/SheetHeader': host('Header'), '/SheetConfirmation': host('Confirm'), '/Segmented': props => React.createElement('Segmented', props), '/CharacterPortrait': host('Portrait'), '/ProgressRing': host('Ring'),
});
const pressLabel = (root, label) => root.findAllByType('Press').find(x => x.props.accessibilityLabel === label);

// A squad is its own page now, opened from Squads or Home. Its ••• menu holds the leader's tools.
class AnimatedValue { constructor(value) { this.value = value; } interpolate(config) { return { source: this, config }; } }
const squadPage = (state, nav = []) => load('src/app/squad/[id].tsx', {
  'react-native': { ...rn, StyleSheet: { ...rn.StyleSheet, absoluteFill: {} }, Animated: { View: host('Animated'), Value: AnimatedValue, spring: () => ({ start() {} }) } },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) }, '/useReducedMotion': { useReducedMotion: () => true },
  '@expo/vector-icons': { Ionicons: host('Icon') }, '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), BottomSheetTextInput: host('Input'), TouchableOpacity: host('Press') },
  'expo-router': { useFocusEffect: () => {}, useLocalSearchParams: () => ({ id: squad().id }), useRouter: () => ({ canGoBack: () => true, back: () => nav.push('back'), replace: route => nav.push(route) }) },
  '/PersonalUI': { PersonalPage: ({ title, action, children }) => React.createElement('Page', { title }, action, children) },
  '/MotionPressable': host('Press'), '/AppText': { Text: host('Text') }, '/SheetConfirmation': host('Confirm'), '/useSquads': { useSquads: () => state() },
  '/AppSheet': props => props.visible ? React.createElement('Sheet', props, props.header, props.children) : null,
  '/SheetHeader': host('Header'), '/Segmented': host('Segmented'), '/CharacterPortrait': host('Portrait'), '/ProgressRing': host('Ring'),
}).default;
const words = root => root.findAllByType('Text').map(t => [].concat(t.props.children).filter(x => typeof x === 'string' || typeof x === 'number').join(''));

test('a squad opens as its own page: it ranks members, shares the code and asks before leaving or removing', async () => {
  const calls = [], nav = []; let current = squad();
  const state = () => ({ ready: true, squads: current ? [current] : [], refresh: async () => {}, update: async () => null,
    leave: async id => { calls.push(['leave', id]); return null; }, remove: async (id, m) => { calls.push(['remove', m]); return null; } });
  const Page = squadPage(state, nav); let ui;
  await act(async () => { ui = create(React.createElement(Page)); });
  assert.equal(ui.root.findByType('Page').props.title, 'Calc crew');
  assert.ok(words(ui.root).includes('2 members · you lead this squad · 1 focusing now'));
  await act(async () => pressLabel(ui.root, 'Invite friends').props.onPress());
  assert.match(rn.shared.message, /K7Q4PX/);
  const row = pressLabel(ui.root, '1. User 2, 30m this week, level 2, focusing now');
  assert.equal(row.props.onPress, undefined, 'a tap never removes anyone');
  await act(async () => row.props.onLongPress());
  assert.equal(calls.length, 0, 'removing asks first');
  await act(async () => ui.root.findByType('Confirm').props.onConfirm());
  assert.deepEqual(calls, [['remove', member(2).id]]);
  assert.equal(ui.root.findAll(n => n.props.testID === 'squad-menu').length, 0);
  await act(async () => pressLabel(ui.root, 'Squad options').props.onPress());
  assert.deepEqual(ui.root.findAllByType('Press').filter(x => x.props.accessibilityRole === 'menuitem').map(x => x.props.accessibilityLabel), ['Edit name and goal', 'New invite code', 'Share invite', 'Leave squad']);
  await act(async () => pressLabel(ui.root, 'Leave squad').props.onPress());
  assert.equal(ui.root.findAll(n => n.props.testID === 'squad-menu').length, 0, 'choosing an option closes the menu');
  assert.equal(ui.root.findByType('Confirm').props.message, utils.leaveOutcome(squad()), 'leaving says what happens to the squad');
  assert.match(ui.root.findByType('Confirm').props.message, /longest becomes the leader/);
  await act(async () => ui.root.findByType('Confirm').props.onConfirm());
  assert.deepEqual(calls.slice(1), [['leave', squad().id]]); assert.deepEqual(nav, ['back'], 'leaving returns to the list');
  current = { ...squad(), ownerIsYou: false };
  await act(async () => ui.update(React.createElement(Page)));
  await act(async () => pressLabel(ui.root, 'Squad options').props.onPress());
  assert.deepEqual(ui.root.findAllByType('Press').filter(x => x.props.accessibilityRole === 'menuitem').map(x => x.props.accessibilityLabel), ['Share invite', 'Leave squad'], 'members only share or leave');
  await act(async () => pressLabel(ui.root, 'Close squad options').props.onPress());
  assert.equal(ui.root.findAll(n => n.props.testID === 'squad-menu').length, 0, 'tapping outside closes the menu');
  assert.match(utils.leaveOutcome(squad(1, [member(1, 0)])), /squad closes and its invite code stops working/, 'the last member is told the squad ends');
  current = null;
  await act(async () => ui.update(React.createElement(Page)));
  assert.ok(words(ui.root).includes('This squad isn’t here anymore'), 'a squad that closed says so instead of a blank page');
  await act(async () => ui.unmount());
});

test('join and create explain a missing code or name instead of greying out; errors stay in the sheet', async () => {
  const { SquadJoinSheet } = sheets(); const calls = []; let closed = 0, ui;
  await act(async () => { ui = create(React.createElement(SquadJoinSheet, { visible: true, online: true, onClose: () => closed++,
    onJoin: async code => { calls.push(['join', code]); return code === 'K7Q4PX' ? null : 'No squad has that code.'; }, onCreate: async name => { calls.push(['create', name]); return null; } })); });
  const submit = () => ui.root.findAllByType('Press').at(-1);
  const input = () => ui.root.findByType('Input');
  await act(async () => input().props.onChangeText('k7q'));
  assert.equal(submit().props.disabled, false, 'the button stays tappable');
  await act(async () => submit().props.onPress());
  assert.ok(ui.root.findAllByType('Text').some(t => t.props.children === 'Enter all 6 characters of the code.')); assert.equal(calls.length, 0);
  await act(async () => input().props.onChangeText('AAAAAA'));
  await act(async () => submit().props.onPress());
  assert.ok(ui.root.findAllByType('Text').some(t => t.props.children === 'No squad has that code.')); assert.equal(closed, 0);
  await act(async () => input().props.onChangeText('k7q4px'));
  await act(async () => submit().props.onPress());
  assert.deepEqual(calls.at(-1), ['join', 'K7Q4PX']); assert.equal(closed, 1);
  await act(async () => ui.root.findByType('Segmented').props.onChange('create'));
  await act(async () => submit().props.onPress());
  assert.ok(ui.root.findAllByType('Text').some(t => t.props.children === 'Give your squad a name first.'));
  await act(async () => input().props.onChangeText('  Calc crew  '));
  await act(async () => submit().props.onPress());
  assert.deepEqual(calls.at(-1), ['create', 'Calc crew']);
  await act(async () => ui.update(React.createElement(SquadJoinSheet, { visible: true, online: false, onClose: () => {}, onJoin: async () => null, onCreate: async () => null })));
  assert.equal(submit().props.disabled, true, 'offline cannot join or create');
  await act(async () => ui.update(React.createElement(SquadJoinSheet, { visible: true, online: true, leading: 'Calc crew', memberships: 1, onClose: () => {}, onJoin: async () => null, onCreate: async () => null })));
  await act(async () => ui.root.findByType('Segmented').props.onChange('create'));
  assert.equal(submit().props.disabled, true, 'you lead one squad at a time');
  assert.ok(ui.root.findAllByType('Text').some(t => /You already lead Calc crew/.test(t.props.children)));
  await act(async () => ui.root.findByType('Segmented').props.onChange('join'));
  assert.equal(submit().props.disabled, false, 'joining someone else’s squad is still fine');
  await act(async () => ui.update(React.createElement(SquadJoinSheet, { visible: true, online: true, leading: null, memberships: 3, onClose: () => {}, onJoin: async () => null, onCreate: async () => null })));
  assert.equal(submit().props.disabled, true, 'three squads is the most for now');
  await act(async () => ui.unmount());
});

test('leaders rename, set a weekly goal and get a new code from the menu; the goal shows as a bar', async () => {
  const calls = []; let current = { ...squad(), goalMinutes: 60 };
  const state = () => ({ ready: true, squads: [current], refresh: async () => {}, leave: async () => null, remove: async () => null,
    update: async (id, change) => { calls.push(change); return null; } });
  const Page = squadPage(state); let ui;
  await act(async () => { ui = create(React.createElement(Page)); });
  assert.ok(words(ui.root).includes('of 1h goal')); assert.ok(words(ui.root).some(t => /^20m to go · \d+ days? left$/.test(t)));
  const byText = label => ui.root.findAllByType('Press').find(x => x.findAllByType('Text').some(t => t.props.children === label));
  await act(async () => pressLabel(ui.root, 'Squad options').props.onPress());
  await act(async () => pressLabel(ui.root, 'Edit name and goal').props.onPress());
  assert.equal(ui.root.findByType('Sheet').props.label, 'edit squad');
  await act(async () => ui.root.findByType('Input').props.onChangeText('  Calc crew 2 '));
  await act(async () => pressLabel(ui.root, '10 hours a week').props.onPress());
  await act(async () => byText('Save').props.onPress());
  assert.deepEqual(calls[0], { name: 'Calc crew 2', goalMinutes: 600 });
  assert.equal(ui.root.findAllByType('Sheet').length, 0, 'a saved edit closes the sheet');
  await act(async () => pressLabel(ui.root, 'Squad options').props.onPress());
  await act(async () => pressLabel(ui.root, 'New invite code').props.onPress());
  assert.equal(ui.root.findByType('Confirm').props.title, 'Get a new invite code?');
  await act(async () => ui.root.findByType('Confirm').props.onConfirm());
  assert.equal(calls[1], 'code');
  current = { ...squad(), goalMinutes: null };
  await act(async () => ui.update(React.createElement(Page)));
  await act(async () => byText('Set a weekly goal').props.onPress());
  assert.ok(pressLabel(ui.root, '10 hours a week'), 'a leader without a goal is one tap from setting one');
  current = { ...squad(), ownerIsYou: false, goalMinutes: null };
  await act(async () => ui.update(React.createElement(Page)));
  assert.equal(byText('Set a weekly goal'), undefined, 'members cannot set the goal');
  assert.ok(words(ui.root).some(t => /^Resets on Monday · \d+ days? left$/.test(t)));
  await act(async () => ui.unmount());
});

test('the Squads tab lists My Squads, each opening its own page, and an empty tab invites you to start one', async () => {
  const nav = []; let current = [];
  const Tab = load('src/app/(tabs)/squads.tsx', {
    'react-native': rn, '@expo/vector-icons': { Ionicons: host('Icon') }, '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), BottomSheetTextInput: host('Input'), TouchableOpacity: host('Press') },
    'expo-router': { useFocusEffect: () => {}, useRouter: () => ({ push: to => nav.push(to) }) }, '/useTabDockInset': { useTabDockInset: () => 100 },
    '/PersonalUI': { PersonalPage: ({ title, action, children }) => React.createElement('Page', { title }, action, children) }, '/ContentReveal': props => props.children,
    '/MotionPressable': host('Press'), '/AppText': { Text: host('Text') }, '/SquadsSection': { SquadSummary: host('Summary') },
    '/SquadSheets': { SquadJoinSheet: host('JoinSheet') },
    '/useSquads': { useSquads: () => ({ ready: true, online: true, squads: current, refresh: async () => {}, join: async () => null, create: async () => null }) },
  }).default;
  let ui; await act(async () => { ui = create(React.createElement(Tab)); });
  assert.equal(ui.root.findByType('Page').props.title, 'Squads');
  assert.ok(ui.root.findAll(n => n.props.testID === 'squads-empty').length > 0);
  await act(async () => ui.root.findAllByType('Press').filter(x => x.props.accessibilityLabel === 'Join or start a squad').at(-1).props.onPress());
  assert.equal(ui.root.findByType('JoinSheet').props.visible, true);
  await act(async () => ui.root.findByType('JoinSheet').props.onClose());
  current = [squad(), { ...squad(2), ownerIsYou: false, name: 'Library' }];
  await act(async () => ui.update(React.createElement(Tab)));
  assert.equal(ui.root.findAllByType('Summary').length, 2);
  assert.equal(ui.root.findByType('JoinSheet').props.leading, 'Calc crew'); assert.equal(ui.root.findByType('JoinSheet').props.memberships, 2);
  await act(async () => ui.root.findAllByType('Press').filter(x => typeof x.props.accessibilityLabel === 'string' && x.props.accessibilityLabel.startsWith('Library,'))[0].props.onPress());
  assert.deepEqual(nav, [{ pathname: '/squad/[id]', params: { id: squad(2).id } }]);
  await act(async () => ui.unmount());
});
