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
    "react-native": { useWindowDimensions: () => ({ width: 360, height: 640, fontScale: 1 }), View: host("View"), StyleSheet: { create: v => v, absoluteFill: {} } }, "react-native-svg": svg, "@expo/vector-icons": { Ionicons: host("Icon") },
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

test("today's trail fits in view, draws on its first layout, and you walk from where you were", async () => {
  const scrolls = [], log = [];
  const Scroll = React.forwardRef((props, ref) => { React.useImperativeHandle(ref, () => ({ scrollTo: to => scrolls.push(to) })); return React.createElement("Scroll", props, props.children); });
  const lerp = (x, i, o) => { if (x <= i[0]) return o[0]; for (let k = 1; k < i.length; k++) if (x <= i[k]) return o[k - 1] + (o[k] - o[k - 1]) * (x - i[k - 1]) / (i[k] - i[k - 1]); return o[o.length - 1]; };
  const Trail = load("src/components/rewards/TodayTrail.tsx", {
    "react-native": { useWindowDimensions: () => ({ width: 360, height: 640, fontScale: 1 }), View: host("View"), ScrollView: Scroll, StyleSheet: { create: v => v, absoluteFill: {} } }, "react-native-svg": svg,
    "react-native-reanimated": { __esModule: true, default: { View: host("AView"), createAnimatedComponent: c => c }, Easing: { inOut: x => x, cubic: 0 }, interpolate: lerp,
      runOnJS: f => f, useAnimatedProps: fn => fn(), useAnimatedReaction: () => {}, useAnimatedStyle: fn => fn(), useSharedValue: v => React.useRef({ value: v }).current,
      cancelAnimation: () => {}, withDelay: (delay, x) => { log.push(["walk", delay, x]); return x; }, withTiming: (to, _c, done) => { done?.(true); return to; }, withSpring: to => to },
    "@expo/vector-icons": { Ionicons: host("Icon") }, "../AppText": { Text: host("Text") }, "../adventurer/ProfilePicture": host("Picture"),
    "../adventurer/ItemArt": { StardustArt: host("Dust") }, "../../hooks/useReducedMotion": { useReducedMotion: () => false }, "../../utils/tapHaptics": { tapHaptic: s => log.push(["haptic", s]) },
  }).default;
  const props = { seconds: 2400, fromSeconds: 1800, findSeconds: 1200, stops: 6, finds: 2, complete: false, nextFindSeconds: 1200, look: LOOK, equipped: {}, level: 4, background: "bg_dusk", frame: null };
  let r; await act(async () => { r = create(React.createElement(Trail, props)); });
  assert.match(words(r), /40 m.*walked today.*2 of 6.*finds today.*20 min.*to next find/);
  assert.equal(r.root.findAll(n => n.type === "SvgText").length, 0, "the map needs its actual layout dimensions");
  const frame = r.root.findByProps({ testID: "today-trail-map" });
  await act(async () => { frame.props.onLayout({ nativeEvent: { layout: { width: 340, height: 420 } } }); });
  assert.deepEqual(log.find(e => e[0] === "walk").slice(2), [2], "you walk on to the second stop, 40 minutes");
  const labels = r.root.findAll(n => n.type === "SvgText").map(n => [].concat(n.props.children).join(""));
  assert.ok(labels.includes("20 min total") && labels.includes("Next find · 60 min total") && labels.includes("Trail's end · 120 min total") && labels.includes("CAMP"), labels.join(", "));
  assert.equal(r.root.findAll(n => n.type === "Scroll").length, 0, "no scrolling: the whole trail is in view");
  const ys = r.root.findAll(n => n.type === "SvgText" && /min total$/.test([].concat(n.props.children).join("")) && n.props.y !== undefined).map(n => n.props.y);
  assert.ok(Math.min(...ys) > 0 && Math.max(...ys) < 420, "every stop fits inside the map");
  assert.equal(r.root.findAllByProps({ testID: "trail-complete" }).length, 0);
  // Past the end you wait at the end; the session that got you there brings the trail's reward.
  log.length = 0;
  await act(async () => r.update(React.createElement(Trail, { ...props, seconds: 9000, fromSeconds: 6600, finds: 6, complete: true, bonus: 50, nextFindSeconds: 0 })));
  await act(async () => { await new Promise(done => setTimeout(done, 20)); });
  assert.deepEqual(log.find(e => e[0] === "walk").slice(2), [6], "capped at the trail's end");
  assert.equal(r.root.findAllByProps({ testID: "trail-complete" }).length > 0, true);
  assert.match(words(r), /Trail complete.*120 minutes today.*\+50/);
  assert.ok(log.some(e => e[0] === "haptic" && e[1] === "success"));
  // Opened from Home: no walk, just where you are.
  log.length = 0;
  await act(async () => r.update(React.createElement(Trail, { ...props, fromSeconds: undefined })));
  assert.equal(log.filter(e => e[0] === "walk").length, 0);
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
