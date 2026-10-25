/* global __dirname */
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, "..");
function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const resolved = [".ts", ".tsx"].map(extension => target + extension).find(fs.existsSync);
    return load(path.relative(root, resolved), mocks, cache);
  }, module, module.exports);
  return module.exports;
}
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
const svg = { __esModule: true, ...Object.fromEntries(["default", "Circle", "Defs", "Ellipse", "G", "LinearGradient", "Path", "Rect", "Stop", "Text"].map(name => [name, host(`Svg${name}`)])) };
const LOOK = { skin: "3", hair: "short", hairColor: "darkbrown", glasses: false };
const base = { seconds: 60, findSeconds: 1800, stops: 4, finds: 0, complete: false, nextFindSeconds: 1740,
  look: LOOK, equipped: {}, level: 4, background: "bg_dusk", frame: null, fill: true };
const layout = (width = 320, height = 380) => ({ nativeEvent: { layout: { width, height } } });
const words = ui => ui.root.findAllByType("Text").map(node => [].concat(node.props.children).join("")).join(" ");
const labels = ui => ui.root.findAllByType("SvgText").map(node => [].concat(node.props.children).join(""));

function harness({ reduced = false, fontScale = 1 } = {}) {
  const animations = [], cancelled = [], haptics = [];
  let pictures = 0, worklets = 0;
  const useSharedValue = initial => {
    const ref = React.useRef(null);
    if (!ref.current) {
      let current = initial;
      const shared = { get value() { return current; }, set value(value) {
        if (value && typeof value === "object" && "to" in value) { value.shared = shared; animations.push(value); }
        else current = value;
      } };
      ref.current = shared;
    }
    return ref.current;
  };
  const interpolate = (value, input, output) => {
    if (value <= input[0]) return output[0];
    for (let i = 1; i < input.length; i++) if (value <= input[i]) return output[i - 1] + (output[i] - output[i - 1]) * (value - input[i - 1]) / (input[i] - input[i - 1]);
    return output.at(-1);
  };
  const mocks = {
    "react-native": { useWindowDimensions: () => ({ width: 360, height: 640, fontScale }), View: host("View"), StyleSheet: { create: value => value, absoluteFill: {} } },
    "react-native-svg": svg, "@expo/vector-icons": { Ionicons: host("Icon") }, "../AppText": { Text: host("Text") },
    "../adventurer/ProfilePicture": props => { pictures++; return React.createElement("Picture", props); },
    "../adventurer/ItemArt": { StardustArt: host("Dust") }, "../../hooks/useReducedMotion": { useReducedMotion: () => reduced },
    "../../utils/tapHaptics": { tapHaptic: value => haptics.push(value) },
    "../../utils/afterTransition": { afterTransition() { throw Error("Map must not wait for a post-entrance timer"); } },
    "../services/rewardCatalog": { FIND_SECONDS: 1500 },
    "react-native-reanimated": { __esModule: true, default: { View: host("AView"), createAnimatedComponent: component => component },
      Easing: { inOut: value => value, cubic: 0 }, useSharedValue, interpolate, runOnJS: callback => callback,
      useAnimatedReaction: () => { worklets++; }, useAnimatedProps: callback => { worklets++; return { current: callback }; }, useAnimatedStyle: callback => { worklets++; return { current: callback }; },
      withTiming: (to, config, done) => ({ to, config, done }), withDelay: (delay, animation) => ({ ...animation, delay }), withSpring: to => to,
      cancelAnimation: shared => cancelled.push(shared) },
  };
  const Trail = load("src/components/rewards/TodayTrail.tsx", mocks).default;
  return { Trail, mocks, animations, cancelled, haptics, pictures: () => pictures, worklets: () => worklets,
    finish: animation => act(async () => { animation.shared.value = animation.to; animation.done?.(true); }) };
}
async function mountMap(h, props = {}, size = layout()) {
  let ui;
  await act(async () => { ui = create(React.createElement(h.Trail, { ...base, ...props })); });
  await act(async () => ui.root.findByProps({ testID: "today-trail-map" }).props.onLayout(size));
  return ui;
}

