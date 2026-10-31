/* global __dirname */
// Round 84: the awhile look (paper, aubergine, lilac, Newsreader and Inter), Today as home with no tab bar,
// squads as a circle, quiet markers in Your rhythm, and light ink over the session's night scene.
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
const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('the palette keeps every reading colour at 4.5:1 on every surface it sits on', () => {
  const { colors, sceneInk } = load('src/constants/theme.ts');
  // Round 87: dark only (deep aubergine page, lilac buttons and the one lilac card).
  assert.equal(colors.background, '#1C1519'); assert.equal(colors.primary, '#D9C2E6'); assert.equal(colors.focusSurface, '#3B2D44');
  for (const surface of ['background', 'surface', 'surfaceRaised', 'sheetCard', 'focusSurface'])
    for (const ink of ['text', 'neutral', 'secondary', 'muted', 'accent', 'danger', 'progress', 'protection'])
      assert.ok(contrast(colors[ink], colors[surface]) >= 4.5, `${ink} on ${surface}: ${contrast(colors[ink], colors[surface]).toFixed(2)}`);
  assert.ok(contrast(colors.primaryText, colors.primary) >= 4.5, 'button text on the main button');
  // The session's night scene stays dark, so its ink is light.
  assert.ok(contrast(sceneInk.text, '#0B0F1A') >= 7);
});

test('every category and subject colour is readable on paper, and old saved colours land on the new ones', () => {
  const { lifeAreaColor } = load('src/utils/lifeAreaColor.ts');
  const { courseColor } = load('src/utils/studyPlan.ts');
  const { FOCUS_AREAS } = load('src/utils/focusAreas.ts');
  const used = new Set([...[0, 1, 2, 3, 4, 5].map(id => lifeAreaColor(id)), ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(courseColor), ...FOCUS_AREAS.map(area => area.color)]);
  for (const color of used) assert.ok(contrast(color, '#F6F2EC') >= 3.4, `${color} as a mark on paper`);
  assert.equal(lifeAreaColor(1, '#64D2FF'), '#2E6A9E', 'the bright dark-theme blue becomes the deep paper blue');
});

test('text picks the bundled Inter file for its weight, Newsreader for titles, and the phone font until they load', () => {
  let ready = false;
  const mocks = { 'react-native': { Platform: { OS: 'android' }, StyleSheet: { flatten: style => Object.assign({}, ...[].concat(style).filter(Boolean)) }, Text: host('Text'), TextInput: host('Input') },
    '../utils/fontState': { fontState: { ready: () => ready } } };
  const { fontFor, DISPLAY } = load('src/components/AppText.tsx', mocks);
  assert.deepEqual(fontFor(undefined, '700'), { fontFamily: undefined }, 'before the fonts load, the phone font keeps the weight');
  assert.deepEqual(fontFor(DISPLAY, '400'), { fontFamily: 'serif' });
  ready = true;
  assert.deepEqual(fontFor(undefined, undefined), { fontFamily: 'Inter_400Regular', fontWeight: 'normal' });
  assert.deepEqual(fontFor(undefined, '500'), { fontFamily: 'Inter_500Medium', fontWeight: 'normal' });
  assert.deepEqual(fontFor(undefined, '600'), { fontFamily: 'Inter_600SemiBold', fontWeight: 'normal' });
  assert.deepEqual(fontFor(undefined, 'bold'), { fontFamily: 'Inter_700Bold', fontWeight: 'normal' });
  assert.deepEqual(fontFor(undefined, '800'), { fontFamily: 'Inter_700Bold', fontWeight: 'normal' });
  assert.deepEqual(fontFor(DISPLAY, '400'), { fontFamily: 'Newsreader_400Regular', fontWeight: 'normal' });
  assert.deepEqual(fontFor(DISPLAY, '500'), { fontFamily: 'Newsreader_500Medium', fontWeight: 'normal' });
  assert.deepEqual(fontFor('monospace', '400'), { fontFamily: 'monospace' }, 'a family chosen on purpose is kept');
  const loader = read('src/services/appFonts.ts');
  for (const file of ['Newsreader_400Regular', 'Newsreader_500Medium', 'Inter_400Regular', 'Inter_500Medium', 'Inter_600SemiBold', 'Inter_700Bold']) {
    assert.match(loader, new RegExp(`assets/fonts/${file}\\.ttf`)); assert.ok(fs.existsSync(path.join(root, 'assets/fonts', `${file}.ttf`)));
  }
  assert.match(read('assets/fonts/LICENSES.txt'), /SIL Open Font License/);
});

