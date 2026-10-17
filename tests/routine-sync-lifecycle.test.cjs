const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const scope = { ownerId: '11111111-1111-4111-8111-111111111111', backendId: 'routine-sync-fixture' };
const other = { ...scope, ownerId: '22222222-2222-4222-8222-222222222222' };
const draft = { name: 'Review notes', focusAreaId: null, durationSeconds: 60, reminder: { enabled: false, hour: 18, minute: 0 } };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const turn = () => new Promise(resolve => setImmediate(resolve));
async function harness({ queued = 1, proofRerenders = false, holdApply = false, failApply = false } = {}) {
  const root = path.resolve(__dirname, '..'), modules = new Map(), values = new Map(), rows = new Map();
  const Auth = React.createContext(null), calls = [], held = [], verifiers = [];
  let currentScope = scope, accessMode = 'online', epoch = 1, sequence = 0, renderAuth, tree;
  const notifications = { getPermissionsAsync: async () => ({ granted: false }), getAllScheduledNotificationsAsync: async () => [] };
  const mocks = {
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    'expo-notifications': notifications,
    '@react-native-async-storage/async-storage': { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } },
    'expo-modules-core': { uuid: { v4: () => `bbbbbbbb-bbbb-4bbb-8bbb-${String(++sequence).padStart(12, '0')}` } },
    '../../lib/supabase': { supabase: { rpc: async (name, params) => {
      calls.push({ name, params });
      if (name === 'list_saved_routines_v1') return { data: [...rows.values()], error: null };
      if (holdApply) { const reply = deferred(); held.push(reply); await reply.promise; }
      if (failApply) return { data: null, error: new Error('Synthetic connection failure') };
      const row = { ...params.p_draft, id: params.p_routine_id, revision: params.p_expected_revision + 1, deletedAt: null };
      rows.set(row.id, row);
      return { data: { status: 'saved', routine: row }, error: null };
    } } },
    '../context/AuthContext': { useAuth: () => React.useContext(Auth) },
    '../context/UserContext': { useUser: () => ({ soundEnabled: false }) },
    '../services/notificationPermissionService': { subscribeNotificationPermissionChanges: () => () => {} },
    '../hooks/useSavedRoutines': { useSavedRoutines: () => {
      const auth = React.useContext(Auth), selected = auth.scope;
      const subscribe = React.useCallback(listener => service.savedRoutineStore.subscribe(selected, listener), [selected]);
      const snapshot = React.useCallback(() => service.savedRoutineStore.snapshot(selected), [selected]);
      return { ...React.useSyncExternalStore(subscribe, snapshot, snapshot), scope: selected };
    } },
  };
  function load(file) {
    const filename = path.resolve(root, file); if (modules.has(filename)) return modules.get(filename).exports;
    const mod = { exports: {} }; modules.set(filename, mod);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    new Function('require', 'module', 'exports', code)(name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (!name.startsWith('.')) return require(name);
      const target = path.resolve(path.dirname(filename), name), ext = ['.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
      return load(path.relative(root, target + ext));
    }, mod, mod.exports); return mod.exports;
  }
  const service = load('src/services/savedRoutineService.ts'), Lifecycle = load('src/components/RoutineLifecycle.tsx').default;
  for (let count = 0; count < queued; count++) await service.savedRoutineStore.save(scope, { ...draft, name: `${draft.name} ${count}` });
  await service.savedRoutineStore.load(scope);
  function App() {
    const [, setRevision] = React.useState(0); renderAuth = () => setRevision(value => value + 1);
    const verifyCurrentOwner = async () => {
      verifiers.push(currentScope?.ownerId ?? null);
      // Real Auth verification sets state and supplies a new callback identity.
      // Let that committed render occur before the proof/RPC completes.
      if (proofRerenders) { renderAuth(); await turn(); }
      return currentScope ? { id: currentScope.ownerId, backendId: currentScope.backendId } : null;
    };
    return React.createElement(Auth.Provider, { value: { scope: currentScope, accessMode, admissionEpoch: epoch, verifyCurrentOwner } }, React.createElement(Lifecycle));
  }
  await act(async () => { tree = create(React.createElement(App)); await turn(); });
  return { calls, held, verifiers, service, values,
    state: () => service.savedRoutineStore.snapshot(scope),
    setFailure: value => { failApply = value; },
    flush: () => act(async () => { for (let n = 0; n < 8; n++) await turn(); }),
    save: name => act(async () => { await service.savedRoutineStore.save(scope, { ...draft, name }); }),
    release: index => act(async () => { held[index].resolve(); await turn(); }),
    updateAuth: patch => act(async () => {
      if (Object.hasOwn(patch, 'scope')) currentScope = patch.scope;
      accessMode = patch.accessMode ?? accessMode; epoch = patch.epoch ?? epoch;
      if (currentScope) await service.savedRoutineStore.load(currentScope);
      renderAuth(); await turn();
    }),
    cleanup: () => act(async () => tree.unmount()),
  };
}

