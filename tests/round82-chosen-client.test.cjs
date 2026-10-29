/* global __dirname */
// Chosen rewards on the phone: reading the server's reply, celebrating an
// earned reward once (after any session return), Home's card and the choice.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript"), babel = require("@babel/core");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, "..");
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
function load(file, mocks = {}, cache = new Map(), compiled = false) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  let source = fs.readFileSync(filename, "utf8");
  if (compiled && filename.endsWith(".tsx")) source = babel.transformSync(source, { filename, configFile: false, babelrc: false,
    parserOpts: { plugins: ["typescript", "jsx"] }, plugins: [[require.resolve("babel-plugin-react-compiler"), { target: "19" }]] }).code;
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const resolved = [".ts", ".tsx"].map(ext => target + ext).find(fs.existsSync);
    return load(path.relative(root, resolved), mocks, cache, compiled);
  }, module, module.exports);
  return module.exports;
}
const service = load("src/services/rewardsService.ts", { "../../lib/supabase": { supabase: {} } });
const wire = (chosen, extra = {}) => ({ stardust: 10, nextFindSeconds: 1800, findSeconds: 1800, trailSeconds: 7200, owned: [], earned: [],
  avatar: { look: {}, equipped: {}, frame: null, background: "bg_dusk", title: null, revision: 1 },
  pack: { date: "2026-10-30", goalReached: true, claimed: false, tier: 0, daysInARow: 0 },
  today: { date: "2026-10-30", seconds: 0, finds: 0 }, ...(chosen === undefined ? {} : { chosen }), ...extra });
const chosen = (extra = {}) => ({ version: 1, enabled: true, startsOn: "2026-10-30", requiredDays: 5, balance: 3, target: "beret", revision: 4,
  offers: [{ slot: 1, item: "beret" }, { slot: 2, item: "bg_forest" }, { slot: 3, item: "decor_bonsai" }, { slot: 4, item: "book_bag" }], grants: [], ...extra });

test("the reply's chosen rewards are read when present and simply absent on older servers", () => {
  const s = service.parseRewardsState(wire(chosen()));
  assert.deepEqual([s.chosen.enabled, s.chosen.balance, s.chosen.target, s.chosen.revision, s.chosen.offers.length], [true, 3, "beret", 4, 4]);
  assert.equal(service.parseRewardsState(wire(undefined)).chosen, undefined, "a server without the Round 82 SQL: no card, packs as before");
  assert.equal(service.parseRewardsState(wire({ enabled: "yes" })).chosen, undefined, "a damaged part hides the feature instead of breaking rewards");
  const odd = service.parseRewardsState(wire(chosen({ offers: [{ slot: 1, item: "not_an_item" }, { slot: 2, item: "tie" }], target: "not_an_item",
    grants: [{ id: "g1", item: "tie", rarity: "common" }, { id: "g2", item: "nope", rarity: "common" }] }))).chosen;
  assert.deepEqual(odd.offers, [{ slot: 2, item: "tie" }]); assert.equal(odd.target, null);
  assert.deepEqual(odd.grants, [{ id: "g1", item: "tie", rarity: "common", new: true, stardust: 0 }]);
  assert.deepEqual(service.parseRewardsState(JSON.parse(JSON.stringify(s))).chosen, s.chosen, "the phone's own cached copy reads back the same");
});

function store() {
  const saved = new Map();
  const { createRewardsStore } = load("src/services/rewardsStore.ts", { "./rewardsService": service, "./rewardCatalog": { STREAK_FRAMES: [] } });
  return createRewardsStore({ getItem: async key => saved.get(key) ?? null, setItem: async (key, value) => { saved.set(key, value); } });
}
const parsed = c => service.parseRewardsState(wire(c));