test('the app waits behind the logo until the fonts are ready, and never longer than two seconds', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveFonts;
  const Intro = load('src/components/LaunchIntro.tsx', {
    'react-native': { View: host('View'), Text: host('Text'), StyleSheet: { create: s => s, absoluteFill: {}, hairlineWidth: 1, flatten: s => s }, Platform: { OS: 'android' },
      AccessibilityInfo: { isReduceMotionEnabled: async () => true }, Animated: { Value: class { setValue() {} }, View: host('Animated'), timing: () => ({ start() {}, stop() {} }) } },
    'expo-splash-screen': { preventAutoHideAsync: async () => {}, hideAsync: async () => {} },
    '../services/launchUpdate': { prepareLaunchUpdate: async () => false, loadLaunchUpdate: async () => {} },
    '../services/appFonts': { loadAppFonts: () => new Promise(resolve => { resolveFonts = resolve; }) },
  }).default;
  let tree;
  await act(async () => { tree = create(React.createElement(Intro, null, React.createElement('Home'))); });
  try {
    assert.equal(tree.root.findAllByType('Home').length, 0, 'screens wait, so text never switches font in front of you');
    await act(async () => { resolveFonts(true); });
    assert.equal(tree.root.findAllByType('Home').length, 1);
  } finally { await act(async () => tree.unmount()); }
  // A font load that never answers still lets the app in.
  const Slow = load('src/components/LaunchIntro.tsx', {
    'react-native': { View: host('View'), Text: host('Text'), StyleSheet: { create: s => s, absoluteFill: {}, hairlineWidth: 1, flatten: s => s }, Platform: { OS: 'android' },
      AccessibilityInfo: { isReduceMotionEnabled: async () => true }, Animated: { Value: class { setValue() {} }, View: host('Animated'), timing: () => ({ start() {}, stop() {} }) } },
    'expo-splash-screen': { preventAutoHideAsync: async () => {}, hideAsync: async () => {} },
    '../services/launchUpdate': { prepareLaunchUpdate: async () => false, loadLaunchUpdate: async () => {} },
    '../services/appFonts': { loadAppFonts: () => new Promise(() => {}) },
  }).default;
  await act(async () => { tree = create(React.createElement(Slow, null, React.createElement('Home'))); });
  try {
    assert.equal(tree.root.findAllByType('Home').length, 0);
    await act(async () => t.mock.timers.tick(2000));
    assert.equal(tree.root.findAllByType('Home').length, 1, 'the system font is used after two seconds rather than holding the app');
  } finally { await act(async () => tree.unmount()); }
});

