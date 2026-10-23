// Rewards, stage 1: finds from credited focus time, pets for hours, streak
// frames, set titles, the daily supply pack ladder, the trader and saving the
// character's look. Everything is decided on the server.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261024090000_rewards_core.sql'), 'utf8');

test('rewards live in a private schema and change only through checked functions', () => {
  assert.match(sql, /create schema if not exists liferpg_reward_private;\nrevoke all on schema liferpg_reward_private from public, anon, authenticated;/);
  assert.match(sql, /revoke all on all tables in schema liferpg_reward_private from public, anon, authenticated;/);
  for (const fn of ['get_rewards_v1', 'claim_session_rewards_v1', 'open_daily_pack_v1', 'buy_reward_item_v1', 'save_avatar_v1']) {
    assert.match(sql, new RegExp(`create function public\\.${fn}\\(p_expected_owner uuid[^)]*\\) returns jsonb\\nlanguage plpgsql security definer set search_path = ''`), `${fn} is owner-checked`);
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`));
  }
  assert.doesNotMatch(sql, /alter table public\.|create or replace function public\.(credit|complete|start|confirm)/, 'no existing table or session function is changed');
  for (const table of ['wallets', 'inventory', 'avatars', 'claimed_sessions', 'pack_claims', 'events'])
    assert.match(sql, new RegExp(`create table liferpg_reward_private\\.${table} \\([\\s\\S]*?user_id uuid[^,]*references auth\\.users\\(id\\) on delete cascade`), `${table} goes with a deleted account`);
});

const ts = require('typescript');
function load(file, mocks) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}

test('the app catalog matches the server catalog item for item', () => {
  const catalog = load('src/services/rewardCatalog.ts', {});
  const rows = [...sql.matchAll(/\('([a-z0-9_]+)', '(wearable|pet|frame|background|decor|title)', (?:'([a-z]+)'|null), (?:'([a-z]+)'|null), '([a-z]+)', (true|false), (?:true|false), (?:true|false), (\d+|null)\)/g)]
    .map(m => ({ id: m[1], kind: m[2], slot: m[3], set: m[4], rarity: m[5], free: m[6] === 'true', price: m[7] === 'null' ? undefined : Number(m[7]) }));
  assert.equal(rows.length, catalog.REWARD_ITEMS.length);
  for (const row of rows) {
    const item = catalog.rewardItem(row.id);
    assert.ok(item, row.id);
    assert.equal(item.kind, row.kind, row.id); assert.equal(item.rarity, row.rarity, row.id);
    assert.equal(item.slot, row.slot ?? undefined, row.id); assert.equal(item.set, row.set ?? undefined, row.id);
    assert.equal(!!item.free, row.free, row.id); assert.equal(item.price, row.price, row.id);
    assert.ok(item.name && item.hint, row.id);
  }
});

test('the app refuses odd replies, ignores unknown items and always sends the owner', async () => {
  const calls = [];
  const owner = 'e7147605-e165-48bf-acf2-bcfdd095b6a5';
  let reply;
  const svc = load('src/services/rewardsService.ts', {
    '../../lib/supabase': { supabase: { rpc: async (name, args) => { calls.push([name, args]); return { data: reply, error: null }; } } },
    './rewardCatalog': load('src/services/rewardCatalog.ts', {}),
  });
  const state = { stardust: 12, nextFindSeconds: 900, owned: ['beret', 'from_the_future'],
    avatar: { look: { skin: '2', hair: 'bun', hairColor: 'blonde', glasses: true }, equipped: { head: 'beret', top: 'future_coat' }, frame: null, background: 'bg_dusk', title: null, revision: 3 },
    pack: { date: '2026-10-24', goalReached: true, claimed: false, tier: 1, daysInARow: 2 } };
  const client = svc.createRewardsClient(owner, async () => owner);
  reply = state;
  const s = await client.load();
  assert.deepEqual(s.owned, ['beret']); assert.deepEqual(s.avatar.equipped, { head: 'beret' });
  assert.deepEqual(calls[0], ['get_rewards_v1', { p_expected_owner: owner }]);
  reply = { sessions: [{ sessionId: 'x', finds: [{ item: 'tote', rarity: 'common', new: true, stardust: 0 }], minutesStardust: 5 }], milestones: [], state };
  const claim = await client.claimSessions();
  assert.equal(claim.sessions[0].finds[0].item, 'tote');
  reply = { sessions: [{ sessionId: 'x', finds: [{ item: 'tote', rarity: 'mythic', new: true, stardust: 0 }], minutesStardust: 5 }], milestones: [], state };
  await assert.rejects(client.claimSessions(), /Unexpected/);
  reply = { ...state, stardust: -1 };
  await assert.rejects(client.load(), /Unexpected/);
  await client.saveAvatar({ look: state.avatar.look, equipped: {}, frame: null, background: 'bg_dusk', title: null }, 3).catch(() => {});
  assert.equal(calls.at(-1)[1].p_expected_revision, 3);
  const switched = svc.createRewardsClient(owner, async () => 'someone-else');
  await assert.rejects(switched.load(), /Account changed/);
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';

  async function setup() {
    const db = new PGlite();
    await db.exec(`
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create role authenticated; create role anon;
      create table auth.users(id uuid primary key);
      create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, timezone text, streak_count int default 0);
      create table public.activity_sessions(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, status text,
        duration_seconds int, credit_result jsonb, completed_at timestamptz);
      create table public.daily_progress(user_id uuid references auth.users(id) on delete cascade, progress_date date, goal_minutes int, goal_completed boolean,
        primary key (user_id, progress_date));
      insert into auth.users values ('${a}'), ('${b}');
      insert into public.profiles(id, timezone) values ('${a}', 'Asia/Kuala_Lumpur'), ('${b}', 'Not/AZone');`);
    await db.exec(sql);
    return db;
  }
  const as = async (db, user) => db.exec(`select set_config('test.uid', '${user}', false)`);
  const call = async (db, q, params = []) => (await db.query(q, params)).rows[0];
  const session = (db, user, seconds, ago = '1 minute', credited = true, status = 'completed') => db.query(
    `insert into public.activity_sessions(user_id, status, duration_seconds, credit_result, completed_at) values ($1, $2, $3, $4, now() - $5::interval) returning id`,
    [user, status, seconds, credited ? { ok: true } : null, ago]);

  test('SQL: finds come from every 25 focused minutes, however sessions are split, and only once', async () => {
    const db = await setup();
    try {
      await as(db, a);
      const first = (await call(db, `select public.get_rewards_v1($1) s`, [a])).s;
      assert.equal(first.stardust, 0); assert.deepEqual(first.owned, []); assert.equal(first.nextFindSeconds, 1500);
      assert.equal(first.avatar.background, 'bg_dusk');
      // 3 sessions of 10 minutes = 30 minutes -> one find and 5 minutes banked.
      await session(db, a, 600, '30 seconds'); await session(db, a, 600, '20 seconds'); await session(db, a, 600, '10 seconds');
      // Not credited, cancelled, or from before rewards started: no finds.
      await session(db, a, 3000, '5 seconds', false);
      await session(db, a, 3000, '5 seconds', true, 'cancelled');
      await session(db, a, 9000, '2 days');
      const claim = (await call(db, `select public.claim_session_rewards_v1($1) r`, [a])).r;
      assert.equal(claim.sessions.length, 3, 'three new credited sessions');
      const finds = claim.sessions.flatMap(s => s.finds);
      assert.equal(finds.length, 1, 'one find for 30 minutes');
      assert.equal(claim.sessions.reduce((n, s) => n + s.minutesStardust, 0), 6, '2 Stardust per 10 minutes');
      assert.equal(claim.state.nextFindSeconds, 1500 - 300, '5 minutes carried towards the next find');
      assert.equal(claim.state.owned.length, 1);
      const again = (await call(db, `select public.claim_session_rewards_v1($1) r`, [a])).r;
      assert.deepEqual(again.sessions, [], 'each session counts once');
      assert.equal(again.state.stardust, claim.state.stardust);
      // A 2-hour session: (300 + 7200) / 1500 = 5 finds.
      await session(db, a, 7200, '1 second');
      const big = (await call(db, `select public.claim_session_rewards_v1($1) r`, [a])).r;
      assert.equal(big.sessions[0].finds.length, 5);
      for (const f of big.sessions[0].finds) assert.ok(['common', 'uncommon', 'rare'].includes(f.rarity));
      const ownedIds = big.state.owned;
      const kinds = (await db.query(`select distinct kind from liferpg_reward_private.items where id = any($1)`, [ownedIds])).rows.map(r => r.kind).sort();
      assert.ok(kinds.every(k => ['decor', 'wearable'].includes(k)), 'finds are clothes or camp decor');
      // Someone else can't claim for this person.
      await as(db, b);
      await assert.rejects(db.query(`select public.claim_session_rewards_v1($1)`, [a]), /Account changed/);
      await as(db, '');
      await assert.rejects(db.query(`select public.get_rewards_v1($1)`, [a]), /Account changed/);
    } finally { await db.close(); }
  });

  test('SQL: pets for total hours (past hours count), streak frames and set titles', async () => {
    const db = await setup();
    try {
      await as(db, a);
      await session(db, a, 11 * 3600, '30 days');
      await db.exec(`update public.profiles set streak_count = 31 where id = '${a}'`);
      const r = (await call(db, `select public.claim_session_rewards_v1($1) r`, [a])).r;
      assert.deepEqual(r.sessions, [], 'old sessions give no finds');
      assert.deepEqual(r.milestones.map(m => m.item).sort(), ['frame_streak_30', 'frame_streak_7', 'pet_owl']);
      assert.ok(!r.state.owned.includes('pet_cat'));
      const again = (await call(db, `select public.claim_session_rewards_v1($1) r`, [a])).r;
      assert.deepEqual(again.milestones, [], 'given once');
      // Owning every Artist piece earns the Artist title.
      await db.exec(`update liferpg_reward_private.wallets set stardust = 1000 where user_id = '${a}'`);
      for (const item of ['overalls', 'beret', 'tote']) await db.query(`select public.buy_reward_item_v1($1, $2)`, [a, item]);
      const last = (await call(db, `select public.buy_reward_item_v1($1, 'sneakers') r`, [a])).r;
      assert.deepEqual(last.milestones.map(m => m.item), ['title_artist']);
      assert.equal(last.state.stardust, 1000 - 120 - 60 - 60 - 240);
    } finally { await db.close(); }
  });

  test('SQL: the trader sells only shop items, once, and never on credit', async () => {
    const db = await setup();
    try {
      await as(db, a);
      await db.query(`select public.get_rewards_v1($1)`, [a]);
      await assert.rejects(db.query(`select public.buy_reward_item_v1($1, 'beret')`, [a]), /Not enough Stardust/);
      await db.exec(`update liferpg_reward_private.wallets set stardust = 200 where user_id = '${a}'`);
      await assert.rejects(db.query(`select public.buy_reward_item_v1($1, 'pet_fox')`, [a]), /not sold/);
      await assert.rejects(db.query(`select public.buy_reward_item_v1($1, 'frame_streak_365')`, [a]), /not sold/);
      await assert.rejects(db.query(`select public.buy_reward_item_v1($1, 'nope')`, [a]), /not sold/);
      const r = (await call(db, `select public.buy_reward_item_v1($1, 'beret') r`, [a])).r;
      assert.equal(r.state.stardust, 140);
      await assert.rejects(db.query(`select public.buy_reward_item_v1($1, 'beret')`, [a]), /already have/);
      const events = (await db.query(`select kind, item_id, stardust from liferpg_reward_private.events where user_id = $1`, [a])).rows;
      assert.deepEqual(events, [{ kind: 'purchase', item_id: 'beret', stardust: -60 }]);
    } finally { await db.close(); }
  });

  test('SQL: the daily pack needs the goal, opens once a day, grows with days in a row and steps back one pack after a miss', async () => {
    const db = await setup();
    try {
      await as(db, a);
      const today = (await call(db, `select liferpg_reward_private.local_today($1) d`, [a])).d;
      const day = n => new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);
      await assert.rejects(db.query(`select public.open_daily_pack_v1($1)`, [a]), /Reach your daily goal/);
      await db.query(`insert into public.daily_progress values ($1, $2, 60, true)`, [a, day(0)]);
      const before = (await call(db, `select public.get_rewards_v1($1) s`, [a])).s;
      assert.deepEqual([before.pack.goalReached, before.pack.claimed, before.pack.tier], [true, false, 0]);
      const p = (await call(db, `select public.open_daily_pack_v1($1) r`, [a])).r;
      assert.equal(p.tier, 0); assert.equal(p.daysInARow, 1);
      assert.equal(p.stardust, 10 + 4, 'canvas 10, plus 2 per half hour of goal');
      assert.equal(p.items.length, 1);
      const kind = (await call(db, `select kind from liferpg_reward_private.items where id = $1`, [p.items[0].item])).kind;
      assert.ok(['background', 'decor'].includes(kind));
      assert.equal(p.state.pack.claimed, true);
      await assert.rejects(db.query(`select public.open_daily_pack_v1($1)`, [a]), /already opened/);
      // Pretend the last pack was yesterday with 6 days in a row: today is day 7 -> Brass.
      await db.query(`delete from liferpg_reward_private.pack_claims where user_id = $1`, [a]);
      await db.query(`update liferpg_reward_private.wallets set pack_days = 6, last_pack_date = $2 where user_id = $1`, [a, day(-1)]);
      const brass = (await call(db, `select public.open_daily_pack_v1($1) r`, [a])).r;
      assert.deepEqual([brass.tier, brass.daysInARow, brass.stardust], [2, 7, 35 + 4]);
      // At Brass, missing days steps back to Leather (3) and today makes 4: still Leather, not zero.
      await db.query(`delete from liferpg_reward_private.pack_claims where user_id = $1`, [a]);
      await db.query(`update liferpg_reward_private.wallets set pack_days = 9, last_pack_date = $2 where user_id = $1`, [a, day(-3)]);
      const back = (await call(db, `select public.open_daily_pack_v1($1) r`, [a])).r;
      assert.deepEqual([back.tier, back.daysInARow], [1, 4]);
      // A big goal adds only a little: 300 minutes -> +16 at most.
      await db.query(`delete from liferpg_reward_private.pack_claims where user_id = $1`, [a]);
      await db.query(`update public.daily_progress set goal_minutes = 300 where user_id = $1`, [a]);
      await db.query(`update liferpg_reward_private.wallets set pack_days = 13, last_pack_date = $2 where user_id = $1`, [a, day(-1)]);
      const crystal = (await call(db, `select public.open_daily_pack_v1($1) r`, [a])).r;
      assert.deepEqual([crystal.tier, crystal.stardust], [3, 60 + 16]);
      // A broken time zone falls back to UTC instead of failing.
      await as(db, b);
      const s = (await call(db, `select public.get_rewards_v1($1) s`, [b])).s;
      assert.match(s.pack.date, /^\d{4}-\d{2}-\d{2}$/);
    } finally { await db.close(); }
  });

  test('SQL: the look saves only owned or free items in the right slots, and never over a newer save', async () => {
    const db = await setup();
    try {
      await as(db, a);
      const s = (await call(db, `select public.get_rewards_v1($1) s`, [a])).s;
      const look = { skin: '6', hair: 'braids', hairColor: 'black', glasses: true };
      const save = (avatar, rev) => db.query(`select public.save_avatar_v1($1, $2, $3) s`, [a, avatar, rev]);
      const saved = (await save({ look, equipped: { face: 'glasses' }, background: 'bg_dusk' }, s.avatar.revision)).rows[0].s;
      assert.deepEqual(saved.avatar.look, look); assert.deepEqual(saved.avatar.equipped, { face: 'glasses' });
      await assert.rejects(save({ look, equipped: {} }, s.avatar.revision), /another device/, 'older revision refused');
      const rev = saved.avatar.revision;
      await assert.rejects(save({ look, equipped: { top: 'cardigan' } }, rev), /don't have that item/);
      await assert.rejects(save({ look, equipped: { head: 'glasses' } }, rev), /Invalid outfit/, 'wrong slot');
      await assert.rejects(save({ look, equipped: { pet: 'pet_owl' } }, rev), /don't have that item/);
      await assert.rejects(save({ look: { ...look, skin: '9' }, equipped: {} }, rev), /Invalid look/);
      await assert.rejects(save({ look: { ...look, extra: 1 }, equipped: {} }, rev), /Invalid look/);
      await assert.rejects(save({ look, equipped: {}, background: 'bg_sunset' }, rev), /background/);
      await assert.rejects(save({ look, equipped: {}, frame: 'frame_streak_7' }, rev), /frame/);
      await assert.rejects(save({ look, equipped: {}, title: 'title_artist' }, rev), /title/);
      await db.query(`insert into liferpg_reward_private.inventory values ($1, 'cardigan', 'find'), ($1, 'pet_owl', 'milestone'), ($1, 'frame_streak_7', 'streak'), ($1, 'bg_sunset', 'pack')`, [a]);
      const dressed = (await save({ look, equipped: { top: 'cardigan', pet: 'pet_owl', face: 'glasses' }, frame: 'frame_streak_7', background: 'bg_sunset' }, rev)).rows[0].s;
      assert.equal(dressed.avatar.frame, 'frame_streak_7'); assert.equal(dressed.avatar.background, 'bg_sunset');
      assert.equal(dressed.avatar.revision, rev + 1);
      // Another person can't change it.
      await as(db, b);
      await assert.rejects(db.query(`select public.save_avatar_v1($1, $2, $3)`, [a, { look, equipped: {} }, rev + 1]), /Account changed/);
    } finally { await db.close(); }
  });

  test('SQL: deleting an account removes every reward row', async () => {
    const db = await setup();
    try {
      await as(db, a);
      await session(db, a, 3000, '1 second');
      await db.query(`select public.claim_session_rewards_v1($1)`, [a]);
      await db.exec(`delete from auth.users where id = '${a}'`);
      for (const t of ['wallets', 'inventory', 'avatars', 'claimed_sessions', 'pack_claims', 'events'])
        assert.equal((await call(db, `select count(*)::int n from liferpg_reward_private.${t}`)).n, 0, t);
    } finally { await db.close(); }
  });
}
