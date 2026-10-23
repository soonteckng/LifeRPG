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
const svg = { __esModule: true, default: host("Svg"), G: host("G"), Path: host("Path"), Circle: host("Circle"), Ellipse: host("Ellipse"), Rect: host("Rect"), Defs: host("Defs"), LinearGradient: host("LinearGradient"), Stop: host("Stop") };
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
  assert.equal(high.root.findAllByType("Text")[0].props.children, 12);
  assert.equal(low.root.findAllByType("Item").length, 0); assert.equal(low.root.findAllByType("Text").length, 0);
  const small = await render({ size: 32, equipped: { pet: "pet_owl" }, streak: 40 });
  assert.equal(small.root.findAllByType("Item").length + small.root.findAllByType("Text").length, 0, "tiny pictures stay clean");
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

async function outfits({ online = true, owned = ["cardigan", "beret"], stardust = 100 } = {}) {
  const log = [];
  const rewards = {
    online, busy: false, stardust, owned, look: LOOK, equipped: { top: "cardigan" }, background: "bg_dusk", frame: null, title: null,
    saveAvatar: async draft => { log.push(["save", draft]); return { ok: true, value: {} }; },
    buy: async id => { log.push(["buy", id]); return { ok: true, value: {} }; },
  };
  const Screen = load("src/app/outfits.tsx", {
    "react-native": native, "@expo/vector-icons": { Ionicons: host("Icon") }, "../components/MotionPressable": host("Press"), "../components/AppText": { Text: host("Text") },
    "../components/PersonalUI": { PersonalPage: ({ children, footer }) => React.createElement("Page", null, children, footer), PersonalButton: props => React.createElement("Button", props), p: {} },
    "../components/Segmented": props => React.createElement("Segmented", props), "../components/SheetConfirmation": props => React.createElement("Confirm", props),
    "../components/adventurer/Adventurer": host("Adventurer"), "../components/adventurer/ItemArt": { __esModule: true, default: host("Item"), StardustArt: host("Dust") },
    "../context/UserContext": { useUser: () => ({ profile: { level: 12 } }) }, "../hooks/useRewards": { useRewards: () => rewards },
    "expo-router": { useRouter: () => ({ back: () => log.push(["back"]) }) },
  }).default;
  let r; await act(async () => { r = create(React.createElement(Screen)); });
  const press = async label => act(async () => r.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0].props.onPress());
  const tab = async value => act(async () => r.root.findByType("Segmented").props.onChange(value));
  const button = title => r.root.findAllByType("Button").find(b => b.props.title === title);
  const words = () => JSON.stringify(r.root.findAllByType("Text").map(t => t.props.children));
  return { r, log, press, tab, button, words, preview: () => r.root.findByType("Adventurer").props };
}

test("Outfits wears what you own, previews what you don't, and saves then goes back to Profile", async () => {
  const ui = await outfits();
  try {
    assert.equal(ui.button("Save look").props.disabled, true, "nothing to save yet");
    await ui.press("Skin tone 7"); await ui.press("Braids"); await ui.press("Glasses off");
    assert.deepEqual(ui.preview().look, { skin: "7", hair: "braids", hairColor: "darkbrown", glasses: true });
    await ui.tab("clothes");
    await ui.press("Red beret, Common, owned");
    assert.deepEqual(ui.preview().equipped, { top: "cardigan", head: "beret" });
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
    assert.deepEqual(ui.log, [["save", { look: { skin: "7", hair: "braids", hairColor: "darkbrown", glasses: true }, equipped: { head: "beret" }, background: "bg_dusk", frame: null, title: null }], ["back"]],
      "saved, then back to Profile");
  } finally { await act(async () => ui.r.unmount()); }
});

test("Outfits buys with enough Stardust after asking, and needs internet to save or buy", async () => {
  const ui = await outfits({ stardust: 500 });
  try {
    await ui.tab("gear"); await ui.press("Walking staff, Common, not found yet");
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
    await off.tab("gear"); await off.press("Walking staff, Common, not found yet");
    assert.equal(off.button("Get it for 60 Stardust"), undefined, "no buying offline");
  } finally { await act(async () => off.r.unmount()); }
});

test("Reset and Save look stay fixed below the scrolling outfits", () => {
  const page = fs.readFileSync(path.join(root, "src/app/outfits.tsx"), "utf8");
  assert.match(page, /<PersonalPage title="Outfits"[^>]*footer=\{footer\}>/);
  const ui = fs.readFileSync(path.join(root, "src/components/PersonalUI.tsx"), "utf8");
  assert.match(ui, /<\/TourScrollView>\n\s*\{footer && <View/, "the footer sits outside the scroll view");
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
