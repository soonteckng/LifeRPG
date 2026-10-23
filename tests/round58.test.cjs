/* global __dirname */
// Round 58: the trail behind a session (setting off, night to day near the
// end), coming back to camp with your finds, opening today's supply pack,
// Stardust on Home, and the numbers behind today's trail.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, "..");

function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const resolved = [".ts", ".tsx"].map(ext => target + ext).find(fs.existsSync);
    return load(path.relative(root, resolved), mocks, cache);
  }, mod, mod.exports);
  return mod.exports;
}
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
const LOOK = { skin: "3", hair: "short", hairColor: "darkbrown", glasses: false };

test("the sky stays night for most of a session and only turns to day near the end", () => {
  const trail = load("src/utils/trail.ts");
  for (const p of [0, 0.3, 0.6, 0.79, 0.8]) assert.equal(trail.sessionLight(p), 0, `night at ${p}`);
  assert.ok(trail.sessionLight(0.9) > 0.3 && trail.sessionLight(0.9) < 0.7, "dawn on the last stretch");
  assert.equal(trail.sessionLight(1), 1); assert.equal(trail.sessionLight(1.4), 1);
  assert.equal(trail.mix("#000000", "#FFFFFF", 0.5), "#808080");
  assert.equal(trail.walked(4500), "1 h 15 m"); assert.equal(trail.walked(59), "0 m");
  assert.deepEqual([0, 1.9, 2, 4.5, 9].map(s => trail.trailZone(s).name), ["Meadow", "Meadow", "Lantern Lake", "Red Canyon", "Starfall Ridge"]);
  assert.equal(trail.trailStops(3000), 2);
});

test("replies carry today's trail, session lengths and test gifts; older replies still read", async () => {
  let reply;
  const svc = load("src/services/rewardsService.ts", { "../../lib/supabase": { supabase: { rpc: async () => ({ data: reply, error: null }) } } });
  const base = { stardust: 3, nextFindSeconds: 900, owned: [], avatar: { look: LOOK, equipped: {}, frame: null, background: "bg_dusk", title: null, revision: 1 },
    pack: { date: "2026-10-24", goalReached: true, claimed: false, tier: 1, daysInARow: 2 } };
  assert.deepEqual(svc.parseRewardsState(base).today, { seconds: 0, finds: 0 }, "older servers: nothing walked yet");
  assert.deepEqual(svc.parseRewardsState({ ...base, today: { seconds: 4500, finds: 3 } }).today, { seconds: 4500, finds: 3 });
  const client = svc.createRewardsClient("me", async () => "me");
  reply = { sessions: [{ sessionId: "s", finds: [], minutesStardust: 5, seconds: 1620 }, { sessionId: "t", finds: [], minutesStardust: 2 }], milestones: [], state: base };
  const claim = await client.claimSessions();
  assert.deepEqual(claim.sessions.map(s => s.seconds), [1620, 600], "an older reply falls back to the Stardust minutes");
  reply = { ...base, gifts: [{ item: "beret", rarity: "common", new: true, stardust: 0 }] };
  const dev = await client.developer("find");
  assert.equal(dev.gifts[0].item, "beret"); assert.equal(dev.state.stardust, 3);
});

test("a return or pack screen comes before single pop-ups, and closing it marks what it showed as seen", async () => {
  const saved = new Map();
  const storage = { getItem: async k => saved.get(k) ?? null, setItem: async (k, v) => { saved.set(k, v); } };
  const svc = load("src/services/rewardsService.ts", { "../../lib/supabase": { supabase: {} } });
  const { createRewardsStore, revealItems } = load("src/services/rewardsStore.ts", { "./rewardsService": svc });
  const state = earned => svc.parseRewardsState({ stardust: 0, nextFindSeconds: 1500, owned: earned, earned,
    avatar: { look: LOOK, equipped: {}, frame: null, background: "bg_dusk", title: null, revision: 1 }, pack: { date: "2026-10-24", goalReached: false, claimed: false, tier: 0, daysInARow: 0 } });
  const store = createRewardsStore(storage); store.subscribe("a", () => {});
  await store.load("a", { load: async () => state([]) });
  await store.load("a", { load: async () => state(["beret", "tote", "pet_owl"]) });
  const reveal = { id: "return:s", kind: "expedition", seconds: 1500, finds: [{ item: "beret", rarity: "common", new: true, stardust: 0 }, { item: "tote", rarity: "common", new: false, stardust: 5 }], stardust: 10 };
  store.addReveal("a", reveal); store.addReveal("a", reveal);
  assert.equal(store.snapshot("a").reveals.length, 1, "one screen per return");
  assert.deepEqual(revealItems(reveal), ["beret"], "only new things count; a duplicate became Stardust");
  store.dismissReveal("a", "return:s");
  assert.deepEqual(store.snapshot("a").reveals, []);
  assert.deepEqual(store.snapshot("a").moments, ["tote", "pet_owl"], "the beret was shown on the return screen; the owl still gets its pop-up");
});