test("an earned chosen reward shows once, after the session's return, and is acknowledged only after it was seen", async () => {
  const s = store();
  const earned = parsed(chosen({ balance: 0, target: null, grants: [{ id: "grant-1", item: "beret", rarity: "common" }] }));
  // The claim reply carries both: the store queues the reward, then the claim's return arrives.
  await s.act("owner", async () => ({ state: earned }));
  s.addReveal("owner", { id: "return:s1", kind: "expedition", seconds: 60, finds: [], stardust: 0 });
  assert.deepEqual(s.snapshot("owner").reveals.map(r => r.id), ["return:s1", "chosen:grant-1"], "walk the trail first, then the reward");
  const reward = s.snapshot("owner").reveals[1];
  assert.deepEqual([reward.finds[0].item, reward.skipTrail, reward.chosen.days], ["beret", true, 5]);
  assert.equal(s.snapshot("owner").toAcknowledge, undefined, "nothing to acknowledge before it is seen");
  s.dismissReveal("owner", "return:s1"); s.dismissReveal("owner", "chosen:grant-1");
  assert.deepEqual(s.snapshot("owner").toAcknowledge, ["grant-1"]);
  // A refresh before the acknowledgement lands must not show it again.
  await s.load("owner", { load: async () => earned });
  assert.deepEqual(s.snapshot("owner").reveals, []);
  s.acknowledged("owner", ["grant-1"]);
  assert.deepEqual(s.snapshot("owner").toAcknowledge, []);
});

const icons = { Ionicons: host("Icon") };
function ui(compiled = false) {
  const mocks = { "react-native": { View: host("View"), StyleSheet: { create: v => v } }, "@gorhom/bottom-sheet": { BottomSheetScrollView: host("SheetScroll") },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) }, "@expo/vector-icons": icons,
    "../MotionPressable": host("Press"), "../SheetTouchable": host("Option"), "../AppText": { Text: host("Text") },
    "../AppSheet": props => props.visible ? React.createElement("Sheet", props, props.header, props.children) : null,
    "../SheetHeader": host("Header"), "../adventurer/ItemArt": host("Art"), "./rarity": { RARITY_COLOR: new Proxy({}, { get: () => "#ABCDEF" }) } };
  return load("src/components/rewards/ChosenReward.tsx", mocks, new Map(), compiled);
}
const words = node => node.root.findAllByType("Text").map(n => [].concat(n.props.children).flat().filter(x => typeof x === "string").join("")).join(" | ");

for (const compiled of [false, true]) test(`Home's card: progress toward the choice, a nudge to choose, and everything collected (${compiled ? "compiled" : "uncompiled"})`, async () => {
  const { ChosenRewardCard } = ui(compiled);
  let r, opened = 0;
  const render = c => act(async () => { if (r) r.update(React.createElement(ChosenRewardCard, { chosen: service.parseChosen(c), onOpen: () => opened++ }));
    else r = create(React.createElement(ChosenRewardCard, { chosen: service.parseChosen(c), onOpen: () => opened++ })); });
  await render(chosen());
  assert.match(words(r), /Beret|beret/i); assert.match(words(r), /3 of 5 goal days/);
  assert.match(r.root.findByProps({ testID: "home-chosen" }).props.accessibilityLabel, /Working toward .*3 of 5 goal days/);
  r.root.findByProps({ testID: "home-chosen" }).props.onPress(); assert.equal(opened, 1);
  await render(chosen({ target: null, balance: 7 }));
  assert.match(words(r), /Choose your next reward/); assert.match(words(r), /7 goal days saved/);
  await render(chosen({ target: null, balance: 0 }));
  assert.match(words(r), /Reach your daily goal on 5 days/);
  await render(chosen({ target: null, offers: [], balance: 2 }));
  assert.match(words(r), /Everything collected · 2 goal days saved/);
  assert.equal(r.root.findAllByType("Press").length, 0, "nothing to choose: not a button");
  await act(async () => r.unmount());
});

