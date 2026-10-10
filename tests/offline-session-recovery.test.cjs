/* global __dirname */
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => {
  function Host(props) { return React.createElement(name, props, props.children); }
  return Host;
};
function load(file, mocks = {}, modules = new Map()) {
  const filename = path.resolve(__dirname, "..", file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = { exports: {} }; modules.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name), ext = ["", ".ts", ".tsx"].find(ext => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, ".."), target + ext), mocks, modules);
  }, mod, mod.exports);
  return mod.exports;
}
const text = node => typeof node === "string" ? node : (node.children ?? []).map(text).join("");
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const cached = { id: "owner", username: "Soon Teck", daily_goal_minutes: 60, level: 2, current_xp: 40, gold: 9 };
async function screen(options = {}) {
  const calls = [];
  const forbidden = () => { throw Error("Editable offline action called"); };
  const auth = { localOwner: { id: "owner", backendId: "fixture.supabase.co" }, cachedProfile: cached,
    retrySessionVerification: async () => { calls.push("connection"); return options.connection?.(); }, ...options.auth };
  let timer = { timeLeft: 90, duration: 1800, hasOpenSession: true, isRunning: true, isCompleted: false, isRestoring: false,
    restoreError: false, actionBusy: false, actionError: null, awaitingStart: false, syncStatus: "idle", sessionSummary: null,
    retryRestore: () => calls.push("restore"), retryCompletion: async () => { calls.push("completion"); return options.completion?.(); },
    retryAction: async () => { calls.push("action"); return options.action?.(); },
    startTimer: forbidden, startFreeTimer: forbidden, startSuggestedTimer: forbidden, pauseTimer: forbidden, resumeTimer: forbidden, resetTimer: forbidden,
    ...options.timer };
  const module = load("src/components/OfflineSessionRecovery.tsx", {
    "react-native": { View: host("View"), Pressable: host("Button"), ScrollView: host("Scroll"), StyleSheet: { create: v => v, hairlineWidth: 0.5 },
      useWindowDimensions: () => ({ width: options.width ?? 390, height: 844, fontScale: options.fontScale ?? 1 }) },
    "react-native-safe-area-context": { SafeAreaView: host("SafeArea") }, "./AppText": { Text: host("Text") },
    "../context/AuthContext": { useAuth: () => auth }, "../context/UserContext": { useUser: () => ({ profile: options.profile ?? cached, updateProfile: forbidden }) },
    "../context/TimerContext": { useTimer: () => timer },
  });
  let tree; await act(async () => { tree = create(React.createElement(module.default)); });
  return { root: () => tree.root, calls, button: label => tree.root.findAllByType("Button").find(node => node.props.accessibilityLabel === label),
    update: next => act(async () => { timer = { ...timer, ...next }; tree.update(React.createElement(module.default)); }),
    cleanup: () => act(async () => tree.unmount()) };
}
test("running recovery shows cached name/goal and live countdown with no editing controls or reward estimates", async () => {
  const ui = await screen();
  try {
    assert.match(text(ui.root()), /Welcome back, Soon Teck\./); assert.match(text(ui.root()), /Last saved daily goal: 60 min/);
    const countdown = () => ui.root().findByProps({ testID: "offline-countdown" });
    assert.equal(countdown().props.accessibilityLabel, "Time remaining, 1 minute, 30 seconds");
    await ui.update({ timeLeft: 59 }); assert.equal(countdown().props.accessibilityLabel, "Time remaining, 0 minutes, 59 seconds");
    assert.deepEqual(ui.root().findAllByType("Button").map(button => button.props.accessibilityLabel), ["Retry connection"]);
    assert.doesNotMatch(text(ui.root()), /XP|gold|earned|Start focus|Pause session|End session/); assert.deepEqual(ui.calls, []);
  } finally { await ui.cleanup(); }
});
test("paused recovery describes confirmed paused time and does not offer resume or end", async () => {
  const ui = await screen({ timer: { isRunning: false, timeLeft: 300 } });
  try { assert.match(text(ui.root()), /Your session is paused/); assert.equal(ui.root().findByProps({ testID: "offline-countdown" }).props.accessibilityLabel, "Time remaining, 5 minutes, 0 seconds"); assert.equal(ui.root().findAllByType("Button").length, 1); }
  finally { await ui.cleanup(); }
});