test("the trail shows only while a session runs, and you set off from camp only on a fresh start", async () => {
  const log = [];
  let reduced = false;
  const mod = load("src/components/session/SessionBackdrop.tsx", {
    "react-native": { View: host("View"), Pressable: host("Press"), StyleSheet: { create: v => v, absoluteFill: {} }, useWindowDimensions: () => ({ width: 390, height: 844 }) },
    "react-native-reanimated": { __esModule: true, default: { View: host("AView") }, Easing: { inOut: x => x, quad: 0 }, runOnJS: f => f, useAnimatedStyle: () => ({}), useSharedValue: v => ({ value: v }), withDelay: (_d, x) => x, withTiming: x => x },
    "../AppText": { Text: host("Text") }, "../adventurer/AdventurerBack": host("Walker"),
    "./TrailScenes": { NightTrail: props => { log.push(["trail", props.light, props.walking]); return React.createElement("Night", props); }, CampScene: host("Camp") },
    "../../hooks/useRewards": { useRewards: () => ({ look: LOOK, equipped: {}, today: { seconds: 3000, finds: 2 } }) },
    "../../hooks/useReducedMotion": { useReducedMotion: () => reduced },
  });
  const Backdrop = mod.default;
  const props = (phase, progress = 0.1, walking = true) => ({ phase, progress, walking, minutes: 45, area: "Learning" });
  let r; await act(async () => { r = create(React.createElement(Backdrop, props("setup"))); });
  assert.equal(r.toJSON(), null, "nothing behind setup");
  await act(async () => r.update(React.createElement(Backdrop, props("running"))));
  const off = () => r.root.findAll(n => typeof n.type === "string" && n.props.testID === "session-setting-off");
  assert.equal(off().length, 1, "a fresh start sets off from camp");
  assert.match(JSON.stringify(r.root.findAllByType("Text").map(t => t.props.children)), /SETTING OFF.*Off to the Lantern Lake.*45 min · Learning.*Tap anywhere to skip/);
  await act(async () => r.root.findByProps({ accessibilityLabel: "Skip" }).props.onPress());
  assert.equal(off().length, 0, "tap skips it");
  await act(async () => r.update(React.createElement(Backdrop, props("paused", 0.95, false))));
  assert.deepEqual(log.at(-1).slice(1), [0.84, false], "dawn near the end; standing still while paused");
  await act(async () => r.update(React.createElement(Backdrop, props("running", 0.95))));
  assert.equal(off().length, 0, "resuming never sets off again");
  await act(async () => r.unmount());
  // Reopening a session that was already running goes straight to the trail.
  await act(async () => { r = create(React.createElement(Backdrop, props("running"))); });
  assert.equal(off().length, 0);
  await act(async () => r.unmount());
  reduced = true;
  await act(async () => { r = create(React.createElement(Backdrop, props("setup"))); });
  await act(async () => r.update(React.createElement(Backdrop, props("running"))));
  assert.equal(off().length, 0, "less motion: no walk-off");
  await act(async () => r.unmount());
  const screen = fs.readFileSync(path.join(root, "src/components/SessionScreen.tsx"), "utf8");
  assert.match(screen, /<SessionBackdrop phase=\{phase\}/);
  assert.match(screen, /style=\{\[styles\.screen, onTrail && styles\.onTrail\]\}/, "the screen is see-through only while on the trail");
});

