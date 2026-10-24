const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;

function setup() {
  const reads = [], events = [];
  let removes = 0;
  const native = { AccessibilityInfo: {
    isReduceMotionEnabled: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
    addEventListener: (name, callback) => {
      assert.equal(name, "reduceMotionChanged");
      const event = { callback, removed: false };
      events.push(event);
      return { remove() { event.removed = true; removes++; } };
    },
  } };
  const source = fs.readFileSync(path.resolve(__dirname, "../src/hooks/useReducedMotion.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => name === "react-native" ? native : require(name), loaded, loaded.exports);
  function Consumer({ id }) {
    const reduced = loaded.exports.useReducedMotion();
    return React.createElement("Value", { id, reduced });
  }
  const list = count => React.createElement(React.Fragment, null,
    ...Array.from({ length: count }, (_, id) => React.createElement(Consumer, { key: id, id })));
  return { reads, events, list, removes: () => removes };
}

test("many motion consumers share one native read and listener, including newly opened rows", async () => {
  const s = setup(); let tree;
  await act(async () => { tree = create(s.list(80)); });
  try {
    assert.equal(s.reads.length, 1);
    assert.equal(s.events.length, 1);
    assert.ok(tree.root.findAllByType("Value").every(n => n.props.reduced));
    await act(async () => s.reads[0].resolve(false));
    assert.ok(tree.root.findAllByType("Value").every(n => !n.props.reduced));
    await act(async () => tree.update(s.list(120)));
    assert.equal(s.reads.length, 1);
    assert.equal(s.events.length, 1);
    assert.ok(tree.root.findAllByType("Value").every(n => !n.props.reduced));
    await act(async () => s.events[0].callback(true));
    assert.ok(tree.root.findAllByType("Value").every(n => n.props.reduced));
    await act(async () => tree.update(s.list(1)));
    assert.equal(s.removes(), 0, "the last consumer still observes the OS");
  } finally { await act(async () => tree.unmount()); }
  assert.equal(s.removes(), 1);
});

test("a slow initial accessibility read cannot overwrite a newer OS event", async () => {
  const s = setup(); let tree;
  await act(async () => { tree = create(s.list(2)); });
  try {
    await act(async () => s.events[0].callback(false));
    await act(async () => s.reads[0].resolve(true));
    assert.ok(tree.root.findAllByType("Value").every(n => !n.props.reduced));
  } finally { await act(async () => tree.unmount()); }
});

test("unmounting releases the listener and stale callbacks cannot change a later screen", async () => {
  const s = setup(); let first, second;
  await act(async () => { first = create(s.list(1)); });
  await act(async () => s.events[0].callback(false));
  await act(async () => first.unmount());
  assert.equal(s.removes(), 1);
  await act(async () => { second = create(s.list(1)); });
  try {
    assert.equal(s.reads.length, 2);
    assert.equal(second.root.findByType("Value").props.reduced, false, "keep the known setting while reading");
    await act(async () => { s.events[0].callback(true); s.reads[0].resolve(true); });
    assert.equal(second.root.findByType("Value").props.reduced, false);
    await act(async () => s.reads[1].resolve(true));
    assert.equal(second.root.findByType("Value").props.reduced, true);
  } finally { await act(async () => second.unmount()); }
  assert.equal(s.removes(), 2);
});

test("a failed initial read stays calm and future OS changes still reach every consumer", async () => {
  const s = setup(); let tree;
  await act(async () => { tree = create(s.list(3)); });
  try {
    await act(async () => s.reads[0].reject(new Error("not available")));
    assert.ok(tree.root.findAllByType("Value").every(n => n.props.reduced));
    await act(async () => s.events[0].callback(false));
    assert.ok(tree.root.findAllByType("Value").every(n => !n.props.reduced));
  } finally { await act(async () => tree.unmount()); }
});