test("a saved stop request never looks like a running countdown or a completed reward", async () => {
  const ui = await screen({ timer: { endingSession: true, syncStatus: "waiting", timeLeft: 0 } });
  try {
    assert.match(text(ui.root()), /Your request to end is saved/);
    assert.match(text(ui.root()), /won’t submit a completion/);
    assert.equal(ui.root().findAllByProps({ testID: "offline-countdown" }).length, 0);
    await act(async () => ui.button("Retry saved session").props.onPress());
    assert.deepEqual(ui.calls, ["action"]);
  } finally { await ui.cleanup(); }
});
test("unknown start labels its planned duration instead of suggesting a running countdown", async () => {
  const ui = await screen({ timer: { awaitingStart: true, isRunning: false, timeLeft: 0, syncStatus: "waiting" } });
  try {
    assert.match(text(ui.root()), /Checking your session start/); assert.match(text(ui.root()), /Reconnect to check its outcome before starting again/);
    assert.equal(ui.root().findByProps({ testID: "offline-countdown" }).props.accessibilityLabel, "Planned focus, 30 minutes, 0 seconds");
    await act(async () => ui.button("Retry saved session").props.onPress()); assert.deepEqual(ui.calls, ["action"]);
  } finally { await ui.cleanup(); }
});
test("pending completion stays at zero and makes no confirmed reward claim", async () => {
  for (const isCompleted of [true, false]) {
    const ui = await screen({ timer: { isCompleted, timeLeft: 0, syncStatus: "waiting", sessionSummary: { xpEarned: 1000, goldEarned: 12 } } });
    try {
      assert.match(text(ui.root()), /Waiting for account confirmation/); assert.match(text(ui.root()), /Progress updates after confirmation/);
      assert.equal(text(ui.root().findByProps({ testID: "offline-minutes" })), "0"); assert.equal(text(ui.root().findByProps({ testID: "offline-seconds" })), "00");
      assert.doesNotMatch(text(ui.root()), /1000|12 gold|XP|earned/);
      if (isCompleted) { await act(async () => ui.button("Retry saved session").props.onPress()); assert.deepEqual(ui.calls, ["completion"]); }
    } finally { await ui.cleanup(); }
  }
});
test("a confirmed saved receipt is described honestly without cached balances posing as a new reward", async () => {
  const ui = await screen({ timer: { isCompleted: true, timeLeft: 0, syncStatus: "saved", sessionSummary: { xpEarned: 250, goldEarned: 15 } } });
  try { assert.match(text(ui.root()), /Session saved/); assert.match(text(ui.root()), /Your account confirmed this session/); assert.doesNotMatch(text(ui.root()), /250|15 gold|XP/); assert.equal(ui.root().findAllByProps({ testID: "offline-countdown" }).length, 0); assert.equal(ui.button("Retry saved session"), undefined); }
  finally { await ui.cleanup(); }
});
test("no saved active record never displays the draft 30-minute timer as an active session", async () => {
  const ui = await screen({ timer: { hasOpenSession: false, isRunning: false, timeLeft: 1800 } });
  try { assert.match(text(ui.root()), /No active session is saved on this phone/); assert.equal(ui.root().findAllByProps({ testID: "offline-countdown" }).length, 0); assert.equal(ui.button("Retry saved session"), undefined); }
  finally { await ui.cleanup(); }
});
test("restoring, unreadable and rejected records get distinct guidance with no new control actions", async () => {
  for (const [timer, expected, retry] of [
    [{ isRestoring: true }, /Restoring your session/, false],
    [{ restoreError: true }, /Your saved session needs another look/, true],
    [{ syncStatus: "rejected" }, /Your session needs review/, false],
    [{ syncStatus: "rejected", awaitingStart: true }, /Your session needs review/, false],
  ]) {
    const ui = await screen({ timer });
    try {
      assert.match(text(ui.root()), expected); assert.equal(ui.root().findAllByProps({ testID: "offline-countdown" }).length, 0);
      assert.equal(!!ui.button("Retry saved session"), retry);
      if (retry) { await act(async () => ui.button("Retry saved session").props.onPress()); assert.deepEqual(ui.calls, ["restore"]); }
    } finally { await ui.cleanup(); }
  }
});
test("connection retry locks repeat taps, exposes busy/disabled state and returns to the ordinary label", async () => {
  const wait = deferred(), ui = await screen({ connection: () => wait.promise });
  try {
    const original = ui.button("Retry connection"); await act(async () => { original.props.onPress(); original.props.onPress(); });
    assert.deepEqual(ui.calls, ["connection"]); const busy = ui.button("Checking connection");
    assert.equal(busy.props.disabled, true); assert.deepEqual(busy.props.accessibilityState, { disabled: true, busy: true }); assert.match(text(busy), /Checking connection/);
    await act(async () => wait.resolve()); assert.equal(ui.button("Retry connection").props.disabled, false);
    const message = ui.root().findAllByType("Text").find(node => /Connection check finished/.test(text(node)));
    assert.equal(message.props.accessibilityLiveRegion, "polite");
  } finally { await ui.cleanup(); }
});
test("saved-session retry has its own busy label and prevents connection or duplicate session actions", async () => {
  const wait = deferred(), ui = await screen({ timer: { isCompleted: true, timeLeft: 0, syncStatus: "waiting" }, completion: () => wait.promise });
  try {
    await act(async () => ui.button("Retry saved session").props.onPress());
    assert.equal(ui.button("Checking saved session").props.accessibilityState.busy, true);
    assert.equal(ui.button("Retry connection").props.disabled, true);
    await act(async () => ui.button("Retry connection").props.onPress()); assert.deepEqual(ui.calls, ["completion"]);
    await act(async () => wait.resolve()); assert.equal(ui.button("Retry saved session").props.disabled, false);
  } finally { await ui.cleanup(); }
});
test("retry errors are readable, live-announced and do not expose exception contents", async () => {
  const ui = await screen({ connection: async () => { throw Error("private token and backend response"); } });
  try {
    await act(async () => ui.button("Retry connection").props.onPress());
    assert.match(text(ui.root()), /Couldn’t reconnect yet/); assert.doesNotMatch(text(ui.root()), /private token/);
    const error = ui.root().findAllByType("Text").find(node => node.props.accessibilityRole === "alert"); assert.equal(error.props.accessibilityLiveRegion, "polite");
  } finally { await ui.cleanup(); }
});
test("a stalled connection check releases the retry control and safely handles a late rejection", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const wait = deferred(), ui = await screen({ connection: () => wait.promise });
  try {
    await act(async () => ui.button("Retry connection").props.onPress());
    assert.equal(ui.button("Checking connection").props.disabled, true);
    await act(async () => { t.mock.timers.tick(8000); });
    assert.equal(ui.button("Retry connection").props.disabled, false);
    assert.match(text(ui.root()), /Couldn’t reconnect yet/);
    await act(async () => wait.reject(Error("private late response")));
    assert.doesNotMatch(text(ui.root()), /private late response/);
    assert.equal(ui.button("Retry connection").props.disabled, false);
  } finally { await ui.cleanup(); t.mock.timers.reset(); }
});
test("screen uses all safe areas, scrolls with large text and keeps accessible controls at least 44 pixels high", async () => {
  const ui = await screen({ width: 320, fontScale: 2 });
  try {
    assert.deepEqual(ui.root().findByType("SafeArea").props.edges, ["top", "bottom", "left", "right"]);
    assert.equal(ui.root().findByType("Scroll").props.contentContainerStyle.flexGrow, 1);
    const time = ui.root().findAllByType("View").find(node => Array.isArray(node.props.style) && node.props.style.some(style => style?.flexDirection === "column")); assert.ok(time);
    assert.ok(ui.root().findAllByType("Text").every(node => node.props.allowFontScaling !== false));
    for (const button of ui.root().findAllByType("Button")) { assert.equal(button.props.accessibilityRole, "button"); assert.ok(button.props.style[0].minHeight >= 44); }
    assert.ok(ui.root().findAllByType("View").some(node => node.props.accessibilityLabel === "Offline. Working from saved account details on this phone."));
  } finally { await ui.cleanup(); }
});
test("foreign cached profile details cannot leak into the local owner's recovery screen", async () => {
  const foreign = { ...cached, id: "foreign", username: "Someone Else" };
  const ui = await screen({ auth: { cachedProfile: foreign }, profile: foreign });
  try { assert.match(text(ui.root()), /Welcome back\./); assert.doesNotMatch(text(ui.root()), /Someone Else|Last saved daily goal/); }
  finally { await ui.cleanup(); }
});
