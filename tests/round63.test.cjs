/* global __dirname */
// Round 63: the found page plays as a reveal: finds dealt one by one, the
// Stardust counting up, then you walking on along today's trail.
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

test("every find lands on one big card in turn with a buzz each, the Stardust counts up, then Continue opens the trail", async () => {
  const log = [];
  global.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
  global.cancelAnimationFrame = id => clearTimeout(id);
  const { ExpeditionReveal } = load("src/components/rewards/RevealScreens.tsx", {
    "react-native": { View: host("View"), ScrollView: host("Scroll"), StyleSheet: { create: v => v, absoluteFill: {} }, useWindowDimensions: () => ({ width: 390, height: 844 }) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "react-native-reanimated": { __esModule: true, default: { View: host("AView") }, Easing: { inOut: x => x, out: x => x, sin: 0, quad: 0, cubic: 0 },
      useAnimatedStyle: () => ({}), useSharedValue: v => React.useRef({ value: v }).current,
      withDelay: (delay, x) => { log.push(["delay", delay, x]); return x; }, withSpring: to => ({ spring: to }), withTiming: to => to, withRepeat: x => x, withSequence: (...x) => x[0] },
    "react-native-svg": { __esModule: true, default: host("Svg"), Defs: host("Defs"), RadialGradient: host("RG"), Rect: host("Rect"), Stop: host("Stop") },
    "@expo/vector-icons": { Ionicons: host("Icon") }, "../MotionPressable": host("Press"), "../AppText": { Text: host("Text") },
    "../adventurer/Adventurer": host("Adventurer"), "../adventurer/ProfilePicture": host("Picture"), "../adventurer/ItemArt": { __esModule: true, default: host("Item"), StardustArt: host("Dust") },
    "../session/TrailScenes": { CampScene: host("Camp") }, "./PackArt": { __esModule: true, default: host("Pack"), PACK_COLORS: ["#1", "#2", "#3", "#4"] },
    "./TodayTrail": host("Trail"), "../../hooks/useReducedMotion": { useReducedMotion: () => false },
    "../../utils/tapHaptics": { tapHaptic: style => log.push(["haptic", style]) },
  });
  const player = { look: LOOK, equipped: {}, level: 4, background: "bg_dusk", frame: null, today: { seconds: 4500, finds: 3 }, nextFindSeconds: 420, trail: { findSeconds: 1200, stops: 6, complete: false } };
  const reveal = { id: "r", kind: "expedition", seconds: 2700, stardust: 14,
    finds: [{ item: "beret", rarity: "common", new: true, stardust: 0 }, { item: "tote", rarity: "common", new: false, stardust: 5 }, { item: "pet_owl", rarity: "epic", new: true, stardust: 0 }] };
  let r; await act(async () => { r = create(React.createElement(ExpeditionReveal, { reveal, player, onClose() {}, onOutfits() {} })); });
  const dust = () => r.root.findAll(n => n.type === "Text" && typeof n.props.children === "string" && / Stardust$/.test(n.props.children))[0].props.children;
  assert.equal(dust(), "+0 Stardust", "the Stardust waits for the cards");
  const deals = log.filter(e => e[0] === "delay" && e[2]?.spring === 1).map(e => e[1]);
  assert.deepEqual(deals, [420, 680, 940], "each find is dealt onto the one card in turn");
  await act(async () => { await new Promise(done => setTimeout(done, 2000)); });
  assert.equal(dust(), "+14 Stardust", "then it counts up to the total");
  const buzzes = log.filter(e => e[0] === "haptic").map(e => e[1]);
  assert.deepEqual(buzzes.slice(1, 4), ["success", "light", "success"], "a buzz per card: new or rare finds buzz more");
  assert.ok(log.some(e => e[0] === "delay" && e[1] === 940 && e[2] === 1), "the epic find starts to glow as it lands");
  assert.equal(r.root.findAllByType("Trail").length, 0, "the trail waits for Continue");
  await act(async () => r.root.findAll(n => n.type === "Press" && n.props.accessibilityLabel === "Continue")[0].props.onPress());
  assert.equal(r.root.findByType("Trail").props.fromSeconds, 1800);
  await act(async () => r.unmount());
  delete global.requestAnimationFrame; delete global.cancelAnimationFrame;
});
