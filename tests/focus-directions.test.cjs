const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => props => React.createElement(name, props, props.children);
const text = node => node.children.map(child => typeof child === 'string' ? child : text(child)).join('');
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.endsWith('/MotionPressable')) return host('Button');
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const ext = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, '..'), target + ext), mocks, cache);
  }, module, module.exports);
  return module.exports;
}
function storage() {
  const values = new Map();
  return { values, api: { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } } };
}
const mocks = {
  'react-native': { View: host('View'), StyleSheet: { create: value => value, hairlineWidth: 0.5 } },
  '@expo/vector-icons': { Ionicons: host('Icon') },
  'expo-haptics': { selectionAsync: async () => {} },
  '../context/UserContext': { useUser: () => ({ hapticsEnabled: true }) },
  './AppText': { Text: host('Text') },
};
async function render(Component) {
  let tree;
  await act(async () => { tree = create(React.createElement(Component)); });
  return {
    tree,
    press: async label => act(async () => {
      const button = tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label);
      assert.ok(button, `Missing ${label}`);
      assert.notEqual(button.props.disabled, true);
      button.props.onPress();
    }),
    cleanup: async () => act(async () => tree.unmount()),
  };
}

test('new directions persist their selected prompt in the existing account-scoped record without changing another account', async () => {
  const db = storage();
  const prefs = load('src/services/guidedPreferenceService.ts', { '@react-native-async-storage/async-storage': db.api });
  const choices = [
    ['work', 'work-priority'], ['creative', 'creative-practice'], ['life-admin', 'life-reset-space'], ['restore', 'quiet-screen-free'],
  ];
  await Promise.all([prefs.guidedPreferenceStore.load('person'), prefs.guidedPreferenceStore.load('another-person')]);
  for (const [need, templateId] of choices) {
    const value = { version: 1, enabled: true, invited: true, need, templateId, smaller: false };
    assert.equal(await prefs.guidedPreferenceStore.save('person', value), true);
    assert.deepEqual(prefs.parseGuidedPreference(db.values.get('liferpg:guided:v1:person')), value);
    assert.equal(prefs.guidedPreferenceStore.snapshot('another-person').value.enabled, false);
  }
  assert.equal(db.values.size, 1);
  const mismatched = { version: 1, enabled: true, invited: true, need: 'restore', templateId: 'work-priority', smaller: false };
  assert.deepEqual(prefs.parseGuidedPreference(JSON.stringify(mismatched)), prefs.DEFAULT_GUIDED_PREFERENCE);
});

test('old study choices and saved exact-second wording restore through the expanded catalogue', () => {
  const api = load('src/constants/guidedQuests.ts');
  const prefs = load('src/services/guidedPreferenceService.ts', { '@react-native-async-storage/async-storage': storage().api });
  for (const [oldId, need] of Object.entries(api.LEGACY_STARTER_NEEDS)) {
    const value = { version: 1, enabled: true, invited: true, need, templateId: oldId, smaller: true };
    assert.deepEqual(prefs.parseGuidedPreference(JSON.stringify(value)), { ...value, templateId: api.defaultFocusId(need), smaller: false });
    const snapshot = { templateId: oldId, need, title: 'The original session', instruction: 'Keep the original instruction.', seconds: 1859, smaller: true };
    assert.deepEqual(api.readSuggestedFocus(api.encodeSuggestedFocus(snapshot)), snapshot);
    assert.equal(api.suggestedFocusAreaKey(oldId), 'learning');
  }
  for (const templateId of ['project-next-step', 'creative-first-draft', 'life-small-task', 'quiet-screen-free']) {
    const focus = { ...api.suggestedFocus(templateId), seconds: 2473 };
    assert.deepEqual(api.readSuggestedFocus(api.encodeSuggestedFocus(focus)), focus);
  }
  assert.equal(api.readSuggestedFocus('liferpg:suggested:v1:{"id":"uncurated-prompt","smaller":false}'), null);
});

test('the six-category chooser shows only the selected starting points and retains the chosen prompt across Free focus', async () => {
  const Choice = load('src/components/GuidedChoice.tsx', mocks).default;
  let current;
  function Harness() {
    const [value, setValue] = React.useState({ version: 1, enabled: true, invited: true, need: 'revision', templateId: 'review-topic', smaller: false, areaId: 22 });
    current = value;
    return React.createElement(Choice, { value, onChange: setValue });
  }
  const ui = await render(Harness);
  try {
    const labels = () => ui.tree.root.findAllByType('Button').map(button => button.props.accessibilityLabel);
    assert.deepEqual(labels().slice(0, 6), ['Learning', 'Work & projects', 'Creativity', 'Everyday life', 'Free focus', 'Wellbeing']);
    assert.equal(labels().includes('Help me choose a focus'), false);
    assert.equal(labels().includes('Just let me focus'), false);
    assert.match(text(ui.tree.root), /Review and remember/);
    assert.doesNotMatch(text(ui.tree.root), /Make a first draft/);
    await ui.press('Work & projects');
    assert.equal(current.templateId, 'project-next-step');
    assert.doesNotMatch(text(ui.tree.root), /Review and remember|Practise what you’re learning/);
    await ui.press('Make room for a priority');
    assert.equal(current.templateId, 'work-priority');
    await ui.press('Free focus');
    assert.equal(current.enabled, false);
    assert.equal(current.areaId, null);
    assert.equal(current.templateId, 'work-priority');
    assert.match(text(ui.tree.root), /Your starting point/);
    assert.match(text(ui.tree.root), /One thing at a time/);
    assert.doesNotMatch(text(ui.tree.root), /Make room for a priority/);
    assert.equal(ui.tree.root.findAllByType('Button').length, 6);
    assert.deepEqual(ui.tree.root.findAllByType('Button').filter(button => button.props.accessibilityState.checked).map(button => button.props.accessibilityLabel), ['Free focus']);
    await ui.press('Work & projects');
    assert.equal(current.enabled, true);
    assert.equal(current.areaId, undefined);
    assert.equal(current.templateId, 'work-priority');
    await ui.press('Creativity');
    await ui.press('Spend time with your craft');
    assert.equal(current.need, 'creative');
    assert.equal(current.templateId, 'creative-practice');
    await ui.press('Everyday life');
    assert.match(text(ui.tree.root), /Clear a small life task/);
    assert.doesNotMatch(text(ui.tree.root), /Spend time with your craft/);
    await ui.press('Wellbeing');
    assert.match(text(ui.tree.root), /Make time to recharge/);
    assert.doesNotMatch(text(ui.tree.root), /Clear a small life task/);
  } finally { await ui.cleanup(); }
});

