/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { create, act } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => function Host(props) { return React.createElement(name, props, props.children); };
function load(file, mocks, modules = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = { exports: {} }; modules.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name), ext = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, '..'), target + ext), mocks, modules);
  }, mod, mod.exports);
  return mod.exports;
}
function motionHarness() {
  const transitions = [];
  class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } }
  return { transitions, Animated: {
    Value, View: host('AnimatedView'),
    timing: (value, config) => ({ value, config }),
    parallel: animations => {
      const transition = { animations, stopped: false, callback: null };
      return {
        start(callback) { transition.callback = callback; transitions.push(transition); },
        stop() { transition.stopped = true; },
      };
    },
  },
  async finish(index = transitions.length - 1) {
    const transition = transitions[index]; assert.ok(transition);
    await act(async () => {
      if (!transition.stopped) for (const animation of transition.animations) animation.value.setValue(animation.config.toValue);
      // A queued native callback may arrive after stop; the component must fence it.
      transition.callback?.({ finished: true });
    });
  } };
}
async function surface(options = {}) {
  const motion = motionHarness(), counters = { mounts: 0, unmounts: 0 };
  let props = { localOnly: options.localOnly ?? false, onlineReady: options.onlineReady ?? true };
  function Navigation() {
    const token = React.useRef({});
    React.useEffect(() => { counters.mounts++; return () => { counters.unmounts++; }; }, []);
    return React.createElement('Navigation', { token: token.current });
  }
  const Surface = load('src/components/ConnectionSurface.tsx', {
    'react-native': { View: host('View'), Animated: motion.Animated, StyleSheet: { create: value => value } },
    '../hooks/useReducedMotion': { useReducedMotion: () => options.reducedMotion ?? false },
  }).default;
  const render = () => React.createElement(Surface, { ...props, offline: active => React.createElement('Offline', { active }) }, React.createElement(Navigation));
  let tree; await act(async () => { tree = create(render()); });
  return { motion, counters, root: () => tree.root,
    update: async next => { props = { ...props, ...next }; await act(async () => { tree.update(render()); }); },
    cleanup: () => act(async () => tree.unmount()),
  };
}

test('connectivity transitions preserve the navigation instance and suppress controls on the hidden surface', async () => {
  const ui = await surface();
  try {
    const navigation = ui.root().findByType('Navigation'), token = navigation.props.token;
    await ui.motion.finish();
    await ui.update({ localOnly: true });
    assert.equal(ui.root().findByType('Navigation'), navigation);
    assert.equal(ui.root().findByType('Navigation').props.token, token);
    const online = ui.root().findByProps({ testID: 'online-navigation-surface' });
    assert.equal(online.props.pointerEvents, 'none');
    assert.equal(online.props.importantForAccessibility, 'no-hide-descendants');
    assert.equal(ui.root().findByType('Offline').props.active, true);
    await ui.motion.finish(); await ui.update({ localOnly: false });
    const outgoing = ui.root().findByProps({ testID: 'offline-connection-surface' });
    assert.equal(outgoing.props.pointerEvents, 'none'); assert.equal(outgoing.props.accessibilityElementsHidden, true);
    assert.equal(ui.root().findByType('Offline').props.active, false);
    assert.equal(ui.root().findByType('Navigation'), navigation);
    await ui.motion.finish(); assert.equal(ui.root().findAllByType('Offline').length, 0);
    assert.deepEqual(ui.counters, { mounts: 1, unmounts: 0 });
  } finally { await ui.cleanup(); }
});

test('an obsolete fade callback cannot remove the active offline surface after a rapid reconnect and disconnect', async () => {
  const ui = await surface({ localOnly: true });
  try {
    await ui.motion.finish(); await ui.update({ localOnly: false });
    const stale = ui.motion.transitions.length - 1;
    await ui.update({ localOnly: true });
    assert.equal(ui.motion.transitions[stale].stopped, true);
    await ui.motion.finish(stale);
    assert.equal(ui.root().findByType('Offline').props.active, true);
    assert.equal(ui.root().findByProps({ testID: 'offline-connection-surface' }).props.pointerEvents, 'auto');
    assert.deepEqual(ui.counters, { mounts: 1, unmounts: 0 });
    await ui.motion.finish();
    assert.equal(ui.root().findByType('Offline').props.active, true);
  } finally { await ui.cleanup(); }
});

