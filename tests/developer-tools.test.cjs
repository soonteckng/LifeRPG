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
    // The new isolated lab has its own behavioural tests. Keep this harness
    // focused on the older settings controls and their real-collection path.
    if (name === "./DeveloperRewardTests") return () => null;
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

async function tools({ developer = true, online = true, session = false, restart = async () => true, reload = async () => true, rewardReply = {}, transport = null, readTrail = async () => "timer fixture", share = async () => ({ action: "sharedAction" }) } = {}) {
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
    "../services/sessionTrail": { readSessionTrail: () => { log.push("read-session-log"); return readTrail(); } },
    "react-native": { Share: { share: value => { log.push(value); return share(value); } }, Modal: host("Modal"), View: host("View"), Pressable: host("Press"), StyleSheet: { create: v => v, hairlineWidth: 1 } }, "./AppText": { Text: host("Text") },
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
    "../services/notificationOnboardingStore": { notificationOnboardingStore: { reopen: async owner => { log.push(`notify:${owner}`); } } },
    "../context/TimerContext": { useTimer: () => ({ hasOpenSession: session }) },
    "../context/UserContext": { useUser: () => ({ profile: { id: profileOwner, level: 4, current_xp: 30 }, reloadProfile: async () => { log.push("reload"); return reload(); } }) },
    "../context/AuthContext": { useAuth: authValue },
    "../services/developerAccess": { useIsDeveloper: (owner, isOnline) => developer && owner === "dev" && isOnline,
      restartIntro: async owner => { log.push(`restart:${owner}`); return restart(); } },
    "expo-router": { useRouter: () => ({ navigate: to => log.push(typeof to === "string" ? `go:${to}` : `go:${to.pathname}?collection=${to.params?.collection}`) }) },
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


test("every session card opens on the real result card with sample numbers, and Done closes it", async () => {
  const ui = await tools();
  try {
    assert.deepEqual(ui.renderer.root.findAllByType("Row").map(node => node.props.title),
      ["Share session log", "Replay first-time setup", "Show the notification ask again",
        "Session complete", "Earlier session saved", "Session ended early", "Saved offline result", "Offline sync summary", "Session could not be credited", "Saving screen"]);
    assert.equal(ui.result(), undefined);
    await ui.press("Session complete");
    let card = ui.result().props;
    assert.equal(card.visible, true); assert.equal(card.recovered, false); assert.equal(card.goalReachedNow, true);
    // Round 88: the finished card shows everything it can: today against the goal and both tiles.
    assert.deepEqual([card.dailyCompletedSeconds, card.dailyGoalMinutes, card.streakDays, card.weekSeconds], [5100, 60, 12, 13200]);
    assert.equal(typeof card.onOpenRhythm, "function");
    assert.equal(card.saveAction, undefined, "a preview never offers to save a quest");
    for (const removed of ["isLevelUp", "newLevel", "xpEarned", "currentXP", "requiredXP"]) assert.equal(card[removed], undefined, `${removed} is gone`);
    await act(async () => card.onClose());
    assert.equal(ui.result().props.visible, false);
    await act(async () => ui.result().props.onDismiss());
    assert.equal(ui.result(), undefined);
    await ui.press("Earlier session saved");
    assert.equal(ui.result().props.recovered, true);
    await act(async () => ui.result().props.onDismiss());
    await ui.press("Session ended early");
    assert.equal(ui.result().props.ending, true);
    await act(async () => ui.result().props.onDismiss());
    await ui.press("Saved offline result");
    card = ui.result().props;
    assert.deepEqual([card.pending, card.offline, card.localSaved], [true, true, true]);
    await act(async () => card.onDismiss());
    await ui.press("Offline sync summary");
    card = ui.result().props;
    assert.equal(card.syncSummary.sessionCount, 3); assert.deepEqual(card.syncSummary.durations, [{ seconds: 60, count: 3 }]);
    assert.equal("xp" in card.syncSummary.areas[0], false);
    await act(async () => card.onDismiss());
    await ui.press("Session could not be credited");
    assert.equal(ui.result().props.rejected, true);
  } finally { await ui.cleanup(); }
});

test("the saving preview shows the saving screen for a few seconds, then goes", async () => {
  const realSet = global.setTimeout; const timers = [];
  const ui = await tools();
  try {
    global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
    await ui.press("Saving screen");
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

test("Show the notification ask again resets only the ask, for this account (Round 88)", async () => {
  const ui = await tools();
  try {
    await ui.press("Show the notification ask again"); await flush();
    assert.deepEqual(ui.log, ["notify:dev"]);
    assert.match(ui.group().props.footer, /Go to Today to see the notification ask/);
  } finally { await ui.cleanup(); }
});

test("Restart the intro asks first, then restarts and reloads the profile so the intro opens", async () => {
  const ui = await tools();
  try {
    await ui.press("Replay first-time setup");
    assert.ok(ui.confirm()); assert.deepEqual(ui.log, [], "nothing happens until you confirm");
    await act(async () => ui.confirm().props.onCancel());
    assert.equal(ui.confirm(), undefined);
    await ui.press("Replay first-time setup");
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
      await ui.press("Replay first-time setup");
      await act(async () => ui.confirm().props.onConfirm()); await flush();
      assert.equal(ui.confirm(), undefined);
      assert.match(ui.group().props.footer, pattern);
    } finally { await ui.cleanup(); }
  }
});

test("during a session the setup replay and the notification ask wait", async () => {
  const ui = await tools({ session: true });
  try {
    assert.equal(ui.row("Show the notification ask again").props.disabled, true);
    assert.equal(ui.row("Replay first-time setup").props.disabled, true);
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




test("the visible developer log button shares the existing on-phone trail with a safe empty fallback", async () => {
  for (const text of ["2026-10-26 timer {\"phase\":\"completed\"}", ""]) {
    const ui = await tools({ readTrail: async () => text });
    try {
      assert.equal(ui.row("Share session log").props.testID, "dev-share-session-log");
      await ui.press("Share session log");
      assert.deepEqual(ui.log, ["read-session-log", { message: text || "No session events yet." }]);
      assert.equal(ui.row("Share session log").props.disabled, false);
    } finally { await ui.cleanup(); }
  }
});

test("sharing the session log locks repeat taps and recovers from a read or share failure", async () => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const ui = await tools({ readTrail: () => pending });
  try {
    await ui.press("Share session log"); await ui.press("Share session log");
    assert.deepEqual(ui.log, ["read-session-log"]);
    assert.equal(ui.row("Share session log").props.busy, true);
    await act(async () => resolve("timer fixture"));
    assert.equal(ui.row("Share session log").props.busy, false);
  } finally { await ui.cleanup(); }
  for (const options of [{ readTrail: async () => { throw Error("storage"); } }, { share: async () => { throw Error("share"); } }]) {
    const failed = await tools(options);
    try {
      await failed.press("Share session log");
      assert.equal(failed.row("Share session log").props.disabled, false);
      assert.match(failed.group().props.footer, /Couldn't open sharing/);
    } finally { await failed.cleanup(); }
  }
});

test("a log read that finishes after switching accounts cannot open the share sheet", async () => {
  let resolve; const ui = await tools({ readTrail: () => new Promise(done => { resolve = done; }) });
  try {
    await ui.press("Share session log"); await ui.scope("another-owner", 2);
    await act(async () => resolve("private local events"));
    assert.deepEqual(ui.log, ["read-session-log"]);
    assert.equal(ui.row("Share session log"), undefined);
  } finally { await ui.cleanup(); }
});