test("the complete map paints on its first measured layout, with four stops and every zone in view", async () => {
  const h = harness(), ui = await mountMap(h, {}, layout(300, 260));
  try {
    assert.deepEqual(labels(ui).filter(label => /min$/.test(label)), ["Next find · 30 min", "60 min", "90 min", "Trail's end · 120 min"]);
    for (const place of ["MEADOW", "LANTERN LAKE", "RED CANYON", "STARFALL RIDGE", "CAMP"]) assert.ok(labels(ui).includes(place), place);
    assert.equal(ui.root.findAllByType("Svgdefault").length, 1);
    assert.equal(h.pictures(), 1, "one character is needed for the whole map");
    assert.equal(h.animations.length, 0, "Home stands at its current position without replaying a walk");
    const minuteLabels = ui.root.findAllByType("SvgText").filter(node => /min$/.test([].concat(node.props.children).join("")));
    assert.ok(minuteLabels.every(node => node.props.y > 0 && node.props.y < 260));
    await act(async () => ui.root.findByProps({ testID: "today-trail-map" }).props.onLayout(layout(300, 260)));
    assert.equal(h.pictures(), 1, "identical native layout events do not redraw the SVG and portrait");
  } finally { await act(async () => ui.unmount()); }
});

test("each completed minute updates the existing map and marker without remounting or waiting", async () => {
  const h = harness(), ui = await mountMap(h);
  const position = () => { const style = ui.root.findByProps({ testID: "today-trail-marker" }).props.style[1]; return (style.current ? style.current() : style).transform; };
  try {
    const before = position();
    assert.match(words(ui), /1 m.*0 of 4.*29 min/);
    await act(async () => ui.update(React.createElement(h.Trail, { ...base, seconds: 120, nextFindSeconds: 1680 })));
    assert.match(words(ui), /2 m.*0 of 4.*28 min/);
    assert.ok(position()[1].translateY < before[1].translateY, "the marker advances along the same measured path");
    assert.equal(ui.root.findAllByType("Svgdefault").length, 1);
    assert.equal(h.animations.length, 0);
  } finally { await act(async () => ui.unmount()); }
});

