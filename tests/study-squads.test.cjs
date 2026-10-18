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
  'react-native': rn, '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), BottomSheetTextInput: host('Input'), TouchableOpacity: host('Press') },
  '/AppText': { Text: host('Text') }, '/AppSheet': props => props.visible ? React.createElement('Sheet', props, props.header, props.children, props.overlay) : null,
  '/SheetHeader': host('Header'), '/SheetConfirmation': host('Confirm'), '/Segmented': props => React.createElement('Segmented', props), '/CharacterPortrait': host('Portrait'), '/ProgressRing': host('Ring'),
});
const pressLabel = (root, label) => root.findAllByType('Press').find(x => x.props.accessibilityLabel === label);

test('squad sheet ranks members, shares the code and asks before leaving or removing', async () => {
  const { SquadSheet } = sheets(); const calls = []; let ui;
  await act(async () => { ui = create(React.createElement(SquadSheet, { visible: true, squad: squad(), onClose: () => calls.push('close'),
    onLeave: async id => { calls.push(['leave', id]); return null; }, onRemove: async (id, m) => { calls.push(['remove', m]); return null; } })); });
  assert.equal(ui.root.findByType('Header').props.subtitle, '2 members · 1 focusing now');
  await act(async () => pressLabel(ui.root, 'Share invite').props.onPress());
  assert.match(rn.shared.message, /K7Q4PX/);
  await act(async () => pressLabel(ui.root, '1. User 2, 30m this week, level 2, focusing now').props.onPress());
  assert.equal(calls.length, 0, 'removing asks first');
  await act(async () => ui.root.findByType('Confirm').props.onConfirm());
  assert.deepEqual(calls, [['remove', member(2).id]]);
  await act(async () => ui.root.findAllByType('Press').find(x => x.findAllByType('Text').some(t => t.props.children === 'Leave squad')).props.onPress());
  await act(async () => ui.root.findByType('Confirm').props.onConfirm());
  assert.deepEqual(calls.slice(1), [['leave', squad().id], 'close']);
  await act(async () => ui.unmount());
});

test('join waits for a full code; create needs a clean name; errors stay in the sheet', async () => {
  const { SquadJoinSheet } = sheets(); const calls = []; let closed = 0, ui;
  await act(async () => { ui = create(React.createElement(SquadJoinSheet, { visible: true, online: true, onClose: () => closed++,
    onJoin: async code => { calls.push(['join', code]); return code === 'K7Q4PX' ? null : 'No squad has that code.'; }, onCreate: async name => { calls.push(['create', name]); return null; } })); });
  const submit = () => ui.root.findAllByType('Press').at(-1);
  const input = () => ui.root.findByType('Input');
  await act(async () => input().props.onChangeText('k7q'));
  assert.equal(submit().props.disabled, true);
  await act(async () => input().props.onChangeText('AAAAAA'));
  await act(async () => submit().props.onPress());
  assert.ok(ui.root.findAllByType('Text').some(t => t.props.children === 'No squad has that code.')); assert.equal(closed, 0);
  await act(async () => input().props.onChangeText('k7q4px'));
  await act(async () => submit().props.onPress());
  assert.deepEqual(calls.at(-1), ['join', 'K7Q4PX']); assert.equal(closed, 1);
  await act(async () => ui.root.findByType('Segmented').props.onChange('create'));
  await act(async () => input().props.onChangeText('  Calc crew  '));
  await act(async () => submit().props.onPress());
  assert.deepEqual(calls.at(-1), ['create', 'Calc crew']);
  await act(async () => ui.update(React.createElement(SquadJoinSheet, { visible: true, online: false, onClose: () => {}, onJoin: async () => null, onCreate: async () => null })));
  assert.equal(submit().props.disabled, true, 'offline cannot join or create');
  await act(async () => ui.unmount());
});

test('owners rename, set a weekly goal and get a new code; the goal shows as a ring', async () => {
  const { SquadSheet } = sheets(); const calls = []; let ui;
  const props = { visible: true, squad: { ...squad(), goalMinutes: 60 }, onClose: () => {}, onLeave: async () => null, onRemove: async () => null,
    onUpdate: async (id, change) => { calls.push(change); return null; } };
  await act(async () => { ui = create(React.createElement(SquadSheet, props)); });
  assert.equal(ui.root.findAllByType('Ring').length, 1);
  assert.ok(ui.root.findAllByType('Text').some(t => t.props.children === 'of a 1h squad goal'));
  const byText = label => ui.root.findAllByType('Press').find(x => x.findAllByType('Text').some(t => t.props.children === label));
  await act(async () => byText('Edit squad').props.onPress());
  await act(async () => ui.root.findByType('Input').props.onChangeText('  Calc crew 2 '));
  await act(async () => ui.root.findAllByType('Press').find(x => x.props.accessibilityLabel === '10 hours a week').props.onPress());
  await act(async () => byText('Save').props.onPress());
  assert.deepEqual(calls[0], { name: 'Calc crew 2', goalMinutes: 600 });
  await act(async () => byText('Edit squad').props.onPress());
  await act(async () => byText('New code').props.onPress());
  assert.equal(ui.root.findByType('Confirm').props.title, 'Get a new invite code?');
  await act(async () => ui.root.findByType('Confirm').props.onConfirm());
  assert.equal(calls[1], 'code');
  await act(async () => ui.update(React.createElement(SquadSheet, { ...props, squad: { ...squad(), ownerIsYou: false, goalMinutes: null } })));
  assert.equal(byText('Edit squad'), undefined, 'members cannot edit'); assert.equal(ui.root.findAllByType('Ring').length, 0);
  await act(async () => ui.unmount());
});
