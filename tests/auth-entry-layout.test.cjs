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
  Platform: { OS: "android" }, Keyboard: { dismiss() {} },
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

test("auth form uses native Android resize once, centers short forms, and includes its centered position when revealing a control", async () => {
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
      assert.equal(scroll.props.contentContainerStyle.paddingBottom, 16);
      assert.equal(renderer.root.findAllByType("Portrait").length, 0);
      assert.equal(renderer.root.findAllByType("View").find(node => node.props.testID === "field").props.tight, true);
      assert.equal(animations.length, 0);
    } finally { await act(async () => renderer.unmount()); }
  }
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
