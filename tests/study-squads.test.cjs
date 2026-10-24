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
  // Nobody wins by joining first: 0 minutes is unranked, and equal time shares a place.
  const mixed = squad(1, [member(3, 0), member(1, 0, { name: 'Zed' }), member(2, 600), member(4, 600), member(5, 900)]);
  assert.deepEqual(utils.standings(mixed).map(x => [x.member.name, x.place]),
    [['User 5', 1], ['User 2', 2], ['User 4', 2], ['User 3', null], ['Zed', null]]);
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
  '/SheetHeader': host('Header'), '/SheetConfirmation': host('Confirm'), '/Segmented': props => React.createElement('Segmented', props), '/CharacterPortrait': host('Portrait'), '/CharacterMark': host('Mark'), '/ProgressRing': host('Ring'), '/ProfilePicture': host('Picture'), '/Adventurer': host('Character'), '/useRewards': { useRewards: () => ({ look: { skin: '2', hair: 'short', hairColor: 'darkbrown', glasses: false }, equipped: { pet: 'pet_owl' }, background: 'bg_forest' }) }, 'react-native-svg': { __esModule: true, default: host('Svg'), Defs: host('Defs'), LinearGradient: host('LG'), Rect: host('Rect'), Stop: host('Stop') }, '/ItemArt': host('ItemArt'),
  '/usePlayer': { usePlayerCard: () => ({ card: null, loading: false, failed: false, online: false }) },
});
const pressLabel = (root, label) => root.findAllByType('Press').find(x => x.props.accessibilityLabel === label);

// The Squads tab lists one card per squad; a card opens the squad page, which rises from the bottom.
const mocks = (state, extra = {}) => ({
  'react-native': { ...rn, ScrollView: host('HScroll') }, '@expo/vector-icons': { Ionicons: host('Icon') },
  '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), BottomSheetTextInput: host('Input'), TouchableOpacity: host('Press') },
  'expo-router': { useFocusEffect: () => {} }, '/useTabDockInset': { useTabDockInset: () => 100 },
  '/PersonalUI': { PersonalPage: ({ title, action, children }) => React.createElement('Page', { title }, action, children) }, '/ContentReveal': props => props.children,
  '/SlideUpPage': ({ title, action, footer, gone, children }) => React.createElement('Page', { title, gone }, action, children, footer),
  '/MotionPressable': host('Press'), '/SheetTouchable': host('Press'), '/AppText': { Text: host('Text') }, '/SheetConfirmation': host('Confirm'),
  // The ••• menu's options are its contract; its popover has its own looks.
  '/MoreMenu': props => React.createElement('Menu', props),
  '/AppSheet': props => props.visible ? React.createElement('Sheet', props, props.header, props.children) : null,
  '/SheetHeader': host('Header'), '/Segmented': host('Segmented'), '/CharacterPortrait': host('Portrait'), '/CharacterMark': host('Mark'), '/ProgressRing': host('Ring'), '/ProfilePicture': host('Picture'), '/Adventurer': host('Character'), '/useRewards': { useRewards: () => ({ look: { skin: '2', hair: 'short', hairColor: 'darkbrown', glasses: false }, equipped: { pet: 'pet_owl' }, background: 'bg_forest' }) }, 'react-native-svg': { __esModule: true, default: host('Svg'), Defs: host('Defs'), LinearGradient: host('LG'), Rect: host('Rect'), Stop: host('Stop') }, '/ItemArt': host('ItemArt'),
  '/usePlayer': { usePlayerCard: () => ({ card: null, loading: false, failed: false, online: false }) },
  '/useSquads': { useSquads: () => state() }, ...extra,
});
const squadsTab = (state, navigate = () => {}, choose = () => {}) => load('src/app/(tabs)/squads.tsx', mocks(state, { 'expo-router': { useFocusEffect: () => {}, useRouter: () => ({ navigate }) },
  '/squadSelection': { squadSelection: { get: () => null, choose } } })).default;
