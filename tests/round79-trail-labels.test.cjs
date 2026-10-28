/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(root, file); if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name), suffix = ['.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
    assert.ok(suffix, `resolve ${name} from ${file}`); return load(path.relative(root, target + suffix), mocks, cache);
  }, module, module.exports);
  return module.exports;
}
const base = { seconds: 420, findSeconds: 1800, stops: 4, finds: 0, complete: false, nextFindSeconds: 1380,
  look: { skin: '3', hair: 'short', hairColor: 'darkbrown', glasses: false }, equipped: {}, level: 4, background: 'bg_dusk', frame: null, fill: true };
const labels = ui => ui.root.findAllByType('SvgText').map(node => node.props.children);
const words = ui => ui.root.findAllByType('Text').map(node => [].concat(node.props.children).join('')).join(' ');
const expected = next => [next === 1 ? 'Next find · 30 min total' : '30 min total', next === 2 ? 'Next find · 60 min total' : '60 min total',
  next === 3 ? 'Next find · 90 min total' : '90 min total', "Trail's end · 120 min total"];
async function fixture({ reduced = false, fontScale = 1, props = {} } = {}) {
  const animations = [], interpolate = (value, input, output) => {
    if (value <= input[0]) return output[0];
    for (let i = 1; i < input.length; i++) if (value <= input[i]) return output[i - 1] + (output[i] - output[i - 1]) * (value - input[i - 1]) / (input[i] - input[i - 1]);
    return output.at(-1);
  };
  const svg = { __esModule: true, ...Object.fromEntries(['default', 'Circle', 'Defs', 'Ellipse', 'G', 'LinearGradient', 'Path', 'Rect', 'Stop', 'Text'].map(name => [name, host(`Svg${name}`)])) };
  const reanimated = { __esModule: true, default: { View: host('AnimatedView'), createAnimatedComponent: component => component },
    Easing: { inOut: value => value, cubic: 0 }, cancelAnimation() {}, interpolate, runOnJS: callback => callback,
    useSharedValue: value => React.useState(() => ({ value }))[0], useAnimatedReaction() {}, useAnimatedStyle: callback => callback(), useAnimatedProps: callback => callback(),
    withTiming: (to, config, done) => { animations.push({ to, config, done }); return to; }, withDelay: (_delay, value) => value, withSpring: value => value };
  const Trail = load('src/components/rewards/TodayTrail.tsx', {
    'react-native': { View: host('View'), StyleSheet: { create: value => value, absoluteFill: {} }, useWindowDimensions: () => ({ width: 360, height: 640, fontScale }) },
    'react-native-reanimated': reanimated, 'react-native-svg': svg, '@expo/vector-icons': { Ionicons: host('Icon') },
    '../AppText': { Text: host('Text') }, '../adventurer/ProfilePicture': host('Picture'), '../adventurer/ItemArt': { StardustArt: host('Dust') },
    '../../hooks/useReducedMotion': { useReducedMotion: () => reduced }, '../../utils/tapHaptics': { tapHaptic() {} },
  }).default;
  let ui; await act(async () => { ui = create(React.createElement(Trail, { ...base, ...props })); });
  await act(async () => ui.root.findByProps({ testID: 'today-trail-map' }).props.onLayout({ nativeEvent: { layout: { width: 300, height: 260 } } }));
  return { ui, animations, update: async props => act(async () => ui.update(React.createElement(Trail, { ...base, ...props }))),
    cleanup: () => act(async () => ui.unmount()) };
}

test('seven minutes shows 23 minutes remaining and unambiguous fixed total-minute trail positions', async () => {
  const f = await fixture(); try {
    assert.match(words(f.ui), /7 m.*0 of 4.*23 min.*to next find/);
    assert.deepEqual(labels(f.ui).filter(label => /min total$/.test(label)), expected(1));
    assert.ok(!labels(f.ui).some(label => /53 min|83 min|113 min/.test(label)), 'milestone positions do not become countdowns');
    assert.match(f.ui.root.findByProps({ testID: 'today-trail-map' }).props.accessibilityLabel, /23 min to your next find/);
  } finally { await f.cleanup(); }
});

test('later progress changes the next stop and remaining time without changing route milestones', async () => {
  const f = await fixture(); try {
    await f.update({ seconds: 2220, finds: 1, nextFindSeconds: 1380 });
    assert.match(words(f.ui), /37 m.*1 of 4.*23 min/); assert.deepEqual(labels(f.ui).filter(label => /min total$/.test(label)), expected(2));
    await f.update({ seconds: 4020, finds: 2, nextFindSeconds: 1380 });
    assert.match(words(f.ui), /1 h 7 m.*2 of 4.*23 min/); assert.deepEqual(labels(f.ui).filter(label => /min total$/.test(label)), expected(3));
    assert.equal(f.animations.length, 0, 'copy changes do not add stationary map animations');
  } finally { await f.cleanup(); }
});

test('completed and reduced-motion trails retain the fixed totals and existing no-countdown state', async () => {
  const f = await fixture({ reduced: true, props: { seconds: 7200, fromSeconds: 7020, finds: 4, complete: true, nextFindSeconds: 0 } }); try {
    assert.deepEqual(labels(f.ui).filter(label => /min total$/.test(label)), expected(0));
    assert.match(words(f.ui), /trail complete/); assert.ok(!words(f.ui).includes('to next find'));
    assert.equal(f.animations.length, 0); assert.ok(f.ui.root.findAllByProps({ testID: 'trail-complete' }).length > 0);
    await f.update({ seconds: 9000, fromSeconds: 7200, finds: 4, complete: true, nextFindSeconds: 0 });
    assert.deepEqual(labels(f.ui).filter(label => /min total$/.test(label)), expected(0));
    assert.equal(f.ui.root.findAllByType('SvgCircle').length, 4, 'no extra node appears beyond 120 minutes');
  } finally { await f.cleanup(); }
});

test('small-phone large-text rendering keeps all four total labels in the existing measured map', async () => {
  const f = await fixture({ fontScale: 1.8 }); try {
    const labels = f.ui.root.findAllByType('SvgText').filter(node => /min total$/.test(node.props.children));
    assert.equal(labels.length, 4); assert.ok(labels.every(node => node.props.y > 0 && node.props.y < 260));
    assert.ok(labels.every(node => node.props.x >= 0 && node.props.x <= 300));
    assert.match(words(f.ui), /23 min.*to next find/); assert.equal(f.ui.root.findAllByType('Picture').length, 1);
  } finally { await f.cleanup(); }
});
