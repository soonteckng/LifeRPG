const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const {act, create} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
function setup(reduced = true) {
  const animations = [];
  const host = name => props => React.createElement(name, props, props.children);
  class Value {
    constructor(value) {this.value = value;}
    setValue(value) {this.value = value;}
    stopAnimation() {}
    interpolate(config) {return {source: this, config};}
  }
  const mocks = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {View: host('View'), Animated: {Value, createAnimatedComponent: c => c, timing: (value, config) => {
      const animation = {config, stopped: false, start() {value.setValue(config.toValue);}, stop() {this.stopped = true;}};
      animations.push(animation); return animation;
    }}},
    'react-native-svg': {__esModule: true, default: host('Svg'), Circle: host('Circle')},
    '../constants/theme': {colors: {accent: '#A5B4FC', line: '#222'}},
    '../hooks/useReducedMotion': {useReducedMotion: () => reduced},
  };
  const module = {exports: {}};
  const code = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/components/ProgressRing.tsx'), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => mocks[name], module, module.exports);
  return {Ring: module.exports.default, animations};
}
test('SVG ring uses two circles, round caps and a twelve-o-clock origin; children stay outside decorative SVG', async () => {
  const {Ring} = setup(); let tree;
  await act(async () => {tree = create(React.createElement(Ring, {size: 172, progress: 0.5}, React.createElement('Text', {}, 'Timer')));});
  const circles = tree.root.findAllByType('Circle');
  assert.equal(circles.length, 2);
  assert.equal(circles[1].props.r, 81);
  assert.equal(circles[1].props.strokeWidth, 10);
  assert.equal(circles[1].props.strokeLinecap, 'round');
  assert.equal(circles[1].props.rotation, -90);
  assert.deepEqual(circles[1].props.strokeDashoffset.config.outputRange, [2*Math.PI*81, 0]);
  assert.equal(circles[1].props.strokeDashoffset.source.value, 0.5);
  const decoration = tree.root.findAllByType('View').find(node => node.props.pointerEvents === 'none');
  assert.equal(decoration.props.accessible, false);
  assert.equal(decoration.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(tree.root.findByType('Svg').findAllByType('Text').length, 0);
  await act(async () => tree.unmount());
});
test('SVG ring clamps invalid progress and suppresses the zero-progress round-cap dot', async () => {
  for (const [progress, expected] of [[-1,0],[NaN,0],[Infinity,0],[2,1]]) {
    const {Ring} = setup(); let tree;
    await act(async () => {tree = create(React.createElement(Ring, {size: 300, stroke: 8, progress}));});
    const arc = tree.root.findAllByType('Circle')[1];
    assert.equal(arc.props.r, 146);
    assert.equal(arc.props.opacity.source.value, expected);
    assert.deepEqual(arc.props.opacity.config.outputRange, [0,1]);
    await act(async () => tree.unmount());
  }
});
test('SVG updates honour reduced motion and stop interrupted animations', async () => {
  for (const reduced of [true, false]) {
    const {Ring, animations} = setup(reduced); let tree;
    await act(async () => {tree = create(React.createElement(Ring, {size: 172, progress: 0.2}));});
    await act(async () => tree.update(React.createElement(Ring, {size: 172, progress: 0.8})));
    assert.equal(tree.root.findAllByType('Circle')[1].props.strokeDashoffset.source.value, 0.8);
    if (reduced) assert.equal(animations.length, 0);
    else {
      assert.equal(animations[0].stopped, true);
      assert.deepEqual(animations[1].config, {toValue: 0.8, duration: 220, useNativeDriver: false});
    }
    await act(async () => tree.unmount());
    if (!reduced) assert.equal(animations[1].stopped, true);
  }
});
