/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), dir = path.join(root, 'supabase/migrations');
const read = name => fs.readFileSync(path.join(dir, name), 'utf8');
const filename = fs.readdirSync(dir).find(name => name.endsWith('_round75_developer_reward_lab.sql'));
const sql = read(filename);
test('Round 75 proposal adds only one checked developer function and no table, policy or normal RPC change', () => {
  assert.equal((sql.match(/create or replace function /g) || []).length, 1);
  assert.doesNotMatch(sql, /\b(?:alter|drop|truncate|create table|create policy)\b/i);
  assert.match(sql, /signed_in\(p_expected_owner\)/);
  assert.match(sql, /developers where user_id = owner/);
  assert.match(sql, /revoke all on function public\.dev_reward_lab_v1\([^;]+from public, anon/);
  assert.match(sql, /grant execute on function public\.dev_reward_lab_v1\([^;]+to authenticated/);
  for (const fn of ['buy_reward_item_v1', 'save_avatar_v1', 'open_daily_pack_v1', 'dev_rewards_v1']) assert.ok(sql.includes(`public.${fn}(owner`));
  assert.match(sql, /raise exception using errcode = 'P7500'/);
});
if (process.env.SESSION_SQL_PGLITE_ROOT) {
  const { PGlite } = require(path.join(process.env.SESSION_SQL_PGLITE_ROOT, '@electric-sql/pglite'));
  const dev = '75757575-7575-4575-8575-757575757575', normal = '74747474-7474-4474-8474-747474747474';
  test('Round 75 isolated database: normal rules and rewards execute, every test write rolls back', async t => {
    const db = new PGlite();
    try {
      await db.exec(fs.readFileSync(path.join(root, 'tests/sql/progression-bootstrap.sql'), 'utf8'));
      await db.exec(`alter table public.activity_sessions add column if not exists client_session_id uuid;
        alter table public.activity_sessions add column if not exists credit_result jsonb;
        insert into auth.users(id) values('${dev}'),('${normal}');
        insert into public.profiles(id,username,timezone,level) values('${dev}','Developer fixture','UTC',3),('${normal}','Normal fixture','UTC',3) on conflict(id) do nothing;
        create schema if not exists liferpg_auth_private; create table liferpg_auth_private.developers(user_id uuid primary key);
        insert into liferpg_auth_private.developers values('${dev}');`);
      for (const name of ['20261018120000_study_plan','20261018140000_study_squads','20261018160000_study_extras','20261024090000_rewards_core',
        '20261024100000_rewards_dev_tools','20261024110000_rewards_dev_unlocks','20261024120000_rewards_auto_frames']) await db.exec(read(`${name}.sql`));
      const later = read('20261023090000_security_streak_dev_goal.sql'), at = later.indexOf('create or replace function liferpg_squad_private.focus_streak');
      await db.exec(later.slice(at, later.indexOf('$function$;', at) + 11).replace(/\$function\$/g, '$$$$'));
      for (const name of ['20261024130000_squad_player_cards','20261024140000_round58_rewards_cards','20261024140100_round58_dev_protection','20261025090001_round66_daily_trail']) await db.exec(read(`${name}.sql`));
      await db.exec(sql);
      const as = owner => db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`);
      const call = async (expr, args = []) => (await db.query(`select ${expr} r`, args)).rows[0].r;
      await as(dev); await call('public.get_rewards_v1($1)', [dev]);
      await db.exec('reset role');
      await db.query("update liferpg_reward_private.wallets set stardust=831,pack_days=7 where user_id=$1", [dev]);
      await call("liferpg_reward_private.give($1,'field_jacket','find',null,null)", [dev]);
      const fingerprint = async () => {
        await db.exec('reset role');
        const result = {};
        for (const table of ['liferpg_reward_private.wallets','liferpg_reward_private.inventory','liferpg_reward_private.avatars','liferpg_reward_private.events',
          'liferpg_reward_private.pack_claims','liferpg_reward_private.claimed_sessions','public.activity_sessions','public.daily_progress','public.profiles']) {
          result[table] = (await db.query(`select coalesce(jsonb_agg(r order by r::text),'[]'::jsonb) rows from (select to_jsonb(t) r from ${table} t) q`)).rows[0].rows;
        }
        return result;
      };
      const before = await fingerprint();
      await as(dev); const real = await call('public.get_rewards_v1($1)', [dev]);
      const empty = { ...real, stardust:500, owned:['glasses','bg_dusk'], earned:[],
        avatar:{ ...real.avatar, equipped:{}, background:'bg_dusk', frame:null, title:null, revision:1 }, pack:{...real.pack,daysInARow:0} };
      const lab = async (action, snapshot = empty, item = null, amount = 0, avatar = null, owner = dev) => {
        await as(owner); return call('public.dev_reward_lab_v1($1,$2,$3,$4,$5,$6)', [owner,action,snapshot,item,amount,avatar]);
      };
      await t.test('empty test inventory hides automatic unlocks without taking anything away', async () => {
        const r = await lab('load'); assert.deepEqual(r.state.earned, []); assert.deepEqual(r.state.owned.sort(), ['bg_dusk','glasses']);
        assert.equal(r.state.stardust, 500); assert.deepEqual(r.state.avatar.equipped, {});
        assert.deepEqual(await fingerprint(), before);
      });
      await t.test('real purchase pricing, exact funds, insufficient funds and already-owned checks', async () => {
        const r = await lab('buy',empty,'tote'); assert.equal(r.state.stardust,440); assert.ok(r.state.owned.includes('tote'));
        await assert.rejects(lab('buy',r.state,'tote'), /already have/);
        assert.equal((await lab('buy',{...empty,stardust:60},'tote')).state.stardust,0);
        await assert.rejects(lab('buy',{...empty,stardust:59},'tote'), /Not enough Stardust/);
        await assert.rejects(lab('buy',empty,'pet_owl'), /not sold/);
        assert.deepEqual(await fingerprint(), before);
      });
      await t.test('all four pack tiers can be repeated without using the real daily claim', async () => {
        for (let tier=0;tier<4;tier++) {
          const r = await lab('pack',empty,null,tier); assert.equal(r.pack.tier,tier); assert.equal(r.pack.items.length,1);
          assert.ok(r.state.pack.claimed); assert.ok(r.state.owned.includes(r.pack.items[0].item));
          assert.equal((await lab('pack',r.state,null,tier)).pack.tier,tier);
        }
        assert.deepEqual(await fingerprint(), before);
      });
      await t.test('any milestone or reward and real duplicate conversion, including long streaks', async () => {
        const ids = (await db.query('select id from liferpg_reward_private.items order by id')).rows.map(row => row.id);
        for (const id of ids) {
          const r=await lab('give',empty,id); assert.equal(r.gifts[0].new,true,id); assert.ok(r.state.earned.includes(id),id);
          const duplicate=await lab('duplicate',r.state,id); assert.equal(duplicate.gifts[0].new,false,id); assert.ok(duplicate.gifts[0].stardust>0,id);
        }
        assert.deepEqual(await fingerprint(), before);
      });
      await t.test('normal find roll and test balances use no focus or squad records', async () => {
        const r=await lab('find'); assert.equal(r.gifts.length,1); assert.ok(r.state.owned.includes(r.gifts[0].item));
        for(const amount of [0,60,120,240,500,5000]) assert.equal((await lab('stardust',empty,null,amount)).state.stardust,amount);
        assert.deepEqual(await fingerprint(), before);
      });
      await t.test('test look saves through real validator and neither updates real avatar nor grants items', async () => {
        const own=await lab('buy',empty,'tote'); const avatar={...own.state.avatar,equipped:{bag:'tote'}};
        const r=await lab('avatar',own.state,null,0,avatar); assert.equal(r.state.avatar.equipped.bag,'tote'); assert.equal(r.state.avatar.revision,2);
        await assert.rejects(lab('avatar',empty,null,0,avatar), /don't have/);
        await assert.rejects(lab('avatar',own.state,null,0,{...avatar,look:{...avatar.look,skin:'99'}}), /Invalid look/);
        const all={...empty,owned:real.owned}; const preview=await lab('avatar',all,null,0,avatar);
        assert.equal(preview.state.avatar.equipped.bag,'tote'); assert.deepEqual(preview.state.earned,[]);
        assert.deepEqual(await fingerprint(), before);
      });
      await t.test('normal accounts, mismatched owners and anonymous callers cannot use the lab', async () => {
        await assert.rejects(lab('load',empty,null,0,null,normal), /Only developer/);
        await as(normal); await assert.rejects(call('public.dev_reward_lab_v1($1,$2,$3)',[dev,'load',empty]), /Account changed|owner|account/i);
        await db.exec('set role anon'); await assert.rejects(call('public.dev_reward_lab_v1($1,$2,$3)',[dev,'load',empty]), /permission denied/);
        assert.deepEqual(await fingerprint(), before);
      });
      await t.test('malformed input and failed normal RPC roll back test setup as well', async () => {
        for(const seed of [null,{...empty,stardust:-1},{...empty,earned:['no_such_item']},{...empty,earned:Array(129).fill('tote')}]) await assert.rejects(lab('load',seed),/Invalid test/);
        await assert.rejects(lab('reset'),/Invalid test/);
        await assert.rejects(lab('pack',empty,null,4),/Invalid pack/);
        await assert.rejects(lab('give',empty,'missing'),/Invalid reward/);
        assert.deepEqual(await fingerprint(), before);
      });
      await t.test('the real account still owns everything, retains earned items, and reset stays refused', async () => {
        await as(dev); const r=await call('public.get_rewards_v1($1)',[dev]);
        assert.deepEqual(r,real); assert.ok(r.earned.includes('field_jacket'));
        await assert.rejects(call("public.dev_rewards_v1($1,'reset',0)",[dev]),/Reset is turned off/);
        assert.deepEqual(await fingerprint(),before);
      });
    } finally { await db.close(); }
  });
} else test('Round 75 SQL execution requires isolated PGlite', {skip:true}, () => {});