const squadsPage = state => load('src/app/squad.tsx', mocks(state)).default;
const menu = root => root.findAllByType('Menu')[0]?.props.options ?? [];
const choose = (root, label) => act(async () => menu(root).find(option => option.label === label).onPress());
const words = root => root.findAllByType('Text').map(t => [].concat(t.props.children).filter(x => typeof x === 'string' || typeof x === 'number').join(''));

test('the squad page shows the whole squad: it ranks members, shares the code and asks before leaving or removing', async () => {
  const calls = []; let current = [squad()];
  const state = () => ({ ready: true, online: true, squads: current, refresh: async () => {}, update: async () => null, join: async () => null, create: async () => null,
    leave: async id => { calls.push(['leave', id]); return null; }, remove: async (id, m) => { calls.push(['remove', m]); return null; } });
  const base = state; const withUpdate = () => ({ ...base(), update: async (id, change) => { calls.push(['update', change]); return null; } });
  const Tab = squadsPage(withUpdate); let ui;
  await act(async () => { ui = create(React.createElement(Tab)); });
  assert.equal(ui.root.findByType('Page').props.title, 'My Squad');
  assert.ok(ui.root.findAll(n => n.props.testID === 'squad-board').length > 0, 'the squad itself, not a shortcut to it');
  assert.ok(words(ui.root).includes('Calc crew')); assert.ok(words(ui.root).includes('2 members · you lead this squad · 1 focusing now'));
  assert.ok(ui.root.findAll(n => n.props.testID === 'squad-leaderboard').length > 0, 'one table, however many members');
  await act(async () => pressLabel(ui.root, 'Invite friends').props.onPress());
  assert.match(rn.shared.message, /K7Q4PX/);
  const first = pressLabel(ui.root, '1. User 2, 30m this week, level 2, focusing now');
  assert.equal(first.props.onLongPress, undefined, 'no hidden hold-to-remove');
  await act(async () => first.props.onPress());
  const sheet = () => ui.root.findAllByType('Sheet').find(x => x.props.label === 'player card');
  assert.ok(sheet(), 'a tap opens their player card');
  await act(async () => pressLabel(ui.root, 'Remove User 2').props.onPress());
  assert.equal(calls.length, 0, 'removing asks first');
  await act(async () => ui.root.findByType('Confirm').props.onConfirm());
  assert.deepEqual(calls, [['remove', member(2).id]]);
  // Removing and changing the code, for a code that reached the wrong person.
  await act(async () => pressLabel(ui.root, '1. User 2, 30m this week, level 2, focusing now').props.onPress());
  await act(async () => pressLabel(ui.root, 'Remove User 2 and get a new code').props.onPress());
  assert.match(ui.root.findByType('Confirm').props.message, /old code stops working/);
  await act(async () => ui.root.findByType('Confirm').props.onConfirm());
  assert.deepEqual(calls.slice(1), [['remove', member(2).id], ['update', 'code']]);
  calls.splice(1);
  assert.deepEqual(menu(ui.root).map(option => option.label), ['Edit name and goal', 'New invite code', 'Share invite', 'Join or start a squad', 'Leave squad']);
  await choose(ui.root, 'Leave squad');
  assert.equal(ui.root.findByType('Confirm').props.message, utils.leaveOutcome(squad()), 'leaving says what happens to the squad');
  assert.match(ui.root.findByType('Confirm').props.message, /longest becomes the leader/);
  await act(async () => ui.root.findByType('Confirm').props.onConfirm());
  assert.deepEqual(calls.slice(1), [['leave', squad().id]]);
  current = [{ ...squad(), ownerIsYou: false }];
  await act(async () => ui.update(React.createElement(Tab)));
  assert.deepEqual(menu(ui.root).map(option => option.label), ['Share invite', 'Join or start a squad', 'Leave squad'], 'members only share, join another or leave');
  await act(async () => pressLabel(ui.root, '1. User 2, 30m this week, level 2, focusing now').props.onPress());
  assert.equal(pressLabel(ui.root, 'Remove User 2'), undefined, 'members cannot remove anyone');
  assert.match(utils.leaveOutcome(squad(1, [member(1, 0)])), /squad closes and its invite code stops working/, 'the last member is told the squad ends');
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
  const state = () => ({ ready: true, online: true, squads: [current], refresh: async () => {}, leave: async () => null, remove: async () => null, join: async () => null, create: async () => null,
    update: async (id, change) => { calls.push(change); return null; } });
  const Tab = squadsPage(state); let ui;
  await act(async () => { ui = create(React.createElement(Tab)); });
  assert.ok(words(ui.root).includes('of 1h goal')); assert.ok(words(ui.root).some(t => /^20m to go · \d+ days? left$/.test(t)));
  const byText = label => ui.root.findAllByType('Press').find(x => x.findAllByType('Text').some(t => t.props.children === label));
  await choose(ui.root, 'Edit name and goal');
  assert.equal(ui.root.findByType('Sheet').props.label, 'edit squad');
  await act(async () => ui.root.findByType('Input').props.onChangeText('  Calc crew 2 '));
  await act(async () => pressLabel(ui.root, '10 hours a week').props.onPress());
  await act(async () => byText('Save').props.onPress());
  assert.deepEqual(calls[0], { name: 'Calc crew 2', goalMinutes: 600 });
  assert.equal(ui.root.findAllByType('Sheet').length, 0, 'a saved edit closes the sheet');
  await choose(ui.root, 'New invite code');
  assert.equal(ui.root.findByType('Confirm').props.title, 'Get a new invite code?');
  await act(async () => ui.root.findByType('Confirm').props.onConfirm());
  assert.equal(calls[1], 'code');
  current = { ...squad(), goalMinutes: null };
  await act(async () => ui.update(React.createElement(Tab)));
  await act(async () => byText('Set a weekly goal').props.onPress());
  assert.ok(pressLabel(ui.root, '10 hours a week'), 'a leader without a goal is one tap from setting one');
  current = { ...squad(), ownerIsYou: false, goalMinutes: null };
  await act(async () => ui.update(React.createElement(Tab)));
  assert.equal(byText('Set a weekly goal'), undefined, 'members cannot set the goal');
  assert.ok(words(ui.root).some(t => /^Resets on Monday · \d+ days? left$/.test(t)));
  await act(async () => ui.unmount());
});
test('the Squads tab shows a card for every squad; a card opens that squad, and an empty tab invites you to start one', async () => {
  let current = []; const opened = [], chosen = [];
  const state = () => ({ ready: true, online: true, squads: current, refresh: async () => {}, join: async () => null, create: async () => null, update: async () => null, leave: async () => null, remove: async () => null });
  const Tab = squadsTab(state, to => opened.push(to), id => chosen.push(id)); let ui;
  await act(async () => { ui = create(React.createElement(Tab)); });
  assert.ok(ui.root.findAll(n => n.props.testID === 'squads-empty').length > 0);
  await act(async () => ui.root.findAllByType('Press').filter(x => x.props.accessibilityLabel === 'Join or start a squad').at(-1).props.onPress());
  assert.equal(ui.root.findAllByType('Sheet').some(x => x.props.label === 'join squad'), true);
  current = [squad(), { ...squad(2), ownerIsYou: false, name: 'Library' }];
  await act(async () => ui.update(React.createElement(Tab)));
  const cards = ui.root.findAll(n => n.props.testID === 'squad-card' && n.type === 'Press');
  assert.equal(cards.length, 2, 'one card per squad, never a switcher');
  assert.ok(words(ui.root).includes('Calc crew') && words(ui.root).includes('Library'));
  assert.ok(ui.root.findAll(n => n.props.accessibilityRole === 'tab').length === 0);
  await act(async () => cards[1].props.onPress());
  assert.deepEqual(opened, ['/squad']);
  assert.deepEqual(chosen, [squad(2).id], 'the page opens on the squad you tapped');
  await act(async () => ui.unmount());
});