test("return and pack screens: walk back, see what you found and today's trail; open the pack, then its contents", async () => {
  const log = [];
  const mods = {
    "react-native": { View: host("View"), ScrollView: host("Scroll"), StyleSheet: { create: v => v }, useWindowDimensions: () => ({ width: 390, height: 844 }) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "react-native-reanimated": { __esModule: true, default: { View: host("AView") }, Easing: { inOut: x => x, out: x => x, sin: 0, quad: 0 }, useAnimatedStyle: () => ({}), useSharedValue: v => ({ value: v }),
      withRepeat: x => x, withSequence: x => x, withSpring: x => x, withTiming: x => x },
    "@expo/vector-icons": { Ionicons: host("Icon") }, "../MotionPressable": host("Press"), "../AppText": { Text: host("Text") },
    "../adventurer/Adventurer": host("Adventurer"), "../adventurer/ItemArt": { __esModule: true, default: host("Item"), StardustArt: host("Dust") },
    "../session/TrailScenes": { CampScene: host("Camp") }, "./PackArt": { __esModule: true, default: host("Pack"), PACK_COLORS: ["#1", "#2", "#3", "#4"] },
    "./TodayTrail": host("Trail"), "../../hooks/useReducedMotion": { useReducedMotion: () => true }, "../../utils/tapHaptics": { tapHaptic: () => log.push("haptic") },
  };
  const { ExpeditionReveal, PackReveal } = load("src/components/rewards/RevealScreens.tsx", mods);
  const player = { look: LOOK, equipped: {}, level: 4, background: "bg_dusk", frame: null, today: { seconds: 4500, finds: 3 }, nextFindSeconds: 420 };
  const reveal = { id: "r", kind: "expedition", seconds: 2700, finds: [{ item: "beret", rarity: "common", new: true, stardust: 0 }, { item: "tote", rarity: "common", new: false, stardust: 5 }], stardust: 14 };
  const words = r => JSON.stringify(r.root.findAllByType("Text").map(t => t.props.children));
  const press = (r, label) => act(async () => r.root.findAll(n => n.type === "Press" && n.props.accessibilityLabel === label)[0].props.onPress());
  let r; await act(async () => { r = create(React.createElement(ExpeditionReveal, { reveal, player, onClose: () => log.push("close"), onOutfits: () => log.push("outfits") })); });
  assert.ok(r.root.findAllByType("Camp").length && r.root.findAllByType("Adventurer").length, "back at camp, walking in");
  assert.match(words(r), /BACK AT CAMP.*45 minutes, done.*Your pack looks heavier · 2 finds/);
  await press(r, "See what you found");
  assert.match(words(r), /FROM YOUR 45-MINUTE WALK.*What you found.*Red beret.*NEW.*Canvas tote.*\+5.*\+14 Stardust/);
  assert.deepEqual(r.root.findByType("Trail").props.seconds, 4500, "today's trail so far");
  await press(r, "See it in Outfits"); await press(r, "Continue");
  assert.deepEqual(log.filter(x => x !== "haptic"), ["outfits", "close"]);
  await act(async () => r.unmount());
  // A test find has no session length.
  await act(async () => { r = create(React.createElement(ExpeditionReveal, { reveal: { ...reveal, seconds: null, finds: [], stardust: 6 }, player, onClose() {}, onOutfits() {} })); });
  assert.match(words(r), /Back at camp.*\+6 Stardust from the trail/);
  await act(async () => r.unmount());
  await act(async () => { r = create(React.createElement(PackReveal, { reveal: { id: "p", kind: "pack", tier: 2, daysInARow: 7, items: [{ item: "bg_sunset", rarity: "rare", new: true, stardust: 0 }], stardust: 41 }, player, onClose() {}, onOutfits() {} })); });
  assert.match(words(r), /TODAY'S SUPPLY PACK.*Brass pack.*7 days in a row/);
  assert.doesNotMatch(words(r), /Sunset/, "closed until you open it");
  await press(r, "Open your Brass pack");
  assert.match(words(r), /INSIDE YOUR PACK.*Sunset.*NEW.*\+41 Stardust.*Crystal pack/);
  assert.equal(r.root.findByType("Pack").props.open, true);
  await act(async () => r.unmount());
});

test("the pop-up host shows a return or pack screen first, and closing it marks it seen", async () => {
  const log = [];
  let reveals = [{ id: "pack:x", kind: "pack", tier: 0, daysInARow: 1, items: [], stardust: 10 }], moments = ["pet_owl"];
  const rewards = () => ({ online: true, moments, reveals, look: LOOK, equipped: {}, background: "bg_dusk", frame: null, today: { seconds: 0, finds: 0 }, nextFindSeconds: 1500,
    claimSessions: async () => ({ ok: true }), dismissMoment: id => log.push(`moment:${id}`), dismissReveal: id => { log.push(`reveal:${id}`); reveals = []; } });
  const native = { View: host("View"), StyleSheet: { create: v => v }, Modal: host("Modal"), AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
    Animated: { View: host("AView"), Value: class { setValue() {} interpolate() { return 0; } }, spring: () => ({ start() {}, stop() {} }), timing: () => ({}), loop: () => ({ start() {}, stop() {} }) }, Easing: { linear: 0 } };
  const Moments = load("src/components/RewardMoments.tsx", {
    "react-native": native, "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "expo-router": { useRouter: () => ({ push: to => log.push(`go:${to}`) }) },
    "react-native-svg": { __esModule: true, default: host("Svg"), G: host("G"), Path: host("Path") }, "./MotionPressable": host("Press"), "./AppText": { Text: host("Text") },
    "./adventurer/ItemArt": host("Item"), "./adventurer/ProfilePicture": host("Picture"),
    "../context/UserContext": { useUser: () => ({ profile: { id: "u", level: 4, current_xp: 1, streak_count: 1 } }) }, "../hooks/useRewards": { useRewards: () => rewards() },
    "../hooks/useReducedMotion": { useReducedMotion: () => true },
    "../services/launchIntroState": { launchIntroState: { subscribe: () => () => {}, isDone: () => true } },
    "../utils/sheetActivity": { registerSheetActivity: () => () => {}, useActiveSheetCount: () => 0 }, "../utils/tapHaptics": { tapHaptic() {} },
    "./rewards/RevealScreens": { ExpeditionReveal: host("Expedition"), PackReveal: host("PackOpen") }, "./rewards/rarity": { RARITY_COLOR: { epic: "#A78BFA" } },
  }).default;
  const wait = () => act(async () => { await new Promise(done => setTimeout(done, 480)); });
  let r; await act(async () => { r = create(React.createElement(Moments, { insideSession: false })); });
  assert.equal(r.root.findByType("Modal").props.visible, false, "waits a moment, so a goal celebration can go first");
  await wait();
  assert.equal(r.root.findByType("Modal").props.visible, true);
  assert.equal(r.root.findAllByType("PackOpen").length, 1); assert.equal(r.root.findAllByType("Picture").length, 0, "the owl waits");
  await act(async () => r.root.findByType("PackOpen").props.onOutfits());
  assert.deepEqual(log, ["reveal:pack:x", "go:/outfits"]);
  await act(async () => r.update(React.createElement(Moments, { insideSession: false }))); await wait();
  assert.equal(r.root.findAllByType("PackOpen").length, 0);
  assert.match(JSON.stringify(r.root.findAllByType("Text").map(t => t.props.children)), /Barn owl joined you/, "then the pop-ups");
  await act(async () => r.unmount());
});

test("Home shows your Stardust beside you and today's supply pack in Today", () => {
  const home = fs.readFileSync(path.join(root, "src/app/(tabs)/index.tsx"), "utf8");
  assert.match(home, /testID="home-stardust" onPress=\{\(\) => router\.navigate\("\/outfits"\)\}/);
  assert.match(home, /accessibilityLabel=\{`\$\{rewards\.stardust\} Stardust\. Open Outfits`\}/);
  assert.match(home, /<HomePack tier=\{rewards\.pack\.tier\} ready=\{rewards\.pack\.goalReached && !rewards\.pack\.claimed\}/);
  assert.match(home, /accessibilityLabel=\{`Open today's \$\{name\} pack`\}/);
  assert.match(home, /Reach your goal to open a \$\{name\} pack/);
  const hook = fs.readFileSync(path.join(root, "src/hooks/useRewards.ts"), "utf8");
  assert.match(hook, /if \(r\.ok\) rewardsStore\.addReveal\(owner, \{ id: `pack:/, "opening a pack shows the pack screen");
  assert.match(hook, /if \(r\.ok && r\.value\.sessions\.length\) \{/, "coming back from a session shows the return screen");
});

test("the tier road: every tier a stop on one road, lit behind you, your picture where you are", async () => {
  const sheet = props => React.createElement("Sheet", props, props.header, props.children);
  const api = load("src/components/LevelTierSheet.tsx", {
    "react-native": { View: host("View"), StyleSheet: { create: v => v, absoluteFill: {} } }, "@expo/vector-icons": { Ionicons: host("Icon") },
    "@gorhom/bottom-sheet": { BottomSheetScrollView: host("Scroll") }, "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) }, "./AppSheet": sheet,
    "react-native-svg": { __esModule: true, default: host("Svg"), Path: host("Path") }, "./adventurer/ProfilePicture": host("Picture"),
    "../hooks/useRewards": { useRewards: () => ({ look: LOOK, equipped: {}, background: "bg_dusk", frame: null }) }, "./AppText": { Text: host("Text") }, "./SheetHeader": host("Header"),
  });
  let r; await act(async () => { r = create(React.createElement(api.LevelTierPath, { level: 12, currentXP: 0 })); });
  const lit = r.root.findAllByType("Path").filter(p => p.props.stroke === "#FBBF24" || p.props.strokeWidth === 5);
  assert.equal(lit.length, 3, "three stretches walked: First steps → Spark → Momentum → Rhythm");
  assert.equal(r.root.findAllByType("Picture").length, 1, "you, at Rhythm");
  assert.equal(r.root.findAll(n => n.type === "View" && typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.includes("current tier")).length, 1);
  await act(async () => r.unmount());
});
