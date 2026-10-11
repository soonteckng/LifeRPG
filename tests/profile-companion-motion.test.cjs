/* global __dirname */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}

async function motionHarness({ focused = true, enabled = true, reduced = false, greetOnFocus = true } = {}) {
  const listeners = {}, appListeners = new Set();
  const native = { AppState: { currentState: "active", addEventListener: (_name, listener) => {
    appListeners.add(listener); return { remove: () => appListeners.delete(listener) };
  } } };
  const navigation = { isFocused: () => focused, addListener: (event, listener) => {
    listeners[event] = listener; return () => delete listeners[event];
  } };
  const context = React.createContext(undefined);
  const fake = require("./character-motion-mocks.cjs").motionApi(React, type => function MotionHost(props) { return React.createElement(type, props); });
  const useMotion = load("src/hooks/useCharacterMotion.ts", {
    "react-native": native, "expo-router/react-navigation": { NavigationContext: context },
    "react-native-reanimated": fake.api, "./useReducedMotion": { useReducedMotion: () => reduced },
  }).useCharacterMotion;
  let motion, renderer;
  function Consumer() { motion = useMotion(enabled, greetOnFocus); return null; }
  const element = () => React.createElement(context.Provider, { value: navigation }, React.createElement(Consumer));
  await act(async () => { renderer = create(element()); });
  return {
    fake,
    greetings: () => fake.events.filter(event => event.kind === "set" && event.value === fake.values[2] && event.next.kind === "delay"),
    repeats: () => fake.events.filter(event => event.kind === "repeat"),
    async focus() { focused = true; await act(async () => listeners.focus()); },
    async blur() { focused = false; await act(async () => listeners.blur()); },
    async app(state) { native.AppState.currentState = state; await act(async () => { for (const listener of appListeners) listener(state); }); },
    async update(options = {}) {
      if (Object.hasOwn(options, "enabled")) enabled = options.enabled;
      if (Object.hasOwn(options, "reduced")) reduced = options.reduced;
      await act(async () => renderer.update(element()));
    },
    async tap() { await act(async () => motion.greet()); },
    motion: () => motion,
    async cleanup() { await act(async () => renderer.unmount()); assert.equal(appListeners.size, 0); assert.equal(Object.keys(listeners).length, 0); },
  };
}

test("retained Profile greets on first and later visits without repeating on profile refresh or editor dismissal", async () => {
  const ui = await motionHarness({ focused: false });
  try {
    assert.equal(ui.greetings().length, 0);
    await ui.focus();
    assert.equal(ui.greetings().length, 1);
    assert.equal(ui.greetings()[0].next.delay, 140);
    assert.equal(ui.greetings()[0].next.animation.config.duration, 900);
    await ui.update();
    assert.equal(ui.greetings().length, 1);
    await ui.update({ enabled: false });
    await ui.update({ enabled: true });
    assert.equal(ui.greetings().length, 1, "opening and closing an editor is the same profile visit");
    await ui.blur();
    for (const [index, rest] of [[0, 0], [1, 1], [2, 0], [3, 0]]) assert.equal(ui.fake.values[index].get(), rest);
    await ui.focus();
    assert.equal(ui.greetings().length, 2);
  } finally { await ui.cleanup(); }
});

test("Profile resumes breathing and blinking after backgrounding without another entrance wave", async () => {
  const ui = await motionHarness();
  try {
    assert.equal(ui.greetings().length, 1);
    assert.equal(ui.repeats().length, 3);
    assert.equal(ui.repeats()[2].animation.items[0].animation.toValue, 2);
    assert.equal(ui.repeats()[2].animation.items[2].animation.toValue, -2);
    await ui.app("background");
    const count = ui.greetings().length;
    await ui.tap();
    assert.equal(ui.greetings().length, count);
    for (const value of ui.fake.values) assert.ok(ui.fake.events.some(event => event.kind === "cancel" && event.value === value));
    await ui.app("active");
    assert.equal(ui.greetings().length, count);
    assert.equal(ui.repeats().length, 6);
    await ui.tap();
    assert.equal(ui.greetings().length, count + 1, "tap interaction remains available");
    assert.ok(ui.motion().eyeStyle.transform.some(value => Object.hasOwn(value, "translateX")));
  } finally { await ui.cleanup(); }
});

test("Reduce Motion suppresses all greetings and idle animation, including taps and visits", async () => {
  const ui = await motionHarness({ reduced: true });
  try {
    await ui.tap();
    assert.equal(ui.greetings().length, 0);
    assert.equal(ui.repeats().length, 0);
    await ui.update({ reduced: false });
    assert.equal(ui.greetings().length, 1, "the first visible visit greets after the motion preference resolves");
    await ui.update({ reduced: true });
    await ui.tap();
    await ui.blur();
    await ui.focus();
    assert.equal(ui.greetings().length, 1);
    await ui.update({ reduced: false });
    assert.equal(ui.greetings().length, 2);
  } finally { await ui.cleanup(); }
});

test("Home portraits and editor previews keep idle motion without automatic waving", async () => {
  const ui = await motionHarness({ greetOnFocus: false });
  try {
    assert.equal(ui.greetings().length, 0);
    await ui.blur();
    await ui.focus();
    await ui.app("background");
    await ui.app("active");
    assert.equal(ui.greetings().length, 0);
    await ui.tap();
    assert.equal(ui.greetings().length, 1);
  } finally { await ui.cleanup(); }
});

test("CharacterPortrait forwards the explicit greeting option only to its own motion hook", async () => {
  const calls = [];
  const Portrait = load("src/components/CharacterPortrait.tsx", {
    "react-native": { View: props => React.createElement("View", props, props.children), Pressable: props => React.createElement("Button", props, props.children) },
    "./CharacterArt": props => React.createElement("Art", props),
    "../utils/characterAppearance": { characterLook: () => ({ title: "Starlight" }) },
    "../hooks/useCharacterMotion": { useCharacterMotion: (...args) => { calls.push(args); return { greet() {} }; } },
  }).default;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Portrait, { avatar: "⭐" })); });
  try {
    assert.deepEqual(calls.at(-1), [true, false]);
    await act(async () => renderer.update(React.createElement(Portrait, { avatar: "⭐", greetOnFocus: true })));
    assert.deepEqual(calls.at(-1), [true, true]);
  } finally { await act(async () => renderer.unmount()); }
});
