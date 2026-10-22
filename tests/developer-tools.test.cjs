/* global __dirname */
// Developer tools: only the server's yes shows them, and previews never save.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const resolved = [".ts", ".tsx", "/index.ts"].map(ext => target + ext).find(fs.existsSync);
    return load(path.relative(path.resolve(__dirname, ".."), resolved), mocks, cache);
  }, mod, mod.exports);
  return mod.exports;
}
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

function access(rpc) {
  const calls = [];
  const mod = load("src/services/developerAccess.ts", { "../../lib/supabase": { supabase: { rpc: async name => { calls.push(name); return rpc(); } } } });
  return { mod, calls };
}

test("developer access is a clear server yes, asked once per account", async () => {
  const yes = access(() => ({ data: true, error: null }));
  assert.equal(await yes.mod.isDeveloper("dev"), true);
  assert.equal(await yes.mod.isDeveloper("dev"), true);
  assert.deepEqual(yes.calls, ["is_developer_v1"]);
  assert.equal(await yes.mod.isDeveloper(""), false);
  for (const reply of [() => ({ data: false, error: null }), () => ({ data: null, error: { message: "nope" } }), () => ({ data: "true", error: null }), () => { throw Error("offline"); }]) {
    const { mod } = access(reply);
    assert.equal(await mod.isDeveloper("someone"), false);
  }
  // A failed answer is not remembered, so the next try can still succeed.
  let fail = true;
  const retry = access(() => fail ? { data: null, error: { message: "down" } } : { data: true, error: null });
  assert.equal(await retry.mod.isDeveloper("dev"), false);
  fail = false;
  assert.equal(await retry.mod.isDeveloper("dev"), true);
});

async function tools({ developer = true, online = true } = {}) {
  const sheets = [];
  const Tools = load("src/components/DeveloperTools.tsx", {
    "react-native": { Modal: host("Modal") },
    "./SettingsList": { SettingsGroup: host("Group"), SettingsRow: props => React.createElement("Row", props) },
    "./SessionResultSheet": props => { sheets.push(props); return React.createElement("Result", props); },
    "./SessionSavingOverlay": host("Saving"),
    "../context/UserContext": { useUser: () => ({ profile: { id: "dev", level: 4, current_xp: 30 } }) },
    "../context/AuthContext": { useAuth: () => ({ accessMode: online ? "online" : "offline" }) },
    "../services/developerAccess": { useIsDeveloper: (owner, isOnline) => developer && owner === "dev" && isOnline },
  }).default;
  let renderer; await act(async () => { renderer = create(React.createElement(Tools)); });
  const row = title => renderer.root.findAllByType("Row").find(node => node.props.title === title);
  return { renderer, sheets, row, press: async title => act(async () => row(title).props.onPress()),
    result: () => renderer.root.findAllByType("Result")[0], cleanup: () => act(async () => renderer.unmount()) };
}

test("the Developer section is hidden from everyone else and while offline", async () => {
  for (const options of [{ developer: false }, { online: false }]) {
    const ui = await tools(options);
    try { assert.equal(ui.renderer.root.findAllByType("Group").length, 0); assert.equal(ui.renderer.root.findAllByType("Row").length, 0); } finally { await ui.cleanup(); }
  }
});

test("each preview opens a card marked as a preview, and Done closes it", async () => {
  const ui = await tools();
  try {
    assert.deepEqual(ui.renderer.root.findAllByType("Row").map(node => node.props.title),
      ["Preview level up", "Preview session complete", "Preview earlier session saved", "Preview saving screen"]);
    assert.equal(ui.result(), undefined);
    await ui.press("Preview level up");
    let card = ui.result().props;
    assert.equal(card.preview, true); assert.equal(card.visible, true);
    assert.equal(card.isLevelUp, true); assert.equal(card.newLevel, 5); assert.equal(card.recovered, false);
    assert.equal(card.saveAction, undefined);
    await act(async () => card.onClose());
    assert.equal(ui.result().props.visible, false);
    await act(async () => ui.result().props.onDismiss());
    assert.equal(ui.result(), undefined);
    await ui.press("Preview session complete");
    card = ui.result().props;
    assert.equal(card.isLevelUp, false); assert.equal(card.newLevel, 4); assert.equal(card.recovered, false); assert.equal(card.preview, true);
    await act(async () => card.onDismiss());
    await ui.press("Preview earlier session saved");
    assert.equal(ui.result().props.recovered, true); assert.equal(ui.result().props.preview, true);
  } finally { await ui.cleanup(); }
});

test("the saving preview shows the saving screen for a few seconds, then goes", async () => {
  const realSet = global.setTimeout; const timers = [];
  const ui = await tools();
  try {
    global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
    await ui.press("Preview saving screen");
    assert.equal(ui.renderer.root.findByType("Modal").props.visible, true);
    assert.equal(ui.renderer.root.findByType("Saving").props.visible, true);
    const timer = timers.find(item => item.ms === 3000); assert.ok(timer);
    global.setTimeout = realSet;
    await act(async () => timer.fn());
    assert.equal(ui.renderer.root.findByType("Modal").props.visible, false);
  } finally { global.setTimeout = realSet; await ui.cleanup(); }
});

test("the server check exists only for signed-in accounts and is in a migration", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../supabase/migrations/20261022120000_developer_accounts.sql"), "utf8");
  assert.match(sql, /function public\.is_developer_v1\(\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /revoke all on function public\.is_developer_v1\(\) from public, anon/);
  assert.match(sql, /grant execute on function public\.is_developer_v1\(\) to authenticated/);
  assert.doesNotMatch(sql, /insert into/i, "accounts are added by hand, never by a migration");
});
