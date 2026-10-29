/* global __dirname */
// Production-compiled scene components; only device, navigation and drawing
// boundaries are mocked. Count registered repeating animations, not device FPS.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), babel = require('@babel/core');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const repo = path.resolve(__dirname, '..');
const host = type => function Host(props) { return React.createElement(type, props, props.children); };

async function fixture({ compiled = true, focused = true, appState = 'active', reduced = false, active = true } = {}) {
  const loops = new Map(), events = [], appListeners = new Set(), focusListeners = new Set(), reduceListeners = new Set(), cache = new Map();
  let focus = focused, reduce = reduced;
  const app = { currentState: appState, addEventListener(_type, listener) { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
  const useSharedValue = initial => {
    const ref = React.useRef(null);
    if (!ref.current) {
      let value = initial;
      const shared = { get value() { return value; }, set value(next) {
        if (next?.kind === 'repeat') { loops.set(shared, next); events.push('start'); }
        else if (typeof next !== 'object') { value = next; loops.delete(shared); }
      } };
      ref.current = shared;
    }
    return ref.current;
  };
  const svg = { __esModule: true };
  for (const type of ['default', 'Circle', 'Defs', 'Ellipse', 'G', 'LinearGradient', 'Path', 'RadialGradient', 'Rect', 'Stop']) svg[type] = host('Svg' + type);
  const mocks = {
    'react-native': { AppState: app, View: host('View'), Pressable: host('Press'), useWindowDimensions: () => ({ width: 360, height: 640, fontScale: 1 }),
      StyleSheet: { create: value => value, absoluteFill: {} }, Animated: { View: host('NativeMotion'), Value: class { constructor(value) { this.value = value; } }, timing: () => ({ start() {}, stop() {} }) } },
    'expo-router': { useFocusEffect: callback => {
      const onShow = React.useSyncExternalStore(listener => { focusListeners.add(listener); return () => focusListeners.delete(listener); }, () => focus, () => focus);
      React.useEffect(() => onShow ? callback() : undefined, [onShow, callback]);
    } },
    'react-native-reanimated': { __esModule: true, default: { View: host('Motion') }, useSharedValue, useAnimatedStyle: () => ({}), interpolate: () => 0,
      Easing: { inOut: value => value, linear: 0, quad: 0, sin: 0 }, runOnJS: callback => callback,
      withTiming: (to, config, done) => ({ kind: 'timing', to, config, done }), withDelay: (_delay, motion) => motion,
      withSequence: (...motions) => ({ kind: 'sequence', motions }), withRepeat: motion => ({ kind: 'repeat', motion }),
      cancelAnimation: shared => { if (loops.delete(shared)) events.push('cancel'); } },
    'react-native-svg': svg,
    '../AppText': { Text: host('Text') },
    '../../hooks/useReducedMotion': { useReducedMotion: () => React.useSyncExternalStore(listener => {
      reduceListeners.add(listener); return () => reduceListeners.delete(listener);
    }, () => reduce, () => reduce) },
    './ItemArt': { __esModule: true, default: host('Item') }, './AdventurerArt': { __esModule: true, default: host('Character') },
  };
  function load(file) {
    const filename = path.resolve(repo, file); if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    let source = fs.readFileSync(filename, 'utf8');
    if (compiled && /(?:SessionBackdrop|TrailScenes|AdventurerBack)\.tsx$/.test(filename)) {
      source = babel.transformSync(source, { filename, configFile: false, babelrc: false, parserOpts: { plugins: ['typescript', 'jsx'] },
        plugins: [[require.resolve('babel-plugin-react-compiler'), { target: '19' }]] }).code;
      assert.match(source, /react\/compiler-runtime/, 'the measurement uses production React compilation');
    }
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'module', 'exports', js)(name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (!name.startsWith('.')) return require(name);
      const target = path.resolve(path.dirname(filename), name), extension = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext) && fs.statSync(target + ext).isFile());
      return load(target + extension);
    }, module, module.exports);
    return module.exports;
  }
  const Scene = load('src/components/session/SessionBackdrop.tsx').default;
  let props = { phase: 'running', progress: 0.1, secondsLeft: 1620, walking: true, intro: false, skipToken: 0, onIntroEnd() {}, active }, tree;
  await act(async () => { tree = create(React.createElement(Scene, props)); });
  return { loops: () => loops.size, events,
    update: changes => act(async () => { props = { ...props, ...changes }; tree.update(React.createElement(Scene, props)); }),
    focus: next => act(async () => { focus = next; for (const listener of focusListeners) listener(); }),
    app: next => act(async () => { app.currentState = next; for (const listener of appListeners) listener(next); }),
    reduce: next => act(async () => { reduce = next; for (const listener of reduceListeners) listener(); }),
    close: () => act(async () => tree.unmount()), subscriptions: () => appListeners.size };
}

for (const compiled of [false, true]) {
  const mode = compiled ? 'production compiler' : 'uncompiled control';
  test(`hidden session cancels decorative loops and resumes them once on route focus (${mode})`, async () => {
    const h = await fixture({ compiled });
    try {
      assert.equal(h.loops(), 2, 'fire and fireflies each run one repeat while visible (no walker since Round 83)');
      await h.focus(false); assert.equal(h.loops(), 0, 'Outfits or another covering route must stop all decorative repeats');
      await h.app('background'); await h.app('active'); assert.equal(h.loops(), 0, 'AppState cannot restart a blurred scene');
      await h.focus(true); assert.equal(h.loops(), 2);
      const starts = h.events.filter(event => event === 'start').length;
      for (const secondsLeft of [1619, 1618, 1617]) await h.update({ secondsLeft });
      assert.equal(h.events.filter(event => event === 'start').length, starts, 'ticks keep existing visible loops instead of registering more');
    } finally { await h.close(); }
    assert.equal(h.loops(), 0); assert.equal(h.subscriptions(), 0);
  });

  test(`background and inactive states pause only decorative motion (${mode})`, async () => {
    const h = await fixture({ compiled });
    try {
      await h.app('inactive'); assert.equal(h.loops(), 0);
      await h.app('background'); assert.equal(h.loops(), 0);
      await h.app('active'); assert.equal(h.loops(), 2);
      await h.update({ phase: 'paused', walking: false }); assert.equal(h.loops(), 1, 'visible paused camp retains its normal fire glow');
      await h.app('background'); assert.equal(h.loops(), 0);
      await h.app('active'); assert.equal(h.loops(), 1, 'resume visibility must not resume a paused walk');
      await h.reduce(true); assert.equal(h.loops(), 0, 'Reduce Motion leaves every repeat cancelled');
      await h.app('background'); await h.app('active'); assert.equal(h.loops(), 0);
    } finally { await h.close(); }
  });

  test(`a covered return screen stops the backdrop without changing its completion (${mode})`, async () => {
    const h = await fixture({ compiled });
    try {
      await h.update({ active: false }); assert.equal(h.loops(), 0, 'a return screen in the same route covers all decorative work');
      await h.update({ phase: 'completed', walking: false, secondsLeft: 0 }); assert.equal(h.loops(), 0);
      await h.update({ active: true }); assert.equal(h.loops(), 1, 'a visible completed camp keeps its glow and stays still');
    } finally { await h.close(); }
  });

  test(`a scene first mounted while hidden never starts decorative loops (${mode})`, async () => {
    for (const hidden of [{ focused: false }, { appState: 'background' }, { active: false }]) {
      const h = await fixture({ compiled, ...hidden });
      try { assert.equal(h.loops(), 0); assert.equal(h.events.filter(event => event === 'start').length, 0); }
      finally { await h.close(); }
    }
  });
}