test('routine sync survives Auth renders caused by its own owner verification and clears its durable queue', async () => {
  const ui = await harness({ proofRerenders: true });
  try {
    await ui.flush();
    assert.equal(ui.state().pendingCount, 0);
    assert.equal(ui.state().busy, false); assert.equal(ui.state().error, null);
    assert.equal(ui.calls.filter(call => call.name === 'change_saved_routine_v1').length, 1);
    assert.equal(ui.verifiers.length, 4, 'one before/after proof for mutation and list; no verification/render loop');
    assert.equal([...ui.values.values()].map(value => JSON.parse(value)).find(value => value.scope.ownerId === scope.ownerId).pending.length, 0);
  } finally { await ui.cleanup(); }
});

test('routine queue changes wake an idle sync and acknowledged items do not cancel the next queued item', async () => {
  const ui = await harness({ queued: 0, holdApply: true });
  try {
    await ui.flush(); await ui.save('First'); await ui.flush();
    assert.equal(ui.held.length, 1, 'saving online starts syncing without waiting for the retry interval');
    await ui.save('Second'); await ui.release(0); await ui.flush();
    assert.equal(ui.held.length, 2, 'the same draining sync reaches the next operation');
    await ui.release(1); await ui.flush();
    assert.equal(ui.state().pendingCount, 0); assert.equal(ui.state().error, null);
    assert.equal(ui.calls.filter(call => call.name === 'change_saved_routine_v1').length, 2);
  } finally { await ui.cleanup(); }
});

test('an account change during a routine reply preserves the old queue and sends nothing under the new owner', async () => {
  const ui = await harness({ holdApply: true });
  try {
    await ui.flush(); assert.equal(ui.held.length, 1);
    await ui.updateAuth({ scope: other, epoch: 2 }); await ui.release(0); await ui.flush();
    assert.equal(ui.state().pendingCount, 1, 'a departed account reply cannot acknowledge local work');
    assert.equal(ui.service.savedRoutineStore.snapshot(other).pendingCount, 0);
    assert.equal(ui.calls.filter(call => call.name === 'change_saved_routine_v1').length, 1);
    assert.equal(ui.calls.find(call => call.name === 'change_saved_routine_v1').params.p_expected_owner, scope.ownerId);
  } finally { await ui.cleanup(); }
});

test('a genuine routine connection failure keeps the queued change and clears busy rather than acknowledging it', async () => {
  const ui = await harness({ failApply: true });
  try {
    await ui.flush(); assert.equal(ui.state().pendingCount, 1); assert.equal(ui.state().busy, false);
    assert.match(ui.state().error, /Saved on this phone/);
  } finally { await ui.cleanup(); }
});

test('routine sync retries a real failure on the existing interval and clears pending/error after recovery', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const ui = await harness({ failApply: true });
  try {
    await ui.flush(); assert.equal(ui.state().pendingCount, 1); assert.ok(ui.state().error);
    ui.setFailure(false);
    const attempts = ui.calls.filter(call => call.name === 'change_saved_routine_v1').length;
    await act(async () => t.mock.timers.tick(14999)); await ui.flush();
    assert.equal(ui.calls.filter(call => call.name === 'change_saved_routine_v1').length, attempts);
    await act(async () => t.mock.timers.tick(1)); await ui.flush();
    assert.equal(ui.state().pendingCount, 0); assert.equal(ui.state().busy, false); assert.equal(ui.state().error, null);
    assert.equal(ui.calls.filter(call => call.name === 'change_saved_routine_v1').length, attempts + 1);
  } finally { await ui.cleanup(); t.mock.timers.reset(); }
});
