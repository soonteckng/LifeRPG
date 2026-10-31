/* global __dirname */
// Round 86: no white gap at the bottom of any page (the old tab bar's height is
// no longer reserved), Up next leads back to an open session, Today's goal and
// streak in one card, the finished card in lilac, a smooth progress line in the
// arch, hours and minutes on the tiles, and plum initials instead of brown.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, mocks = {}) {
  const filename = path.resolve(root, file), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), name)) + (fs.existsSync(path.resolve(path.dirname(filename), name) + '.ts') ? '.ts' : '.tsx'), mocks) : require(name), module, module.exports);
  return module.exports;
}

test('an empty dock reserves only the safe area, so a page that fits does not scroll', () => {
  const { floatingTabInset } = load('src/utils/floatingTabInset.ts');
  for (const pill of [0, 49, 66]) assert.equal(floatingTabInset(pill, 24, {}), 34, 'the old tab pill height is ignored');
  assert.equal(floatingTabInset(49, 24, { hasOpenSession: true }), 94, 'the session banner still gets its room');
  // Pages that fit end 24 px above the safe area, not a tab bar's height above it.
  assert.match(read('src/app/(tabs)/index.tsx'), /paddingBottom: dockHeight \+ 24/);
  assert.match(read('src/components/PersonalUI.tsx'), /Math\.max\(48, insets\.bottom \+ 24, bottomContentInset \+ 24\)/);
});

test('with a session open, Up next is the way back to it, never a greyed-out button', () => {
  const card = read('src/components/SavedRoutinesCard.tsx');
  assert.match(card, /const returning = !!timer\.hasOpenSession && !!onAnyActivity;/);
  assert.match(card, /testID="today-back-to-session" onPress=\{\(\) => \{ feedback\(\); onAnyActivity!\(\); \}\} accessibilityRole="button" accessibilityLabel="Back to your session"/);
  assert.match(card, /timer\.isRunning \? "You’re in a session\." : "Your session is paused\."/);
  // useJustFocus only navigates back when a session is open; it never changes it.
  assert.match(read('src/hooks/useJustFocus.ts'), /if \(!blocked\) \{[\s\S]*?\}\n {4}timer\.reviewSummary\?\.\(\);[\s\S]*?router\.navigate\("\/session"\);/);
});

test('Today groups the goal, streak and menu in one card, and an empty list is a plain row', () => {
  assert.match(read('src/app/(tabs)/index.tsx'), /today: \{ gap: 10, borderRadius: 22, backgroundColor: colors\.surface,/);
  const card = read('src/components/SavedRoutinesCard.tsx');
  assert.match(card, />Nothing else planned today\.<\/Text>/);
  assert.match(card, /accessibilityLabel="Save something you return to as a routine"/, 'the empty row still opens Your activities');
});

test('the finished card is lilac like Up next; peach stays only for the break', () => {
  const { colors } = load('src/constants/theme.ts');
  const details = read('src/components/CompletionDetails.tsx');
  assert.match(details, /card: \{borderRadius:28, backgroundColor:colors\.focusSurface,/);
  assert.doesNotMatch(details, /warm(Surface|Text|Line)/);
  assert.equal(colors.warmText, undefined); assert.equal(colors.warmLine, undefined);
  assert.match(read('src/components/SessionScreen.tsx'), /archBreak: \{ backgroundColor: colors\.warmSurface \}/);
});

test('the arch shows one smooth progress line, clamped to the session', async () => {
  const Countdown = load('src/components/SessionCountdown.tsx', {
    'react-native': { View: host('View'), StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }) },
    './AppText': { Text: host('Text') },
  }).default;
  let ui; const fill = () => ui.root.findAll(n => n.props.testID === 'session-progress-line' && n.type === 'View')[0].findAllByType('View').at(-1).props.style;
  const width = () => Object.assign({}, ...[].concat(fill())).width;
  await act(async () => { ui = create(React.createElement(Countdown, { seconds: 1200, caption: '10 of 30 min focused', serif: true, progress: 1 / 3 })); });
  assert.equal(width(), '33%');
  for (const [progress, expected] of [[1.4, '100%'], [-1, '0%'], [Number.NaN, '0%']]) {
    await act(async () => ui.update(React.createElement(Countdown, { seconds: 1200, progress })));
    assert.equal(width(), expected);
  }
  assert.equal(ui.root.findAll(n => n.props.testID === 'session-segments').length, 0, 'no segments');
  await act(async () => ui.unmount());
});

test('initials use the aubergine family: no brown or olive, and light text stays readable', () => {
  const source = read('src/components/InitialsAvatar.tsx');
  const tints = JSON.parse(source.match(/const TINTS = (\[[^\]]+\])/)[1]);
  assert.equal(tints.length, 8); assert.equal(new Set(tints).size, 8);
  assert.ok(!tints.includes('#7A4E35') && !tints.includes('#55602F'));
  const lum = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  for (const tint of tints) assert.ok((lum('#F6F2EC') + 0.05) / (lum(tint) + 0.05) >= 4.5, tint);
});
