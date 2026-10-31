/* global __dirname */
// Round 87: everything dark, Today fits one screen with Later today scrolling
// inside it, a started session locks you on a minimal page until you end it,
// the camp scene and its day-to-night walk are gone, and the When control in
// routine setup splits evenly.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(require, module, module.exports);
  return module.exports;
}
const lum = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('the app is dark: deep aubergine page, light text, lilac buttons, light status bar icons', () => {
  const { colors, guideColors } = load('src/constants/theme.ts');
  assert.ok(lum(colors.background) < 0.02, 'a deep page, not paper');
  for (const surface of ['background', 'surface', 'surfaceRaised', 'sheetCard', 'focusSurface'])
    assert.ok(contrast(colors.text, colors[surface]) >= 7, `text on ${surface}`);
  assert.ok(contrast(colors.primaryText, colors.primary) >= 7, 'dark words on the lilac button');
  assert.ok(contrast(colors.primary, colors.background) >= 3, 'the button stands out from the page');
  assert.ok(contrast(colors.text, colors.warmSurface) >= 4.5, 'the break arch stays readable');
  assert.ok(contrast(guideColors.text, guideColors.surface) >= 7, 'guide words on the lilac guide card');
  assert.ok(contrast(guideColors.actionText, guideColors.action) >= 7, 'guide button words');
  assert.match(read('src/app/_layout.tsx'), /<StatusBar barStyle="light-content" \/>/);
  assert.match(read('app.json'), /"userInterfaceStyle": "dark"/, 'the system parts were already dark: no native change');
});

test('Today fits the screen: the page stays still and Later today scrolls inside its card', () => {
  const home = read('src/app/(tabs)/index.tsx');
  assert.match(home, /const fitted = viewportHeight >= 600 && fontScale <= 1\.3;/, 'a short screen or very large text still scrolls, so nothing is cut off');
  assert.match(home, /scrollEnabled=\{!fitted\} overScrollMode="never" bounces=\{false\}/);
  assert.match(home, /fitted && \{ height: viewportHeight \}/);
  assert.match(home, /<TourAnchor id="home-quests" style=\{fitted && styles\.fill\}><SavedRoutinesCard layout="today" fitted=\{fitted\}/);
  const card = read('src/components/SavedRoutinesCard.tsx');
  assert.match(card, /<ScrollView style=\{fitted \? s\.todayScroll : undefined\} scrollEnabled=\{fitted\} nestedScrollEnabled/);
  assert.match(card, /todayScroll: \{ flex: 1, minHeight: 136 \}/, 'at least two rows stay visible');
});

test('an open session is locked: no header way out, no swipe, and Back asks to end it', () => {
  const screen = read('src/components/SessionScreen.tsx');
  assert.match(screen, /const lockedIn = timer\.hasOpenSession && !timer\.restoreError && !timer\.isCompleted && phase !== "ended";/, 'a session that cannot be restored can still be left');
  assert.match(screen, /onBack=\{lockedIn \? undefined : \(\) => minimise\("header"\)\}/);
  assert.match(screen, /return !lockedInRef\.current && !picker/);
  assert.match(screen, /if \(lockedInRef\.current\) \{ if \(!focusActions\.current\.dismissLayer\(\)\) focusActions\.current\.askToEnd\(\); return true; \}/);
  assert.match(screen, /if \(lockedIn\) \{ if \(!dismissLayer\(\)\) setConfirmEnd\(true\); return; \}/, 'a navigation back asks too');
});

test('the locked page is just the timer and two small buttons', () => {
  const screen = read('src/components/SessionScreen.tsx');
  for (const gone of ['Just this, for a while.', 'One 5 min break is here if you need it.', 'Distracting apps set aside</Text>', 'FOCUS TIME REMAINING', 'Break time doesn’t count as focus'])
    assert.ok(!screen.includes(gone), `${gone} is gone`);
  assert.match(screen, /styles\.roundRow/);
  assert.match(screen, /checkingStart \? "Checking start" : breakActive \? "Focus" : timer\.protectedSession \? breakSpent \? "Break used" : "Break" : timer\.isRunning \? "Pause" : "Resume"/);
  assert.match(screen, /accessibilityLabel="End session"[\s\S]{0,200}onPress=\{\(\) => setConfirmEnd\(true\)\}/, 'End still asks first');
  assert.match(screen, /: "Focus"\) : suggestion\?\.title \?\? routineName \?\? "Focus"\)/, 'a calm title when a routine cannot load');
});

test('the camp scene and its day-to-night walk are gone; setting off is a short fade', () => {
  for (const file of ['src/components/session/SessionBackdrop.tsx', 'src/components/session/TrailScenes.tsx', 'src/utils/focusSceneLayout.ts', 'src/components/ArrivalBanner.tsx'])
    assert.equal(fs.existsSync(path.join(root, file)), false, `${file} removed`);
  const screen = read('src/components/SessionScreen.tsx');
  assert.match(screen, /const SETTLE_MS = 320;/);
  assert.match(screen, /const go = setTimeout\(finishIntro, reducedMotion \? 0 : SETTLE_MS\);\n {4}return \(\) => clearTimeout\(go\);/, 'a cancelled fade never starts the session');
  assert.doesNotMatch(read('src/components/CompletionDetails.tsx'), /CompletionHero|CompletionRows|ArrivalBanner/);
});

test('routine setup splits When evenly', () => {
  const editor = read('src/components/RoutineEditorSheet.tsx');
  assert.match(editor, /<View key=\{title\} style=\{s\.whenCell\}><TouchableOpacity/);
  assert.match(editor, /whenCell: \{ flex: 1 \},\n {2}whenOption: \{ alignSelf: "stretch"/);
});