test('cloud-only squad sheet portals close offline and do not reopen after reconnect', async () => {
  for (const [action, label] of [['Edit name and goal', 'edit squad'], ['Join or start a squad', 'join squad']]) {
    let online = true; const calls = [];
    const state = () => ({ ready: true, online, squads: [squad()], refresh: async () => {},
      update: async (...args) => { calls.push(['update', ...args]); return null; },
      join: async (...args) => { calls.push(['join', ...args]); return null; },
      create: async (...args) => { calls.push(['create', ...args]); return null; },
      leave: async () => null, remove: async () => null });
    const Tab = squadsPage(state); let ui;
    await act(async () => { ui = create(React.createElement(Tab)); });
    try {
      assert.equal(ui.root.findAllByType('Menu').length, 1, 'the normal online squad menu is present');
      const delayedAction = menu(ui.root).find(option => option.label === action).onPress;
      await choose(ui.root, action);
      assert.equal(ui.root.findByType('Sheet').props.label, label);
      online = false;
      await act(async () => ui.update(React.createElement(Tab)));
      assert.equal(ui.root.findAllByType('Sheet').length, 0, `${label} cannot cover the offline workspace`);
      assert.equal(ui.root.findAllByType('Menu').length, 0, 'the native menu portal unmounts with the cloud-only action');
      await act(async () => delayedAction());
      assert.equal(ui.root.findAllByType('Sheet').length, 0, 'an outgoing menu callback cannot open a cloud editor offline');
      assert.deepEqual(calls, [], 'dismissing a portal does not submit any squad change');
      online = true;
      await act(async () => ui.update(React.createElement(Tab)));
      assert.equal(ui.root.findAllByType('Sheet').length, 0, 'reconnection must not replay a closed sheet');
      assert.equal(ui.root.findAllByType('Menu').length, 1, 'a fresh menu returns with the online squad page');
      await act(async () => delayedAction());
      assert.equal(ui.root.findAllByType('Sheet').length, 0, 'an old online menu callback stays fenced after reconnect');
      await choose(ui.root, action);
      assert.equal(ui.root.findByType('Sheet').props.label, label, 'the normal online editor can still be opened');
      assert.deepEqual(calls, []);
    } finally { await act(async () => ui.unmount()); }
  }
});

