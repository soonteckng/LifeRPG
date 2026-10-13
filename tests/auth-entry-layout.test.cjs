/* global __dirname */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => function Host(props) { return React.createElement(name, props, props.children); };
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.endsWith("/MotionPressable")) return host("Button");
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const ext = ["", ".ts", ".tsx"].find(ext => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, ".."), target + ext), mocks, cache);
  }, mod, mod.exports);
  return mod.exports;
}
const layout = load("src/utils/authFormLayout.ts");
const entry = load("src/services/authEntryPreference.ts");
const text = node => typeof node === "string" ? node : (node.children ?? []).map(text).join("");
const native = {
  View: host("View"), Text: host("Text"), TextInput: host("Input"), ScrollView: host("Scroll"),
  KeyboardAvoidingView: host("KeyboardArea"), ActivityIndicator: host("Spinner"),
  Platform: { OS: "android" }, Keyboard: { dismiss() {}, metrics: () => undefined, addListener: () => ({ remove() {} }) },
};
function mocksFor({ os = "android", reduced = true, animations = [] } = {}) {
  return {
    "react-native": { ...native, Platform: { OS: os }, Animated: {
      Value: class { setValue(value) { this.value = value; } interpolate(options) { return options; } },
      View: host("Animated"),
      timing: (value, options) => { animations.push(options); return { start() { value.setValue(options.toValue); }, stop() {} }; },
    } },
    "react-native-safe-area-context": { SafeAreaView: host("Safe"), useSafeAreaInsets: () => ({ top: 24, bottom: 34 }) },
    "../hooks/useReducedMotion": { useReducedMotion: () => reduced },
    "./PersonalUI": { p: {}, PersonalButton: host("Button") },
    "./CharacterPortrait": host("Portrait"), "@expo/vector-icons": { Ionicons: host("Icon") },
  };
}

test("first launch and known-account entry preferences cannot choose an authenticated destination", () => {
  assert.equal(entry.authEntryPreference(null), "sign-up");
  assert.equal(entry.authEntryPreference("sign-in"), "sign-in");
  for (const malformed of [false, {}, "online", "home", "sign-up"]) assert.equal(entry.authEntryPreference(malformed), "sign-up");
  assert.equal(entry.authEntryPreference(null, true), "sign-in");
});

test("keyboard reveal keeps visible controls still and moves only enough for a field or a long error", () => {
  assert.equal(layout.authFieldScrollOffset({ y: 100, height: 52 }, 300, 0), 0);
  assert.equal(layout.authFieldScrollOffset({ y: 240, height: 60 }, 300, 0), 12);
  assert.equal(layout.authFieldScrollOffset({ y: 250, height: 150 }, 180, 0), 232);
  assert.equal(layout.authFieldScrollOffset({ y: 60, height: 60 }, 300, 100), 48);
  assert.equal(layout.authFieldScrollOffset(undefined, 300, 80), 80);
});

test("auth form preserves iOS avoidance and includes its centered position when revealing a control", async () => {
  for (const os of ["android", "ios"]) {
    const moves = [], animations = [];
    const Frame = load("src/components/AuthFormFrame.tsx", mocksFor({ os, animations })).default;
    let renderer;
    await act(async () => { renderer = create(React.createElement(Frame, { title: "Welcome back", description: "A small step.", transitionKey: "sign-in", hero: React.createElement("Portrait") },
      ({ compact, tight, focus, layout: place }) => React.createElement("View", { testID: "field", compact, tight,
        onLayout: event => place("email", event) }, React.createElement("Input", { onFocus: () => focus("email") }))), {
      createNodeMock: element => element.type === "Scroll" ? { scrollTo: move => moves.push(move) } : null,
    }); });
    try {
      const area = renderer.root.findByType("KeyboardArea");
      assert.equal(area.props.enabled, os === "ios");
      assert.equal(area.props.behavior, os === "ios" ? "padding" : undefined);
      const scroll = renderer.root.findByType("Scroll");
      assert.equal(scroll.props.automaticallyAdjustKeyboardInsets, false);
      assert.equal(scroll.props.keyboardShouldPersistTaps, "handled");
      assert.equal(scroll.props.contentContainerStyle.justifyContent, "center");
      moves.length = 0;
      await act(async () => {
        scroll.props.onLayout({ nativeEvent: { layout: { height: 340 } } });
        renderer.root.findByType("Animated").props.onLayout({ nativeEvent: { layout: { y: 40 } } });
        renderer.root.findAllByType("View").find(node => node.props.testID === "field").props.onLayout({ nativeEvent: { layout: { y: 250, height: 60 } } });
        renderer.root.findByType("Input").props.onFocus();
      });
      assert.equal(moves.at(-1).y, 22);
      assert.equal(scroll.props.contentContainerStyle.paddingBottom, 50);
      assert.equal(renderer.root.findAllByType("Portrait").length, 0);
      assert.equal(renderer.root.findAllByType("View").find(node => node.props.testID === "field").props.tight, true);
      assert.equal(animations.length, 0);
    } finally { await act(async () => renderer.unmount()); }
  }
});