test("legacy awarded finds point to the next eligible stop, and a collected day still walks to the trail's end", async () => {
  const h = harness(), ui = await mountMap(h, { seconds: 1500, finds: 1, nextFindSeconds: 2100 });
  try {
    assert.match(words(ui), /25 m.*1 of 4.*35 min/);
    assert.ok(labels(ui).includes("Next find · 60 min"));
    assert.ok(!labels(ui).includes("Next find · 30 min"));
    await act(async () => ui.update(React.createElement(h.Trail, { ...base, seconds: 6000, finds: 4, nextFindSeconds: 0 })));
    assert.match(words(ui), /100 m|1 h 40 m/);
    assert.match(words(ui), /20 min.*to trail's end/);
    assert.match(ui.root.findByProps({ testID: "today-trail-map" }).props.accessibilityLabel, /All finds collected.*20 min/);
    assert.equal(ui.root.findAllByProps({ testID: "trail-complete" }).length, 0, "four carried awards alone do not claim the trail bonus");
    assert.ok(!labels(ui).some(label => label.startsWith("Next find")));
  } finally { await act(async () => ui.unmount()); }
});

test("a saved stop waiting for its claim says Find ready without pretending a reward was collected", async () => {
  const h = harness(), ui = await mountMap(h, { seconds: 1800, finds: 0, pendingFinds: 1, nextFindSeconds: 0 });
  try {
    assert.match(words(ui), /30 m.*0 of 4.*Find ready.*awaiting confirmation/);
    assert.match(ui.root.findByProps({ testID: "today-trail-map" }).props.accessibilityLabel, /Find ready, awaiting confirmation/);
    assert.ok(labels(ui).includes("Next find · 30 min"));
    const first = ui.root.findAllByType("SvgG").find(group => group.findAllByType("SvgText").some(child => child.props.children === "Next find · 30 min"));
    assert.ok(first.findAllByType("SvgCircle").some(circle => circle.props.strokeDasharray === "3 3"), "an unclaimed stop stays a pending outline");
    assert.equal(first.findAllByType("SvgPath").length, 0, "no earned-find star appears before confirmation");
    assert.equal(ui.root.findAllByProps({ testID: "trail-complete" }).length, 0);
    await act(async () => ui.update(React.createElement(h.Trail, { ...base, seconds: 1800, finds: 1, pendingFinds: 0, nextFindSeconds: 1800 })));
    assert.match(words(ui), /30 m.*1 of 4.*30 min.*to next find/);
    assert.ok(labels(ui).includes("Next find · 60 min"));
    await act(async () => ui.update(React.createElement(h.Trail, { ...base, seconds: 7200, finds: 0, pendingFinds: 4, nextFindSeconds: 0 })));
    assert.match(words(ui), /0 of 4.*4 finds ready.*awaiting confirmation/);
  } finally { await act(async () => ui.unmount()); }
});

test("a new walk cannot reuse an earlier arrival, and cancelled callbacks cannot complete it", async () => {
  const h = harness(), ui = await mountMap(h, { seconds: 1800, fromSeconds: 0, finds: 1, nextFindSeconds: 1800 });
  try {
    const first = h.animations.at(-1); await h.finish(first);
    await act(async () => ui.update(React.createElement(h.Trail, { ...base, seconds: 7200, fromSeconds: 5400, finds: 4, complete: true, bonus: 50, nextFindSeconds: 0 })));
    assert.equal(ui.root.findAllByProps({ testID: "trail-complete" }).length, 0, "the new final walk has not arrived yet");
    await h.finish(first);
    assert.equal(ui.root.findAllByProps({ testID: "trail-complete" }).length, 0, "late callback from the old walk is ignored");
    await h.finish(h.animations.at(-1));
    assert.ok(ui.root.findAllByProps({ testID: "trail-complete" }).length > 0);
    assert.equal(h.haptics.filter(value => value === "success").length, 1);
  } finally { await act(async () => ui.unmount()); }
});

test("closing cancels a pending walk; Reduce Motion opens at the final position immediately", async () => {
  const h = harness(), ui = await mountMap(h, { seconds: 7200, fromSeconds: 5400, finds: 4, complete: true, nextFindSeconds: 0 });
  const pending = h.animations.at(-1), cancelled = h.cancelled.length;
  await act(async () => ui.unmount());
  assert.ok(h.cancelled.length > cancelled);
  await h.finish(pending);
  assert.equal(h.haptics.filter(value => value === "success").length, 0);
  const reduced = harness({ reduced: true }), instant = await mountMap(reduced, { seconds: 7200, fromSeconds: 5400, finds: 4, complete: true, nextFindSeconds: 0 });
  try {
    assert.equal(reduced.animations.length, 0);
    assert.ok(instant.root.findAllByProps({ testID: "trail-complete" }).length > 0);
  } finally { await act(async () => instant.unmount()); }
});

test("Home reuses the existing refresh once the sheet is up, on opening/reconnection, and retains the map through dismissal", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const refresh = async () => { reads++; }; let reads = 0, online = true;
  const rewards = { ...base, today: { seconds: 60, finds: 0 }, trail: { findSeconds: 1800, stops: 4, complete: false }, online, refresh };
  const Sheet = load("src/components/rewards/TrailSheet.tsx", {
    "@gorhom/bottom-sheet": { BottomSheetScrollView: host("SheetScroll") },
    "react-native": { useWindowDimensions: () => ({ width: 360, height: 640, fontScale: 1 }), View: host("View"), StyleSheet: { create: value => value } }, "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
    "../AppSheet": host("Sheet"), "../SheetHeader": host("Header"), "./TodayTrail": host("Trail"),
    "../../hooks/useRewards": { useRewards: () => ({ ...rewards, online }) }, "../../context/UserContext": { useUser: () => ({ profile: { id: "me", level: 7 } }) },
    "../../services/levelPreview": { useShownLevel: () => ({ level: 7 }) },
  }).default;
  let ui; const props = { visible: false, onClose() {} };
  await act(async () => { ui = create(React.createElement(Sheet, props)); });
  try {
    assert.equal(reads, 0);
    await act(async () => ui.update(React.createElement(Sheet, { ...props, visible: true })));
    assert.equal(reads, 0, "nothing redraws while the sheet slides up");
    assert.deepEqual(ui.root.findByType("Trail").props.initialSize, { width: 298, height: ui.root.findByType("Trail").props.initialSize.height }, "the map is drawn with the sheet");
    assert.ok(ui.root.findByType("Trail").props.initialSize.height >= 220);
    assert.equal(ui.root.findByType("Trail").props.sizeKey, "home-sheet");
    await act(async () => t.mock.timers.tick(450));
    assert.equal(reads, 1);
    await act(async () => ui.update(React.createElement(Sheet, { ...props, visible: true })));
    await act(async () => t.mock.timers.tick(1000));
    assert.equal(reads, 1, "ordinary renders do not add requests");
    await act(async () => ui.update(React.createElement(Sheet, props)));
    assert.equal(ui.root.findAllByType("Trail").length, 1, "AppSheet owns physical unmount after its close animation");
    online = false; await act(async () => ui.update(React.createElement(Sheet, { ...props, visible: true })));
    await act(async () => t.mock.timers.tick(1000));
    assert.equal(reads, 1);
    online = true; await act(async () => ui.update(React.createElement(Sheet, { ...props, visible: true })));
    await act(async () => t.mock.timers.tick(450));
    assert.equal(reads, 2, "reconnection uses the shared existing read once");
  } finally { await act(async () => ui.unmount()); }
});

