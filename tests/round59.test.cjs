/* global __dirname */
// Round 59: the session card's morning banner, today's trail as a map you can
// scroll, and Outfits growing from the Stardust chip on Home.
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
const svg = new Proxy({ __esModule: true }, { get: (t, k) => (k in t ? t[k] : host(`Svg${String(k)}`)) });
const LOOK = { skin: "3", hair: "short", hairColor: "darkbrown", glasses: false };
const words = r => JSON.stringify(r.root.findAllByType("Text").map(t => t.props.children));

test("the session card opens on you back at camp in the morning, with the time recorded", async () => {
  const Banner = load("src/components/ArrivalBanner.tsx", {
    "react-native": { View: host("View"), StyleSheet: { create: v => v, absoluteFill: {} } }, "react-native-svg": svg, "@expo/vector-icons": { Ionicons: host("Icon") },
    "./AppText": { Text: host("Text") }, "./adventurer/AdventurerArt": host("You"), "../hooks/useRewards": { useRewards: () => ({ look: LOOK, equipped: { top: "cardigan" } }) },
  }).default;
  let r; await act(async () => { r = create(React.createElement(Banner, { seconds: 2700, title: "Mathematics" })); });
  assert.match(words(r), /Time recorded.*45 min.*Mathematics/);
  assert.deepEqual(r.root.findByType("You").props.equipped, { top: "cardigan" }, "you, as you look now");
  await act(async () => r.update(React.createElement(Banner, { seconds: 60, levelUp: true })));
  assert.match(words(r), /Level up.*1 min/);
  assert.doesNotMatch(words(r), /Time recorded/);
  // Large text: the banner grows, and its scene grows with it.
  const banner = r.root.findByProps({ testID: "session-arrival" });
  await act(async () => banner.props.onLayout({ nativeEvent: { layout: { width: 360, height: 190 } } }));
  assert.equal(r.root.findAll(n => n.type === "Svgdefault")[0].props.height, 190);
  await act(async () => r.unmount());
});

test("today's trail is a map you can scroll, opening on where you are", async () => {
  const scrolls = [];
  const Scroll = React.forwardRef((props, ref) => { React.useImperativeHandle(ref, () => ({ scrollTo: to => scrolls.push(to) })); return React.createElement("Scroll", props, props.children); });
  const Trail = load("src/components/rewards/TodayTrail.tsx", {
    "react-native": { View: host("View"), ScrollView: Scroll, StyleSheet: { create: v => v } }, "react-native-svg": svg,
    "../AppText": { Text: host("Text") }, "../adventurer/ProfilePicture": host("Picture"),
  }).default;
  const props = { seconds: 4500, finds: 3, nextFindSeconds: 420, look: LOOK, equipped: {}, level: 4, background: "bg_dusk", frame: null };
  let r; await act(async () => { r = create(React.createElement(Trail, props)); });
  assert.match(words(r), /1 h 15 m.*walked today.*3.*finds today.*7 min.*to next find/);
  assert.match(words(r), /Every 25 focused minutes/);
  const map = r.root.findByProps({ testID: "today-trail-map" });
  assert.equal(map.props.nestedScrollEnabled, true, "it scrolls inside a page");
  const frame = r.root.findAll(n => n.type === "View" && typeof n.props.onLayout === "function")[0];
  await act(async () => { frame.props.onLayout({ nativeEvent: { layout: { width: 340, height: 300 } } }); await new Promise(done => setTimeout(done, 5)); });
  await act(async () => { await new Promise(done => setTimeout(done, 20)); });
  assert.equal(scrolls.length, 1, "it opens on where you are");
  assert.ok(scrolls[0].y > 0, "not at the top of the map");
  assert.equal(scrolls[0].animated, false);
  assert.equal(r.root.findAllByType("Picture").length, 1, "you, on the trail");
  await act(async () => r.update(React.createElement(Trail, { ...props, fill: true })));
  assert.doesNotMatch(words(r), /Every 25 focused minutes/, "filling a page, the map gets the room");
  await act(async () => r.unmount());
});

test("Outfits grows from the Stardust chip, and Home's name and level have room", () => {
  const home = fs.readFileSync(path.join(root, "src/app/(tabs)/index.tsx"), "utf8");
  assert.match(home, /<View ref=\{stardustIcon\}/);
  assert.match(home, /pathname: "\/outfits", params: \{ from: "home" \}|params: \{ from: "home" \}/);
  assert.match(home, /style=\{styles\.nameRow\}/);
  assert.match(home, /style=\{styles\.chipRow\}/, "level and Stardust sit on their own row under your name");
  const layout = fs.readFileSync(path.join(root, "src/app/_layout.tsx"), "utf8");
  assert.match(layout, /name="outfits"[\s\S]{0,300}from === "home"/, "from Home it opens like Settings and Profile");
  const outfits = fs.readFileSync(path.join(root, "src/app/outfits.tsx"), "utf8");
  assert.match(outfits, /expandFromIcon=\{fromHome\}/);
});