test('the squad page stays on the squad it opened with, and slides away once you are no longer in it', async () => {
  let current = [squad(), { ...squad(2), ownerIsYou: false, name: 'Library' }];
  const state = () => ({ ready: true, online: true, squads: current, refresh: async () => {}, join: async () => null, create: async () => null, update: async () => null, leave: async () => null, remove: async () => null });
  const Page = squadsPage(state); let ui;
  await act(async () => { ui = create(React.createElement(Page)); });
  assert.ok(words(ui.root).includes('Calc crew')); assert.equal(ui.root.findByType('Page').props.gone, false);
  current = [{ ...squad(2), ownerIsYou: false, name: 'Library' }];
  await act(async () => ui.update(React.createElement(Page)));
  assert.equal(ui.root.findByType('Page').props.gone, true, 'never swaps in another squad');
  assert.ok(!words(ui.root).includes('Library'));
  await act(async () => ui.unmount());
});

test('in one squad, the Squads tab is that squad in full, with its menu and a way to join another', async () => {
  let current = [squad()];
  const state = () => ({ ready: true, online: true, squads: current, refresh: async () => {}, join: async () => null, create: async () => null, update: async () => null, leave: async () => null, remove: async () => null });
  const Tab = squadsTab(state); let ui;
  await act(async () => { ui = create(React.createElement(Tab)); });
  try {
    assert.ok(ui.root.findAll(n => n.props.testID === 'squads-single').length > 0);
    assert.equal(ui.root.findAll(n => n.props.testID === 'squad-card' && n.type === 'Press').length, 0, 'no list for a single squad');
    assert.equal(ui.root.findByType('Page').props.title, 'Squads', 'titled like the tab; the squad’s own name is on the board');
    assert.ok(ui.root.findAll(n => n.props.testID === 'squad-board').length > 0, 'the leaderboard and invite are right here');
    assert.ok(menu(ui.root).some(option => option.label === 'Leave squad'), 'the same options as the squad page');
    await act(async () => pressLabel(ui.root, 'Join or start another squad').props.onPress());
    assert.equal(ui.root.findAllByType('Sheet').some(x => x.props.label === 'join squad'), true);
    current = [squad(), { ...squad(2), ownerIsYou: false, name: 'Library' }];
    await act(async () => ui.update(React.createElement(Tab)));
    assert.equal(ui.root.findAll(n => n.props.testID === 'squad-card' && n.type === 'Press').length, 2, 'two or more go back to cards');
  } finally { await act(async () => ui.unmount()); }
});

