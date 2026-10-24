// Round 58 on the server: developers can open a pack any day and test finds
// and milestones through the real code, developer accounts are protected from
// reset and deletion, today's trail numbers, and fuller player cards.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'supabase/migrations', f), 'utf8').replace(/\r\n/g, '\n');
const auto = read('20261024140000_round58_rewards_cards.sql'), manual = read('20261024140100_round58_dev_protection.sql');

test('Round 58 SQL: no table of everyone is touched, and the risky parts check for developers on the server', () => {
  assert.doesNotMatch(auto, /\bdelete\b|drop |alter table/i, 'the part applied automatically only replaces functions');
  assert.match(auto, /if not liferpg_reward_private\.is_dev\(owner\) then raise exception 'Reach your daily goal to open a pack'/);
  assert.match(manual, /if not exists\(select 1 from liferpg_auth_private\.developers where user_id = owner\) then raise exception 'Only developer accounts can use this'/);
  assert.match(manual, /elsif p_action = 'reset' then\n\s+raise exception 'Reset is turned off to keep this account safe';/);
  assert.match(manual, /from liferpg_auth_private\.developers where user_id = v_user\) then\n\s+raise exception 'This account is protected and can''t be deleted'/);
  for (const statement of manual.match(/(delete from|update) liferpg_reward_private\.\w+[^;]*;/g)) assert.match(statement, /where user_id = owner/, statement);
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  const dev = '11111111-1111-4111-8111-111111111111', user = '22222222-2222-4222-8222-222222222222';
  async function setup() {
    const db = new PGlite();
    await db.exec(fs.readFileSync(path.join(root, 'tests/sql/progression-bootstrap.sql'), 'utf8'));
    // Squad focus_streak requires a valid member time zone. The dedicated
    // rewards-sql test keeps coverage of the rewards invalid-zone fallback.
    await db.exec(`alter table public.activity_sessions add column if not exists client_session_id uuid; alter table public.activity_sessions add column if not exists credit_result jsonb;
      insert into auth.users(id) values('${dev}'),('${user}');
      insert into public.profiles(id, username, timezone, level) values ('${dev}','Dev','Asia/Kuala_Lumpur',12),('${user}','Ali','UTC',3) on conflict (id) do nothing;
      create schema if not exists liferpg_auth_private; create table liferpg_auth_private.developers(user_id uuid primary key); insert into liferpg_auth_private.developers values ('${dev}');`);
    for (const f of ['20261018120000_study_plan', '20261018140000_study_squads', '20261018160000_study_extras', '20261024090000_rewards_core', '20261024100000_rewards_dev_tools',
      '20261024110000_rewards_dev_unlocks', '20261024120000_rewards_auto_frames']) await db.exec(read(`${f}.sql`));
    const later = read('20261023090000_security_streak_dev_goal.sql'), at = later.indexOf('create or replace function liferpg_squad_private.focus_streak');
    await db.exec(later.slice(at, later.indexOf('$function$;', at) + 11).replace(/\$function\$/g, '$$$$'));
    for (const f of ['20261024130000_squad_player_cards', '20261024140000_round58_rewards_cards', '20261024140100_round58_dev_protection']) await db.exec(read(`${f}.sql`));
    return db;
  }
  const as = (db, u) => db.exec(`set role authenticated;set request.jwt.claim.sub='${u}'`);
  const q = async (db, text, args) => (await db.query(`select ${text} as r`, args)).rows[0].r;
  const session = (db, u, seconds, ago = '1 minute') => db.exec(`reset role; insert into public.activity_sessions(user_id, status, target_duration_seconds, duration_seconds, credit_result, completed_at)
    values ('${u}', 'completed', ${seconds}, ${seconds}, '{}', now() - interval '${ago}')`);

  test('SQL: developers open a pack without the goal; everyone else still needs it', async () => {
    const db = await setup();
    try {
      await as(db, user);
      await assert.rejects(q(db, `public.open_daily_pack_v1($1)`, [user]), /Reach your daily goal/);
      await as(db, dev);
      const pack = await q(db, `public.open_daily_pack_v1($1)`, [dev]);
      assert.equal(pack.items.length, 1); assert.equal(pack.stardust, 10, 'a Canvas pack, no goal bonus');
      await assert.rejects(q(db, `public.open_daily_pack_v1($1)`, [dev]), /already opened/);
    } finally { await db.close(); }
  });

  test('SQL: developer test finds and milestones go through the real code; reset and deletion are refused for developers', async () => {
    const db = await setup();
    try {
      await as(db, dev);
      const found = await q(db, `public.dev_rewards_v1($1,'find',0)`, [dev]);
      assert.equal(found.gifts.length, 1); assert.equal(found.earned.length, 1);
      assert.equal(found.today.finds, 1, 'counts in today\'s finds');
      const next = await q(db, `public.dev_rewards_v1($1,'next_milestones',0)`, [dev]);
      assert.deepEqual(next.gifts.map(g => g.item), ['pet_owl', 'frame_streak_7', 'title_scholar']);
      assert.equal(next.avatar.frame, 'frame_streak_7', 'the frame upgrades like a real one');
      const again = await q(db, `public.dev_rewards_v1($1,'next_milestones',0)`, [dev]);
      assert.deepEqual(again.gifts.map(g => g.item), ['pet_cat', 'frame_streak_30', 'title_artist']);
      const back = await q(db, `public.dev_rewards_v1($1,'reearn',0)`, [dev]);
      assert.deepEqual(back.earned, found.earned, 'only pets, frames and badges are taken back');
      await assert.rejects(q(db, `public.dev_rewards_v1($1,'reset',0)`, [dev]), /turned off/);
      await assert.rejects(q(db, `public.delete_my_account_v1('DELETE')`), /protected/);
      await as(db, user);
      await assert.rejects(q(db, `public.dev_rewards_v1($1,'find',0)`, [user]), /Only developer/);
      assert.equal((await q(db, `public.delete_my_account_v1('DELETE')`)).status, 'deleted', 'everyone else can still delete their account');
    } finally { await db.close(); }
  });

  test('SQL: today\'s trail numbers, session lengths in claims, and fuller player cards', async () => {
    const db = await setup();
    try {
      await as(db, dev);
      const made = await q(db, `public.create_squad_v1(gen_random_uuid(),'Crew',$1::uuid,now())`, [dev]);
      await q(db, `public.get_rewards_v1($1)`, [dev]);
      await session(db, dev, 3000);
      await as(db, dev);
      const claim = await q(db, `public.claim_session_rewards_v1($1)`, [dev]);
      assert.equal(claim.sessions[0].seconds, 3000);
      assert.equal(claim.sessions[0].finds.length, 2);
      assert.deepEqual([claim.state.today.seconds, claim.state.today.finds], [3000, 2]);
      await session(db, dev, 1200, '3 days');
      await as(db, user);
      await q(db, `public.join_squad_v1($1,$2::uuid,now())`, [made.squad.code, user]);
      const card = await q(db, `public.get_player_card_v1($1,$2)`, [user, dev]);
      assert.equal(card.statsShared, true);
      const s = card.stats;
      assert.deepEqual([s.totalSeconds, s.sessions, s.longestSeconds, s.daysFocused], [4200, 2, 3000, 2]);
      assert.equal(s.last7.length, 7); assert.equal(s.last7[6], 3000, 'today is last'); assert.equal(s.last7[3], 1200);
      assert.deepEqual([s.pets, s.badges], [[], []]);
      await assert.rejects(db.query(`select public.get_stats_visibility_v1($1)`, [user]), /does not exist/, 'the share setting is gone');
    } finally { await db.close(); }
  });
}
