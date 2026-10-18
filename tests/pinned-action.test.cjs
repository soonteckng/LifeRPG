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

test("each tab keeps its own pinned slot, so the tab bar shows the button for the tab on screen", async () => {
  const Start = ({ route, label }) => React.createElement(pinned.PinnedRoute, { name: route },
    React.createElement(pinned.PinnedAction, null, React.createElement(Button, { label })));
  const seen = {};
  function Presence({ route }) { seen[route] = pinned.usePinnedActionPresent(route); return null; }
  const tree = showStudy => React.createElement(pinned.PinnedActionProvider, null,
    React.createElement(Start, { route: "routines", label: "Start quick focus" }),
    showStudy ? React.createElement(Start, { route: "study", label: "Start studying" }) : null,
    React.createElement("RoutinesDock", null, React.createElement(pinned.PinnedActionHost, { route: "routines" })),
    React.createElement("StudyDock", null, React.createElement(pinned.PinnedActionHost, { route: "study" })),
    React.createElement("HomeDock", null, React.createElement(pinned.PinnedActionHost, { route: "index" })),
    React.createElement(Presence, { route: "routines" }), React.createElement(Presence, { route: "study" }), React.createElement(Presence, { route: "index" }));
  let ui;
  await act(async () => { ui = create(tree(true)); });
  assert.equal(ui.root.findByType("RoutinesDock").findByType(Button).props.label, "Start quick focus");
  assert.equal(ui.root.findByType("StudyDock").findByType(Button).props.label, "Start studying");
  assert.equal(ui.root.findByType("HomeDock").findAllByType(Button).length, 0, "Home pins nothing of its own");
  assert.deepEqual(seen, { routines: true, study: true, index: false });
  await act(async () => ui.update(tree(false)));
  assert.equal(ui.root.findByType("StudyDock").findAllByType(Button).length, 0, "leaving Study empties only its slot");
  assert.equal(ui.root.findByType("RoutinesDock").findByType(Button).props.label, "Start quick focus");
  assert.deepEqual(seen, { routines: true, study: false, index: false });
  await act(async () => ui.unmount());
});