test("keyboard overlap handles full overlay, native resize and partial resize without double subtraction", () => {
  assert.equal(layout.authKeyboardOverlap(24, 776, 500), 300);
  assert.equal(layout.authKeyboardOverlap(24, 476, 500), 0);
  assert.equal(layout.authKeyboardOverlap(24, 576, 500), 100);
  assert.equal(layout.authKeyboardOverlap(24, 776, undefined), 0);
  assert.equal(layout.authKeyboardOverlap(24, 776, 900), 0);
  assert.equal(layout.authKeyboardOverlap(24, 776, 0), 776);
  assert.equal(layout.authKeyboardOverlap(24, 776, NaN), 0);
});

async function keyboardForm({ metrics, delayed = false } = {}) {
  const events = new Map(), removed = [], measures = [], moves = [];
  let geometry = { y: 24, height: 776 };
  const mocks = mocksFor();
  mocks["react-native"].Keyboard = {
    metrics: () => metrics, dismiss() {},
    addListener(name, callback) { events.set(name, callback); return { remove() { removed.push(name); events.delete(name); } }; },
  };
  const Frame = load("src/components/AuthFormFrame.tsx", mocks).default;
  const make = key => React.createElement(Frame, { title: "Account", transitionKey: key, hero: React.createElement("Portrait") },
    ({ focus, layout: place }) => React.createElement("View", { testID: "field", onLayout: event => place("password", event) },
      React.createElement("Input", { onFocus: () => focus("password") })));
  let renderer;
  await act(async () => { renderer = create(make("sign-up"), { createNodeMock: element => {
    if (element.type === "Scroll") return { scrollTo: move => moves.push(move) };
    if (element.props.testID === "auth-keyboard-host") return { measureInWindow: callback => {
      if (delayed) measures.push(callback); else callback(0, geometry.y, 360, geometry.height);
    } };
    return null;
  } }); });
  const emit = async (name, screenY = 500, height = 300) => act(async () => events.get(name)?.({ endCoordinates: { screenY, height } }));
  const node = id => renderer.root.findAllByType("View").find(item => item.props.testID === id);
  return { renderer, emit, node, measures, moves, events, removed, make,
    geometry: value => { geometry = value; },
    cleanup: async () => act(async () => renderer.unmount()) };
}

test("Android overlay makes room for a keyboard even when the window never resizes", async () => {
  const ui = await keyboardForm();
  try {
    const scroll = ui.renderer.root.findByType("Scroll");
    await act(async () => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 776 } } });
      ui.node("auth-fields").props.onLayout({ nativeEvent: { layout: { y: 100 } } });
      ui.node("field").props.onLayout({ nativeEvent: { layout: { y: 430, height: 60 } } });
      ui.renderer.root.findByType("Input").props.onFocus();
    });
    await ui.emit("keyboardDidShow");
    assert.equal(ui.node("auth-keyboard-inset").props.style.paddingBottom, 300);
    assert.equal(ui.renderer.root.findAllByType("Portrait").length, 0);
    await act(async () => scroll.props.onLayout({ nativeEvent: { layout: { height: 476 } } }));
    assert.equal(ui.moves.at(-1).y, 126);
    assert.equal(scroll.props.contentContainerStyle.justifyContent, "flex-start");
    assert.equal(scroll.props.contentContainerStyle.paddingBottom, 16);
    await ui.emit("keyboardDidShow", 440, 360);
    assert.equal(ui.node("auth-keyboard-inset").props.style.paddingBottom, 360);
    // Changing our child layout must not measure the shortened child and undo the inset.
    await act(async () => ui.node("auth-keyboard-host").props.onLayout());
    assert.equal(ui.node("auth-keyboard-inset").props.style.paddingBottom, 360);
    await ui.emit("keyboardDidHide");
    assert.equal(ui.node("auth-keyboard-inset").props.style.paddingBottom, 0);
    assert.equal(ui.moves.at(-1).y, 0);
  } finally { await ui.cleanup(); }
  assert.equal(ui.events.size, 0);
});

test("native resize removes only the remaining overlay, including a keyboard visible at mount", async () => {
  const ui = await keyboardForm({ metrics: { screenY: 500, height: 300 } });
  try {
    assert.equal(ui.node("auth-keyboard-inset").props.style.paddingBottom, 300);
    ui.geometry({ y: 24, height: 576 });
    await act(async () => ui.node("auth-keyboard-host").props.onLayout());
    assert.equal(ui.node("auth-keyboard-inset").props.style.paddingBottom, 100);
    ui.geometry({ y: 24, height: 476 });
    await act(async () => ui.node("auth-keyboard-host").props.onLayout());
    assert.equal(ui.node("auth-keyboard-inset").props.style.paddingBottom, 0);
  } finally { await ui.cleanup(); }
});

