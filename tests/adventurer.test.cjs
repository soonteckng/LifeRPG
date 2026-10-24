/* global __dirname */
// The new character: one drawing with a layer per worn item, the profile
// picture, the shared rewards copy every screen reads, and the Outfits page.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, "..");

function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", "requestAnimationFrame", "cancelAnimationFrame", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const resolved = [".ts", ".tsx"].map(ext => target + ext).find(fs.existsSync);
    return load(path.relative(root, resolved), mocks, cache);
  }, mod, mod.exports, mocks.requestAnimationFrame ?? globalThis.requestAnimationFrame, mocks.cancelAnimationFrame ?? globalThis.cancelAnimationFrame);
  return mod.exports;
}
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
const svg = { __esModule: true, default: host("Svg"), G: host("G"), Path: host("Path"), Circle: host("Circle"), Ellipse: host("Ellipse"), Rect: host("Rect"), Defs: host("Defs"), LinearGradient: host("LinearGradient"), Stop: host("Stop"), Text: host("SvgText") };
const native = { View: host("View"), StyleSheet: { create: v => v, hairlineWidth: 1 } };
const drawing = () => load("src/components/adventurer/AdventurerArt.tsx", { "react-native-svg": svg });
const LOOK = { skin: "3", hair: "short", hairColor: "darkbrown", glasses: false };

test("every look and every wearable draws, each item as its own layer", async () => {
  const Art = drawing().default;
  const { REWARD_ITEMS } = load("src/services/rewardCatalog.ts");
  const { HAIR_STYLES } = load("src/utils/adventurerLook.ts");
  const count = async (props) => { let r; await act(async () => { r = create(React.createElement(Art, { size: 120, ...props })); }); const n = r.root.findAll(() => true).length; await act(async () => r.unmount()); return n; };
  const bare = await count({ look: LOOK });
  for (const item of REWARD_ITEMS.filter(i => i.kind === "wearable" && !i.free))
    assert.ok(await count({ look: LOOK, equipped: { [item.slot]: item.id } }) > bare, `${item.id} adds to the drawing`);
  for (const hair of HAIR_STYLES) for (const skin of ["1", "8"]) await count({ look: { ...LOOK, hair: hair.id, skin, glasses: true } });
  // The portrait shows the head and shoulders on a square.
  let r; await act(async () => { r = create(React.createElement(Art, { look: LOOK, size: 80, crop: "portrait" })); });
  const box = r.root.findByType("Svg").props;
  assert.deepEqual([box.width, box.height, box.viewBox], [80, 80, "38 12 124 124"]);
  await act(async () => r.unmount());
});

test("odd saved looks fall back to the default instead of breaking the drawing", () => {
  const { normalizeLook, DEFAULT_LOOK, darken, tierColor, levelLanternColors } = load("src/utils/adventurerLook.ts");
  assert.deepEqual(normalizeLook(null), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ skin: "9", hair: "mohawk", hairColor: "green", glasses: "yes" }), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ skin: "7", hair: "coily", hairColor: "black", glasses: true }), { skin: "7", hair: "coily", hairColor: "black", glasses: true });
  assert.equal(darken("#808080", 0.5), "#404040");
  assert.equal(tierColor(1), "#AAB3FF"); assert.equal(tierColor(12), "#F4AA88"); assert.equal(tierColor(250), "#BFA9F0");
  assert.equal(levelLanternColors(0), null);
  assert.equal(levelLanternColors(2).gem, false); assert.equal(levelLanternColors(3).gem, true);
  assert.equal(levelLanternColors(60).frame, "#F3E3AE");
});

test("the profile picture grows its frame with level and shows a pet and long streaks", async () => {
  const Pic = load("src/components/adventurer/ProfilePicture.tsx", { "react-native": native, "react-native-svg": svg, "../AppText": { Text: host("Text") },
    "./AdventurerArt": host("Art"), "./ItemArt": host("Item") }).default;
  const render = async props => { let r; await act(async () => { r = create(React.createElement(Pic, { look: LOOK, size: 96, level: 1, ...props })); }); return r; };
  const circles = r => r.root.findAllByType("Circle").length;
  const low = await render({}), mid = await render({ level: 21 }), high = await render({ level: 100, equipped: { pet: "pet_owl" }, streak: 12 });
  assert.ok(circles(mid) > circles(low), "studs from level 21");
  assert.ok(high.root.findAllByType("Path").length > mid.root.findAllByType("Path").length, "laurels and a crown at 100");
  assert.equal(high.root.findAllByType("Item")[0].props.id, "pet_owl");
  const texts = r => [...r.root.findAllByType("Text"), ...r.root.findAllByType("SvgText")].map(t => [].concat(t.props.children).join(""));
  assert.deepEqual(texts(high), ["12", "100"], "the 12-day streak, then the level below the picture");
  assert.equal(low.root.findAllByType("Item").length, 0); assert.deepEqual(texts(low), ["1"], "only the level: no pet, no short streak");
  const noLevel = await render({ showLevel: false });
  assert.equal(texts(noLevel).length, 0);
  await act(async () => noLevel.unmount());
  const small = await render({ size: 30, equipped: { pet: "pet_owl" }, streak: 40 });
  assert.equal(small.root.findAllByType("Item").length + texts(small).length, 0, "tiny pictures stay clean");
  const squadSize = await render({ size: 44, level: 7, equipped: { pet: "pet_owl" } });
  assert.deepEqual([squadSize.root.findAllByType("Item").length, texts(squadSize)], [1, ["7"]], "squad-size pictures show the pet and the level");
  await act(async () => squadSize.unmount());
  assert.equal(low.root.findByType("Art").props.crop, "portrait");
  for (const r of [low, mid, high, small]) await act(async () => r.unmount());
});

