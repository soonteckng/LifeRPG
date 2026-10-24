/* global __dirname */
// Round 64 in the app: the trail's rules come from the server (with the old
// rules until the Round 64 SQL runs), today's trail opens from Home, and the
// level hangs below the picture.
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
const state = extra => ({ stardust: 10, nextFindSeconds: 600, owned: [], earned: [], avatar: { look: {}, equipped: {}, background: "bg_dusk", revision: 1 },
  pack: { date: "2026-10-25", goalReached: false, claimed: false, tier: 0, daysInARow: 0 }, today: { seconds: 1800, finds: 1 }, ...extra });

test("the trail's rules come from the server, and the old rules hold until the Round 64 SQL runs", async () => {
  let reply;
  const service = load("src/services/rewardsService.ts", { "../../lib/supabase": { supabase: { rpc: async () => ({ data: reply, error: null }) } } });
  const old = service.parseRewardsState(state());
  assert.deepEqual(old.trail, { findSeconds: 1500, stops: 6, complete: false }, "an older server: a find every 25 minutes");
  const now = service.parseRewardsState(state({ findSeconds: 1200, trailSeconds: 7200, today: { seconds: 7300, finds: 6, trailComplete: true } }));
  assert.deepEqual(now.trail, { findSeconds: 1200, stops: 6, complete: true });
  const client = service.createRewardsClient("me", async () => "me");
  reply = { sessions: [{ sessionId: "s", finds: [], minutesStardust: 6, seconds: 1800, daySecondsBefore: 5400, trailStardust: 50 }, { sessionId: "t", finds: [], minutesStardust: 1 }], milestones: [], state: state() };
  const claim = await client.claimSessions();
  assert.deepEqual(claim.sessions.map(s => [s.daySecondsBefore, s.trailStardust]), [[5400, 50], [null, 0]], "older replies still read");
});

test("a session's card holds every find it made, and the trail starts from where today stood before it", () => {
  const hook = read("src/hooks/useRewards.ts");
  assert.match(hook, /const finds = r\.value\.sessions\.flatMap\(x => x\.finds\)/, "all sessions claimed together share one card");
  assert.match(hook, /fromSeconds: Math\.max\(0, r\.value\.state\.today\.seconds - seconds\)/);
  assert.match(hook, /finds\.reduce\(\(n, g\) => n \+ g\.stardust, 0\) \+ trailStardust/, "the trail bonus is in the Stardust total");
});

test("Home opens today's trail from a map button between your name and Settings; your name keeps its room and shortens first", async () => {
  const home = read("src/app/(tabs)/index.tsx");
  const name = home.indexOf('testID="home-name"'), map = home.indexOf('testID="home-trail"'), settings = home.indexOf('testID="home-settings"');
  assert.ok(name < map && map < settings, "name, then the map, then Settings");
  assert.match(home, /<TrailSheet visible=\{trailOpen\} onClose=\{\(\) => setTrailOpen\(false\)\} \/>/);
  assert.match(home, /nameButton: \{ flex: 1, minWidth: 0 \}/);
  assert.match(home, /style=\{styles\.name\} numberOfLines=\{1\} ellipsizeMode="tail"/);
  const Sheet = load("src/components/rewards/TrailSheet.tsx", {
    "react-native": { View: host("View"), StyleSheet: { create: v => v } }, "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
    "../AppSheet": props => props.visible ? React.createElement("Sheet", props, props.header, props.children) : null, "../SheetHeader": host("Header"),
    "./TodayTrail": host("Trail"), "../../context/UserContext": { useUser: () => ({ profile: { id: "me", level: 7 } }) },
    "../../hooks/useRewards": { useRewards: () => ({ today: { seconds: 2600, finds: 2 }, trail: { findSeconds: 1200, stops: 6, complete: false }, nextFindSeconds: 1000,
      look: {}, equipped: {}, background: "bg_dusk", frame: null }) },
  }).default;
  let r; await act(async () => { r = create(React.createElement(Sheet, { visible: true, onClose() {} })); });
  const trail = r.root.findByType("Trail").props;
  assert.deepEqual([trail.seconds, trail.fromSeconds, trail.findSeconds, trail.stops, trail.level], [2600, undefined, 1200, 6, 7], "you stand where today's focus has taken you");
  assert.match(r.root.findByType("Header").props.subtitle, /A find every 20 focused minutes, up to 120 minutes a day/);
  await act(async () => r.unmount());
});

test("the level sits below the picture at its full size, clear of the face and shirt, on Home, squads and Outfits", async () => {
  const Picture = load("src/components/adventurer/ProfilePicture.tsx", {
    "react-native": { View: host("View") }, "react-native-svg": svg, "./AdventurerArt": host("Art"), "./ItemArt": host("Item"), "../AppText": { Text: host("Text") },
  }).default;
  for (const size of [48, 70, 146]) {
    let r; await act(async () => { r = create(React.createElement(Picture, { look: {}, level: 9, size })); });
    const up = node => { let n = node.parent; while (n && n.type !== "View") n = n.parent; return n; };
    const photoNode = up(r.root.findByType("Art")), art = up(photoNode).props.style;
    const pillTop = r.root.findAll(n => n.type === "View" && n.props.style?.left === 0 && n.props.style?.right === 0)[0].props.style.top;
    assert.equal(art.width, size, `${size}: the picture keeps its full size`);
    assert.ok(pillTop >= size, `${size}: the pill starts below the picture`);
    await act(async () => r.unmount());
  }
  for (const [file, pattern] of [["src/components/CharacterMark.tsx", /<View style=\{\{ width: size \}\}/], ["src/components/SquadSheets.tsx", /<View style=\{\{ width: size \}\}/],
    ["src/app/(tabs)/index.tsx", /avatarFrame: \{ width: 70, alignItems: "center" \}/]]) assert.match(read(file), pattern, `${file}: room for the pill below`);
});
