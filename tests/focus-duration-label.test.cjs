const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => props => React.createElement(name, props, props.children);
const content = node => typeof node === 'string' ? node : (node.children ?? []).map(content).join('');
const mocks = {
  'react-native': { View: host('View'), StyleSheet: { create: value => value } },
  'expo-haptics': { selectionAsync: async () => {} },
  '../context/UserContext': { useUser: () => ({ hapticsEnabled: false }) },
  '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), BottomSheetTextInput: host('Input'), TouchableOpacity: host('Button') },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
  './AppText': { Text: host('Text') },
  './MotionPressable': host('Button'),
  './AppSheet': props => props.visible ? React.createElement('Sheet', props, props.header, props.children, props.footer) : null,
};
function load(file, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const extension = ['.ts', '.tsx'].find(value => fs.existsSync(target + value));
    return load(path.relative(path.resolve(__dirname, '..'), target + extension), cache);
  }, module, module.exports);
  return module.exports;
}

test('a remembered eight-minute session keeps a plain Custom option and exact editor value', async () => {
  const Control = load('src/components/FocusLengthControl.tsx').default;
  let tree, seconds = 480;
  const props = () => ({ seconds, onChange: value => { seconds = value; } });
  await act(async () => { tree = create(React.createElement(Control, props())); });
  const custom = () => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === 'Set a custom focus duration');
  const field = label => tree.root.findAllByType('Input').find(node => node.props.accessibilityLabel === label);
  const save = () => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === 'Use this duration');
  try {
    assert.equal(content(custom()), 'Custom');
    assert.equal(custom().props.accessibilityState.selected, true);
    assert.equal(custom().props.accessibilityValue.text, '8 min');
    await act(async () => custom().props.onPress());
    assert.equal(field('Focus minutes').props.value, '8');
    assert.equal(field('Focus seconds').props.value, '0');
    await act(async () => { field('Focus minutes').props.onChangeText('22'); field('Focus seconds').props.onChangeText('59'); });
    await act(async () => save().props.onPress());
    assert.equal(seconds, 1379);
    await act(async () => tree.update(React.createElement(Control, props())));
    assert.equal(content(custom()), 'Custom');
    assert.equal(custom().props.accessibilityValue.text, '22 min 59 sec');
    await act(async () => custom().props.onPress());
    assert.equal(field('Focus minutes').props.value, '22');
    assert.equal(field('Focus seconds').props.value, '59');
    await act(async () => tree.root.findByType('Sheet').props.onRequestClose());
    await act(async () => custom().props.onPress());
    assert.equal(field('Focus minutes').props.value, '22');
    assert.equal(field('Focus seconds').props.value, '59');
  } finally { await act(async () => tree.unmount()); }
});

test('Custom never advertises a default when a preset is selected', async () => {
  const Control = load('src/components/FocusLengthControl.tsx').default;
  let tree;
  await act(async () => { tree = create(React.createElement(Control, { seconds: 3600, onChange() {} })); });
  try {
    const custom = tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === 'Set a custom focus duration');
    assert.equal(content(custom), 'Custom');
    assert.equal(custom.props.accessibilityState.selected, false);
    assert.equal(custom.props.accessibilityValue.text, '');
    await act(async () => custom.props.onPress());
    const field = label => tree.root.findAllByType('Input').find(node => node.props.accessibilityLabel === label);
    assert.equal(field('Focus minutes').props.value, '60');
    assert.equal(field('Focus seconds').props.value, '0');
  } finally { await act(async () => tree.unmount()); }
});