test("the shared rewards copy is kept per account, works offline and runs one change at a time", async () => {
  const saved = new Map();
  const storage = { getItem: async k => saved.get(k) ?? null, setItem: async (k, v) => { saved.set(k, v); } };
  const svc = load("src/services/rewardsService.ts", { "../../lib/supabase": { supabase: {} } });
  const { createRewardsStore, rewardsCacheKey, rewardsErrorMessage } = load("src/services/rewardsStore.ts", { "./rewardsService": svc });
  const state = stardust => ({ stardust, nextFindSeconds: 1500, owned: ["beret"], avatar: { look: LOOK, equipped: { head: "beret" }, frame: null, background: "bg_dusk", title: null, revision: 2 },
    pack: { date: "2026-10-24", goalReached: false, claimed: false, tier: 0, daysInARow: 0 } });
  const store = createRewardsStore(storage);
  let heard = 0; const stop = store.subscribe("a", () => heard++);
  await store.load("a", { load: async () => svc.parseRewardsState(state(10)) });
  assert.equal(store.snapshot("a").state.stardust, 10); assert.ok(heard > 0);
  assert.equal(JSON.parse(saved.get(rewardsCacheKey("a"))).stardust, 10, "kept on the phone for offline");
  assert.equal(store.snapshot("b").state, null, "another account sees nothing of it");
  // A new store (app restart, offline) shows the kept copy.
  const later = createRewardsStore(storage); later.subscribe("a", () => {});
  await later.load("a", null);
  assert.equal(later.snapshot("a").state.stardust, 10);
  // One change at a time; failures keep the copy and explain themselves.
  let release; const slow = new Promise(r => { release = r; });
  const first = store.act("a", () => slow.then(() => svc.parseRewardsState(state(70))));
  assert.deepEqual(await store.act("a", async () => state(1)), { ok: false, message: "One moment, still saving." });
  release(); assert.equal((await first).ok, true); assert.equal(store.snapshot("a").state.stardust, 70);
  assert.deepEqual(await store.act("a", async () => { throw Error("Not enough Stardust"); }), { ok: false, message: "Not enough Stardust." });
  assert.equal(store.snapshot("a").state.stardust, 70);
  assert.deepEqual(await store.act("a", null), { ok: false, message: "Connect to the internet to use rewards." });
  assert.match(rewardsErrorMessage({ message: "Account changed. Reconnect" }), /account changed/i);
  assert.match(rewardsErrorMessage(Error("relation does not exist")), /Couldn't reach your rewards/, "server internals never show");
  stop();
});

async function outfits({ online = true, ready = true, owned = ["cardigan", "beret"], earned = owned, frame = null, stardust = 100, params = {}, saveAvatar } = {}) {
  const log = [];
  const frames = new Map(); let frameId = 0;
  const renders = { adventurer: 0, thumbnails: 0, portrait: 0 };
  // Match the real portrait's memo boundary. Stage art is deliberately not
  // memoised here, so unrelated tabs prove the stage itself stays isolated.
  const Adventurer = props => { renders.adventurer++; return React.createElement("Adventurer", props); };
  const Picture = React.memo(function Picture(props) {
    if (props.size === 52) renders.thumbnails++; else renders.portrait++;
    return React.createElement("Picture", props);
  });
  const rewards = {
    state: ready ? { avatar: {} } : null,
    online, busy: false, stardust, owned, earned, look: LOOK, equipped: { top: "cardigan" }, background: "bg_dusk", frame, title: null,
    saveAvatar: async draft => { log.push(["save", draft]); return saveAvatar ? saveAvatar(draft) : { ok: true, value: {} }; },
    buy: async id => { log.push(["buy", id]); return { ok: true, value: {} }; },
  };
  const mod = load("src/app/outfits.tsx", {
    requestAnimationFrame: callback => { const id = ++frameId; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    "react-native": { ...native, useWindowDimensions: () => ({ width: 390, height: 844 }) }, "@expo/vector-icons": { Ionicons: host("Icon") }, "../components/MotionPressable": host("Press"), "../components/AppText": { Text: host("Text") },
    "../components/PersonalUI": { PersonalPage: ({ children, footer, pinned }) => React.createElement("Page", null, pinned, children, footer), PersonalButton: props => React.createElement("Button", props), p: {} },
    "../components/Segmented": props => React.createElement("Segmented", props), "../components/SheetConfirmation": props => React.createElement("Confirm", props),
    "../components/adventurer/Adventurer": Adventurer, "../components/adventurer/ItemArt": { __esModule: true, default: host("Item"), StardustArt: host("Dust") },
    "../context/UserContext": { useUser: () => ({ profile: { level: 12, streak_count: 33 } }) }, "../hooks/useRewards": { useRewards: () => rewards },
    "expo-router": { useRouter: () => ({ back: () => log.push(["back"]) }), useLocalSearchParams: () => params },
    "react-native-svg": svg, "../components/adventurer/ProfilePicture": { __esModule: true, default: Picture, levelPill: size => size >= 36 ? { room: 20, height: 18, width: 40, font: 11, border: 1.5 } : null },
  }), Screen = mod.default;
  let r; await act(async () => { r = create(React.createElement(Screen)); });
  const press = async label => act(async () => r.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0].props.onPress());
  const tab = async value => act(async () => r.root.findByType("Segmented").props.onChange(value));
  const button = title => r.root.findAllByType("Button").find(b => b.props.title === title);
  const words = () => JSON.stringify(r.root.findAllByType("Text").map(t => t.props.children));
  const nextFrame = async () => {
    const callbacks = [...frames.values()]; frames.clear();
    await act(async () => callbacks.forEach(callback => callback(0)));
  };
  const finishFrames = async () => {
    let count = 0;
    while (frames.size) { assert.ok(count++ < 10, "thumbnail work must be bounded"); await nextFrame(); }
  };
  const updateRewards = async changes => { Object.assign(rewards, changes); await act(async () => r.update(React.createElement(Screen))); };
  return { r, log, renders, press, tab, button, words, nextFrame, finishFrames, pendingFrames: () => frames.size,
    updateRewards, opening: mod.outfitsOpening, preview: () => r.root.findByType("Adventurer").props };
}

test("See it in Outfits opens on the item's own category, already tried on", async () => {
  const ui = await outfits({ owned: ["cardigan", "beret", "pet_owl"], params: { show: "pet_owl" } });
  const opening = ui.opening;
  assert.equal(opening("pet_owl").tab, "pets", "a pet opens Pets");
  assert.deepEqual([opening("frame_streak_30").tab, opening("frame_streak_30").part], ["picture", "frames"], "a frame opens Picture › Frames");
  assert.equal(opening("title_scholar").part, "badges", "a badge opens Picture › Badges");
  assert.equal(opening("beret").tab, "clothes");
  assert.equal(opening("beret").slot, "head", "clothes open on their own slot");
  assert.equal(opening("nonsense"), null, "anything else opens Outfits as usual");
  try {
    assert.equal(ui.r.root.findByType("Segmented").props.value, "pets");
    assert.equal(ui.button("Save look").props.disabled, false, "the owl is tried on, ready to keep");
  } finally { await act(async () => ui.r.unmount()); }
});

test("Outfits wears what you own, previews what you don't, and saves then goes back to Profile", async () => {
  const ui = await outfits();
  try {
    assert.equal(ui.button("Save look").props.disabled, true, "nothing to save yet");
    await ui.press("Skin tone 7"); await ui.press("Braids"); await ui.press("Glasses off");
    assert.deepEqual(ui.preview().look, { skin: "7", hair: "braids", hairColor: "darkbrown", glasses: true });
    await ui.tab("clothes");
    assert.equal(ui.r.root.findAll(n => n.props.accessibilityLabel === "Oat cardigan, Uncommon, wearing").length, 0, "one part at a time: Hats first");
    await ui.press("Red beret, Common, owned");
    assert.deepEqual(ui.preview().equipped, { top: "cardigan", head: "beret" });
    await ui.press("Tops");
    await ui.press("Oat cardigan, Uncommon, wearing");
    assert.deepEqual(ui.preview().equipped, { head: "beret" }, "tap again to take it off");
    // Locked: you can try it on to see it, but not save it.
    await ui.press("Field jacket, Uncommon, not found yet");
    assert.deepEqual(ui.preview().equipped, { head: "beret", top: "field_jacket" }, "previewed on the character");
    assert.equal(ui.r.root.findAllByType("Confirm").length, 0, "trying on never asks to buy");
    assert.equal(ui.button("Save look").props.disabled, true);
    assert.match(ui.words(), /Trying on Field jacket/);
    assert.equal(ui.button("Get it for 120 Stardust").props.secondary, true);
    await act(async () => ui.button("Get it for 120 Stardust").props.onPress());
    const confirm = ui.r.root.findByType("Confirm").props;
    assert.equal(confirm.confirmLabel, "Not enough Stardust");
    await act(async () => confirm.onConfirm());
    assert.deepEqual(ui.log, [], "not enough Stardust buys nothing");
    await ui.press("Field jacket, Uncommon, wearing");
    await ui.tab("pets"); await ui.press("Barn owl, Epic, not found yet");
    assert.equal(ui.button("Get it for undefined Stardust"), undefined, "pets aren't sold");
    assert.match(ui.words(), /Joins you at 10 hours of focus/);
    await ui.press("Barn owl, Epic, wearing");
    assert.equal(ui.button("Save look").props.disabled, false);
    await act(async () => ui.button("Save look").props.onPress());
    assert.doesNotMatch(ui.words(), /Tap something|Tap again|free for everyone/, "no hint text");
    assert.deepEqual(ui.log, [["save", { look: { skin: "7", hair: "braids", hairColor: "darkbrown", glasses: true }, equipped: { head: "beret" }, background: "bg_dusk", title: null }], ["back"]],
      "saved, then back to Profile");
  } finally { await act(async () => ui.r.unmount()); }
});

test("Outfits buys with enough Stardust after asking, and needs internet to save or buy", async () => {
  const ui = await outfits({ stardust: 500 });
  try {
    await ui.tab("gear"); await ui.press("In hand"); await ui.press("Walking staff, Common, not found yet");
    await act(async () => ui.button("Get it for 60 Stardust").props.onPress());
    const confirm = ui.r.root.findByType("Confirm").props;
    assert.equal(confirm.confirmLabel, "Buy for 60");
    await act(async () => confirm.onConfirm());
    assert.deepEqual(ui.log, [["buy", "walking_staff"]]);
  } finally { await act(async () => ui.r.unmount()); }
  const off = await outfits({ online: false, stardust: 500 });
  try {
    await off.press("Skin tone 2");
    assert.equal(off.button("Save look").props.disabled, true);
    await off.tab("gear"); await off.press("In hand"); await off.press("Walking staff, Common, not found yet");
    assert.equal(off.button("Get it for 60 Stardust"), undefined, "no buying offline");
  } finally { await act(async () => off.r.unmount()); }
});

test("the Profile tab: frames follow your streak and only preview, badges and backgrounds are chosen", async () => {
  const ui = await outfits({ owned: ["cardigan", "frame_streak_7", "frame_streak_30", "bg_sunset", "title_artist"], frame: "frame_streak_30" });
  try {
    await ui.tab("picture");
    const stage = () => ui.r.root.findAllByType("Picture").find(p => p.props.size >= 100).props;
    assert.equal(stage().frame, "frame_streak_30", "your highest earned frame shows");
    const labels = ui.r.root.findAll(n => n.type === "Press" && typeof n.props.accessibilityLabel === "string" && /in a row|Level frame/.test(n.props.accessibilityLabel) && typeof n.props.onPress === "function").map(n => n.props.accessibilityLabel);
    assert.deepEqual(labels, ["Level frame, Earned", "7 days in a row, Earned", "30 days in a row, Showing", "60 days in a row, 27 days to go",
      "100 days in a row, 67 days to go", "180 days in a row, 147 days to go", "365 days in a row, 332 days to go"]);
    await ui.press("60 days in a row, 27 days to go");
    assert.equal(stage().frame, "frame_streak_60", "tapping a frame previews it");
    assert.match(ui.words(), /Preview/);
    assert.equal(ui.button("Save look").props.disabled, true, "a frame is never saved");
    await ui.press("Badges"); await ui.press("The Artist, Rare, owned");
    await ui.press("Background"); await ui.press("Sunset, Rare, owned");
    assert.deepEqual([stage().frame, stage().background, stage().level], ["frame_streak_30", "bg_sunset", 12], "leaving Frames ends the preview");
    assert.match(ui.words(), /The Artist/);
    await act(async () => ui.button("Save look").props.onPress());
    assert.deepEqual(ui.log[0], ["save", { look: LOOK, equipped: { top: "cardigan" }, background: "bg_sunset", title: "title_artist" }]);
  } finally { await act(async () => ui.r.unmount()); }
});

test("unrelated Outfits tab changes reuse the stage; preview changes still redraw it", async () => {
  const ui = await outfits({ owned: ["cardigan", "pet_owl"] });
  try {
    assert.equal(ui.renders.adventurer, 1);
    for (const tab of ["clothes", "gear", "pets"]) await ui.tab(tab);
    assert.equal(ui.renders.adventurer, 1, "one standing character is kept across tabs, without rebuilding the stage");
    await ui.press("Barn owl, Epic, owned");
    assert.equal(ui.preview().equipped.pet, "pet_owl");
    assert.equal(ui.renders.adventurer, 2, "equipping a pet updates the real preview");
    await ui.tab("look");
    await ui.press("Skin tone 7");
    assert.equal(ui.preview().look.skin, "7");
    assert.equal(ui.renders.adventurer, 3);
  } finally { await act(async () => ui.r.unmount()); }
});

test("frame previews redraw the main portrait without rebuilding seven unchanged sample portraits", async () => {
  const ui = await outfits({ frame: "frame_streak_30" });
  try {
    await ui.tab("picture");
    await ui.finishFrames();
    assert.deepEqual([ui.renders.thumbnails, ui.renders.portrait], [7, 1]);
    await ui.press("60 days in a row, 27 days to go");
    await ui.press("180 days in a row, 147 days to go");
    assert.deepEqual([ui.renders.thumbnails, ui.renders.portrait], [7, 3], "the unchanged frame samples survive each preview selection");
    const chosen = ui.r.root.findAll(n => n.type === "Press" && n.props.accessibilityState?.selected);
    assert.equal(chosen.length, 1);
    assert.match(chosen[0].props.accessibilityLabel, /^180 days/);
    assert.equal(ui.button("Save look").props.disabled, true, "preview still cannot change the earned frame");
  } finally { await act(async () => ui.r.unmount()); }
});

test("Picture opens with three portraits, while all frame choices remain immediately usable", async () => {
  const ui = await outfits({ frame: "frame_streak_30" });
  try {
    await ui.tab("picture");
    assert.deepEqual([ui.renders.thumbnails, ui.renders.portrait], [2, 1], "tab entry does not mount all eight SVG portraits together");
    const frames = () => ui.r.root.findAll(n => n.type === "Press" && /^(Level frame|\d+ days in a row),/.test(n.props.accessibilityLabel ?? ""));
    assert.equal(frames().length, 7, "labels, status and press targets are never deferred");
    await ui.press("365 days in a row, 332 days to go");
    const stage = () => ui.r.root.findAllByType("Picture").find(p => p.props.size >= 100);
    assert.equal(stage().props.frame, "frame_streak_365", "a tap previews the frame before its thumbnail is drawn");
    assert.equal(ui.renders.thumbnails, 2);
    assert.equal(ui.button("Save look").props.disabled, true);
    for (let count = 3; count <= 7; count++) {
      await ui.nextFrame();
      assert.equal(ui.renders.thumbnails, count, "only one extra thumbnail mounts per frame");
      assert.equal(stage().props.frame, "frame_streak_365");
    }
    assert.equal(ui.pendingFrames(), 0);
    assert.equal(frames().filter(n => n.props.accessibilityState.selected).length, 1);
  } finally { await act(async () => ui.r.unmount()); }
  assert.equal(ui.pendingFrames(), 0);
});

test("leaving Picture or Frames cancels pending portrait work without changing a saved look", async () => {
  const ui = await outfits({ frame: "frame_streak_30" });
  try {
    await ui.tab("picture");
    assert.equal(ui.pendingFrames(), 1);
    await ui.tab("pets");
    assert.equal(ui.pendingFrames(), 0);
    const draws = ui.renders.thumbnails;
    await ui.nextFrame();
    assert.equal(ui.renders.thumbnails, draws, "the hidden list draws nothing");
    await ui.tab("picture");
    assert.equal(ui.pendingFrames(), 1);
    await ui.press("Badges");
    assert.equal(ui.pendingFrames(), 0);
    await ui.press("Frames");
    assert.equal(ui.pendingFrames(), 1);
    assert.deepEqual(ui.log, [], "art scheduling never saves or buys anything");
  } finally { await act(async () => ui.r.unmount()); }
  assert.equal(ui.pendingFrames(), 0, "unmount releases the outstanding frame callback");
});

test("a reward deep link waits for the saved avatar and preserves its late-arriving look and equipment", async () => {
  const ui = await outfits({ ready: false, owned: ["cardigan", "beret", "tote", "pet_owl", "bg_night"], params: { show: "pet_owl" } });
  try {
    assert.equal(ui.button("Save look").props.disabled, true);
    await act(async () => ui.button("Save look").props.onPress());
    assert.deepEqual(ui.log, [], "a placeholder avatar can never be submitted");
    const look = { skin: "7", hair: "coily", hairColor: "black", glasses: true };
    await ui.updateRewards({ state: { avatar: {} }, look, equipped: { top: "cardigan", head: "beret", bag: "tote" }, background: "bg_night", title: null });
    assert.deepEqual(ui.preview().look, look);
    assert.deepEqual(ui.preview().equipped, { top: "cardigan", head: "beret", bag: "tote", pet: "pet_owl" });
    assert.equal(ui.button("Save look").props.disabled, false);
    await act(async () => ui.button("Save look").props.onPress());
    assert.deepEqual(ui.log[0], ["save", { look, equipped: { top: "cardigan", head: "beret", bag: "tote", pet: "pet_owl" }, background: "bg_night", title: null }]);
  } finally { await act(async () => ui.r.unmount()); }
});

test("manual changes made before the saved avatar loads require Reset instead of overwriting that avatar", async () => {
  const ui = await outfits({ ready: false });
  try {
    await ui.press("Skin tone 7");
    const edited = ui.preview().look;
    await ui.updateRewards({ state: { avatar: {} }, look: { ...LOOK, hair: "coily" }, equipped: { top: "cardigan", head: "beret" } });
    assert.deepEqual(ui.preview().look, edited, "keep the person's visible draft until they choose Reset");
    assert.match(ui.words(), /Your saved look changed.*Reset to review/);
    assert.equal(ui.button("Save look").props.disabled, true);
    await act(async () => ui.button("Save look").props.onPress());
    assert.deepEqual(ui.log, []);
    assert.equal(ui.button("Reset").props.disabled, false);
    await act(async () => ui.button("Reset").props.onPress());
    assert.equal(ui.preview().look.hair, "coily");
    assert.deepEqual(ui.preview().equipped, { top: "cardigan", head: "beret" });
    assert.doesNotMatch(ui.words(), /Reset to review/);
  } finally { await act(async () => ui.r.unmount()); }
});

test("an external outfit change fences a manual draft, but equivalent snapshots and automatic frames do not", async () => {
  const ui = await outfits({ owned: ["cardigan", "beret", "pet_owl"] });
  try {
    await ui.updateRewards({ equipped: { top: "cardigan", head: "beret" } });
    await ui.press("Skin tone 7");
    await ui.updateRewards({ state: { avatar: {} }, look: { ...LOOK }, equipped: { head: "beret", absent: undefined, top: "cardigan" }, frame: "frame_streak_60", stardust: 110, owned: ["cardigan", "beret", "pet_owl", "tote"] });
    assert.equal(ui.button("Save look").props.disabled, false, "a refresh with the same editable values leaves the draft valid");
    await ui.updateRewards({ look: { ...LOOK, hair: "long" }, equipped: { head: "beret", top: "cardigan" } });
    assert.equal(ui.preview().look.skin, "7", "do not silently rebase a manual choice");
    assert.equal(ui.preview().look.hair, "short");
    assert.equal(ui.button("Save look").props.disabled, true);
    await act(async () => ui.button("Save look").props.onPress());
    assert.deepEqual(ui.log, []);
    await act(async () => ui.button("Reset").props.onPress());
    assert.equal(ui.preview().look.hair, "long");
    await ui.press("Skin tone 6");
    assert.equal(ui.button("Save look").props.disabled, false);
    await act(async () => ui.button("Save look").props.onPress());
    assert.equal(ui.log[0][1].look.hair, "long");
    assert.equal(ui.log[0][1].look.skin, "6");
    assert.deepEqual(ui.log[0][1].equipped, { head: "beret", top: "cardigan" });
  } finally { await act(async () => ui.r.unmount()); }
});

test("a saved look reply after Outfits unmounts cannot navigate the person's new screen", async () => {
  let finish;
  const ui = await outfits({ saveAvatar: () => new Promise(resolve => { finish = resolve; }) });
  await ui.press("Skin tone 7");
  await act(async () => { ui.button("Save look").props.onPress(); });
  await act(async () => ui.r.unmount());
  await act(async () => finish({ ok: true, value: {} }));
  assert.equal(ui.log.filter(([event]) => event === "back").length, 0);
});

test("Reset and Save look stay fixed below the scrolling outfits", async () => {
  const page = fs.readFileSync(path.join(root, "src/app/outfits.tsx"), "utf8");
  assert.match(page, /<PersonalPage title="Outfits"[^>]*footer=\{footer\} pinned=\{pinned\}>/);
  const ui = await outfits();
  try {
    assert.ok(ui.r.root.findAll(n => n.type === "View" && n.props.testID === "outfits-preview").length, "the pinned preview keeps its testID and layout");
  } finally { await act(async () => ui.r.unmount()); }
  const personal = fs.readFileSync(path.join(root, "src/components/PersonalUI.tsx"), "utf8");
  assert.match(personal, /<\/TourScrollView>\s*\{footer && <View/, "the footer sits outside the scroll view");
});

const devSql = fs.readFileSync(path.join(root, "supabase/migrations/20261024100000_rewards_dev_tools.sql"), "utf8");
test("the developer rewards helpers are for developer accounts only and touch only their own rows", () => {
  assert.match(devSql, /if not exists\(select 1 from liferpg_auth_private\.developers where user_id = owner\) then raise exception 'Only developer accounts can use this'/);
  assert.match(devSql, /revoke all on function public\.dev_rewards_v1\(uuid, text, integer\) from public, anon;/);
  for (const statement of devSql.match(/(delete from|update) liferpg_reward_private\.\w+[^;]*;/g)) assert.match(statement, /where user_id = owner/, statement);
  assert.match(devSql, /p_amount not between 1 and 5000/);
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, "package.json"))) moduleRoot = path.join(moduleRoot, "@electric-sql", "pglite");
  const { PGlite } = require(moduleRoot);
  const core = fs.readFileSync(path.join(root, "supabase/migrations/20261024090000_rewards_core.sql"), "utf8");
  const unlocks = fs.readFileSync(path.join(root, "supabase/migrations/20261024110000_rewards_dev_unlocks.sql"), "utf8");
  const dev = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
  test("SQL: developer helpers add Stardust, reopen today's pack with the ladder carrying on, and reset only rewards", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create schema auth; create schema liferpg_auth_private;
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
        create role authenticated; create role anon;
        create table auth.users(id uuid primary key);
        create table liferpg_auth_private.developers(user_id uuid primary key);
        create table public.profiles(id uuid primary key, timezone text, streak_count int default 0);
        create table public.activity_sessions(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, status text, duration_seconds int, credit_result jsonb, completed_at timestamptz);
        create table public.daily_progress(user_id uuid, progress_date date, goal_minutes int, goal_completed boolean);
        insert into auth.users values ('${dev}'), ('${other}'); insert into public.profiles(id, timezone) values ('${dev}', 'UTC'), ('${other}', 'UTC');
        insert into liferpg_auth_private.developers values ('${dev}');`);
      await db.exec(core); await db.exec(devSql); await db.exec(unlocks);
      const as = u => db.exec(`select set_config('test.uid', '${u}', false)`);
      const call = async (u, action, amount = 0) => (await db.query(`select public.dev_rewards_v1($1, $2, $3) s`, [u, action, amount])).rows[0].s;
      await as(other);
      await assert.rejects(call(other, "stardust", 100), /Only developer accounts/);
      await as(dev);
      assert.equal((await call(dev, "stardust", 500)).stardust, 500);
      await assert.rejects(call(dev, "stardust", 999999), /Invalid amount/);
      await assert.rejects(call(dev, "anything"), /Unknown developer action/);
      await db.query(`insert into public.daily_progress values ($1, (now() at time zone 'UTC')::date, 30, true)`, [dev]);
      const first = (await db.query(`select public.open_daily_pack_v1($1) r`, [dev])).rows[0].r;
      assert.equal(first.daysInARow, 1);
      await call(dev, "reopen_pack");
      const second = (await db.query(`select public.open_daily_pack_v1($1) r`, [dev])).rows[0].r;
      assert.equal(second.daysInARow, 2, "the ladder carries on");
      await db.query(`insert into public.activity_sessions(user_id, status, duration_seconds, credit_result, completed_at) values ($1, 'completed', 3000, '{}', now())`, [dev]);
      await db.query(`select public.claim_session_rewards_v1($1)`, [dev]);
      const reset = await call(dev, "reset");
      assert.deepEqual([reset.stardust, reset.pack.claimed], [0, false]);
      assert.equal((await db.query(`select count(*)::int n from liferpg_reward_private.inventory where user_id = $1`, [dev])).rows[0].n, 0, "the real inventory is empty after a reset");
      assert.equal((await db.query(`select count(*)::int n from public.activity_sessions`)).rows[0].n, 1, "sessions stay");
      const again = (await db.query(`select public.claim_session_rewards_v1($1) r`, [dev])).rows[0].r;
      assert.equal(again.sessions.length, 1, "today's sessions can be collected again after a reset");
    } finally { await db.close(); }
  });
}

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, "package.json"))) moduleRoot = path.join(moduleRoot, "@electric-sql", "pglite");
  const { PGlite } = require(moduleRoot);
  const read = f => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8");
  const dev = "11111111-1111-4111-8111-111111111111", user = "22222222-2222-4222-8222-222222222222";
  test("SQL: a developer account has everything unlocked on the same screens; a normal account still has to earn it", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create schema auth; create schema liferpg_auth_private;
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
        create role authenticated; create role anon;
        create table auth.users(id uuid primary key); create table liferpg_auth_private.developers(user_id uuid primary key);
        create table public.profiles(id uuid primary key, timezone text, streak_count int default 0);
        create table public.activity_sessions(id uuid primary key default gen_random_uuid(), user_id uuid, status text, duration_seconds int, credit_result jsonb, completed_at timestamptz);
        create table public.daily_progress(user_id uuid, progress_date date, goal_minutes int, goal_completed boolean);
        insert into auth.users values ('${dev}'), ('${user}'); insert into public.profiles(id, timezone) values ('${dev}', 'UTC'), ('${user}', 'UTC');
        insert into liferpg_auth_private.developers values ('${dev}');`);
      for (const f of ["20261024090000_rewards_core.sql", "20261024100000_rewards_dev_tools.sql", "20261024110000_rewards_dev_unlocks.sql"]) await db.exec(read(f));
      const as = u => db.exec(`select set_config('test.uid', '${u}', false)`);
      const look = { skin: "3", hair: "short", hairColor: "darkbrown", glasses: false };
      const everything = { look, equipped: { top: "field_jacket", head: "beret", back: "forest_cloak", pet: "pet_fox" }, frame: "frame_streak_365", background: "bg_sunset", title: "title_artist" };
      await as(dev);
      const d = (await db.query(`select public.get_rewards_v1($1) s`, [dev])).rows[0].s;
      const total = (await db.query(`select count(*)::int n from liferpg_reward_private.items`)).rows[0].n;
      assert.equal(d.owned.length, total, "every item is unlocked for a developer");
      const saved = (await db.query(`select public.save_avatar_v1($1, $2, $3) s`, [dev, everything, d.avatar.revision])).rows[0].s;
      assert.equal(saved.avatar.frame, "frame_streak_365"); assert.equal(saved.avatar.equipped.pet, "pet_fox");
      await as(user);
      const u = (await db.query(`select public.get_rewards_v1($1) s`, [user])).rows[0].s;
      assert.deepEqual(u.owned, [], "a normal account starts with nothing");
      await assert.rejects(db.query(`select public.save_avatar_v1($1, $2, $3)`, [user, everything, u.avatar.revision]), /don't have that item/);
      const free = (await db.query(`select public.save_avatar_v1($1, $2, $3) s`, [user, { look, equipped: { face: "glasses" }, background: "bg_dusk" }, u.avatar.revision])).rows[0].s;
      assert.deepEqual(free.avatar.equipped, { face: "glasses" }, "free items still work for everyone");
    } finally { await db.close(); }
  });
}