for (const compiled of [false, true]) test(`the choice: four rewards, the current one marked, earn-now when enough days are saved (${compiled ? "compiled" : "uncompiled"})`, async () => {
  const { ChosenRewardSheet } = ui(compiled);
  let r; const picks = [];
  const render = props => act(async () => { const el = React.createElement(ChosenRewardSheet, { visible: true, busy: false, onChoose: item => picks.push(item), onClose() {}, ...props });
    if (r) r.update(el); else r = create(el); });
  await render({ chosen: undefined });
  assert.equal(r.root.findAllByType("Option").length, 0, "still loading: no options, no crash");
  await render({ chosen: service.parseChosen(chosen()) });
  const options = r.root.findAllByType("Option");
  assert.deepEqual(options.map(o => o.props.testID), ["chosen-offer-beret", "chosen-offer-bg_forest", "chosen-offer-decor_bonsai", "chosen-offer-book_bag"]);
  assert.equal(options[0].props.accessibilityState.selected, true);
  options[1].props.onPress(); options[0].props.onPress();
  assert.deepEqual(picks, ["bg_forest", null], "switching chooses another; tapping the current one stops");
  await render({ chosen: service.parseChosen(chosen({ target: null, balance: 6 })) });
  assert.match(words(r), /6 goal days saved/); assert.match(words(r), /enough for 1/); assert.match(words(r), /Earn it now/);
  await render({ chosen: service.parseChosen(chosen({ target: null, offers: [] })) });
  assert.match(words(r), /You own everything you can work toward/);
  await render({ chosen: service.parseChosen(chosen()), busy: true });
  assert.ok(r.root.findAllByType("Option").every(o => o.props.disabled));
  await act(async () => r.unmount());
});

test("a shown chosen reward is acknowledged by the reward host, retrying at most every few seconds while it fails", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let rewards, acks = [], reply = { ok: false, message: "offline" };
  const base = { owner: "owner", admissionEpoch: 1, online: true, busy: false, reveals: [], moments: [], today: { seconds: 0, finds: 0 }, trail: { findSeconds: 1800, stops: 4 },
    toAcknowledge: ["grant-1"], claimSessions: async () => ({ ok: true, value: { sessions: [] } }), dismissReveal() {}, dismissMoment() {},
    acknowledgeChosen: async ids => { acks.push(ids); return reply; } };
  rewards = { ...base };
  const mocks = {
    "react-native": { Modal: host("Modal"), View: host("View"), AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) }, StyleSheet: { create: v => v }, Animated: {}, Easing: {} },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }, "expo-router": { usePathname: () => "/", useRouter: () => ({ push() {} }) },
    "react-native-svg": { __esModule: true, default: host("Svg"), G: host("G"), Path: host("Path") },
    "./MotionPressable": host("Press"), "./AppText": { Text: host("Text") }, "./adventurer/ItemArt": host("Art"), "./adventurer/ProfilePicture": host("Picture"),
    "../context/UserContext": { useUser: () => ({ profile: { id: "owner", level: 1, current_xp: 0, streak_count: 0 } }) }, "../hooks/useRewards": { useRewards: () => rewards },
    "../hooks/useReducedMotion": { useReducedMotion: () => true }, "../services/launchIntroState": { launchIntroState: { subscribe: () => () => {}, isDone: () => true } },
    "../utils/sheetActivity": { registerSheetActivity: () => () => {}, useActiveSheetCount: () => 0 }, "../utils/tapHaptics": { tapHaptic() {} },
    "./rewards/RevealScreens": { ExpeditionReveal: host("Expedition"), PackReveal: host("Pack") }, "./rewards/rarity": { RARITY_COLOR: {} },
  };
  const Moments = load("src/components/RewardMoments.tsx", mocks);
  let r; const render = () => act(async () => { const el = React.createElement(Moments.default, { insideSession: false });
    if (r) r.update(el); else r = create(el); });
  try {
    await render(); await act(async () => t.mock.timers.tick(1));
    assert.deepEqual(acks, [["grant-1"]]);
    // Each failed try makes the store busy and then free again; that alone must not retry.
    rewards = { ...base, busy: true }; await render(); rewards = { ...base }; await render(); await act(async () => t.mock.timers.tick(10));
    assert.equal(acks.length, 1, "no instant retry loop");
    await act(async () => t.mock.timers.tick(5000)); assert.equal(acks.length, 2, "tries again after a pause");
    reply = { ok: true }; rewards = { ...base, toAcknowledge: [] }; await render(); await act(async () => t.mock.timers.tick(20000));
    assert.equal(acks.length, 2, "nothing left: no more requests");
    rewards = { ...base, online: false, toAcknowledge: ["grant-2"] }; await render(); await act(async () => t.mock.timers.tick(20000));
    assert.equal(acks.length, 2, "offline: waits");
  } finally { await act(async () => r.unmount()); }
});