test("hide and unmount invalidate pending native keyboard measurements", async () => {
  const ui = await keyboardForm({ delayed: true });
  await ui.emit("keyboardDidShow");
  const oldShow = ui.measures.at(-1);
  await ui.emit("keyboardDidHide");
  await act(async () => oldShow(0, 24, 360, 776));
  assert.equal(ui.node("auth-keyboard-inset").props.style.paddingBottom, 0);
  await ui.emit("keyboardDidShow");
  const oldHeight = ui.measures.at(-1);
  await ui.emit("keyboardDidShow", 440, 360);
  await act(async () => ui.measures.at(-1)(0, 24, 360, 776));
  await act(async () => oldHeight(0, 24, 360, 776));
  assert.equal(ui.node("auth-keyboard-inset").props.style.paddingBottom, 360);
  await ui.emit("keyboardDidShow");
  const afterUnmount = ui.measures.at(-1);
  await ui.cleanup();
  assert.doesNotThrow(() => afterUnmount(0, 24, 360, 776));
  assert.equal(ui.events.size, 0);
});

test("switching forms keeps field geometry available when native fields do not re-layout", async () => {
  const ui = await keyboardForm();
  try {
    const scroll = ui.renderer.root.findByType("Scroll");
    await act(async () => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 220 } } });
      ui.node("auth-fields").props.onLayout({ nativeEvent: { layout: { y: 90 } } });
      ui.node("field").props.onLayout({ nativeEvent: { layout: { y: 130, height: 60 } } });
      ui.renderer.update(ui.make("sign-in"));
    });
    await act(async () => ui.renderer.root.findByType("Input").props.onFocus());
    assert.equal(ui.moves.at(-1).y, 72);
    ui.moves.length = 0;
    await act(async () => scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 120 } } }));
    assert.equal(ui.moves.length, 0);
  } finally { await ui.cleanup(); }
});

test("auth and reset forms animate their changed screen once and respect Reduce Motion", async () => {
  for (const reduced of [false, true]) {
    const animations = [];
    const Frame = load("src/components/AuthFormFrame.tsx", mocksFor({ reduced, animations })).default;
    const make = transitionKey => React.createElement(Frame, { title: "Account", transitionKey }, () => React.createElement("Input"));
    let renderer;
    await act(async () => { renderer = create(make("sign-up")); });
    try {
      await act(async () => renderer.update(make("sign-in")));
      await act(async () => renderer.update(make("request-recovery")));
      assert.equal(animations.length, reduced ? 0 : 3);
      for (const animation of animations) { assert.equal(animation.useNativeDriver, true); assert.equal(animation.duration, 230); }
      if (reduced) assert.equal(renderer.root.findByType("Animated").props.style.opacity, 1);
    } finally { await act(async () => renderer.unmount()); }
  }
});

test("web account forms mount without the native-only Keyboard.metrics API", async () => {
  const mocks = mocksFor({ os: "web" });
  mocks["react-native"].Keyboard = { dismiss() {}, addListener: () => ({ remove() {} }) };
  const Frame = load("src/components/AuthFormFrame.tsx", mocks).default;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Frame, { title: "Account", transitionKey: "sign-in" }, () => React.createElement("Input"))); });
  try { assert.match(text(renderer.root), /Account/); }
  finally { await act(async () => renderer.unmount()); }
});

test("Create account can switch to Sign in and reset without losing drafts or using the wrong auth action", async () => {
  const calls = [];
  const Screen = load("src/components/AuthScreen.tsx", { ...mocksFor(),
    "../context/AuthContext": { useAuth: () => ({ recovery: "none",
      signUp: async (email, password) => { calls.push(["sign-up", email, password]); return { error: null, needsEmailConfirmation: true }; },
      signIn: async (email, password) => { calls.push(["sign-in", email, password]); return { error: null }; },
    }) },
  }).default;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Screen, { initialMode: "sign-up" })); });
  const button = title => renderer.root.findAllByType("Button").find(node => node.props.title === title || text(node) === title);
  const input = label => renderer.root.findAllByType("Input").find(node => node.props.accessibilityLabel === label);
  try {
    assert.ok(button("Create account"));
    assert.equal(button("Forgot password?"), undefined);
    await act(async () => { input("Email").props.onChangeText(" hero@example.com "); input("Password").props.onChangeText("draft-password"); });
    await act(async () => button("Already have an account? Sign in").props.onPress());
    assert.equal(input("Email").props.value, " hero@example.com ");
    assert.equal(input("Password").props.value, "draft-password");
    await act(async () => button("Forgot password?").props.onPress());
    assert.match(text(renderer.root), /Reset your password/);
    await act(async () => button("Return to sign in").props.onPress());
    assert.equal(input("Password").props.value, "draft-password");
    await act(async () => button("Sign in").props.onPress());
    assert.deepEqual(calls, [["sign-in", "hero@example.com", "draft-password"]]);
    await act(async () => button("New here? Create an account").props.onPress());
    await act(async () => button("Create account").props.onPress());
    assert.equal(calls[1][0], "sign-up");
    assert.equal(input("Password").props.value, "");
    assert.match(text(renderer.root), /If registration can be completed/);
  } finally { await act(async () => renderer.unmount()); }
});
