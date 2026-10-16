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
    if(name==='@expo/vector-icons')return {Ionicons:props=>React.createElement('Icon',props)};
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const extension = ['.ts', '.tsx'].find(value => fs.existsSync(target + value));
    return load(path.relative(path.resolve(__dirname, '..'), target + extension), cache);
  }, module, module.exports);
  return module.exports;
}

test('an explicitly selected eight-minute duration keeps a plain Custom option and exact editor value', async () => {
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

test('an explicitly remembered Custom default opens independently of the selected preset', async () => {
  const Control = load('src/components/FocusLengthControl.tsx').default;
  let tree, selected = 3600, remembered = 1379, customSaves = 0;
  const props = () => ({ seconds: selected, customSeconds: remembered, onChange: value => { selected = value; }, onCustomSave: value => { selected = value; remembered = value; customSaves++; } });
  await act(async () => { tree = create(React.createElement(Control, props())); });
  const button = label => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label);
  const field = label => tree.root.findAllByType('Input').find(node => node.props.accessibilityLabel === label);
  try {
    await act(async () => button('Set a custom focus duration').props.onPress());
    assert.equal(field('Focus minutes').props.value, '22');
    assert.equal(field('Focus seconds').props.value, '59');
    await act(async () => field('Focus minutes').props.onChangeText('17'));
    await act(async () => tree.root.findByType('Sheet').props.onRequestClose());
    assert.equal(customSaves, 0, 'cancelling does not remember an unfinished edit');
    await act(async () => button('Set a custom focus duration').props.onPress());
    assert.equal(field('Focus minutes').props.value, '22');
    await act(async () => { field('Focus minutes').props.onChangeText('2'); field('Focus seconds').props.onChangeText('15'); });
    await act(async () => button('Use this duration').props.onPress());
    assert.equal(customSaves, 1);
    assert.equal(selected, 135);
    await act(async () => tree.update(React.createElement(Control, props())));
    await act(async () => button('Use 30 minutes').props.onPress());
    await act(async () => tree.update(React.createElement(Control, props())));
    assert.equal(selected, 1800);
    await act(async () => button('Set a custom focus duration').props.onPress());
    assert.equal(field('Focus minutes').props.value, '2');
    assert.equal(field('Focus seconds').props.value, '15');
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