// Round 56: frames follow the streak, and everything earned gets a pop-up.
test("streak frames draw inside the picture's own box, so Android never cuts the top off", async () => {
  const Pic = load("src/components/adventurer/ProfilePicture.tsx", { "react-native": native, "react-native-svg": svg, "../AppText": { Text: host("Text") },
    "./AdventurerArt": host("Art"), "./ItemArt": host("Item") }).default;
  const { STREAK_FRAMES } = load("src/services/rewardCatalog.ts");
  const shapes = [];
  for (const f of STREAK_FRAMES) {
    let r; await act(async () => { r = create(React.createElement(Pic, { look: LOOK, size: 112, level: 1, frame: f.id })); });
    const frame = r.root.findAllByType("Svg").find(x => x.props.viewBox);
    assert.ok(frame, "the frame's own drawing");
    assert.equal(frame.props.viewBox, "-6 -11 112 112", "room above the ring for the flame and crown");
    assert.notEqual(frame.props.style?.overflow, "visible");
    shapes.push(`${r.root.findAllByType("Path").length}:${r.root.findAllByType("Circle").length}:${r.root.findAllByType("Circle").find(c => c.props.stroke).props.stroke}`);
    await act(async () => r.unmount());
  }
  assert.equal(new Set(shapes).size, STREAK_FRAMES.length, "every streak frame has its own shape");
  const fs2 = fs.readFileSync(path.join(root, "src/components/adventurer/ProfilePicture.tsx"), "utf8");
  assert.doesNotMatch(fs2, /-size \* 0\.02/, "badges stay inside the box too");
});