test('category and starting-point choices give one haptic per enabled tap, respect settings and ignore disabled taps', async () => {
  let hapticsEnabled = true, haptics = 0, disabled = false;
  const initial = { version: 1, enabled: true, invited: true, need: 'revision', templateId: 'review-topic', smaller: false };
  const Sheet = load('src/components/GuidedPreferenceSheet.tsx', {
    ...mocks,
    'expo-haptics': { selectionAsync: async () => { haptics++; } },
    '../context/UserContext': { useUser: () => ({ hapticsEnabled }) },
    '../hooks/useGuidedPreference': { useGuidedPreference: () => ({ value: initial, ready: true, busy: disabled }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 16 }) },
    '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), TouchableOpacity: host('Button') },
    './AppSheet': props => React.createElement('Sheet', props, props.header, props.children, props.footer),
    './PersonalUI': { p: {} },
  }).default;
  function Harness() {
    return React.createElement(Sheet, { owner: 'person', visible: true, onClose() {} });
  }
  const ui = await render(Harness);
  try {
    await ui.press('Learning');
    await ui.press('Work & projects');
    await ui.press('Make room for a priority');
    await ui.press('Free focus');
    assert.equal(haptics, 4);
    hapticsEnabled = false;
    await act(async () => ui.tree.update(React.createElement(Harness)));
    await ui.press('Learning');
    await ui.press('Move an assignment forward');
    assert.equal(haptics, 4);
    const checkedLabels = () => ui.tree.root.findAllByType('Button').filter(button => button.props.accessibilityState?.checked).map(button => button.props.accessibilityLabel);
    const before = checkedLabels();
    disabled = true; hapticsEnabled = true;
    await act(async () => ui.tree.update(React.createElement(Harness)));
    for (const button of ui.tree.root.findAllByType('Button').filter(button => button.props.accessibilityRole === 'radio')) {
      assert.equal(button.props.disabled, true);
      await act(async () => button.props.onPress());
    }
    assert.deepEqual(checkedLabels(), before);
    assert.equal(haptics, 4);
  } finally { await ui.cleanup(); }
});

test('six-category selections round-trip through saved preferences without reviving a previous Home area', async () => {
  const db = storage();
  const prefs = load('src/services/guidedPreferenceService.ts', { '@react-native-async-storage/async-storage': db.api });
  const choices = load('src/utils/focusPreference.ts');
  const catalog = load('src/constants/guidedQuests.ts');
  await prefs.guidedPreferenceStore.load('person');
  let value = { version: 1, enabled: true, invited: true, need: 'work', templateId: 'work-priority', smaller: false, areaId: 456 };
  value = choices.preferenceForFocusMode(value, false);
  assert.equal(await prefs.guidedPreferenceStore.save('person', value), true);
  let restored = prefs.parseGuidedPreference(db.values.get('liferpg:guided:v1:person'));
  assert.equal(restored.enabled, false); assert.equal(restored.areaId, null);
  for (const direction of catalog.FOCUS_DIRECTIONS) {
    restored = choices.preferenceForFocusDirection(restored, direction);
    assert.equal(restored.enabled, true);
    assert.equal(restored.areaId, undefined);
    assert.equal(catalog.focusDirection(restored.need).id, direction.id);
    assert.equal(catalog.suggestedFocusAreaKey(restored.templateId), direction.id === 'restore' ? 'wellbeing' : direction.id === 'life-admin' ? 'personal' : direction.id);
    assert.equal(await prefs.guidedPreferenceStore.save('person', restored), true);
    assert.deepEqual(prefs.parseGuidedPreference(db.values.get('liferpg:guided:v1:person')), JSON.parse(JSON.stringify(restored)));
    restored = choices.preferenceForFocusMode(restored, false);
  }
});

test('compact onboarding directions keep an existing learning prompt until a different direction is chosen', async () => {
  const Picker = load('src/components/GuidedChoice.tsx', mocks).FocusDirectionPicker;
  let current;
  function Harness() {
    const [value, setValue] = React.useState({ version: 1, enabled: true, invited: true, need: 'assignments', templateId: 'next-deadline', smaller: false });
    current = value;
    return React.createElement(Picker, { value, onChange: setValue, compact: true });
  }
  const ui = await render(Harness);
  try {
    assert.equal(ui.tree.root.findAllByType('Button').length, 5);
    await ui.press('Learning');
    assert.equal(current.templateId, 'next-deadline');
    assert.equal(current.need, 'assignments');
    await ui.press('Everyday life');
    assert.equal(current.templateId, 'life-small-task');
    await ui.press('Wellbeing');
    assert.equal(current.templateId, 'quiet-screen-free');
    assert.equal(current.need, 'restore');
  } finally { await ui.cleanup(); }
});
