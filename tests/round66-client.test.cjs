/* global __dirname */
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
    const target = path.resolve(path.dirname(filename), name), resolved = [".ts", ".tsx"].map(ext => target + ext).find(fs.existsSync);
    if (!resolved) throw Error(`Missing module ${name} in ${file}`);
    return load(path.relative(root, resolved), mocks, cache);
  }, mod, mod.exports);
  return mod.exports;
}
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
const wire = (seconds = 0, extra = {}) => ({ stardust: 10, nextFindSeconds: Math.max(0, 1800 - seconds), findSeconds: 1800, trailSeconds: 7200,
  owned: [], earned: [], avatar: { look: { skin: "3", hair: "short", hairColor: "darkbrown", glasses: false }, equipped: {}, frame: null, background: "bg_dusk", title: null, revision: 1 },
  pack: { date: "2026-10-25", goalReached: false, claimed: false, tier: 0, daysInARow: 0 },
  today: { date: "2026-10-25", seconds, finds: Math.floor(seconds / 1800), trailComplete: false }, ...extra });
const service = () => load("src/services/rewardsService.ts", { "../../lib/supabase": { supabase: {} } });

test("the phone cache preserves the server's 30-minute rules, four stops and completion flags", () => {
  const { parseRewardsState } = service();
  for (const state of [wire(120), wire(7200, { nextFindSeconds: 0, today: { date: "2026-10-25", seconds: 7200, finds: 4, trailComplete: true, findsComplete: true } }),
    wire(1800, { nextFindSeconds: 0, today: { date: "2026-10-25", seconds: 1800, finds: 0, trailComplete: false, pendingFinds: 1 } })]) {
    const parsed = parseRewardsState(state), cached = parseRewardsState(JSON.parse(JSON.stringify(parsed)));
    assert.deepEqual(cached, parsed);
    assert.deepEqual(cached.trail, { findSeconds: 1800, stops: 4, complete: state.today.trailComplete });
  }
  const legacy = wire(60, { nextFindSeconds: 480 }); delete legacy.findSeconds; delete legacy.trailSeconds;
  const old = parseRewardsState(legacy);
  assert.deepEqual(old.trail, { findSeconds: 1500, stops: 6, complete: false });
  assert.equal(old.nextFindSeconds, 480, "an old server's carried bank is not silently replaced with the new rule");
});

test("invalid cached or wire rules cannot allocate a huge map or invent a completion", () => {
  const { parseRewardsState } = service(), parsed = parseRewardsState(wire(120));
  for (const stops of [2 ** 32, 1.5, Infinity, -1, 0]) {
    const copy = parseRewardsState({ ...parsed, trail: { findSeconds: 1800, stops, complete: true } });
    assert.deepEqual(copy.trail, { findSeconds: 1500, stops: 6, complete: false });
  }
  for (const [findSeconds, trailSeconds] of [[1800, 7201], [1, 2 ** 32], [0, 7200], [1800, 86401]]) {
    const copy = parseRewardsState(wire(120, { findSeconds, trailSeconds }));
    assert.deepEqual(copy.trail, { findSeconds: 1500, stops: 6, complete: false });
  }
});

test("a reopened rewards store reads exactly the same trail from its per-owner offline cache", async () => {
  const saved = new Map(), storage = { getItem: async key => saved.get(key) ?? null, setItem: async (key, value) => saved.set(key, value) };
  const cache = new Map(), mocks = { "../../lib/supabase": { supabase: {} } };
  const { parseRewardsState } = load("src/services/rewardsService.ts", mocks, cache);
  const { createRewardsStore } = load("src/services/rewardsStore.ts", mocks, cache);
  const state = parseRewardsState(wire(120));
  const first = createRewardsStore(storage); await first.load("owner", { load: async () => state });
  const reopened = createRewardsStore(storage); await reopened.load("owner", null);
  assert.deepEqual(reopened.snapshot("owner").state, state);
  await reopened.load("other", null); assert.equal(reopened.snapshot("other").state, null);
});