test('reduced motion uses zero-duration fades while preserving the same navigation tree', async () => {
  const ui = await surface({ localOnly: true, reducedMotion: true });
  try {
    await ui.motion.finish(); await ui.update({ localOnly: false }); await ui.motion.finish();
    assert.ok(ui.motion.transitions.every(transition => transition.animations.every(animation => animation.config.duration === 0)));
    assert.deepEqual(ui.counters, { mounts: 1, unmounts: 0 });
    assert.equal(ui.root().findAllByType('Offline').length, 0);
  } finally { await ui.cleanup(); }
});

async function connection(options = {}) {
  const calls = [], motion = motionHarness();
  let accessMode = options.accessMode ?? 'local-only', pathname = options.pathname ?? '/session';
  let timer = { hasOpenSession: false, isCompleted: false, endingSession: false, sessionEnded: false,
    awaitingStart: false, linkedTaskId: null, isRestoring: false, ...options.timer };
  const router = { replace: route => calls.push(route) };
  const Content = load('src/components/SessionConnectionContent.tsx', {
    'react-native': { View: host('View'), Animated: motion.Animated, StyleSheet: { create: value => value } },
    'expo-router': { usePathname: () => pathname, useRouter: () => router },
    '../hooks/useReducedMotion': { useReducedMotion: () => false },
    '../context/AuthContext': { useAuth: () => ({ accessMode }) },
    '../context/TimerContext': { useTimer: () => timer },
    './OfflineSessionRecovery': host('Recovery'),
  }).default;
  const render = () => React.createElement(Content, null, React.createElement('Navigation'));
  let tree; await act(async () => { tree = create(render()); });
  return { calls, motion, root: () => tree.root,
    update: async next => {
      if (next.accessMode !== undefined) accessMode = next.accessMode;
      if (next.pathname !== undefined) pathname = next.pathname;
      if (next.timer) timer = { ...timer, ...next.timer };
      await act(async () => tree.update(render()));
    },
    cleanup: () => act(async () => tree.unmount()),
  };
}

test('reconnecting after offline Done replaces the stale session route before revealing online navigation', async () => {
  for (const pathname of ['/session', '/timer']) {
    const ui = await connection({ pathname });
    try {
      const navigation = ui.root().findByType('Navigation');
      await ui.update({ accessMode: 'online' });
      assert.deepEqual(ui.calls, ['/']);
      assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'none');
      assert.equal(ui.root().findByType('Recovery').props.active, false);
      await ui.motion.finish();
      assert.equal(ui.root().findAllByType('Recovery').length, 1, 'retain the outgoing surface while the route is obsolete');
      await ui.update({ pathname: '/' });
      assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'auto');
      await ui.motion.finish(); assert.equal(ui.root().findAllByType('Recovery').length, 0);
      assert.equal(ui.root().findByType('Navigation'), navigation);
      assert.deepEqual(ui.calls, ['/']);
    } finally { await ui.cleanup(); }
  }
});

test('valid quest setup, running timer and pending result routes survive reconnection', async () => {
  for (const timer of [{ linkedTaskId: 7 }, { hasOpenSession: true }, { isCompleted: true },
    { endingSession: true }, { sessionEnded: true }, { awaitingStart: true }]) {
    const ui = await connection({ timer });
    try {
      await ui.update({ accessMode: 'online' });
      assert.deepEqual(ui.calls, []);
      assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'auto');
      await ui.motion.finish(); assert.equal(ui.root().findAllByType('Recovery').length, 0);
    } finally { await ui.cleanup(); }
  }
});