test("anything newly earned waits for its pop-up; purchases, old rewards and lower frames don't get one", async () => {
  const saved = new Map();
  const storage = { getItem: async k => saved.get(k) ?? null, setItem: async (k, v) => { saved.set(k, v); } };
  const svc = load("src/services/rewardsService.ts", { "../../lib/supabase": { supabase: {} } });
  const { createRewardsStore, rewardsSeenKey } = load("src/services/rewardsStore.ts", { "./rewardsService": svc });
  const state = (earned, owned = earned) => svc.parseRewardsState({ stardust: 0, nextFindSeconds: 1500, owned, earned,
    avatar: { look: LOOK, equipped: {}, frame: null, background: "bg_dusk", title: null, revision: 1 }, pack: { date: "2026-10-24", goalReached: false, claimed: false, tier: 0, daysInARow: 0 } });
  const store = createRewardsStore(storage); store.subscribe("a", () => {});
  const load1 = list => store.load("a", { load: async () => state(list) });
  await load1(["beret"]);
  assert.deepEqual(store.snapshot("a").moments, [], "what you had before this version counts as seen");
  await load1(["beret", "tote", "pet_owl", "frame_streak_7", "frame_streak_30", "frame_streak_60"]);
  assert.deepEqual(store.snapshot("a").moments, ["tote", "pet_owl", "frame_streak_60"], "one pop-up per new thing; only the highest new frame");
  await store.act("a", async () => ({ state: state(["beret", "tote", "pet_owl", "frame_streak_7", "frame_streak_30", "frame_streak_60", "cardigan"]) }), ["cardigan"]);
  assert.deepEqual(store.snapshot("a").moments, ["tote", "pet_owl", "frame_streak_60"], "a purchase gets no pop-up");
  store.dismissMoment("a", "tote");
  assert.deepEqual(store.snapshot("a").moments, ["pet_owl", "frame_streak_60"]);
  // An app restart shows what wasn't closed yet, and never what was.
  const later = createRewardsStore(storage); later.subscribe("a", () => {});
  await later.load("a", { load: async () => state(["beret", "tote", "pet_owl", "frame_streak_7", "frame_streak_30", "frame_streak_60", "cardigan"]) });
  assert.deepEqual(later.snapshot("a").moments, ["pet_owl", "frame_streak_60"]);
  later.dismissMoment("a", "pet_owl"); later.dismissMoment("a", "frame_streak_60");
  await later.load("a", { load: async () => state(["beret", "tote", "cardigan"]) });
  assert.deepEqual(later.snapshot("a").moments, []);
  // Taken back (the developer "earn again" tool) and given again: it gets its pop-up again.
  await later.load("a", { load: async () => state(["beret", "tote", "cardigan", "pet_owl"]) });
  assert.deepEqual(later.snapshot("a").moments, ["pet_owl"]);
  assert.ok(!JSON.parse(saved.get(rewardsSeenKey("a"))).includes("pet_owl"));
  // A developer owns everything, but only what they really earned is celebrated.
  const dev = createRewardsStore(new Map() && { getItem: async () => "[]", setItem: async () => {} }); dev.subscribe("d", () => {});
  await dev.load("d", { load: async () => state(["pet_cat"], ["beret", "pet_cat", "tote"]) });
  assert.deepEqual(dev.snapshot("d").moments, ["pet_cat"]);
});