test("coexisting maps use independent gradient ids", async () => {
  const h = harness(); let ui;
  await act(async () => { ui = create(React.createElement("View", null, React.createElement(h.Trail, base), React.createElement(h.Trail, base))); });
  try {
    await act(async () => { for (const map of ui.root.findAllByProps({ testID: "today-trail-map" })) map.props.onLayout(layout()); });
    const ids = ui.root.findAllByType("SvgLinearGradient").map(node => node.props.id);
    assert.equal(ids.length, 8);
    assert.equal(new Set(ids).size, ids.length);
  } finally { await act(async () => ui.unmount()); }
});


test("large text stacks trail statistics and never compresses the map below readable geometry", async () => {
  const h = harness({ fontScale: 1.8 }), ui = await mountMap(h, { seconds: 1800, pendingFinds: 1, nextFindSeconds: 0 });
  const style = value => Object.assign({}, ...[].concat(value).filter(Boolean));
  try {
    const stats = ui.root.findAllByType("View").find(node => style(node.props.style).flexDirection === "column");
    assert.ok(stats, "large-font statistics use full-width rows rather than narrow truncated columns");
    const map = ui.root.findByProps({ testID: "today-trail-map" });
    assert.equal(style(map.props.style).minHeight, 260);
    assert.equal(style(map.props.style).flexShrink, 0);
    assert.match(map.props.accessibilityLabel, /Find ready, awaiting confirmation/);
  } finally { await act(async () => ui.unmount()); }
});

test("Round 67: the Home sheet's map is drawn with the sheet, and its measured size is remembered for the next opening", async () => {
  const h = harness();
  const hasMap = ui => ui.root.findAllByType("Svgdefault").length > 0;
  let ui;
  await act(async () => { ui = create(React.createElement(h.Trail, { ...base, sizeKey: "home-sheet", initialSize: { width: 300, height: 400 } })); });
  assert.equal(hasMap(ui), true, "the first opening draws from its guess, before any layout pass");
  await act(async () => ui.root.findByProps({ testID: "today-trail-map" }).props.onLayout(layout(310, 420)));
  assert.equal(ui.root.findAllByType("Svgdefault")[0].props.width, 310, "the real size replaces the guess");
  await act(async () => ui.unmount());
  await act(async () => { ui = create(React.createElement(h.Trail, { ...base, sizeKey: "home-sheet" })); });
  assert.equal(ui.root.findAllByType("Svgdefault")[0].props.width, 310, "the next opening is drawn at the remembered size at once");
  await act(async () => ui.unmount());
  await act(async () => { ui = create(React.createElement(h.Trail, { ...base })); });
  assert.equal(hasMap(ui), false, "a map without a remembered place still waits for its layout");
  await act(async () => ui.unmount());
});


test("Round 68: the Home map has its full first frame without creating stationary animation worklets", async () => {
  const h = harness(); let ui;
  await act(async () => { ui = create(React.createElement(h.Trail, { ...base, sizeKey: "r68-home", initialSize: { width: 300, height: 400 } })); });
  try {
    assert.equal(h.worklets(), 0, "Home's static path and marker do not install animated styles, SVG props or reactions");
    assert.equal(h.pictures(), 1, "the complete portrait is present immediately, never delayed");
    assert.equal(ui.root.findAllByType("SvgLinearGradient").length, 4);
    assert.ok(labels(ui).includes("MEADOW") && labels(ui).includes("STARFALL RIDGE") && labels(ui).some(label => label.startsWith("Trail's end") && label.endsWith("120 min")));
    assert.equal(ui.root.findByProps({ testID: "today-trail-artwork" }).props.renderToHardwareTextureAndroid, true);
    const path = ui.root.findAllByType("SvgPath").find(node => node.props.strokeWidth === 5);
    assert.ok(Number.isFinite(path.props.strokeDashoffset));
    assert.equal(path.props.animatedProps, undefined);
    await act(async () => ui.root.findByProps({ testID: "today-trail-map" }).props.onLayout(layout(310, 420)));
    assert.equal(h.worklets(), 0, "a corrected measurement still does not register animations during the slide");
  } finally { await act(async () => ui.unmount()); }
});

test("Round 68: post-session trail walks keep their live animated path and do not rasterize moving content", async () => {
  const h = harness(), ui = await mountMap(h, { seconds: 2400, fromSeconds: 1800, finds: 1 });
  try {
    assert.ok(h.worklets() > 0);
    assert.equal(ui.root.findByProps({ testID: "today-trail-artwork" }).props.renderToHardwareTextureAndroid, false);
    const path = ui.root.findAllByType("SvgPath").find(node => node.props.strokeWidth === 5);
    assert.ok(path.props.animatedProps);
    assert.equal(h.animations.length, 1);
    assert.equal(h.animations[0].to, 2400 / 1800);
  } finally { await act(async () => ui.unmount()); }
});