test("a claim's walk belongs to its credited day and cannot include yesterday's imported minutes", () => {
  const { claimedTrail, parseRewardsState } = service();
  const state = parseRewardsState(wire(120));
  const old = { sessionId: "yesterday", seconds: 3600, daySecondsBefore: 0, creditedDate: "2026-10-24" };
  const current = { sessionId: "today", seconds: 60, daySecondsBefore: 60, creditedDate: "2026-10-25" };
  const snapshot = claimedTrail({ state, sessions: [old, current] });
  assert.deepEqual([snapshot.seconds, snapshot.fromSeconds, snapshot.nextFindSeconds], [120, 60, 1680]);
  assert.deepEqual(claimedTrail({ state, sessions: [old] }).fromSeconds, 120, "a historical-only claim does not walk today's trail");
  const backlog = claimedTrail({ state: parseRewardsState(wire(3600)), sessions: [{ ...current, daySecondsAfter: 120 }] });
  assert.equal(backlog.seconds, 3600, "real daily totals are not reduced to a 50-session claim batch");
});

test("two real hook/service claims advance one-minute sessions and freeze each reveal's previous position", async () => {
  let rewards, requests = 0;
  const saved = new Map(), auth = { user: { id: "owner" }, accessMode: "online", admissionEpoch: 1, verifyCurrentOwner: async () => ({ id: "owner" }) };
  const cache = new Map(), mocks = {
    "@react-native-async-storage/async-storage": { getItem: async key => saved.get(key) ?? null, setItem: async (key, value) => saved.set(key, value) },
    "../context/AuthContext": { useAuth: () => auth },
    "../../lib/supabase": { supabase: { rpc: async (name, args) => {
      assert.equal(name, "claim_session_rewards_v1"); assert.equal(args.p_expected_owner, "owner"); requests++;
      return { data: { sessions: [{ sessionId: `session-${requests}`, finds: [], minutesStardust: 0, seconds: 60,
        daySecondsBefore: (requests - 1) * 60, daySecondsAfter: requests * 60, creditedDate: "2026-10-25" }], milestones: [], state: wire(requests * 60) }, error: null };
    } } },
  };
  const { useRewards } = load("src/hooks/useRewards.ts", mocks, cache);
  function Capture() { rewards = useRewards({ load: false }); return null; }
  let ui; await act(async () => { ui = create(React.createElement(Capture)); });
  try {
    await act(async () => { assert.equal((await rewards.claimSessions()).ok, true); });
    const first = rewards.reveals[0];
    assert.deepEqual([rewards.today.seconds, rewards.nextFindSeconds, first.trail.fromSeconds, first.trail.seconds], [60, 1740, 0, 60]);
    await act(async () => { assert.equal((await rewards.claimSessions()).ok, true); });
    assert.equal(requests, 2);
    assert.deepEqual([rewards.today.seconds, rewards.nextFindSeconds, rewards.reveals[1].trail.fromSeconds, rewards.reveals[1].trail.seconds], [120, 1680, 60, 120]);
    assert.deepEqual([first.trail.fromSeconds, first.trail.seconds, first.trail.nextFindSeconds], [0, 60, 1740], "the earlier animation stays on its own snapshot");
  } finally { await act(async () => ui.unmount()); }
});

test("a mixed-day claim keeps all Stardust but only today's trail completion bonus appears on today's map", async () => {
  let rewards;
  const auth = { user: { id: "owner" }, accessMode: "online", admissionEpoch: 1, verifyCurrentOwner: async () => ({ id: "owner" }) };
  const { useRewards } = load("src/hooks/useRewards.ts", {
    "@react-native-async-storage/async-storage": { getItem: async () => null, setItem: async () => {} }, "../context/AuthContext": { useAuth: () => auth },
    "../../lib/supabase": { supabase: { rpc: async () => ({ data: { sessions: ["2026-10-24", "2026-10-25"].map((creditedDate, i) => ({ sessionId: `session-${i}`, creditedDate, seconds: 7200,
      daySecondsBefore: 0, daySecondsAfter: 7200, finds: [], minutesStardust: 24, trailStardust: 50 })), milestones: [],
      state: wire(7200, { nextFindSeconds: 0, today: { date: "2026-10-25", seconds: 7200, finds: 4, trailComplete: true } }) }, error: null }) } },
  });
  function Capture() { rewards = useRewards({ load: false }); return null; }
  let ui; await act(async () => { ui = create(React.createElement(Capture)); });
  try {
    await act(async () => { assert.equal((await rewards.claimSessions()).ok, true); });
    const reveal = rewards.reveals[0];
    assert.equal(reveal.stardust, 148, "both days' bonuses and minutes are real earned currency");
    assert.equal(reveal.trailStardust, 50, "today's trail never displays yesterday's bonus again");
    assert.deepEqual([reveal.trail.fromSeconds, reveal.trail.seconds], [0, 7200]);
  } finally { await act(async () => ui.unmount()); }
});

