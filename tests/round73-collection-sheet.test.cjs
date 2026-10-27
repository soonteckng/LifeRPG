/* global __dirname */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, "..");
const host = type => function Host(props) { return React.createElement(type, props, props.children); };

function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", source)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const resolved = [".ts", ".tsx"].map(ext => target + ext).find(fs.existsSync);
    return load(path.relative(root, resolved), mocks, cache);
  }, module, module.exports);
  return module.exports;
}

async function render(options = {}, dimensions = { width: 390, height: 844, fontScale: 1 }) {
  const taps = [], close = [], retries = [];
  class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } stopAnimation() {} }
  const native = { View: host("View"), Pressable: host("Button"), StyleSheet: { create: value => value }, useWindowDimensions: () => dimensions,
    Animated: { Value, createAnimatedComponent: value => value, spring: () => ({ start() {} }) } };
  function Sheet(props) {
    return React.createElement("Sheet", props, props.visible && React.createElement(React.Fragment, null, props.header, props.children, props.footer));
  }
  const Component = load("src/components/rewards/RewardCollectionSheet.tsx", {
    "react-native": native, "@gorhom/bottom-sheet": { BottomSheetScrollView: host("Scroll") },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    "../AppSheet": Sheet, "../SheetHeader": props => React.createElement("Header", props),
    "../AppText": { Text: host("Text") }, "../adventurer/ItemArt": host("Art"),
    "../hooks/useReducedMotion": { useReducedMotion: () => false },
    "../utils/tapHaptics": { tapHaptic: () => taps.push("tap"), tapHapticsEnabled: () => true },
  }).default;
  let props = { visible: true, onClose: () => close.push("close"), owned: [], ready: true, loading: false, error: null, online: true,
    onRetry: () => retries.push("retry"), checking: false, retryDisabled: false, ...options };
  let tree; await act(async () => { tree = create(React.createElement(Component, props)); });
  const texts = () => tree.root.findAllByType("Text").map(node => [].concat(node.props.children).join("")).join(" ");
  const byId = id => tree.root.findAll(node => typeof node.type === "string" && node.props.testID === id);
  return { tree, texts, byId, taps, close, retries,
    async update(next) { props = { ...props, ...next }; await act(async () => tree.update(React.createElement(Component, props))); },
    async unmount() { await act(async () => tree.unmount()); } };
}

test("Collection shows actual owned decorations once, with clear ownership and no outfit or purchase controls", async () => {
  const view = await render({ owned: ["decor_easel", "decor_easel", "decor_bonsai", "field_jacket", "unknown_decor"] });
  assert.deepEqual(view.tree.root.findAllByType("Art").map(node => node.props.id), ["decor_easel", "decor_bonsai"]);
  assert.equal(view.byId("collection-count")[0].props.accessibilityLabel, "2 of 7 camp decorations owned");
  assert.match(view.texts(), /Easel Common Owned Bonsai Uncommon Owned/);
  assert.deepEqual(view.tree.root.findAllByType("Button").map(node => node.props.testID), ["collection-done"]);
  for (const id of ["decor_easel", "decor_bonsai"]) {
    const tile = view.byId(`collection-item-${id}`)[0];
    assert.equal(tile.props.accessible, true); assert.match(tile.props.accessibilityLabel, /owned$/);
    assert.equal(tile.props.onPress, undefined, "read-only keepsakes have no mutation callback");
  }
  await view.unmount();
});

for (const online of [true, false]) test(`unknown inventory never pretends the collection is empty (${online ? "online" : "offline"})`, async () => {
  const view = await render({ ready: false, online, owned: ["decor_easel"] });
  assert.equal(view.byId("collection-empty").length, 0);
  assert.equal(view.byId("collection-count").length, 0);
  assert.equal(view.tree.root.findAllByType("Art").length, 0);
  assert.match(view.texts(), online ? /unavailable right now/ : /Connect to load/);
  assert.equal(view.byId("collection-retry").length, online ? 1 : 0);
  await view.unmount();
});

test("known empty inventory explains where keepsakes appear", async () => {
  const view = await render();
  assert.equal(view.byId("collection-empty").length, 1);
  assert.equal(view.byId("collection-count")[0].props.accessibilityLabel, "0 of 7 camp decorations owned");
  assert.match(view.texts(), /Your first keepsake is ahead.*finds and supply packs/);
  await view.unmount();
});

