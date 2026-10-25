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

async function tools({ developer = true, online = true, session = false, restart = async () => true, reload = async () => true, rewardReply = {}, transport = null } = {}) {
  const sheets = [], log = [], loads = [];
  let profileOwner = "dev", admissionEpoch = 1;
  const authValue = () => ({ user: { id: profileOwner }, accessMode: online ? "online" : "offline", admissionEpoch,
    verifyCurrentOwner: async () => ({ id: profileOwner }) });
  const actualRewards = transport ? load("src/hooks/useRewards.ts", {
    "@react-native-async-storage/async-storage": { getItem: async () => null, setItem: async () => {} },
    "../context/AuthContext": { useAuth: authValue }, "../../lib/supabase": { supabase: { rpc: transport } },
  }) : null;
  let currentRewards;
  const state = { stardust: 40, nextFindSeconds: 600 };
  // The same rewards hook every screen uses; each action is logged.
  const rewards = {
    stardust: 40, busy: false,
    claimSessions: async () => { log.push("claim"); return typeof rewardReply.claim === "function" ? rewardReply.claim() : rewardReply.claim ?? { ok: true, value: { sessions: [], milestones: [], state } }; },
    openPack: async () => { log.push("pack"); return rewardReply.pack ?? { ok: false, message: "Reach your daily goal to open a pack." }; },
    showEmptyReturn: seconds => log.push(`empty:${seconds}`), trail: { findSeconds: 1500, stops: 6, complete: false },
    developer: async (action, amount, seconds) => { log.push(`dev:${action}:${amount}${seconds ? `:${seconds}` : ""}`); return rewardReply.dev ?? { ok: true, value: { state, gifts: action === "find" ? [{ item: "beret", new: true, stardust: 0 }] : [] } }; },
  };
  const Tools = load("src/components/DeveloperTools.tsx", {
    "react-native": { Modal: host("Modal"), View: host("View"), Pressable: host("Press"), StyleSheet: { create: v => v, hairlineWidth: 1 } }, "./AppText": { Text: host("Text") },
    "@expo/vector-icons": { Ionicons: host("Icon") }, "@gorhom/bottom-sheet": { BottomSheetScrollView: host("Scroll") },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "./AppSheet": props => props.visible ? React.createElement("Sheet", props, props.header, props.children) : null, "./SheetHeader": host("Header"),
    "../utils/tapHaptics": { tapHaptic: () => log.push("haptic") },
    "../constants/theme": { colors: new Proxy({}, { get: () => "#000" }), edge: {} },
    "./SettingsList": { SettingsGroup: host("Group"), SettingsRow: props => React.createElement("Row", props,
      props.status ? React.createElement("Text", { testID: `${props.testID}-status` }, props.status) : null) },
    "./SessionResultSheet": props => { sheets.push(props); return React.createElement("Result", props); },
    "./SessionSavingOverlay": host("Saving"),
    "./SheetConfirmation": props => React.createElement("Confirm", props),
    "./FeatureTour": { useFeatureTour: () => ({ start: () => log.push("tour") }) },
    "../context/TimerContext": { useTimer: () => ({ hasOpenSession: session }) },
    "../context/UserContext": { useUser: () => ({ profile: { id: profileOwner, level: 4, current_xp: 30 }, reloadProfile: async () => { log.push("reload"); return reload(); } }) },
    "../context/AuthContext": { useAuth: authValue },
    "../services/developerAccess": { useIsDeveloper: (owner, isOnline) => developer && owner === "dev" && isOnline,
      restartIntro: async owner => { log.push(`restart:${owner}`); return restart(); } },
    "expo-router": { useRouter: () => ({ navigate: to => log.push(`go:${to}`) }) },
    "../hooks/useRewards": { useRewards: options => { loads.push(options.load); currentRewards = actualRewards ? actualRewards.useRewards(options) : rewards; return currentRewards; } },
  }).default;
  let renderer; await act(async () => { renderer = create(React.createElement(Tools)); });
  const row = title => renderer.root.findAllByType("Row").find(node => node.props.title === title);
  return { renderer, sheets, row, log, loads, confirm: () => renderer.root.findAllByType("Confirm")[0], group: () => renderer.root.findAllByType("Group")[0], groups: () => renderer.root.findAllByType("Group"), press: async title => act(async () => row(title).props.onPress()),
    scope: async (owner, epoch) => { profileOwner = owner; admissionEpoch = epoch; await act(async () => renderer.update(React.createElement(Tools))); },
    rewards: () => currentRewards, result: () => renderer.root.findAllByType("Result")[0], cleanup: () => act(async () => renderer.unmount()) };
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
        "Open Outfits", "Preview level colours", "Come back from a session", "Come back with nothing", "Open today's pack", "Find something now", "Earn the next pet, frame and badge",
        "Take back pets, frames and badges", "Add 500 test Stardust", "Reset my rewards"]);
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

