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




test("one scene for the whole session, with nobody in it: dusk, a very dark night, then one fade into morning", async () => {
  const log = [], ended = [];
  let reduced = false;
  const AView = host("AView");
  const mod = load("src/components/session/SessionBackdrop.tsx", {
    "react-native": { AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) }, View: host("View"), Pressable: host("Press"), StyleSheet: { create: v => v, absoluteFill: {} }, useWindowDimensions: () => ({ width: 390, height: 844 }),
      Animated: { View: host("RNView"), Value: class { constructor(v) { this.v = v; } }, timing: (_v, config) => ({ start() { log.push(["words", config.toValue, config.delay]); }, stop() {} }) } },
    "react-native-reanimated": { __esModule: true, default: { View: AView }, Easing: { inOut: x => x, quad: 0 }, interpolate: (v, i, o) => o[0] + (o[1] - o[0]) * v,
      cancelAnimation() {}, runOnJS: f => f, useAnimatedStyle: fn => fn(), useSharedValue: v => React.useRef({ value: v }).current, withDelay: (delay, x) => { log.push(["delay", delay]); return x; },
      withTiming: (to, config, done) => { log.push(["timing", to, config?.duration]); done?.(true); return to; } },
    "expo-router": { useFocusEffect: callback => React.useEffect(callback, [callback]) },
    "../AppText": { Text: host("Text") }, "../adventurer/AdventurerBack": host("Walker"),
    "./CampDecorations": { __esModule: true, default: () => null, campDecorations: () => [] }, "./TrailScenes": { TrailScene: props => React.createElement("Scene", props), FireGlow: host("Fire"), Fireflies: host("Flies") },
    "../../hooks/useRewards": { useRewards: () => ({ look: LOOK, equipped: {}, today: { seconds: 3000, finds: 2 } }) },
    "../../hooks/useReducedMotion": { useReducedMotion: () => reduced },
  });
  const Backdrop = mod.default;
  const props = (phase, progress = 0.1, intro = false, skipToken = 0, secondsLeft = Math.round(1800 * (1 - progress))) => ({ phase, progress, secondsLeft, walking: phase === "running", intro, skipToken, onIntroEnd: () => ended.push("end") });
  const lights = r => r.root.findAllByType("Scene").map(n => n.props.light);
  const layer = (r, light) => { let n = r.root.findAllByType("Scene").find(x => x.props.light === light); while (n && n.type !== "AView") n = n.parent; return n; };
  const opacity = node => [].concat(node.props.style).reduce((o, x) => (x && "opacity" in x ? x.opacity : o), undefined);
  let r; await act(async () => { r = create(React.createElement(Backdrop, props("setup"))); });
  assert.equal(r.toJSON(), null, "nothing behind setup");
  // A fresh start: dusk fades over night; the unused morning SVG stays unmounted.
  await act(async () => r.update(React.createElement(Backdrop, props("running", 0.01, true))));
  assert.deepEqual(lights(r), ["night", "dusk"], "only the two lights needed for the intro are mounted");
  assert.ok(log.some(e => e[0] === "delay" && e[1] === mod.WALK_MS), "the dusk holds a moment first, then the light changes");
  assert.equal(r.root.findAllByType("Walker").length, 0, "nobody walks in the scene");
  assert.equal(r.root.findAllByProps({ testID: "session-walker" }).length, 0);
  assert.ok(log.some(e => e[0] === "timing" && e[1] === 0 && e[2] === mod.NIGHT_FADE_MS), "dusk fades into night in one go");
  assert.equal(mod.NIGHT_FADE_MS, 2000);
  assert.deepEqual(ended, ["end"], "the timer comes back once you're on your way");
  await act(async () => r.update(React.createElement(Backdrop, props("running", 0.5, false))));
  assert.deepEqual(lights(r), ["night"], "night while you focus, without drawing hidden dusk or morning scenes");
  // Near the end, one slow fade into morning, never a change every second.
  log.length = 0;
  await act(async () => r.update(React.createElement(Backdrop, props("running", 0.91, false, 0, 10))));
  await act(async () => r.update(React.createElement(Backdrop, props("running", 0.95, false, 0, 5))));
  await act(async () => r.update(React.createElement(Backdrop, props("running", 0.99, false, 0, 1))));
  assert.deepEqual(log.filter(e => e[0] === "timing"), [["timing", 1, mod.DAWN_SECONDS * 1000]], "one fade, started once");
  assert.equal(opacity(layer(r, "morning")), 1);
  // Finished: the same morning stays behind the card.
  await act(async () => r.update(React.createElement(Backdrop, props("completed", 1))));
  assert.deepEqual(lights(r), ["morning"]);
  assert.equal(opacity(layer(r, "morning")), 1, "the session card sits on the same scene, not a black screen");
  // Ending early keeps the night.
  await act(async () => r.update(React.createElement(Backdrop, props("ended", 0.95))));
  await act(async () => r.update(React.createElement(Backdrop, props("ended", 0.96))));
  assert.deepEqual(lights(r), ["night"]);
  await act(async () => r.unmount());
  // Skipping finishes quickly.
  ended.length = 0; log.length = 0;
  await act(async () => { r = create(React.createElement(Backdrop, props("running", 0.01, true, 0))); });
  ended.length = 0; log.length = 0;
  await act(async () => r.update(React.createElement(Backdrop, props("running", 0.01, true, 1))));
  assert.ok(log.some(e => e[0] === "timing" && e[1] === 0 && e[2] === 700), "a skip fades to night quicker");
  assert.equal(ended.length, 1);
  await act(async () => r.unmount());
  // The words while you set off; tap anywhere to skip.
  let skips = 0;
  await act(async () => { r = create(React.createElement(mod.SessionIntroWords, { minutes: 45, area: "Learning", onSkip: () => skips++ })); });
  assert.match(JSON.stringify(r.root.findAllByType("Text").map(t => t.props.children)), /SETTLING IN.*Learning.*45 min.*Tap anywhere to skip/);
  assert.ok(log.some(e => e[0] === "words" && e[1] === 0 && e[2] === mod.WALK_MS), "the words fade as the light changes");
  await act(async () => r.root.findByProps({ accessibilityLabel: "Skip" }).props.onPress());
  assert.equal(skips, 1);
  await act(async () => r.unmount());
  const screen = fs.readFileSync(path.join(root, "src/components/SessionScreen.tsx"), "utf8");
  assert.match(screen, /<SessionBackdrop phase=\{scenePhase\}/);
  assert.match(screen, /if \(reducedMotion \|\| again\) \{ void Promise\.resolve\(timer\.startTimer/, "less motion (or a retry) starts at once; otherwise Start sets off first (see session tests)");
  assert.match(screen, /style=\{\[styles\.screen, onTrail && styles\.onTrail\]\}/, "the screen is see-through only while on the trail");
  const scenes = fs.readFileSync(path.join(root, "src/components/session/TrailScenes.tsx"), "utf8");
  assert.match(scenes, /night: \{ skyTop: "#03050C"/, "night is very dark; only the timer is bright");
});