test('restoration holds the outgoing surface until a durable result decides whether to close the route', async () => {
  const ui = await connection({ timer: { isRestoring: true } });
  try {
    await ui.update({ accessMode: 'online' });
    assert.deepEqual(ui.calls, []);
    assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'none');
    await ui.motion.finish(); assert.equal(ui.root().findAllByType('Recovery').length, 1);
    await ui.update({ timer: { isRestoring: false, hasOpenSession: true } });
    assert.deepEqual(ui.calls, []);
    assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'auto');
    await ui.motion.finish(); assert.equal(ui.root().findAllByType('Recovery').length, 0);
  } finally { await ui.cleanup(); }
  const empty = await connection({ timer: { isRestoring: true } });
  try {
    await empty.update({ accessMode: 'online' }); await empty.update({ timer: { isRestoring: false } });
    assert.deepEqual(empty.calls, ['/']);
    assert.equal(empty.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'none');
  } finally { await empty.cleanup(); }
});

test('a normal online setup and non-session destinations do not redirect merely because a session is absent', async () => {
  for (const options of [{ accessMode: 'online' }, { pathname: '/profile' }]) {
    const ui = await connection(options);
    try {
      await ui.update({ accessMode: 'online' }); assert.deepEqual(ui.calls, []);
      assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'auto');
    } finally { await ui.cleanup(); }
  }
});

async function questProvider(options = {}) {
  const calls = []; let online = options.online ?? false, state, foreground;
  let timer = { sessionSummary: null, cloudSaveVersion: 0 };
  const module = load('src/context/QuestContext.tsx', {
    'react-native': { AppState: { addEventListener: (_name, callback) => { foreground = callback; return { remove() {} }; } } },
    './TimerContext': { useTimer: () => timer },
    '../services/taskService': {
      getTasks: async () => { calls.push('tasks'); return options.tasks?.() ?? [{ id: 1, title: 'Current quest' }]; },
      getSubjects: async () => { calls.push('areas'); return options.areas?.() ?? [{ id: 7, title: 'Learning' }]; },
    },
  });
  function Capture() { state = module.useQuests(); return null; }
  const render = () => React.createElement(module.QuestProvider, { online }, React.createElement(Capture));
  let tree; await act(async () => tree = create(render()));
  return { calls, state: () => state,
    update: async next => {
      if (next.online !== undefined) online = next.online;
      if (next.timer) timer = { ...timer, ...next.timer };
      await act(async () => tree.update(render()));
    },
    refresh: () => act(async () => { await state.refresh(true); }),
    foreground: () => act(async () => foreground('active')),
    cleanup: () => act(async () => tree.unmount()),
  };
}

test('the retained quest provider performs no online reads while offline, including foreground and sync publications', async () => {
  const ui = await questProvider();
  try {
    await ui.refresh(); await ui.foreground(); await ui.update({ timer: { cloudSaveVersion: 1 } });
    assert.deepEqual(ui.calls, []);
    await ui.update({ online: true });
    assert.deepEqual(ui.calls, ['tasks', 'areas']);
    assert.equal(ui.state().tasks[0].title, 'Current quest');
    await ui.update({ online: false }); await ui.refresh(); await ui.foreground();
    assert.deepEqual(ui.calls, ['tasks', 'areas']);
    assert.equal(ui.state().tasks[0].title, 'Current quest', 'cached choices stay mounted beneath the offline surface');
  } finally { await ui.cleanup(); }
});

test('a pre-disconnect quest response cannot overwrite the retained catalogue after reconnect', async () => {
  let resolveOld, requests = 0;
  const old = new Promise(resolve => { resolveOld = resolve; });
  const ui = await questProvider({ online: true, tasks: () => ++requests === 1 ? old : [{ id: 2, title: 'New quest' }] });
  try {
    assert.equal(ui.state().refreshing, true);
    await ui.update({ online: false });
    assert.equal(ui.state().refreshing, false);
    await ui.update({ online: true }); assert.equal(ui.state().tasks[0].title, 'New quest');
    await act(async () => resolveOld([{ id: 1, title: 'Obsolete quest' }]));
    assert.equal(ui.state().tasks[0].title, 'New quest');
    assert.equal(ui.state().refreshing, false); assert.equal(ui.state().error, false);
  } finally { await ui.cleanup(); }
});