test("the reward pop-up: one at a time, never during a session or over another sheet, and it checks after each session", async () => {
  const log = [];
  let moments = ["frame_streak_30", "pet_owl"], profile = { id: "u", level: 4, current_xp: 10, streak_count: 30 }, sheets = 0;
  const rewards = () => ({ online: true, moments, reveals: [], look: LOOK, equipped: {}, background: "bg_dusk", today: { seconds: 0, finds: 0 }, nextFindSeconds: 1500,
    claimSessions: async () => { log.push("claim"); return { ok: true }; }, dismissMoment: id => { log.push(`seen:${id}`); moments = moments.filter(m => m !== id); } });
  const mod = load("src/components/RewardMoments.tsx", {
    "react-native": { ...native, Modal: host("Modal"), AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
      Animated: { View: host("AView"), Value: class { constructor(v) { this.v = v; } setValue() {} interpolate() { return 0; } }, spring: () => ({ start() {}, stop() {} }), timing: () => ({}), loop: () => ({ start() {}, stop() {} }) },
      Easing: { linear: 0 } },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "expo-router": { usePathname: () => "/", useRouter: () => ({ push: to => log.push(typeof to === "string" ? `go:${to}` : `go:${to.pathname}?show=${to.params?.show}`) }) },
    "react-native-svg": svg, "./MotionPressable": host("Press"), "./AppText": { Text: host("Text") },
    "./adventurer/ItemArt": host("Item"), "./adventurer/ProfilePicture": host("Picture"),
    "../context/UserContext": { useUser: () => ({ profile }) }, "../hooks/useRewards": { useRewards: () => rewards() },
    "../hooks/useReducedMotion": { useReducedMotion: () => true },
    "../services/launchIntroState": { launchIntroState: { subscribe: () => () => {}, isDone: () => true } },
    "../utils/sheetActivity": { registerSheetActivity: () => () => {}, useActiveSheetCount: () => sheets },
    "../utils/tapHaptics": { tapHaptic: () => log.push("haptic") },
    "./rewards/RevealScreens": { ExpeditionReveal: host("Expedition"), PackReveal: host("PackOpen") },
    "./rewards/rarity": { RARITY_COLOR: { common: "#C2C8D8", uncommon: "#2DD4A7", rare: "#60A5FA", epic: "#A78BFA", legendary: "#FBBF24" } },
  });
  const Moments = mod.default;
  // A pop-up waits a moment after everything else closes (see SETTLE_MS).
  let r; const render = async inside => { await act(async () => { if (r) r.update(React.createElement(Moments, { insideSession: inside })); else r = create(React.createElement(Moments, { insideSession: inside })); });
    await act(async () => { await new Promise(done => setTimeout(done, 480)); }); };
  const words = () => JSON.stringify(r.root.findAllByType("Text").map(t => t.props.children));
  const press = label => act(async () => r.root.findAll(n => n.type === "Press" && n.props.accessibilityLabel === label)[0].props.onPress());
  try {
    await render(true);
    assert.equal(r.root.findByType("Modal").props.visible, false, "never during a session");
    assert.deepEqual(log, ["claim"], "checks when the app opens");
    await render(false);
    assert.equal(r.root.findByType("Modal").props.visible, true);
    assert.equal(r.root.findByType("Picture").props.frame, "frame_streak_30", "a frame shows on your own picture");
    assert.match(words(), /NEW FRAME.*30 days in a row!.*upgrades on its own/);
    assert.match(words(), /1 more after this/);
    assert.ok(log.includes("haptic"));
    await press("Continue");
    await render(false);
    assert.match(words(), /NEW FRIEND.*Barn owl joined you.*For 10 hours of focus/);
    await press("See it in Outfits");
    assert.deepEqual(log.filter(x => x.startsWith("seen") || x.startsWith("go")), ["seen:frame_streak_30", "seen:pet_owl", "go:/outfits?show=pet_owl"], "Outfits opens on the pet, in Pets");
    moments = ["beret"]; sheets = 1; await render(false);
    assert.equal(r.root.findByType("Modal").props.visible, false, "waits for another sheet to close");
    sheets = 0; await render(false);
    assert.match(words(), /NEW FIND.*Red beret.*common piece from the Artist set/);
    // A finished session changes XP: look for new finds and frames again.
    const before = log.filter(x => x === "claim").length;
    profile = { ...profile, current_xp: 40 }; await render(false);
    assert.equal(log.filter(x => x === "claim").length, before + 1);
    const { momentCopy } = mod; const { rewardItem } = load("src/services/rewardCatalog.ts");
    assert.match(momentCopy(rewardItem("title_scholar")).body, /every Scholar piece/);
    assert.equal(momentCopy(rewardItem("decor_bonsai")).outfits, false, "camp pieces don't send you to Outfits");
    for (const id of ["frame_streak_7", "pet_fox", "bg_night", "title_wanderer"]) assert.doesNotMatch(JSON.stringify(momentCopy(rewardItem(id))), /—/, "no dashes");
  } finally { await act(async () => r.unmount()); }
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, "package.json"))) moduleRoot = path.join(moduleRoot, "@electric-sql", "pglite");
  const { PGlite } = require(moduleRoot);
  const read = f => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8");
  const dev = "11111111-1111-4111-8111-111111111111", user = "22222222-2222-4222-8222-222222222222";
  test("SQL: the frame follows the highest streak frame earned, 60 and 180 days included; developers re-earn through the real check", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create schema auth; create schema liferpg_auth_private;
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
        create role authenticated; create role anon;
        create table auth.users(id uuid primary key); create table liferpg_auth_private.developers(user_id uuid primary key);
        create table public.profiles(id uuid primary key, timezone text, streak_count int default 0);
        create table public.activity_sessions(id uuid primary key default gen_random_uuid(), user_id uuid, status text, duration_seconds int, credit_result jsonb, completed_at timestamptz);
        create table public.daily_progress(user_id uuid, progress_date date, goal_minutes int, goal_completed boolean);
        insert into auth.users values ('${dev}'), ('${user}'); insert into public.profiles(id, timezone, streak_count) values ('${dev}', 'UTC', 8), ('${user}', 'UTC', 65);
        insert into liferpg_auth_private.developers values ('${dev}');`);
      for (const f of ["20261024090000_rewards_core.sql", "20261024100000_rewards_dev_tools.sql", "20261024110000_rewards_dev_unlocks.sql",
        "20261024120000_rewards_auto_frames.sql", "20261024120100_rewards_dev_reearn.sql"]) await db.exec(read(f));
      const as = u => db.exec(`select set_config('test.uid', '${u}', false)`);
      const claim = async u => (await db.query(`select public.claim_session_rewards_v1($1) r`, [u])).rows[0].r;
      await as(user);
      const first = await claim(user);
      assert.deepEqual(first.milestones.map(m => m.item), ["frame_streak_7", "frame_streak_30", "frame_streak_60"]);
      assert.equal(first.state.avatar.frame, "frame_streak_60", "the reply already shows the upgrade");
      assert.deepEqual([...first.state.earned].sort(), ["frame_streak_30", "frame_streak_60", "frame_streak_7"]);
      const look = { skin: "3", hair: "short", hairColor: "darkbrown", glasses: false };
      const saved = (await db.query(`select public.save_avatar_v1($1, $2, $3) s`, [user, { look, equipped: {}, frame: "frame_streak_7" }, first.state.avatar.revision])).rows[0].s;
      assert.equal(saved.avatar.frame, "frame_streak_60", "a frame can't be picked; any sent is ignored");
      await db.exec(`update public.profiles set streak_count = 180 where id = '${user}'`);
      const more = await claim(user);
      assert.deepEqual(more.milestones.map(m => m.item), ["frame_streak_100", "frame_streak_180"]);
      assert.equal(more.state.avatar.frame, "frame_streak_180", "upgrades on its own");
      await assert.rejects(db.query(`select public.dev_rewards_v1($1, 'reearn', 0)`, [user]), /Only developer accounts/);
      await as(dev);
      const d = await claim(dev);
      assert.equal(d.state.owned.length, 38, "a developer still has everything to try on");
      assert.deepEqual(d.state.earned, ["frame_streak_7"]); assert.equal(d.state.avatar.frame, "frame_streak_7", "but the frame is their real streak's");
      const back = (await db.query(`select public.dev_rewards_v1($1, 'reearn', 0) s`, [dev])).rows[0].s;
      assert.deepEqual([back.earned, back.avatar.frame], [[], null]);
      assert.deepEqual((await claim(dev)).milestones.map(m => m.item), ["frame_streak_7"], "the real check gives it back");
    } finally { await db.close(); }
  });
}
