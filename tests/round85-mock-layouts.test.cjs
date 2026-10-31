/* global __dirname */
// Round 85: every page follows the awhile mockups. Today (Up next, Later today),
// Your activities, routine setup, the Focus arch and Break, the finished card
// ("You made room."), Your rhythm (this week first, History for the charts) and
// the Circle (Here, together, with Join).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name), ext = ['', '.ts', '.tsx'].find(e => fs.existsSync(target + e) && fs.statSync(target + e).isFile());
    return load(path.relative(root, target + ext), mocks, cache);
  }, module, module.exports);
  return module.exports;
}
const rn = { View: host('View'), StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }) };
const words = node => typeof node === 'string' ? node : (node.children ?? []).map(words).join('');
const completion = () => load('src/components/CompletionDetails.tsx', {
  'react-native': rn, '@expo/vector-icons': { Ionicons: host('Icon') }, './AppText': { Text: host('Text') },
  './ProgressRing': host('Ring'), './ArrivalBanner': host('Banner'),
});

test('the finished card shows whole minutes, and keeps the seconds of a short session instead of rounding up', () => {
  const { focusedAmount } = completion();
  assert.deepEqual(focusedAmount(3000), { value: '50', unit: 'min focused' });
  assert.deepEqual(focusedAmount(45), { value: '45', unit: 'sec focused' });
  assert.deepEqual(focusedAmount(90), { value: '1', unit: 'min 30 sec focused' });
  assert.deepEqual(focusedAmount(25 * 60 + 20), { value: '25', unit: 'min focused' });
  assert.deepEqual(focusedAmount(Number.NaN), { value: '0', unit: 'sec focused' });
});

test('the warm card adds today against the goal only once the server has confirmed it', async () => {
  const { CompletionCard, CompletionTiles } = completion();
  let ui;
  await act(async () => { ui = create(React.createElement(CompletionCard, { seconds: 3000, label: 'Learning', line: 'Data Structures', todaySeconds: 5100, goalMinutes: 60 })); });
  assert.match(words(ui.toJSON()), /^LEARNING50min focusedData StructuresYour total today85 \/ 60 minYour daily goal is met\.$/);
  const bar = ui.root.findAll(n => n.props.accessibilityRole === 'progressbar')[0];
  assert.equal(bar.props.accessibilityValue.now, 3600, 'the bar stops at the goal while 85 minutes stays visible');
  await act(async () => ui.update(React.createElement(CompletionCard, { seconds: 1500, label: 'Learning', todaySeconds: 1800, goalMinutes: 60 })));
  assert.match(words(ui.toJSON()), /30 min more to reach your daily goal\./);
  await act(async () => ui.update(React.createElement(CompletionCard, { seconds: 1500, label: 'Learning', todaySeconds: 1800, goalMinutes: 60, loading: true })));
  assert.doesNotMatch(words(ui.toJSON()), /Your total today|goal is met/, 'nothing is claimed while the server confirms');
  assert.match(words(ui.toJSON()), /Adding this to your day…/);
  await act(async () => ui.update(React.createElement(CompletionCard, { seconds: 1500, label: 'Learning', todaySeconds: 1800, goalMinutes: 60, held: true })));
  assert.doesNotMatch(words(ui.toJSON()), /Your total today|Focus day recorded|Adding/, 'saved on this phone: the time only');
  await act(async () => ui.update(React.createElement(CompletionTiles, { streakDays: 12, weekSeconds: 13200, weekLabel: 'on this, past 7 days' })));
  assert.equal(words(ui.toJSON()), '12 daysfocus streak3h 40mon this, past 7 days', 'Round 86: hours and minutes, so the tile never wraps');
  await act(async () => ui.update(React.createElement(CompletionTiles, { weekLabel: 'x' })));
  assert.equal(ui.toJSON(), null, 'no tiles until a number is known');
  await act(async () => ui.unmount());
});

