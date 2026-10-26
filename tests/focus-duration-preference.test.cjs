const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const extension = ['.ts', '.tsx'].find(value => fs.existsSync(target + value));
    return load(path.relative(path.resolve(__dirname, '..'), target + extension), mocks, cache);
  }, module, module.exports);
  return module.exports;
}
function storage() {
  const values = new Map();
  return { values, getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } };
}
function harness(db = storage()) {
  const api = load('src/services/focusDurationPreference.ts', { '@react-native-async-storage/async-storage': db });
  return { db, api, store: api.createFocusDurationPreferenceStore(db) };
}

test('without an explicit custom preference the editor follows the current preset, not session history', async () => {
  const { store, db } = harness();
  await store.load('alice');
  assert.equal(store.snapshot('alice').selectedSeconds, 1800);
  assert.equal(store.snapshot('alice').value.customSeconds, null);
  await store.choose('alice', 3600, false);
  const reopened = harness(db).store;
  await reopened.load('alice');
  assert.equal(reopened.snapshot('alice').selectedSeconds, 3600);
  assert.equal(reopened.snapshot('alice').value.customSeconds, null);
});

test('a saved custom time survives a cold restart while the last preset is selected', async () => {
  const { store, db } = harness();
  await store.load('alice');
  await store.choose('alice', 3600, false);
  await store.choose('alice', 135, true);
  assert.equal(store.snapshot('alice').selectedSeconds, 135);
  const reopened = harness(db).store;
  await reopened.load('alice');
  assert.equal(reopened.snapshot('alice').selectedSeconds, 3600);
  assert.equal(reopened.snapshot('alice').value.customSeconds, 135);
  await reopened.choose('alice', 1800, false);
  assert.equal(reopened.snapshot('alice').value.customSeconds, 135, 'a preset does not replace the explicitly saved Custom editor default');
});

test('account changes never borrow another account’s custom time or preset', async () => {
  const { store, db } = harness();
  await Promise.all([store.load('alice'), store.load('bob')]);
  await store.choose('alice', 3600, false);
  await store.choose('alice', 77, true);
  await store.choose('bob', 91, true);
  const reopened = harness(db).store;
  await Promise.all([reopened.load('alice'), reopened.load('bob')]);
  assert.deepEqual(reopened.snapshot('alice').value, { version: 1, presetSeconds: 3600, customSeconds: 77 });
  assert.deepEqual(reopened.snapshot('bob').value, { version: 1, presetSeconds: 1800, customSeconds: 91 });
  assert.equal(reopened.snapshot('').value.customSeconds, null);
  assert.equal(await reopened.choose('', 123, true), false);
});

test('a pending initial read blocks edits instead of overwriting a later user choice', async () => {
  const read = deferred(); let reads = 0, writes = 0;
  const { store } = harness({ getItem: () => { reads++; return read.promise; }, setItem: async () => { writes++; } });
  const first = store.load('alice'), second = store.load('alice');
  assert.equal(reads, 1);
  assert.equal(store.snapshot('alice').ready, false);
  assert.equal(await store.choose('alice', 135, true), false);
  assert.equal(writes, 0);
  read.resolve(JSON.stringify({ version: 1, presetSeconds: 3600, customSeconds: 83 }));
  await Promise.all([first, second]);
  await store.choose('alice', 135, true);
  assert.equal(store.snapshot('alice').selectedSeconds, 135);
  assert.equal(store.snapshot('alice').value.customSeconds, 135);
});

test('older account reads resolve only into that account’s state', async () => {
  const slow = deferred();
  const { store } = harness({ getItem: key => key.endsWith(':alice') ? slow.promise : Promise.resolve(null), setItem: async () => {} });
  const alice = store.load('alice');
  await store.load('bob');
  await store.choose('bob', 125, true);
  slow.resolve(JSON.stringify({ version: 1, presetSeconds: 3600, customSeconds: 480 }));
  await alice;
  assert.equal(store.snapshot('bob').selectedSeconds, 125);
  assert.equal(store.snapshot('bob').value.customSeconds, 125);
});

test('consecutive edits persist in order even while the first write is delayed', async () => {
  const gate = deferred(), calls = [], values = new Map();
  const db = { getItem: async () => null, setItem: async (key, value) => {
    calls.push(JSON.parse(value));
    if (calls.length === 1) await gate.promise;
    values.set(key, value);
  } };
  const { store, api } = harness(db);
  await store.load('alice');
  const first = store.choose('alice', 135, true);
  const second = store.choose('alice', 3600, false);
  const third = store.choose('alice', 231, true);
  assert.equal(store.snapshot('alice').selectedSeconds, 231, 'selection responds before storage finishes');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  gate.resolve();
  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true]);
  assert.deepEqual(JSON.parse(values.get(api.focusDurationKey('alice'))), { version: 1, presetSeconds: 3600, customSeconds: 231 });
});

test('storage failures preserve the current choice with a visible error and remain retryable', async () => {
  let failRead = true, failWrite = true;
  const { store } = harness({ getItem: async () => { if (failRead) throw Error('disk'); return null; }, setItem: async () => { if (failWrite) throw Error('disk'); } });
  await store.load('alice');
  assert.equal(store.snapshot('alice').ready, false);
  assert.equal(store.snapshot('alice').error, true);
  assert.equal(await store.choose('alice', 135, true), false);
  failRead = false; await store.load('alice');
  assert.equal(await store.choose('alice', 135, true), false);
  assert.equal(store.snapshot('alice').selectedSeconds, 135);
  assert.equal(store.snapshot('alice').error, true);
  failWrite = false;
  assert.equal(await store.choose('alice', 135, true), true);
  assert.equal(store.snapshot('alice').error, false);
});

test('invalid persisted durations never seed an unsafe timer', () => {
  const { api } = harness();
  for (const raw of ['{broken', JSON.stringify({ version: 1, presetSeconds: 480, customSeconds: null }),
    ...[0, -1, 1.5, 28801, '480'].map(customSeconds => JSON.stringify({ version: 1, presetSeconds: 1800, customSeconds }))]) {
    assert.deepEqual(api.parseFocusDurationPreference(raw), api.DEFAULT_FOCUS_DURATION);
  }
  for (const seconds of [60, 28800]) assert.equal(api.parseFocusDurationPreference(JSON.stringify({ version: 1, presetSeconds: 1800, customSeconds: seconds })).customSeconds, seconds);
});

test('the real hook exposes the new owner immediately, then restores only its own preference', async () => {
  const db = storage(), { store } = harness(db);
  await store.load('alice'); await store.choose('alice', 77, true);
  const { useFocusDurationPreference } = load('src/hooks/useFocusDurationPreference.ts', { '../services/focusDurationPreference': { focusDurationPreferenceStore: store } });
  let state, tree;
  function Capture({ owner }) { state = useFocusDurationPreference(owner); return null; }
  await act(async () => { tree = create(React.createElement(Capture, { owner: 'alice' })); });
  try {
    assert.equal(state.value.customSeconds, 77);
    await act(async () => tree.update(React.createElement(Capture, { owner: 'bob' })));
    assert.equal(state.value.customSeconds, null);
    assert.equal(state.selectedSeconds, 1800);
    await act(async () => state.choose(125, true));
    assert.equal(state.value.customSeconds, 125);
    await act(async () => tree.update(React.createElement(Capture, { owner: 'alice' })));
    assert.equal(state.value.customSeconds, 77);
  } finally { await act(async () => tree.unmount()); }
});