test('Create follows the account limits from the server: one led squad by default, more for an account allowed more', async () => {
  const { SquadJoinSheet } = sheets(); let ui;
  const render = props => React.createElement(SquadJoinSheet, { visible: true, online: true, onClose() {}, onJoin: async () => null, onCreate: async () => null, ...props });
  await act(async () => { ui = create(render({ leading: 'Calc crew', leadCount: 1, memberships: 1 })); });
  const submit = () => ui.root.findAllByType('Press').at(-1);
  const choose = async mode => act(async () => ui.root.findByType('Segmented').props.onChange(mode));
  try {
    await choose('create');
    assert.equal(submit().props.disabled, true, 'the default: one squad to lead');
    assert.ok(words(ui.root).some(t => /You already lead Calc crew/.test(t)));
    await act(async () => ui.update(render({ leading: 'Calc crew', leadCount: 1, memberships: 1, limits: { lead: 10, member: 10 } })));
    await choose('create');
    assert.equal(submit().props.disabled, false, 'a higher limit lets you start another');
    assert.ok(words(ui.root).some(t => /lead up to 10 squads and be in up to 10/.test(t)));
    await act(async () => ui.update(render({ leading: 'Calc crew', leadCount: 10, memberships: 10, limits: { lead: 10, member: 10 } })));
    assert.equal(submit().props.disabled, true, 'still a limit, just a higher one');
  } finally { await act(async () => ui.unmount()); }
});