test("offline and failed refreshes retain the existing collection without displaying raw errors", async () => {
  const view = await render({ online: false, owned: ["decor_easel"], error: "private server error" });
  assert.match(view.texts(), /saved on this phone/); assert.match(view.texts(), /Easel/);
  assert.doesNotMatch(view.texts(), /private server error/);
  assert.equal(view.byId("collection-retry").length, 0);
  await view.update({ online: true });
  assert.match(view.texts(), /Showing your saved collection/); assert.match(view.texts(), /Easel/);
  assert.equal(view.byId("collection-retry").length, 1);
  await view.update({ error: null });
  assert.equal(view.byId("collection-status").length, 0);
  await view.unmount();
});

test("retry uses the supplied guarded callback, disables in flight and honours cooldown", async () => {
  const view = await render({ ready: false });
  let retry = view.byId("collection-retry")[0];
  assert.equal(retry.props.accessibilityRole, "button"); assert.equal(retry.props.accessibilityLabel, "Retry loading your collection");
  await act(async () => retry.props.onPress({}));
  assert.deepEqual(view.retries, ["retry"]); assert.deepEqual(view.taps, ["tap"]);
  await view.update({ checking: true, retryDisabled: true });
  retry = view.byId("collection-retry")[0];
  assert.equal(retry.props.disabled, true); assert.deepEqual(retry.props.accessibilityState, { disabled: true, busy: true });
  assert.match(view.texts(), /Checking…/);
  await view.update({ checking: false, retryDisabled: true });
  assert.equal(view.byId("collection-retry")[0].props.disabled, true, "guarded retry cooldown is not bypassed");
  await view.unmount();
});

test("Done is accessible, has a stable testID and invokes normal close with haptic feedback", async () => {
  const view = await render({ owned: ["decor_easel"] });
  const done = view.byId("collection-done")[0];
  assert.equal(done.props.accessibilityRole, "button"); assert.equal(done.props.accessibilityLabel, "Close collection");
  await act(async () => done.props.onPress({}));
  assert.deepEqual(view.close, ["close"]); assert.deepEqual(view.taps, ["tap"]);
  const sheet = view.tree.root.findByType("Sheet");
  assert.equal(sheet.props.expanded, true); assert.equal(sheet.props.motionMode, "timed");
  assert.equal(sheet.props.label, "collection");
  assert.equal(view.byId("collection-scroll")[0].props.enableFooterMarginAdjustment, true);
  await view.unmount();
});

test("a closed Collection keeps the shared sheet lifecycle and mounts no artwork", async () => {
  const view = await render({ visible: false, owned: ["decor_easel"] });
  assert.equal(view.tree.root.findAllByType("Art").length, 0);
  assert.equal(view.tree.root.findByType("Sheet").props.visible, false);
  await view.update({ visible: true });
  assert.deepEqual(view.tree.root.findAllByType("Art").map(node => node.props.id), ["decor_easel"]);
  await view.update({ visible: false });
  assert.equal(view.tree.root.findByType("Sheet").props.visible, false, "the shared sheet owns its exit animation");
  await view.unmount();
});

for (const dimensions of [{ width: 360, height: 640, fontScale: 1 }, { width: 360, height: 640, fontScale: 1.8 }, { width: 412, height: 915, fontScale: 1.8 }])
  test(`Collection uses readable single-column tiles at ${dimensions.width}px and text scale ${dimensions.fontScale}`, async () => {
    const view = await render({ owned: ["decor_reading_nook", "decor_herb_garden"] }, dimensions);
    for (const id of ["decor_reading_nook", "decor_herb_garden"]) {
      const style = Object.assign({}, ...view.byId(`collection-item-${id}`)[0].props.style);
      assert.equal(style.width, "100%"); assert.equal(style.flexDirection, "row");
      assert.equal(style.height, undefined, "text can grow without a fixed card height");
    }
    await view.unmount();
  });

test("normal two-column layouts keep an odd last tile the same width", async () => {
  const view = await render({ owned: ["decor_easel", "decor_bonsai", "decor_reading_nook"] });
  const widths = ["decor_easel", "decor_bonsai", "decor_reading_nook"].map(id => {
    const style = Object.assign({}, ...view.byId(`collection-item-${id}`)[0].props.style);
    assert.equal(style.flexGrow, undefined, "an orphan does not stretch across the row");
    return style.width;
  });
  assert.deepEqual(widths, ["48%", "48%", "48%"]);
  await view.unmount();
});

test("changing owner inventory replaces the visible keepsakes immediately", async () => {
  const view = await render({ owned: ["decor_easel"] });
  await view.update({ owned: [], ready: false });
  assert.equal(view.tree.root.findAllByType("Art").length, 0);
  assert.equal(view.byId("collection-count").length, 0);
  await view.update({ owned: ["decor_hammock"], ready: true });
  assert.deepEqual(view.tree.root.findAllByType("Art").map(node => node.props.id), ["decor_hammock"]);
  await view.unmount();
});