test("the rewards rows use the real rewards actions, each says what happened, and reset is locked", async () => {
  const ui = await tools({ rewardReply: { claim: { ok: true, value: { sessions: [{ sessionId: "s", finds: [{ item: "beret", new: true, stardust: 0 }, { item: "tote", new: false, stardust: 5 }], minutesStardust: 6 }],
    milestones: [{ item: "pet_owl", new: true, stardust: 0 }], state: { nextFindSeconds: 900 } } } } });
  const note = () => ui.renderer.root.findAll(n => n.props.testID === "dev-reward-note" || n.props.testID === "dev-reward-claim-status")[0];
  const noteText = () => JSON.stringify(note().findAllByType("Text").map(t => t.props.children));
  try {
    assert.ok(ui.loads.includes(true), "a developer's rewards load");
    assert.match(ui.groups()[1].props.footer, /^40 Stardust/);
    await ui.press("Open Outfits");
    await ui.press("Come back from a session");
    assert.match(noteText(), /✓ Finds: Red beret \(new\), Canvas tote \(\+5 Stardust\).*\+6 Stardust from minutes.*Unlocked: Barn owl \(new\)/);
    await ui.press("Open today's pack");
    assert.match(noteText(), /! Reach your daily goal to open a pack/, "the server's own reason shows");
    await ui.press("Find something now");
    assert.match(noteText(), /Found Red beret \(new\)/);
    await ui.press("Earn the next pet, frame and badge");
    await ui.press("Take back pets, frames and badges");
    await ui.press("Add 500 test Stardust");
    assert.match(noteText(), /Added 500 Stardust/);
    const reset = ui.row("Reset my rewards");
    assert.equal(reset.props.disabled, true); assert.equal(reset.props.value, "Locked");
    await act(async () => reset.props.onPress());
    assert.equal(ui.confirm(), undefined, "nothing to confirm: reset is off");
    assert.deepEqual(ui.log.filter(x => /^(go|claim|pack|dev)/.test(x)), ["go:/outfits", "claim", "pack", "dev:find:0",
      "dev:next_milestones:0", "dev:reearn:0", "dev:next_milestones:0", "dev:reearn:0", "dev:stardust:500"], "with every milestone earned, they're taken back and earned again");
  } finally { await ui.cleanup(); }
});

test("everyone else never loads rewards from here", async () => {
  const ui = await tools({ developer: false });
  try { assert.ok(ui.loads.every(load => load === false)); assert.equal(ui.renderer.root.findAllByType("Row").length, 0); } finally { await ui.cleanup(); }
});