async function momentsHarness(initialBusy = false, reply = { ok: true }, transport = null, cachedState = null) {
  let profile = { id: "owner", level: 1, current_xp: 0, streak_count: 0 }, calls = 0, claimKey = null;
  const listeners = new Set(), app = { currentState: "active", addEventListener(_event, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const rewards = { owner: "owner", admissionEpoch: 1, online: true, busy: initialBusy, reveals: [], moments: [], today: { seconds: 0, finds: 0 }, trail: { findSeconds: 1800, stops: 4 },
    claimSessions: async () => { calls++; return reply; } };
  const saved = new Map(), cache = new Map();
  const mocks = {
    "react-native": { Modal: host("Modal"), View: host("View"), AppState: app, StyleSheet: { create: v => v } },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }, "expo-router": { usePathname: () => "/", useRouter: () => ({ push() {} }) },
    "react-native-svg": { __esModule: true, default: host("Svg"), G: host("G"), Path: host("Path") },
    "./MotionPressable": host("Press"), "./AppText": { Text: host("Text") }, "./adventurer/ItemArt": host("Art"), "./adventurer/ProfilePicture": host("Picture"),
    "../context/UserContext": { useUser: () => ({ profile }) },
    "../hooks/useReducedMotion": { useReducedMotion: () => true }, "../services/launchIntroState": { launchIntroState: { subscribe: () => () => {}, isDone: () => true } },
    "../utils/sheetActivity": { registerSheetActivity: () => () => {}, useActiveSheetCount: () => 0 }, "../utils/tapHaptics": { tapHaptic() {} },
    "./rewards/RevealScreens": { ExpeditionReveal: host("Expedition"), PackReveal: host("Pack") }, "./rewards/rarity": { RARITY_COLOR: {} },
  };
  let actualRewards;
  if (transport) {
    mocks["@react-native-async-storage/async-storage"] = { getItem: async key => saved.get(key) ?? null, setItem: async (key, value) => saved.set(key, value) };
    mocks["../context/AuthContext"] = { useAuth: () => ({ user: { id: "owner" }, accessMode: "online", admissionEpoch: 1, verifyCurrentOwner: async () => ({ id: "owner" }) }) };
    mocks["../../lib/supabase"] = { supabase: { rpc: transport } };
    actualRewards = load("src/hooks/useRewards.ts", mocks, cache);
    if (cachedState) {
      saved.set("liferpg.rewards.v1.owner", JSON.stringify(cachedState));
      await actualRewards.rewardsStore.load("owner", null);
    }
  } else mocks["../hooks/useRewards"] = { useRewards: () => rewards };
  const Moments = load("src/components/RewardMoments.tsx", mocks, cache).default;
  let ui; const render = () => act(async () => ui.update(React.createElement(Moments, { insideSession: false, claimKey })));
  await act(async () => { ui = create(React.createElement(Moments, { insideSession: false, claimKey })); });
  return { calls: () => calls, snapshot: () => actualRewards?.rewardsStore.snapshot("owner"), update: async patch => { if (patch.profile) profile = { ...profile, ...patch.profile }; if (Object.hasOwn(patch, "claimKey")) claimKey = patch.claimKey;
    for (const key of ["busy", "online", "owner", "admissionEpoch"]) if (Object.hasOwn(patch, key)) rewards[key] = patch[key];
    if (patch.today) rewards.today = { ...rewards.today, ...patch.today }; await render(); },
    app: state => act(async () => { app.currentState = state; for (const listener of listeners) listener(state); }),
    cleanup: () => act(async () => ui.unmount()) };
}

test("a completion arriving during an existing reward action is claimed once after it becomes free", async () => {
  const ui = await momentsHarness(true);
  try {
    assert.equal(ui.calls(), 0);
    await ui.update({ claimKey: "session-one", profile: { current_xp: 1 } }); assert.equal(ui.calls(), 0);
    await ui.update({ profile: { current_xp: 2 } }); assert.equal(ui.calls(), 0);
    await ui.update({ busy: false }); assert.equal(ui.calls(), 1, "profile and summary updates during the lock share one claim");
    await ui.update({ claimKey: null }); assert.equal(ui.calls(), 1);
    await ui.update({ busy: true, claimKey: "session-two" }); assert.equal(ui.calls(), 1);
    await ui.update({ busy: false }); assert.equal(ui.calls(), 2);
  } finally { await ui.cleanup(); }
});

test("a new completed-session profile update is not lost behind a persistent older summary", async () => {
  const ui = await momentsHarness(false);
  try {
    await ui.update({ claimKey: "old-session", profile: { current_xp: 1 } }); const previous = ui.calls();
    await ui.update({ profile: { current_xp: 2 } }); assert.equal(ui.calls(), previous + 1);
    await ui.update({}); assert.equal(ui.calls(), previous + 1);
  } finally { await ui.cleanup(); }
});

test("automatic reward checks do not retry failed HTTP calls or run while backgrounded", async () => {
  const ui = await momentsHarness(false, { ok: false, message: "Couldn't reach your rewards." });
  try {
    assert.equal(ui.calls(), 1); await ui.update({}); assert.equal(ui.calls(), 1);
    await ui.app("background"); await ui.update({ claimKey: "session-one", profile: { current_xp: 1 } }); assert.equal(ui.calls(), 1);
    await ui.app("active"); assert.equal(ui.calls(), 2); await ui.update({}); assert.equal(ui.calls(), 2);
  } finally { await ui.cleanup(); }
});

test("reconnection and a fresh account admission each check once, after the matching profile is ready", async () => {
  const ui = await momentsHarness(false, { ok: false, message: "Couldn't reach your rewards." });
  try {
    assert.equal(ui.calls(), 1);
    await ui.update({ online: false }); assert.equal(ui.calls(), 1);
    await ui.update({ online: true }); assert.equal(ui.calls(), 2);
    await ui.update({}); assert.equal(ui.calls(), 2);
    await ui.update({ admissionEpoch: 2 }); assert.equal(ui.calls(), 3);
    await ui.update({ owner: "other", admissionEpoch: 3 }); assert.equal(ui.calls(), 3, "do not mix an incoming reward account with an outgoing profile");
    await ui.update({ profile: { id: "other" } }); assert.equal(ui.calls(), 4);
  } finally { await ui.cleanup(); }
});

test("a distinct server-reported pending find gets one catch-up check, without polling a failed reply", async () => {
  const ui = await momentsHarness(false, { ok: false, message: "Couldn't reach your rewards." });
  try {
    assert.equal(ui.calls(), 1);
    await ui.update({ busy: true, today: { date: "2026-10-25", seconds: 1800, pendingFinds: 1 } }); assert.equal(ui.calls(), 1);
    await ui.update({ busy: false }); assert.equal(ui.calls(), 2);
    await ui.update({}); assert.equal(ui.calls(), 2);
    await ui.update({ busy: true }); await ui.update({ busy: false }); assert.equal(ui.calls(), 2, "unrelated actions do not retry the same failed pending state");
  } finally { await ui.cleanup(); }
});

test("a cold or warm-cache 51-session backlog catches up the pending stop with one shared follow-up", async () => {
  for (const warm of [false, true]) {
  let claims = 0;
  const pending = wire(1800, { nextFindSeconds: 0, today: { date: "2026-10-25", seconds: 1800, finds: 0, pendingFinds: 1, trailComplete: false } });
  const ui = await momentsHarness(false, null, async name => {
    if (name === "get_rewards_v1") return { data: pending, error: null };
    assert.equal(name, "claim_session_rewards_v1"); claims++;
    const session = (id, creditedDate, seconds = 60) => ({ sessionId: id, creditedDate, seconds, daySecondsBefore: 0,
      daySecondsAfter: seconds, minutesStardust: 0, finds: [] });
    if (claims === 1) return { data: { sessions: Array.from({ length: 50 }, (_, i) => session(`old-${i}`, "2026-10-24")), milestones: [], state: pending }, error: null };
    assert.equal(claims, 2, "the same pending state cannot cause a third request");
    return { data: { sessions: [{ ...session("current", "2026-10-25", 1800), finds: [{ item: "tote", rarity: "common", new: true, stardust: 0 }] }], milestones: [],
      state: wire(1800, { nextFindSeconds: 1800, today: { date: "2026-10-25", seconds: 1800, finds: 1, pendingFinds: 0, trailComplete: false } }) }, error: null };
  }, warm ? service().parseRewardsState(pending) : null);
  try {
    assert.equal(claims, 2); assert.equal(ui.snapshot().state.today.finds, 1);
    assert.equal(ui.snapshot().reveals.length, 2);
    assert.equal(ui.snapshot().reveals[0].trail.fromSeconds, 1800, "old sessions do not replay as today's walk");
    assert.deepEqual([ui.snapshot().reveals[1].trail.fromSeconds, ui.snapshot().reveals[1].trail.seconds], [0, 1800]);
    await ui.update({}); assert.equal(claims, 2);
  } finally { await ui.cleanup(); }
  }
});

test("a displayed trail keeps its frozen progress when the live player advances or crosses midnight", async () => {
  const useStableValue = value => { const ref = React.useRef(null); if (!ref.current) ref.current = { value, get() { return this.value; }, set(next) { this.value = next; } }; return ref.current; };
  const reanimated = { __esModule: true, default: { View: host("Animated") }, Easing: { out: x => x, quad: x => x },
    cancelAnimation() {}, ReduceMotion: { System: "system" }, useSharedValue: useStableValue, useAnimatedStyle: () => ({}), withTiming: value => value };
  const { ExpeditionReveal } = load("src/components/rewards/RevealScreens.tsx", {
    "react-native": { View: host("View"), ScrollView: host("Scroll"), StyleSheet: { create: v => v }, useWindowDimensions: () => ({ width: 360, height: 640 }) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }, "react-native-reanimated": reanimated,
    "react-native-svg": { __esModule: true, default: host("Svg") }, "../MotionPressable": host("Press"), "../AppText": { Text: host("Text") },
    "../adventurer/ItemArt": { __esModule: true, default: host("Art"), StardustArt: host("Dust") }, "./PackArt": { __esModule: true, default: host("PackArt"), PACK_COLORS: [] },
    "./TodayTrail": host("Trail"), "../../hooks/useReducedMotion": { useReducedMotion: () => true }, "../../utils/tapHaptics": { tapHaptic() {} },
  });
  const trail = { date: "2026-10-25", seconds: 120, fromSeconds: 60, finds: 0, nextFindSeconds: 1680, findSeconds: 1800, stops: 4, complete: false };
  const reveal = { id: "return:one", kind: "expedition", seconds: 60, finds: [], stardust: 0, trail };
  const player = { today: { seconds: 7200, finds: 4 }, trail: { findSeconds: 1800, stops: 4, complete: true }, nextFindSeconds: 0, look: {}, equipped: {}, level: 1, background: "bg_dusk", frame: null };
  let ui; await act(async () => { ui = create(React.createElement(ExpeditionReveal, { reveal, player, onClose() {}, onOutfits() {} })); });
  try {
    const reading = () => { const p = ui.root.findByType("Trail").props; return [p.seconds, p.fromSeconds, p.finds, p.nextFindSeconds, p.complete]; };
    assert.deepEqual(reading(), [120, 60, 0, 1680, false]);
    await act(async () => ui.update(React.createElement(ExpeditionReveal, { reveal, player: { ...player, today: { seconds: 0, finds: 0 } }, onClose() {}, onOutfits() {} })));
    assert.deepEqual(reading(), [120, 60, 0, 1680, false]);
  } finally { await act(async () => ui.unmount()); }
});