// Round 57: everyone's own picture, and a player card that respects "Share my stats".
test('squad faces are everyone\'s real picture, and the player card has the same layout before and after it loads', async () => {
  const svgMock = { __esModule: true, default: host('Svg'), Defs: host('Defs'), LinearGradient: host('LG'), Rect: host('Rect'), Stop: host('Stop') };
  let reply = { card: null, loading: true, failed: false };
  const ui = load('src/components/SquadSheets.tsx', {
    'react-native': rn, '@expo/vector-icons': { Ionicons: host('Icon') }, '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), BottomSheetTextInput: host('Input'), TouchableOpacity: host('Press') },
    '/AppText': { Text: host('Text') }, '/AppSheet': props => props.visible ? React.createElement('Sheet', props, props.header, props.children) : null,
    '/SheetHeader': host('Header'), '/SheetConfirmation': host('Confirm'), '/Segmented': host('Segmented'), '/CharacterMark': host('Mark'), '/ProfilePicture': host('Picture'), '/Adventurer': host('Character'), '/useRewards': { useRewards: () => ({ look: { skin: '2', hair: 'short', hairColor: 'darkbrown', glasses: false }, equipped: { pet: 'pet_owl' }, background: 'bg_forest' }) },
    'react-native-svg': svgMock, '/ItemArt': host('ItemArt'),
    '/usePlayer': { usePlayerCard: id => ({ ...reply, asked: id }) },
  });
  const look = { look: { skin: '6', hair: 'bun', hairColor: 'black', glasses: true }, equipped: { top: 'cardigan' }, background: 'bg_night', frame: 'frame_streak_30', title: 'title_artist' };
  const friend = { ...member(2, 9300), look, streak: 31, focusingNow: true };
  let r; await act(async () => { r = create(React.createElement(ui.SquadFace, { member: friend, size: 36 })); });
  const pic = r.root.findByType('Picture').props;
  assert.deepEqual([pic.look.skin, pic.equipped.top, pic.background, pic.frame, pic.level, pic.streak], ['6', 'cardigan', 'bg_night', 'frame_streak_30', 2, 31]);
  await act(async () => r.update(React.createElement(ui.SquadFace, { member: { ...member(3), look: null }, size: 36 })));
  assert.equal(r.root.findByType('Picture').props.look.skin, '3', 'no saved look yet: the starting character');
  await act(async () => r.update(React.createElement(ui.SquadFace, { member: { ...member(1), isYou: true }, size: 36 })));
  assert.equal(r.root.findAllByType('Mark').length, 1, 'you, from your own saved look');
  const card = props => React.createElement(ui.SquadMemberSheet, { member: friend, place: 2, leader: false, busy: false, onClose() {}, onRemove() {}, ...props });
  const words2 = () => r.root.findAllByType('Text').map(t => [].concat(t.props.children).join('')).join(' | ');
  await act(async () => r.update(card()));
  assert.ok(r.root.findAll(n => n.props.testID === 'player-card').length > 0);
  const whole = r.root.findByType('Character').props;
  assert.deepEqual([whole.look.skin, whole.equipped.top, whole.lanternLevel], ['6', 'cardigan', 2], 'the card shows their whole character, as they dressed it');
  assert.equal(r.root.findAllByType('Picture').length, 0, 'the whole character, not the round picture');
  assert.match(words2(), /The Artist/); assert.match(words2(), /Level 2 · First steps/); assert.match(words2(), /Focusing now/);
  assert.match(words2(), /#2 \| on the board/); assert.match(words2(), /2h 35m \| focused/);
  reply = { card: { id: friend.id, isYou: false, name: 'User 2', level: 12, look, statsShared: true, stats: { streak: 31, totalSeconds: 36000, sessions: 1, collected: 7, since: '2026-09-02T10:00:00Z',
    longestSeconds: 5400, daysFocused: 9, last7: [0, 0, 3600, 0, 0, 1800, 2400], pets: ['pet_owl'], badges: ['title_artist'] } }, loading: false, failed: false };
  await act(async () => r.update(card()));
  assert.match(words2(), /All time/); assert.match(words2(), /10h 00m \| focused/); assert.match(words2(), /1 \| session/); assert.match(words2(), /1h 30m \| longest session/);
  assert.match(words2(), /9 \| days focused/); assert.match(words2(), /7 finds/); assert.match(words2(), /Focusing since/);
  assert.equal(r.root.findAllByType('ItemArt')[0].props.id, 'pet_owl');
  assert.match(words2(), /Level 12 · Rhythm/, 'the freshest level from the card');
  // The sheet keeps the same blocks before and after loading, so it never jumps or stutters.
  const blocks = tree => tree.root.findAll(n => n.type === 'View' && n.props.style && [].concat(n.props.style).some(st => st && (st.minHeight === 86 || st.minHeight === 104))).length;
  assert.equal(blocks(r), 8, 'three this-week tiles, four all-time tiles and the collection');
  reply = { card: null, loading: true, failed: false };
  await act(async () => r.update(card({ member: { ...friend, id: 'eeeeeeee-eeee-4eee-8eee-000000000099' } })));
  assert.equal(blocks(r), 8, 'the same blocks while loading');
  await act(async () => r.unmount());
  const settings = fs.readFileSync(require('path').join(__dirname, '..', 'src/app/settings.tsx'), 'utf8');
  assert.doesNotMatch(settings, /Share my stats|useStatsVisibility/, 'no stats setting: stats are part of being in a squad');
});