test('See your rhythm closes the card once, then opens Your rhythm; Back to today keeps the old Done', () => {
  const sheet = read('src/components/SessionResultSheet.tsx');
  assert.match(sheet, /if \(doneRequested\.current \|\| !onOpenRhythm\) return;\n {4}doneRequested\.current = true;\n {4}onOpenRhythm\(\);/);
  assert.match(sheet, /testID="session-result-done" accessibilityRole="button" accessibilityLabel="Back to today"/);
  const resultHost = read('src/components/SessionResultHost.tsx');
  assert.match(resultHost, /onOpenRhythm=\{\(\) => \{ done\(\); if \(closeRequested\.current\) router\?\.navigate\?\.\("\/progress"\); \}\}/, 'only a real close goes on to Your rhythm');
  assert.match(resultHost, /useResultExtras\(online \? auth\.user\?\.id : undefined, ending \|\| rejected \? undefined : summary\?\.sessionId \?\? undefined/, 'tiles only for a confirmed online result');
});

test('the result tiles read once per confirmed session, and a failed read just leaves them out', async () => {
  let streakCalls = 0, sessionCalls = 0, fail = false;
  const service = {
    getFocusStreakDetail: async () => { streakCalls++; if (fail) throw Error('offline'); return { current: 4, restDays: 0, rested: [] }; },
    getCompletedSessions: async () => { sessionCalls++; if (fail) throw Error('offline'); return [{ task_id: 7, duration_seconds: 600 }, { task_id: 8, duration_seconds: 900 }, { task_id: 7, duration_seconds: 300 }]; },
  };
  const source = read('src/hooks/useResultExtras.ts').replace('import("../services/progressService")', 'Promise.resolve(__service)').replace('import("../utils/progressAnalytics")', 'Promise.resolve({ DEFAULT_TIMEZONE: "Asia/Kuala_Lumpur" })');
  const module = { exports: {} };
  new Function('require', 'module', 'exports', '__service', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(require, module, module.exports, service);
  const { useResultExtras } = module.exports;
  let value, props = { owner: 'me', session: 's1', task: 7 };
  const Probe = () => { value = useResultExtras(props.owner, props.session, props.task, 'Asia/Kuala_Lumpur'); return null; };
  let ui; await act(async () => { ui = create(React.createElement(Probe)); });
  assert.deepEqual(value, { key: 'me:s1', streakDays: 4, weekSeconds: 900, onThis: true }, 'only time on this routine');
  await act(async () => ui.update(React.createElement(Probe)));
  assert.equal(streakCalls, 1, 'one read per session'); assert.equal(sessionCalls, 1);
  props = { owner: undefined, session: 's1', task: 7 };
  await act(async () => ui.update(React.createElement(Probe)));
  assert.equal(value, null, 'offline or signed out: no tiles'); assert.equal(streakCalls, 1);
  fail = true; props = { owner: 'me', session: 's2', task: null };
  await act(async () => ui.update(React.createElement(Probe)));
  assert.deepEqual(value, { key: 'me:s2', streakDays: undefined, weekSeconds: undefined, onThis: false });
  await act(async () => ui.unmount());
});

test('Today follows mockup 01: Up next, Later today, time for yourself, then your circle', () => {
  const home = read('src/app/(tabs)/index.tsx');
  const order = ['testID="home-settings"', 'testID="home-open-rhythm"', '<TourAnchor id="home-quests">', '<TourAnchor id="home-focus">', '<TourAnchor id="home-places">'].map(mark => home.indexOf(mark));
  assert.ok(order.every(i => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]), order.join(','));
  assert.match(home, /layout="today"/);
  const card = read('src/components/SavedRoutinesCard.tsx');
  assert.match(card, /testID="today-up-next"/); assert.match(card, /testID=\{nextEntry \? "today-start-next" : fallback!\.testID\}/);
  assert.match(card, /title="Something else" caption="Any activity, your time"/);
  assert.match(card, /if \(seenRequest !== newRequest\) \{/, 'the + New request is read during render, not by an effect');
  assert.doesNotMatch(card, /lastRequest/);
});

test('Your rhythm opens on this week; History holds the detailed charts and comes back to this week', () => {
  const page = read('src/app/(tabs)/progress.tsx');
  assert.match(page, /const overviewReady = !showHistory && mode === "week" && anchor === null;/);
  assert.match(page, /if \(showHistory\) \{ setMode\("week"\); setAnchor\(null\); setSelectedDayKey\(null\); setSessionScope\("day"\); \}/);
  assert.match(read('src/hooks/useProgressData.ts'), /restDays: streak\.restDays, rested: streak\.rested/, 'rest days come from the same streak read');
});

test('the Circle follows mockup 09 and Join only ever starts your own session', () => {
  const board = read('src/components/SquadBoard.tsx');
  assert.match(board, /const focusing = members\.filter\(member => member\.focusingNow && !member\.isYou\);/, 'you never get a Join card for yourself');
  assert.match(board, /accessibilityLabel=\{`Join \$\{member\.name\}\. Starts your own session`\}/);
  for (const page of ['src/app/(tabs)/squads.tsx', 'src/app/squad.tsx']) assert.match(read(page), /useJustFocus/);
  assert.match(board, /"Away for now"/);
});

test('no em dashes in the new copy', () => {
  for (const file of ['src/components/RhythmOverview.tsx', 'src/components/SquadBoard.tsx', 'src/components/CompletionDetails.tsx', 'src/components/SessionResultSheet.tsx', 'src/components/RoutineEditorSheet.tsx', 'src/app/(tabs)/routines.tsx', 'src/components/FeatureTour.tsx']) {
    const strings = read(file).match(/"[^"\n]*"|`[^`\n]*`/g) ?? [];
    assert.equal(strings.filter(s => s.includes('—')).length, 0, file);
  }
});