test("Home shows the chosen-reward card instead of the daily pack once chosen rewards are on, and the pack until then", () => {
  const home = fs.readFileSync(path.join(root, "src/app/(tabs)/index.tsx"), "utf8");
  assert.match(home, /const chosenLive = !!rewards\.chosen\?\.enabled;/);
  assert.match(home, /\{chosenLive && rewards\.chosen && <ChosenRewardCard/);
  assert.match(home, /\{!chosenLive && rewards\.pack && rewards\.online && <HomePack/);
});

test("developer controls: choose, bank test days, earn it through the real reward screen, get it early, start over", async () => {
  const calls = [];
  // A fake of the server's rolled-back preview: same rules, in memory.
  const lab = async (action, snapshot, item) => {
    calls.push([action, JSON.parse(JSON.stringify(snapshot)), item]);
    const c = snapshot.chosen ?? { balance: 0, revision: 1, target: null, offers: [{ slot: 1, item: "beret" }, { slot: 2, item: "bg_forest" }] };
    let balance = c.balance + (action === "day" ? 1 : 0), target = action === "select" ? item : c.target, earned = [...snapshot.earned], grants = [];
    if (target && earned.includes(target)) target = null;
    if (target && balance >= 5) { grants = [{ id: `g${calls.length}`, item: target, rarity: "common", new: true, stardust: 0 }]; earned.push(target); balance -= 5; target = null; }
    return { ok: true, value: { earned, chosen: { enabled: true, startsOn: null, requiredDays: 5, balance, target, revision: c.revision + 1, offers: c.offers.filter(o => !earned.includes(o.item)), grants } } };
  };
  const rewards = { state: {}, owner: "dev", admissionEpoch: 1, online: true, busy: false, look: {}, equipped: {}, background: "bg_dusk", frame: null,
    today: { seconds: 0, finds: 0 }, nextFindSeconds: 1800, trail: { findSeconds: 1800, stops: 4, complete: false }, stardust: 0, lab: { active: false, allOwned: false }, chosenLab: lab };
  const mocks = {
    "react-native": { View: host("View"), Modal: host("Modal"), ScrollView: host("NativeScroll"), StyleSheet: { create: v => v, absoluteFill: {}, hairlineWidth: 1 },
      useWindowDimensions: () => ({ width: 360, height: 640, fontScale: 1 }), AppState: { addEventListener: () => ({ remove() {} }) } },
    "./AppText": { Text: host("Text") }, "./MotionPressable": props => React.createElement("Button", props, props.children),
    "../context/UserContext": { useUser: () => ({ profile: { id: "dev", level: 2, current_xp: 1, streak_count: 0 }, hapticsEnabled: false }) },
    "../context/TimerContext": { useTimer: () => ({ hasOpenSession: false }) }, "../hooks/useRewards": { useRewards: () => rewards }, "../hooks/useReducedMotion": { useReducedMotion: () => false },
    "expo-router": { useRouter: () => ({ navigate() {} }) }, "./AppSheet": host("Sheet"), "./SheetHeader": host("Header"), "./SessionResultSheet": host("Result"),
    "./PostSessionCelebration": { DailyAchievementMoment: host("Achievement") }, "./RewardMoments": { Moment: host("Moment") },
    "./rewards/RevealScreens": { ExpeditionReveal: host("Expedition"), PackReveal: host("Pack") }, "./session/SessionBackdrop": host("Backdrop"),
    "./rewards/ChosenReward": { ChosenRewardSheet: host("ChosenSheet"), ChosenRewardCard: host("ChosenCard") },
    "@expo/vector-icons": { Ionicons: host("Icon") }, "@gorhom/bottom-sheet": { BottomSheetScrollView: host("Scroll") },
  };
  const Component = load("src/components/DeveloperRewardTests.tsx", mocks).default;
  let tree; await act(async () => { tree = create(React.createElement(Component)); });
  const press = id => act(async () => { tree.root.findAllByType("Button").find(n => n.props.testID === id).props.onPress(); });
  const sheet = () => tree.root.findByType("ChosenSheet");
  try {
    await press("dev-chosen-open");
    assert.equal(sheet().props.visible, true); assert.equal(calls[0][0], "load"); assert.deepEqual(calls[0][1], { earned: [] }, "starts with nothing owned, nothing saved");
    await act(async () => sheet().props.onChoose("beret"));
    assert.equal(sheet().props.chosen.target, "beret");
    for (let i = 0; i < 4; i++) await press("dev-chosen-day");
    assert.equal(sheet().props.chosen.balance, 4); assert.equal(tree.root.findAllByType("Expedition").length, 0);
    await press("dev-chosen-day");
    const shown = tree.root.findByType("Expedition").props.reveal;
    assert.deepEqual([shown.finds[0].item, shown.chosen.days, shown.skipTrail], ["beret", 5, true], "the same reward screen a real account sees");
    assert.equal(sheet().props.visible, false, "the choice closes for the reward screen");
    await act(async () => tree.root.findByType("Expedition").props.onClose());
    await act(async () => sheet().props.onChoose("bg_forest"));
    await press("dev-chosen-day"); await press("dev-chosen-early");
    const early = calls.at(-1);
    assert.equal(early[0], "load"); assert.ok(early[1].earned.includes("bg_forest"), "got it another way");
    assert.equal(sheet().props.chosen.target, null); assert.equal(sheet().props.chosen.balance, 1, "saved days stay");
    await press("dev-chosen-reset");
    assert.deepEqual(calls.at(-1)[1], { earned: [] });
    assert.ok(calls.every(([, snapshot]) => !("real" in snapshot)), "only test data goes to the preview");
  } finally { await act(async () => tree.unmount()); }
});

test("camp decorations: up to four you own, newest first, in fixed spots, dim at night", async () => {
  const mocks = { "react-native": { View: host("View"), StyleSheet: { create: v => v, absoluteFill: {} } }, "../adventurer/ItemArt": host("Art"),
    "./TrailScenes": { sceneBox: (w, h) => ({ s: 1, at: (x, y) => ({ left: x, top: y }) }) } };
  const { default: Camp, campDecorations, CAMP_SPOTS } = load("src/components/session/CampDecorations.tsx", mocks);
  assert.deepEqual(campDecorations(["tie", "decor_crates", "decor_easel"], []), ["decor_easel", "decor_crates"], "only decorations, newest first");
  assert.deepEqual(campDecorations(["decor_a_missing", "decor_crates"], ["decor_bonsai", "decor_crates", "beret"]), ["decor_crates", "decor_bonsai"]);
  assert.equal(campDecorations([], ["decor_bonsai", "decor_crates", "decor_easel", "decor_hammock", "decor_signpost"]).length, 4, "a developer owning everything sees four");
  assert.deepEqual(campDecorations([], []), []);
  let r; await act(async () => { r = create(React.createElement(Camp, { width: 390, height: 844, items: ["decor_easel", "decor_crates"], night: false })); });
  const spots = r.root.findAllByType("View").filter(v => /^camp-decoration-/.test(v.props.testID ?? ""));
  assert.deepEqual(spots.map(v => v.props.testID), ["camp-decoration-decor_easel", "camp-decoration-decor_crates"]);
  assert.deepEqual([spots[0].props.style.left, spots[0].props.style.top], [CAMP_SPOTS[0].x - CAMP_SPOTS[0].size / 2, CAMP_SPOTS[0].y - CAMP_SPOTS[0].size]);
  assert.equal(r.root.findByProps({ testID: "camp-decorations" }).props.style[1].opacity, 1);
  await act(async () => r.update(React.createElement(Camp, { width: 390, height: 844, items: ["decor_easel"], night: true })));
  assert.ok(r.root.findByProps({ testID: "camp-decorations" }).props.style[1].opacity < 0.5, "dim at night");
  await act(async () => r.update(React.createElement(Camp, { width: 390, height: 844, items: [], night: false })));
  assert.equal(r.root.findAllByProps({ testID: "camp-decorations" }).length, 0, "nothing collected: nothing drawn");
  for (const spot of CAMP_SPOTS) assert.ok(spot.y <= 760, "every spot stays above the controls along the bottom");
  await act(async () => r.unmount());
});
