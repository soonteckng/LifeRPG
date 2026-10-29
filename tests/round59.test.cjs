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

test("the session card opens on the camp in the morning, with the time recorded and nobody drawn", async () => {
  const Banner = load("src/components/ArrivalBanner.tsx", {
    "react-native": { useWindowDimensions: () => ({ width: 360, height: 640, fontScale: 1 }), View: host("View"), StyleSheet: { create: v => v, absoluteFill: {} } }, "react-native-svg": svg, "@expo/vector-icons": { Ionicons: host("Icon") },
    "./AppText": { Text: host("Text") }, "./adventurer/AdventurerArt": host("You"), "../hooks/useRewards": { useRewards: () => ({ look: LOOK, equipped: { top: "cardigan" } }) },
  }).default;
  let r; await act(async () => { r = create(React.createElement(Banner, { seconds: 2700, title: "Mathematics" })); });
  assert.match(words(r), /Time recorded.*45 min.*Mathematics/);
  assert.equal(r.root.findAllByType("You").length, 0, "no character on the card");
  await act(async () => r.update(React.createElement(Banner, { seconds: 60 })));
  assert.match(words(r), /Time recorded.*1 min/);
  assert.doesNotMatch(words(r), /Level/);
  // Large text: the banner grows, and its scene grows with it.
  const banner = r.root.findByProps({ testID: "session-arrival" });
  await act(async () => banner.props.onLayout({ nativeEvent: { layout: { width: 360, height: 190 } } }));
  assert.equal(r.root.findAll(n => n.type === "Svgdefault")[0].props.height, 190);
  await act(async () => r.unmount());
});


