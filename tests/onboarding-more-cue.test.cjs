/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => function Host(props) { return React.createElement(name, props, props.children); };
function load(file, mocks) {
  const filename = path.resolve(__dirname, '..', file), mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}
class Value { constructor(v) { this.v = v; } setValue(v) { this.v = v; } interpolate() { return this; } stopAnimation() {} }
const Scroll = React.forwardRef(function Scroll(props, ref) { React.useImperativeHandle(ref, () => ({ scrollTo() {}, scrollToEnd() { scrolled.push('end'); } })); return React.createElement('Scroll', props, props.children); });
const scrolled = [];
const Frame = load('src/components/OnboardingFrame.tsx', {
  'react-native': { View: host('View'), ScrollView: Scroll, KeyboardAvoidingView: host('KAV'), StyleSheet: { create: s => s }, Platform: { OS: 'android' },
    Animated: { View: host('Motion'), Value, timing: () => ({ start(cb) { cb?.({ finished: true }); }, stop() {} }) }, Easing: {},
    AccessibilityInfo: { announceForAccessibility() {} }, BackHandler: { addEventListener: () => ({ remove() {} }) }, Keyboard: { isVisible: () => false, dismiss() {} } },
  'react-native-safe-area-context': { SafeAreaView: host('Safe') }, '@expo/vector-icons': { Ionicons: host('Icon') },
  './AppText': { Text: host('Text') }, '../constants/theme': { colors: new Proxy({}, { get: () => '#000' }) }, './MotionPressable': host('Button'), '../hooks/useReducedMotion': { useReducedMotion: () => true },
}).default;

test('a page longer than the screen says there is more below, and the cue goes once scrolled', async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(Frame, { step: 1, total: 8, title: 'What would you like to make time for?', subtitle: 'Pick some',
    opacity: new Value(1), onNext() {} }, React.createElement('View'))); });
  const scroll = () => tree.root.findByType('Scroll'), cue = () => tree.root.findAll(n => n.props.testID === 'onboarding-more' && typeof n.type !== 'string');
  try {
    assert.equal(cue().length, 0);
    await act(async () => { scroll().props.onLayout({ nativeEvent: { layout: { height: 500 } } }); scroll().props.onContentSizeChange(0, 520); });
    assert.equal(cue().length, 0, 'a page that nearly fits needs no cue');
    await act(async () => scroll().props.onContentSizeChange(0, 800));
    assert.equal(cue().length, 1);
    const pill = tree.root.findAll(n => n.props.accessibilityLabel === 'More below. Scroll down').at(-1);
    await act(async () => pill.props.onPress()); assert.deepEqual(scrolled, ['end']);
    await act(async () => scroll().props.onScroll({ nativeEvent: { contentOffset: { y: 300 } } }));
    assert.equal(cue().length, 0, 'gone once the end is in view');
  } finally { await act(async () => tree.unmount()); }
});
