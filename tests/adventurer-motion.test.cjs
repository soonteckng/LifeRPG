/* global __dirname */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;

const host = type => function Host(props) { return React.createElement(type, props, props.children); };

test("the adventurer cancels breathing and SVG blinks on frozen-route blur and app background", async t => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const navigationListeners = new Map(), appListeners = new Set();
  let focused = false, reduced = false, animate = true;
  const native = { View: host("View"), AppState: { currentState: "active", addEventListener: (_event, listener) => {
    appListeners.add(listener); return { remove: () => appListeners.delete(listener) };
  } } };
  const navigation = { isFocused: () => focused, addListener: (event, listener) => {
    navigationListeners.set(event, listener); return () => navigationListeners.delete(event);
  } };
  const NavigationContext = React.createContext(undefined);
  const fake = require("./character-motion-mocks.cjs").motionApi(React, host);
  const useValue = fake.api.useSharedValue;
  fake.api.useSharedValue = function useSharedValue(initial) {
    const value = useValue(initial);
    if (!Object.hasOwn(value, "value")) Object.defineProperty(value, "value", { get: () => value.get(), set: next => value.set(next) });
    return value;
  };
  const mocks = {
    "react-native": native, "expo-router/react-navigation": { NavigationContext }, "react-native-reanimated": fake.api,
    "./AdventurerArt": host("Art"), "./ItemArt": host("Item"), "../../hooks/useReducedMotion": { useReducedMotion: () => reduced },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../src/components/adventurer/Adventurer.tsx"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports);
  const Adventurer = module.exports.default;
  const look = { skin: "3", hair: "short", hairColor: "darkbrown", glasses: false };
  const element = () => React.createElement(NavigationContext.Provider, { value: navigation }, React.createElement(Adventurer, { look, size: 120, animate }));
  const repeats = () => fake.events.filter(event => event.kind === "repeat").length;
  let renderer;
  await act(async () => { renderer = create(element()); });
  const blink = () => renderer.root.findByType("Art").props.eyesClosed;
  const tick = async ms => act(async () => t.mock.timers.tick(ms));
  const visit = async on => act(async () => { focused = on; navigationListeners.get(on ? "focus" : "blur")?.(); });
  const app = async state => act(async () => {
    native.AppState.currentState = state;
    for (const listener of appListeners) listener(state);
  });
  try {
    assert.equal(repeats(), 0, "a retained but hidden route starts no motion");
    await visit(true);
    assert.equal(repeats(), 1);
    await tick(4800); assert.equal(blink(), true);
    await visit(false); assert.equal(blink(), false, "a blur during a blink resets the face immediately");
    assert.equal(fake.values[0].get(), 0);
    await tick(10000); assert.equal(blink(), false);
    await app("background"); await app("active");
    assert.equal(repeats(), 1, "resuming the app does not animate a hidden route");
    await visit(true); assert.equal(repeats(), 2);
    await tick(4800); assert.equal(blink(), true);
    await tick(140); assert.equal(blink(), false, "the original blink duration is preserved");
    await app("background");
    await tick(10000); assert.equal(blink(), false);
    assert.equal(fake.values[0].get(), 0);
    await app("active"); assert.equal(repeats(), 3);
    reduced = true;
    await act(async () => renderer.update(element()));
    await tick(10000); assert.equal(blink(), false);
    assert.equal(repeats(), 3, "Reduce Motion stops both idle loops");
    assert.equal(navigationListeners.size + appListeners.size, 0);
    reduced = false; animate = false;
    await act(async () => renderer.update(element()));
    assert.equal(repeats(), 3, "static previews remain static");
  } finally {
    await act(async () => renderer.unmount());
    assert.equal(navigationListeners.size + appListeners.size, 0);
  }
});
