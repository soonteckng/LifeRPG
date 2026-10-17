const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { act, create } = require("react-test-renderer");

global.IS_REACT_ACT_ENVIRONMENT = true;

function load(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = name => Object.hasOwn(mocks, name) ? mocks[name] : name === "react-native"
    ? { View: props => React.createElement("View", props), StyleSheet: { create: value => value, hairlineWidth: 1 } }
    : require(name);
  new Function("require", "module", "exports", code)(localRequire, module, module.exports);
  return module.exports;
}

const pinned = load("src/components/PinnedAction.tsx");
const Button = props => React.createElement("Button", props);

test("a pinned action renders in place when no pinned slot exists", async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(pinned.PinnedAction, null, React.createElement(Button, { testID: "start" }))); });
  assert.equal(tree.root.findAllByType(Button).length, 1);
  await act(async () => tree.unmount());
});

test("a pinned action moves to the host with its handler and returns nothing in place", async () => {
  const presses = [];
  const presence = [];
  function Presence() { presence.push(pinned.usePinnedActionPresent()); return null; }
  function Screen({ label }) {
    return React.createElement("Card", null, React.createElement(pinned.PinnedAction, null, React.createElement(Button, { testID: "start", label, onPress: () => presses.push(label) })));
  }
  const tree = (label, show = true) => React.createElement(pinned.PinnedActionProvider, null,
    show ? React.createElement(Screen, { label }) : null, React.createElement("Dock", null, React.createElement(pinned.PinnedActionHost)), React.createElement(Presence));
  let ui;
  await act(async () => { ui = create(tree("Start session")); });
  const card = ui.root.findByType("Card");
  assert.equal(card.findAllByType(Button).length, 0, "the button no longer draws inside the card");
  const docked = ui.root.findByType("Dock").findByType(Button);
  assert.equal(docked.props.label, "Start session");
  await act(async () => docked.props.onPress());
  assert.deepEqual(presses, ["Start session"]);
  await act(async () => ui.update(tree("Continue session")));
  assert.equal(ui.root.findByType("Dock").findByType(Button).props.label, "Continue session", "the slot follows the latest render");
  await act(async () => ui.update(tree("Continue session", false)));
  assert.equal(ui.root.findByType("Dock").findAllByType(Button).length, 0, "the slot empties when the screen unmounts");
  assert.equal(presence.at(-1), false);
  assert.ok(presence.includes(true));
  await act(async () => ui.unmount());
});
