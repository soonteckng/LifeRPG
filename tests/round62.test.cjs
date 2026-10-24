/* global __dirname */
// Round 62: level colours follow the level road, a developer-only level
// preview, the level on your picture beside your pet, and Outfits' Profile tab.
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
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("every level's colour is its tier's colour on the level road", () => {
  const look = load("src/utils/adventurerLook.ts");
  const tiers = load("src/utils/levelTiers.ts");
  for (const [index, tier] of tiers.LEVEL_TIERS.entries()) {
    const last = (tiers.LEVEL_TIERS[index + 1]?.level ?? tier.level + 5) - 1;
    for (const level of [tier.level, last]) {
      assert.equal(look.tierColor(level), tier.color, `level ${level} is ${tier.title}'s colour`);
      assert.equal(look.levelColors(level).color, tier.color);
    }
  }
  assert.equal(look.levelColors(2).soft, "#AAB3FF29");
});

test("a level preview is a developer's alone: tied to their account, nothing saved, and easy to turn off", async () => {
  const { levelPreview, useShownLevel } = load("src/services/levelPreview.ts");
  let shown;
  function Probe({ owner, real }) { shown = useShownLevel(owner, real); return null; }
  let r; await act(async () => { r = create(React.createElement(Probe, { owner: "dev", real: 2 })); });
  assert.deepEqual(shown, { level: 2, previewing: false });
  await act(async () => levelPreview.set("dev", 45));
  assert.deepEqual(shown, { level: 45, previewing: true }, "the developer sees Harmony's colours");
  await act(async () => r.update(React.createElement(Probe, { owner: "8k", real: 3 })));
  assert.deepEqual(shown, { level: 3, previewing: false }, "another account on the same phone never sees it");
  await act(async () => levelPreview.set("8k", null));
  assert.equal(levelPreview.get("dev"), 45, "only the account that set it can clear it");
  for (const bad of [0, -3, NaN, Infinity]) levelPreview.set("dev", bad);
  assert.equal(levelPreview.get("dev"), 45, "nonsense levels are ignored");
  await act(async () => r.update(React.createElement(Probe, { owner: "dev", real: 2 })));
  await act(async () => levelPreview.set("dev", null));
  assert.deepEqual(shown, { level: 2, previewing: false });
  await act(async () => r.unmount());
  assert.doesNotMatch(read("src/services/levelPreview.ts"), /AsyncStorage|supabase/, "nothing is stored or sent");
  const tools = read("src/components/DeveloperTools.tsx");
  assert.match(tools, /title="Preview level colours"/);
  assert.match(tools, /if \(!developer\) return null;/, "only the Developer section can set it");
});

test("your level sits in a long pill right below the ring, never over the picture; your pet sits top right", async () => {
  const pic = load("src/components/adventurer/ProfilePicture.tsx", {
    "react-native": { View: host("View") }, "react-native-svg": svg, "./AdventurerArt": host("Art"), "./ItemArt": host("Item"), "../AppText": { Text: host("Text") },
  });
  for (const [size, level] of [[36, 2], [48, 100], [70, 21], [146, 7]]) {
    let r; await act(async () => { r = create(React.createElement(pic.default, { look: {}, equipped: { pet: "pet_owl" }, level, size })); });
    const pill = r.root.findByProps({ testID: "picture-level" }), holder = pill.parent.parent ?? pill.parent;
    const box = r.root.findAll(n => n.type === "View" && n.props.style?.width === size && typeof n.props.style?.height === "number")[0].props.style;
    const below = r.root.findAll(n => n.type === "View" && n.props.style?.top === size + 2)[0];
    const pet = r.root.findByProps({ testID: "picture-pet" }).props.style;
    const number = r.root.findAll(n => n.type === "SvgText" || n.type === "SvgdText").find(n => [].concat(n.props.children).join("") === String(level));
    assert.ok(below, `${size}: the pill starts below the picture's box, so it never covers it`);
    assert.equal(box.height, size + pic.levelPill(size, level).room, `${size}: the picture is a little taller, with room for the pill`);
    assert.deepEqual([pet.top, pet.right], [0, 0], `${size}: the pet is at the top right`);
    assert.ok(pill.props.width >= pill.props.height * 2, `${size}: a long pill`);
    assert.ok(number, `${size}: the level, drawn centred in its pill`);
    assert.equal(number.props.textAnchor, "middle");
    void holder;
    await act(async () => r.unmount());
  }
  assert.ok(pic.levelPill(48, 100).width >= pic.levelPill(48, 7).width && pic.levelPill(48, 1000).width > pic.levelPill(48, 7).width, "long enough for three digits from the start, and longer still if needed");
});

test("Home wears your tier's colours, shows your level on your picture, and keeps the This week and Squad tiles short", () => {
  const home = read("src/app/(tabs)/index.tsx");
  assert.match(home, /<CharacterMark size=\{70\} \/>/, "the picture is big enough to carry the level");
  assert.doesNotMatch(home, /<ProgressRing/, "one ring: the picture's own frame");
  assert.match(home, /const level = useShownLevel\(profile\?\.id, profile\?\.level\)\.level;/);
  assert.match(home, /color: levelTint\.color/);
  const sections = read("src/components/HomeSections.tsx");
  assert.match(sections, /<Text style=\{s\.tileTotal\} numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.7\}>\{studyTime\(week\?\.seconds \?\? 0\)\}<\/Text>/, "1h 31m, on one line");
  assert.match(sections, /numberOfLines=\{1\}>\{tileChange\}/);
  assert.match(sections, /% of the squad goal/, "the squad tile says how close the goal is");
  const road = read("src/components/LevelTierSheet.tsx");
  assert.match(road, /stroke=\{LEVEL_TIERS\[i \+ 1\]\.color\}/, "the lit road takes each tier's colour");
  assert.doesNotMatch(road.slice(0, road.indexOf("const s = StyleSheet")), /colors\.level\b/, "no amber left on the road");
});

test("Outfits calls the picture tab Profile, and its chips sit in a row above your picture", () => {
  const outfits = read("src/app/outfits.tsx");
  assert.match(outfits, /\{ value: "picture", label: "Profile" \}/);
  assert.match(outfits, /\{setName && !picture &&/, "the set chip belongs to clothes, not your profile picture");
  assert.match(outfits, /<View style=\{\[s\.chips, picture && s\.chipsRow\]\}>/);
  assert.match(outfits, /size=\{pictureFits\(Math\.min\(roomy \? 164 : 146, height - PICTURE_ROOM\), height - PICTURE_ROOM\)\}/, "the picture and its level pill fit below the chips");
});