test("with no sessions waiting, a developer still comes back to camp: one real find roll, shown beside the same row", async () => {
  const ui = await tools();
  try {
    await ui.press("Come back from a session");
    const row = ui.row("Come back from a session");
    assert.match(row.props.status, /No sessions waiting, so here's a test walk: Red beret \(new\)/);
    assert.equal(row.props.testID, "dev-reward-claim");
    assert.equal(row.props.busy, false);
    assert.equal(row.findAllByType("Text").length, 1, "feedback is inside the tapped row, not below the whole group");
    assert.equal(ui.renderer.root.findAll(n => n.props.testID === "dev-reward-note").length, 0);
    assert.deepEqual(ui.log, ["claim", "dev:find:0:1500"], "real sessions first, then the real find roll, shown as a 25-minute walk");
  } finally { await ui.cleanup(); }
});

test("a developer can open today's pack again and again, and see the screen after a short session", async () => {
  let opened = 0;
  const ui = await tools({ rewardReply: { get pack() { opened++; return opened === 1 ? { ok: false, message: "Today's pack is already opened" }
    : { ok: true, value: { tier: 1, daysInARow: 3, items: [], stardust: 20 } }; } } });
  try {
    await ui.press("Open today's pack");
    assert.deepEqual(ui.log.filter(x => /^(pack|dev)/.test(x)), ["pack", "dev:reopen_pack:0", "pack"], "an opened pack is reopened, then opened");
    assert.match(JSON.stringify(ui.renderer.root.findByProps({ testID: "dev-reward-note" }).findAllByType("Text").map(t => t.props.children)), /Leather pack \(3 days in a row\)/);
    const empties = [];
    ui.rewards().showEmptyReturn = seconds => empties.push(seconds);
    await ui.press("Come back with nothing");
    assert.deepEqual(empties, [60], "the real return screen, after a 1-minute session, with nothing given");
  } finally { await ui.cleanup(); }
});

test("the check responds immediately, ignores a double tap and returns to an enabled result", async () => {
  let resolve;
  const pending = new Promise(yes => { resolve = yes; });
  const ui = await tools({ rewardReply: { claim: () => pending } });
  try {
    await act(async () => { const row = ui.row("Come back from a session"); row.props.onPress(); row.props.onPress(); });
    assert.deepEqual(ui.log, ["claim"]);
    assert.equal(ui.row("Come back from a session").props.status, "Checking…");
    assert.equal(ui.row("Come back from a session").props.busy, true);
    assert.equal(ui.row("Come back from a session").props.disabled, true);
    await act(async () => resolve({ ok: true, value: { sessions: [], milestones: [], state: { nextFindSeconds: 600 } } }));
    assert.equal(ui.row("Come back from a session").props.busy, false);
    assert.equal(ui.row("Come back from a session").props.disabled, false);
    assert.match(ui.row("Come back from a session").props.status, /test walk/);
  } finally { await ui.cleanup(); }
});

test("failed reward checks show a calm local result and do not get stuck checking", async () => {
  for (const claim of [{ ok: false, message: "One moment, still saving." }, () => { throw Error("private unexpected failure"); }]) {
    const ui = await tools({ rewardReply: { claim } });
    try {
      await ui.press("Come back from a session");
      assert.match(ui.row("Come back from a session").props.status, /^! (One moment|Couldn't check)/);
      assert.doesNotMatch(ui.row("Come back from a session").props.status, /private unexpected/);
      assert.equal(ui.row("Come back from a session").props.busy, false);
      assert.equal(ui.row("Come back from a session").props.disabled, false);
    } finally { await ui.cleanup(); }
  }
});

test("a delayed developer check cannot show the previous account admission's result", async () => {
  let resolve;
  const pending = new Promise(yes => { resolve = yes; });
  const ui = await tools({ rewardReply: { claim: () => pending } });
  try {
    await ui.press("Come back from a session");
    await ui.scope("other", 2); await ui.scope("dev", 3);
    assert.equal(ui.row("Come back from a session").props.status, "");
    await act(async () => resolve({ ok: true, value: { sessions: [], milestones: [], state: { nextFindSeconds: 600 } } }));
    assert.equal(ui.row("Come back from a session").props.status, "");
    assert.equal(ui.row("Come back from a session").props.disabled, false);
  } finally { await ui.cleanup(); }
});

test("a settings action's result is readable in full and announced beside its stable button", async () => {
  const Row = load("src/components/SettingsList.tsx", {
    "react-native": { View: host("View"), Switch: host("Switch"), StyleSheet: { create: value => value, hairlineWidth: 1 } },
    "@expo/vector-icons": { Ionicons: host("Icon") }, "./MotionPressable": host("Press"), "./AppText": { Text: host("Text") },
    "../constants/theme": { colors: {}, edge: {}, radius: { card: 24 } },
  }).SettingsRow;
  let tree;
  await act(async () => { tree = create(React.createElement(Row, { icon: "compass-outline", title: "Come back from a session", status: "Nothing new since your last check.",
    testID: "dev-reward-claim", busy: true, disabled: true, onPress() {} })); });
  try {
    const button = tree.root.findByType("Press"), status = tree.root.findByProps({ testID: "dev-reward-claim-status" });
    assert.equal(button.props.testID, "dev-reward-claim"); assert.equal(button.props.accessibilityRole, "button");
    assert.deepEqual(button.props.accessibilityState, { disabled: true, busy: true });
    assert.equal(status.props.accessibilityLiveRegion, "polite");
    assert.equal(status.props.numberOfLines, undefined, "larger text does not truncate the result");
  } finally { await act(async () => tree.unmount()); }
});

const serverRewards = (stardust = 40) => ({ stardust, nextFindSeconds: 600, owned: [], earned: [],
  avatar: { look: { skin: "3", hair: "short", hairColor: "darkbrown", glasses: false }, equipped: {}, frame: null,
    background: "bg_dusk", title: null, revision: 1 },
  pack: { date: "2026-10-24", goalReached: false, claimed: false, tier: 0, daysInARow: 0 }, today: { seconds: 0, finds: 0 } });

test("the real reward client: real sessions show their return screen; with none, the developer's test walk uses the real find roll", async () => {
  const calls = []; let claims = 0;
  const ui = await tools({ transport: async (name, args) => {
    calls.push({ name, args });
    if (name === "get_rewards_v1") return { data: serverRewards(), error: null };
    if (name === "dev_rewards_v1") { assert.equal(args.p_action, "find"); return { data: { ...serverRewards(47), gifts: [{ item: "tote", rarity: "common", new: true, stardust: 0 }] }, error: null }; }
    assert.equal(name, "claim_session_rewards_v1"); claims++;
    const sessions = claims === 2 ? [{ sessionId: "session-1", finds: [{ item: "beret", rarity: "uncommon", new: true, stardust: 0 }], seconds: 1800, minutesStardust: 6 }] : [];
    return { data: { sessions, milestones: [], state: serverRewards(46) }, error: null };
  } });
  try {
    await ui.press("Come back from a session");
    assert.match(ui.row("Come back from a session").props.status, /test walk: Canvas tote \(new\)/);
    assert.deepEqual(ui.rewards().reveals.map(reveal => ({ kind: reveal.kind, seconds: reveal.seconds })), [{ kind: "expedition", seconds: 1500 }], "the return screen, from a 25-minute walk");
    await ui.press("Come back from a session");
    assert.match(ui.row("Come back from a session").props.status, /Red beret \(new\).*6 Stardust from minutes/);
    assert.deepEqual(ui.rewards().reveals.at(-1), { id: "return:session-1", kind: "expedition", seconds: 1800, finds: [{ item: "beret", rarity: "uncommon", new: true, stardust: 0 }], stardust: 6,
      trailStardust: 0, fromSeconds: 0, trail: { findSeconds: 1500, stops: 6, complete: false, seconds: 0, fromSeconds: 0, finds: 0, nextFindSeconds: 600 } },
      "a real session's return screen, with no test grant");
    assert.deepEqual(calls.map(call => call.name), ["get_rewards_v1", "claim_session_rewards_v1", "dev_rewards_v1", "claim_session_rewards_v1"]);
    assert.ok(calls.every(call => call.args.p_expected_owner === "dev"));
  } finally { await ui.cleanup(); }
});

test("the real reward transport cannot publish an old owner's delayed claim into another account", async () => {
  let resolve, sent;
  const started = new Promise(yes => { sent = yes; });
  const pending = new Promise(yes => { resolve = yes; });
  const calls = [];
  const ui = await tools({ transport: async (name, args) => {
    calls.push({ name, args });
    if (name === "get_rewards_v1") return { data: serverRewards(), error: null };
    sent(); return pending;
  } });
  try {
    await ui.press("Come back from a session"); await started;
    await ui.scope("other", 2);
    await act(async () => resolve({ data: { sessions: [{ sessionId: "old-session", seconds: 1800, minutesStardust: 6,
      finds: [{ item: "beret", rarity: "uncommon", new: true, stardust: 0 }] }], milestones: [], state: serverRewards(999) }, error: null }));
    assert.equal(ui.rewards().state, null);
    assert.equal(ui.rewards().stardust, 0);
    assert.equal(ui.rewards().reveals.length, 0);
    assert.equal(ui.renderer.root.findAllByType("Row").length, 0);
    assert.equal(calls.filter(call => call.name === "claim_session_rewards_v1").length, 1);
    assert.equal(calls.find(call => call.name === "claim_session_rewards_v1").args.p_expected_owner, "dev");
  } finally { await ui.cleanup(); }
});
