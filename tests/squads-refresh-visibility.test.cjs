/* global __dirname */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;

async function setup(t, initiallyFocused) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let focused = initiallyFocused, loads = 0, cached = 0;
  let timer = { sessionId: null, hasOpenSession: false, isRunning: false, sessionEnded: false, sessionSummary: null };
  const appListeners = new Set();
  const native = { AppState: { currentState: "active", addEventListener(_event, listener) {
    appListeners.add(listener); return { remove: () => appListeners.delete(listener) };
  } } };
  const auth = { user: { id: "owner" }, localOwner: { backendId: "fixture", id: "owner" }, accessMode: "online",
    verifyCurrentOwner: async () => ({ id: "owner", backendId: "fixture" }) };
  const state = { squads: [], loading: false, error: null };
  const mocks = {
    "react-native": native,
    "expo-router": { useFocusEffect: function useFocusEffect(callback) {
      React.useEffect(() => focused ? callback() : undefined, [callback, focused]);
    } },
    "../services/squadLimits": { useSquadLimits: () => ({}) },
    "../context/AuthContext": { useAuth: () => auth },
    "../context/TimerContext": { useTimer: () => timer },
    "../utils/sessionBackend": { sessionBackendIdentity: () => ({ backendId: "fixture" }) },
    "../services/squadService": { createSquadTransport: () => ({}), squadStore: {
      subscribe: () => () => {}, snapshot: () => state,
      load: async (_scope, client) => { if (client) loads++; else cached++; },
    } },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../src/hooks/useSquads.ts"), "utf8");
  const module = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", code)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports);
  function Consumer() { module.exports.useSquads(); return React.createElement("Squads"); }
  let ui;
  await act(async () => { ui = create(React.createElement(Consumer)); });
  const render = () => act(async () => ui.update(React.createElement(Consumer)));
  return {
    loads: () => loads, cached: () => cached,
    focus: async value => { focused = value; await render(); },
    session: async patch => { timer = { ...timer, ...patch }; await render(); },
    offline: async () => { auth.accessMode = "local-only"; auth.user = null; await render(); },
    tick: ms => act(async () => t.mock.timers.tick(ms)),
    app: state => act(async () => { native.AppState.currentState = state; for (const listener of appListeners) listener(state); }),
    cleanup: () => act(async () => ui.unmount()),
  };
}

test("a retained hidden squad consumer does not refresh for timer changes and catches up when shown", async t => {
  const s = await setup(t, false);
  try {
    const initial = s.loads();
    await s.session({ sessionId: "focus", hasOpenSession: true, isRunning: true });
    await s.tick(1000);
    await s.session({ hasOpenSession: false, isRunning: false, sessionSummary: {} });
    await s.tick(30000);
    assert.equal(s.loads(), initial, "hidden session changes and polling do not issue reads");
    await s.focus(true);
    assert.equal(s.loads(), initial + 1, "the ordinary focus refresh catches up once");
    await s.tick(30000);
    assert.equal(s.loads(), initial + 2, "the visible live board keeps its existing interval");
  } finally { await s.cleanup(); }
});

test("a delayed visible session refresh is cancelled by leaving the screen", async t => {
  const s = await setup(t, true);
  try {
    const before = s.loads();
    await s.session({ sessionId: "focus", hasOpenSession: true, isRunning: true });
    await s.tick(400); await s.focus(false); await s.tick(400);
    assert.equal(s.loads(), before, "the pending callback cannot read after blur");
    await s.app("background"); await s.app("active");
    assert.equal(s.loads(), before, "hidden consumers have no foreground listener");
  } finally { await s.cleanup(); }
});

test("visible session changes keep the existing delay and do not fetch while the app is in the background", async t => {
  const s = await setup(t, true);
  try {
    const before = s.loads();
    await s.session({ sessionId: "focus", hasOpenSession: true, isRunning: true });
    await s.tick(799); assert.equal(s.loads(), before);
    await s.tick(1); assert.equal(s.loads(), before + 1);
    await s.session({ isRunning: false });
    await s.app("background"); await s.tick(30000);
    assert.equal(s.loads(), before + 1);
    await s.app("active"); assert.equal(s.loads(), before + 2, "foreground performs the existing single catch-up");
  } finally { await s.cleanup(); }
});

test("offline session changes do not add cloud reads", async t => {
  const s = await setup(t, true);
  try {
    await s.offline(); const before = s.loads();
    await s.session({ sessionId: "offline", hasOpenSession: true, isRunning: true });
    await s.tick(31000);
    assert.equal(s.loads(), before);
    assert.ok(s.cached() > 0, "offline cache loading remains available");
  } finally { await s.cleanup(); }
});