test('there is no tab bar: the bottom dock only holds the way back into a session, and Today opens every page', () => {
  const dock = read('src/components/SessionTabBar.tsx');
  assert.doesNotMatch(dock, /<BottomTabBar/, 'no tab pill');
  assert.doesNotMatch(dock, /register\(`tab-/, 'the guide never points at tabs');
  assert.match(dock, /bannerVisible && <TouchableOpacity/, 'an open session can still be reopened from anywhere');
  const home = read('src/app/(tabs)/index.tsx');
  // Round 85 (mockup 01): Later today's "Your activities" link, the circle card
  // and "Your rhythm" beside the date replace the old list of places.
  assert.match(home, /onSeeAll=\{\(\) => router\.navigate\("\/routines"\)\}/);
  assert.match(home, /openProgress = \(\) => \{ if \(currentMenuView\.current === menuView\) router\.navigate\("\/progress"\); \}/);
  assert.match(home, /testID="home-open-rhythm"/);
  assert.match(home, /<HomeCircle \/>/);
  const sections = read('src/components/HomeSections.tsx');
  assert.match(sections, /testID=\{squad \? "home-circle" : "home-squad-empty"\}/);
  assert.match(sections, /export function HomeCircle\(\)[\s\S]*?router\.navigate\("\/squads"\)/);
  assert.match(read('src/app/(tabs)/routines.tsx'), /router\.navigate\("\/study"\)\} accessibilityRole="button" testID="activities-study"/, 'Study opens from Your activities');
  for (const page of ['src/app/(tabs)/routines.tsx', 'src/app/(tabs)/study.tsx', 'src/app/(tabs)/squads.tsx']) assert.match(read(page), /compact today /, `${page} links back to Today`);
  assert.match(read('src/app/(tabs)/progress.tsx'), /<AppHeader title=\{showHistory \? "History" : "Your rhythm\."\} onToday=/);
});

test('a page opened from Today shows a Today link above its title that goes back', async () => {
  const AppHeader = load('src/components/AppHeader.tsx', {
    'react-native': { View: host('View'), StyleSheet: { create: s => s } }, './MotionPressable': host('Press'), './AppText': { Text: host('Text') },
    '@expo/vector-icons': { Ionicons: host('Icon') },
  }).default;
  let went = 0, tree;
  await act(async () => { tree = create(React.createElement(AppHeader, { title: 'Squads', onToday: () => { went++; }, action: React.createElement('Action') })); });
  const link = tree.root.findByProps({ testID: 'header-today' });
  assert.equal(link.props.accessibilityLabel, 'Back to Today');
  assert.ok(tree.root.findAllByType('Text').some(t => t.props.children === 'Today'));
  assert.ok(tree.root.findAllByType('Text').some(t => t.props.children === 'Squads' && t.props.accessibilityRole === 'header'));
  assert.equal(tree.root.findAllByType('Action').length, 1, 'the page action stays on the right');
  await act(async () => link.props.onPress());
  assert.equal(went, 1);
});

test('squad members are a circle, never a ranking: focusing first, then by name, you last', () => {
  const { circleOrder } = load('src/utils/squads.ts');
  const m = (id, name, extra = {}) => ({ id, name, isYou: false, isOwner: false, avatar: '', level: 1, streak: 0, weekSeconds: 0, focusingNow: false, ...extra });
  const squad = { id: 's', name: 'S', code: 'C', ownerIsYou: false, goalMinutes: null,
    members: [m('1', 'Zed', { weekSeconds: 9000 }), m('2', 'amy', { focusingNow: true }), m('3', 'You', { isYou: true, focusingNow: true, weekSeconds: 99999 }), m('4', 'Bo', { weekSeconds: 60 }), m('5', 'Ana', { focusingNow: true })] };
  assert.deepEqual(circleOrder(squad).map(member => member.name), ['amy', 'Ana', 'Bo', 'Zed', 'You'], 'most time never puts anyone first');
  for (const file of ['src/components/SquadBoard.tsx', 'src/components/SquadsSection.tsx', 'src/components/HomeSections.tsx', 'src/components/SquadSheets.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /standings\(|yourPlace|MEDAL|Leaderboard|on the board|Lv \{/, `${file} has no ranking`);
  }
});

test('quiet markers note round numbers from your own history, plainly, with nothing to unlock', () => {
  const { quietMarkers } = load('src/utils/quietMarkers.ts');
  assert.deepEqual(quietMarkers([], 'Asia/Kuala_Lumpur'), [], 'nothing yet, nothing shown');
  const now = new Date('2026-10-30T10:00:00Z');
  const sessions = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, subject_id: 1, activity_type: 'other', duration_seconds: i === 0 ? 7800 : 3000, xp_earned: 0,
    completed_at: new Date(now.getTime() - i * 86400000).toISOString() }));
  sessions.push({ id: 'ended', subject_id: 1, activity_type: 'other', duration_seconds: 99999, xp_earned: 0, completed_at: now.toISOString(), status: 'abandoned' });
  const markers = quietMarkers(sessions, 'Asia/Kuala_Lumpur', now);
  assert.deepEqual(markers.map(marker => marker.text), [
    '25 hours focused in total', 'Showed up on 25 different days', '25 sessions finished', 'Longest run: 30 days in a row', 'Longest session: 2h 10m',
  ]);
  for (const marker of markers) assert.doesNotMatch(marker.text, /unlock|earned|badge|reward|XP|level|!/i);
});

test('Your rhythm lists the quiet markers under the streak', () => {
  const source = read('src/app/(tabs)/progress.tsx');
  assert.match(source, /quietMarkers\(history\.sessions, timeZone\)/);
  // Round 85: they sit on the week overview (mockup 08), under the streak card.
  assert.match(source, /markers=\{markers\} \/>/);
  const overview = read('src/components/RhythmOverview.tsx');
  assert.match(overview, />Along the way<\/Text>/);
  assert.match(overview, /testID="quiet-markers"/);
  assert.ok(overview.indexOf('-day streak') < overview.indexOf('Along the way'));
});

test('over the dark session scene the timer, header and words stay light', async () => {
  const { sceneInk } = load('src/constants/theme.ts');
  const Countdown = load('src/components/SessionCountdown.tsx', {
    'react-native': { View: host('View'), StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }) },
    './AppText': { Text: host('Text') },
  }).default;
  let tree;
  await act(async () => { tree = create(React.createElement(Countdown, { seconds: 1200, caption: 'of 30:00', onScene: true })); });
  const colour = node => Object.assign({}, ...[].concat(node.props.style).filter(Boolean)).color;
  const texts = tree.root.findAllByType('Text');
  assert.equal(colour(texts.find(t => t.props.children === '20:00')), sceneInk.text);
  assert.equal(colour(texts.find(t => t.props.children === 'of 30:00')), sceneInk.secondary);
  const screen = read('src/components/SessionScreen.tsx');
  // Round 85: the arch replaces the scene by default; whenever the scene shows, the ink stays light.
  // Round 87: the scene is gone and the whole app is dark, so the light ink is
  // the app's own text and the status bar icons are light everywhere.
  assert.doesNotMatch(screen, /SessionBackdrop|onScene=|pushStackEntry/);
  assert.match(read('src/app/_layout.tsx'), /<StatusBar barStyle="light-content" \/>/, 'light status bar icons on the dark app');
});

test('switches, spinners and pull-to-refresh use the app colours instead of the phone accent', () => {
  for (const file of ['src/components/SettingsList.tsx', 'src/components/RoutineEditorSheet.tsx', 'src/components/StudyExamSheet.tsx']) {
    const source = read(file);
    const switches = source.match(/<Switch[\s\S]*?\/>/g) ?? [];
    assert.ok(switches.length > 0);
    for (const item of switches) assert.match(item, /thumbColor=\{colors\.surfaceRaised\}/, `${file} sets its switch knob`);
  }
  assert.doesNotMatch(read('src/app/_layout.tsx'), /<ActivityIndicator \/>/);
  assert.match(read('src/app/(tabs)/progress.tsx'), /colors=\{\[colors\.accent\]\}/);
});
