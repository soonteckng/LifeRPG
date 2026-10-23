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
  const calls = [], removed = [];
  const mod = load("src/services/developerAccess.ts", {
    "../../lib/supabase": { supabase: { rpc: async name => { calls.push(name); return rpc(name); } } },
    "@react-native-async-storage/async-storage": { removeItem: async key => { removed.push(key); } },
  });
  return { mod, calls, removed };
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

test("restarting the intro asks the server, then clears this phone's welcome mark", async () => {
  const ok = access(() => ({ data: true, error: null }));
  assert.equal(await ok.mod.restartIntro("dev"), true);
  assert.deepEqual(ok.calls, ["dev_restart_intro_v1"]);
  assert.deepEqual(ok.removed, ["liferpg:welcome:v1:dev"]);
  for (const reply of [() => ({ data: null, error: { code: "42501" } }), () => ({ data: false, error: null }), () => { throw Error("offline"); }]) {
    const refused = access(reply);
    assert.equal(await refused.mod.restartIntro("someone"), false);
    assert.deepEqual(refused.removed, [], "nothing on the phone changes when the server says no");
  }
  const none = access(() => ({ data: true, error: null }));
  assert.equal(await none.mod.restartIntro(""), false); assert.deepEqual(none.calls, []);
});

async function tools({ developer = true, online = true, session = false, restart = async () => true, reload = async () => true, rewardReply = {} } = {}) {
  const sheets = [], log = [], loads = [];
  const state = { stardust: 40, nextFindSeconds: 600 };
  // The same rewards hook every screen uses; each action is logged.
  const rewards = {
    stardust: 40, busy: false,
    claimSessions: async () => { log.push("claim"); return rewardReply.claim ?? { ok: true, value: { sessions: [], milestones: [], state } }; },
    openPack: async () => { log.push("pack"); return rewardReply.pack ?? { ok: false, message: "Reach your daily goal to open a pack." }; },
    developer: async (action, amount) => { log.push(`dev:${action}:${amount}`); return rewardReply.dev ?? { ok: true, value: state }; },
  };
  const Tools = load("src/components/DeveloperTools.tsx", {
    "react-native": { Modal: host("Modal") },
    "./SettingsList": { SettingsGroup: host("Group"), SettingsRow: props => React.createElement("Row", props) },
    "./SessionResultSheet": props => { sheets.push(props); return React.createElement("Result", props); },
    "./SessionSavingOverlay": host("Saving"),
    "./SheetConfirmation": props => React.createElement("Confirm", props),
    "./FeatureTour": { useFeatureTour: () => ({ start: () => log.push("tour") }) },
    "../context/TimerContext": { useTimer: () => ({ hasOpenSession: session }) },
    "../context/UserContext": { useUser: () => ({ profile: { id: "dev", level: 4, current_xp: 30 }, reloadProfile: async () => { log.push("reload"); return reload(); } }) },
    "../context/AuthContext": { useAuth: () => ({ accessMode: online ? "online" : "offline" }) },
    "../services/developerAccess": { useIsDeveloper: (owner, isOnline) => developer && owner === "dev" && isOnline,
      restartIntro: async owner => { log.push(`restart:${owner}`); return restart(); } },
    "expo-router": { useRouter: () => ({ navigate: to => log.push(`go:${to}`) }) },
    "../hooks/useRewards": { useRewards: ({ load }) => { loads.push(load); return rewards; } },
  }).default;
  let renderer; await act(async () => { renderer = create(React.createElement(Tools)); });
  const row = title => renderer.root.findAllByType("Row").find(node => node.props.title === title);
  return { renderer, sheets, row, log, loads, confirm: () => renderer.root.findAllByType("Confirm")[0], group: () => renderer.root.findAllByType("Group")[0], groups: () => renderer.root.findAllByType("Group"), press: async title => act(async () => row(title).props.onPress()),
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
      ["Preview level up", "Preview session complete", "Preview earlier session saved", "Preview saving screen", "Replay the guide", "Restart the intro",
        "Open Outfits", "Check for new finds", "Open today's pack", "Add 500 test Stardust", "Let me open today's pack again", "Earn my pets, frames and badges again", "Reset my rewards"]);
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

test("Replay the guide starts the real tour and saves nothing", async () => {
  const ui = await tools();
  try { await ui.press("Replay the guide"); assert.deepEqual(ui.log, ["tour"]); } finally { await ui.cleanup(); }
});

test("Restart the intro asks first, then restarts and reloads the profile so the intro opens", async () => {
  const ui = await tools();
  try {
    await ui.press("Restart the intro");
    assert.ok(ui.confirm()); assert.deepEqual(ui.log, [], "nothing happens until you confirm");
    await act(async () => ui.confirm().props.onCancel());
    assert.equal(ui.confirm(), undefined);
    await ui.press("Restart the intro");
    await act(async () => { ui.confirm().props.onConfirm(); ui.confirm().props.onConfirm(); });
    await flush();
    assert.deepEqual(ui.log, ["restart:dev", "reload"], "one restart, even with a double tap");
    assert.equal(ui.confirm(), undefined);
  } finally { await ui.cleanup(); }
});

test("a refused restart explains itself and leaves you where you are", async () => {
  for (const [options, pattern] of [[{ restart: async () => false }, /Couldn't restart the intro/], [{ reload: async () => false }, /Close and reopen the app/]]) {
    const ui = await tools(options);
    try {
      await ui.press("Restart the intro");
      await act(async () => ui.confirm().props.onConfirm()); await flush();
      assert.equal(ui.confirm(), undefined);
      assert.match(ui.group().props.footer, pattern);
    } finally { await ui.cleanup(); }
  }
});

test("during a session the guide and intro wait", async () => {
  const ui = await tools({ session: true });
  try {
    assert.equal(ui.row("Replay the guide").props.disabled, true);
    assert.equal(ui.row("Restart the intro").props.disabled, true);
    assert.match(ui.group().props.footer, /Finish or end your session first/);
  } finally { await ui.cleanup(); }
});

test("only developers can restart the intro, and only the intro mark changes", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../supabase/migrations/20261022130000_developer_restart_intro.sql"), "utf8");
  assert.match(sql, /liferpg_auth_private\.developers where user_id = auth\.uid\(\)/);
  assert.match(sql, /raise exception 'Developer accounts only'/);
  assert.match(sql, /update public\.profiles set onboarding_completed = false where id = auth\.uid\(\);/);
  assert.equal((sql.match(/update /g) || []).length, 1);
  assert.doesNotMatch(sql, /delete |truncate/i);
  assert.match(sql, /revoke all on function public\.dev_restart_intro_v1\(\) from public, anon/);
});

test("the rewards rows use the real rewards actions, and the dev-only ones ask the server", async () => {
  const ui = await tools({ rewardReply: { claim: { ok: true, value: { sessions: [{ sessionId: "s", finds: [{ item: "beret", new: true, stardust: 0 }, { item: "tote", new: false, stardust: 5 }], minutesStardust: 6 }],
    milestones: [{ item: "pet_owl", new: true, stardust: 0 }], state: { nextFindSeconds: 900 } } } } });
  try {
    assert.ok(ui.loads.includes(true), "a developer's rewards load");
    await ui.press("Open Outfits");
    await ui.press("Check for new finds");
    assert.match(ui.groups()[1].props.footer, /Red beret \(new\), Canvas tote \(\+5 Stardust\).*\+6 Stardust from minutes.*Unlocked: Barn owl \(new\)/);
    await ui.press("Open today's pack");
    assert.equal(ui.groups()[1].props.footer, "Reach your daily goal to open a pack.", "the server's own reason shows");
    await ui.press("Add 500 test Stardust");
    await ui.press("Let me open today's pack again");
    // Taken back, then the same check every phone runs after a session gives them again.
    await ui.press("Earn my pets, frames and badges again");
    await ui.press("Reset my rewards");
    assert.deepEqual(ui.log.filter(x => x.startsWith("dev:")), ["dev:stardust:500", "dev:reopen_pack:0", "dev:reearn:0"], "reset waits for a yes");
    await act(async () => ui.confirm().props.onConfirm());
    assert.deepEqual(ui.log.filter(x => /^(go|claim|pack|dev)/.test(x)), ["go:/outfits", "claim", "pack", "dev:stardust:500", "dev:reopen_pack:0", "dev:reearn:0", "claim", "dev:reset:0"]);
  } finally { await ui.cleanup(); }
});

test("everyone else never loads rewards from here", async () => {
  const ui = await tools({ developer: false });
  try { assert.ok(ui.loads.every(load => load === false)); assert.equal(ui.renderer.root.findAllByType("Row").length, 0); } finally { await ui.cleanup(); }
});
