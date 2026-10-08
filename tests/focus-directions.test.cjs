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

test('the chooser shows only the current direction prompts and retains the chosen prompt when free focus is toggled', async () => {
  const Choice = load('src/components/GuidedChoice.tsx', mocks).default;
  let current;
  function Harness() {
    const [value, setValue] = React.useState({ version: 1, enabled: true, invited: true, need: 'revision', templateId: 'review-topic', smaller: false });
    current = value;
    return React.createElement(Choice, { value, onChange: setValue });
  }
  const ui = await render(Harness);
  try {
    assert.match(text(ui.tree.root), /Review and remember/);
    assert.doesNotMatch(text(ui.tree.root), /Make a first draft/);
    await ui.press('Work and projects');
    assert.equal(current.templateId, 'project-next-step');
    assert.doesNotMatch(text(ui.tree.root), /Review and remember|Practise what you’re learning/);
    await ui.press('Make room for a priority');
    assert.equal(current.templateId, 'work-priority');
    await ui.press('Just let me focus');
    assert.equal(current.enabled, false);
    assert.equal(current.templateId, 'work-priority');
    assert.doesNotMatch(text(ui.tree.root), /Your starting point/);
    await ui.press('Help me choose a focus');
    assert.equal(current.templateId, 'work-priority');
    await ui.press('Create and practise');
    await ui.press('Spend time with your craft');
    assert.equal(current.need, 'creative');
    assert.equal(current.templateId, 'creative-practice');
  } finally { await ui.cleanup(); }
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
    await ui.press('Learn and study');
    assert.equal(current.templateId, 'next-deadline');
    assert.equal(current.need, 'assignments');
    await ui.press('Everyday life');
    assert.equal(current.templateId, 'life-small-task');
    await ui.press('Quiet time');
    assert.equal(current.templateId, 'quiet-screen-free');
    assert.equal(current.need, 'restore');
  } finally { await ui.cleanup(); }
});
