// Round 57: squads carry everyone's look, and player cards show stats only
// to squad mates, and only while their owner shares them.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261024130000_squad_player_cards.sql'), 'utf8');

test('player cards and the stats setting are owner-checked and closed to everyone else', () => {
  for (const fn of ['get_player_card_v1(uuid, uuid)', 'set_stats_visibility_v1(uuid, text)', 'get_stats_visibility_v1(uuid)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn.replace(/[()]/g, '\\$&')} from public, anon;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, '\\$&')} to authenticated;`));
  }
  assert.equal((sql.match(/liferpg_squad_private\.signed_in\(p_expected_owner\)/g) || []).length, 3, 'every call checks the signed-in owner');
  assert.match(sql, /revoke all on liferpg_squad_private\.player_settings from public, anon, authenticated;/);
  assert.match(sql, /references auth\.users\(id\) on delete cascade/, 'goes with a deleted account');
  assert.doesNotMatch(sql, /alter table public\./);
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  const me = '11111111-1111-4111-8111-111111111111', friend = '22222222-2222-4222-8222-222222222222', stranger = '33333333-3333-4333-8333-333333333333';
  test('SQL: squad mates see each other\'s look and card; stats only while shared; strangers see nothing', async () => {
    const db = new PGlite();
    try {
      await db.exec(fs.readFileSync(path.join(root, 'tests/sql/progression-bootstrap.sql'), 'utf8'));
      await db.exec(`alter table public.activity_sessions add column if not exists client_session_id uuid; alter table public.activity_sessions add column if not exists credit_result jsonb;
        insert into auth.users(id) values('${me}'),('${friend}'),('${stranger}');
        insert into public.profiles(id, username, timezone, level) values ('${me}','Me','UTC',12),('${friend}','Ali','UTC',3),('${stranger}','X','UTC',1) on conflict (id) do nothing;
        create schema if not exists liferpg_auth_private; create table liferpg_auth_private.developers(user_id uuid primary key);`);
      for (const f of ['20261018120000_study_plan', '20261018140000_study_squads', '20261018160000_study_extras', '20261024090000_rewards_core', '20261024100000_rewards_dev_tools',
        '20261024110000_rewards_dev_unlocks', '20261024120000_rewards_auto_frames']) await db.exec(fs.readFileSync(path.join(root, `supabase/migrations/${f}.sql`), 'utf8'));
      const later = fs.readFileSync(path.join(root, 'supabase/migrations/20261023090000_security_streak_dev_goal.sql'), 'utf8');
      const at = later.indexOf('create or replace function liferpg_squad_private.focus_streak');
      await db.exec(later.slice(at, later.indexOf('$function$;', at) + 11).replace(/\$function\$/g, '$$$$'));
      await db.exec(sql);
      const as = u => db.exec(`set role authenticated;set request.jwt.claim.sub='${u}'`);
      const q = async (text, args) => (await db.query(`select ${text} as r`, args)).rows[0].r;
      await as(me);
      const made = await q(`public.create_squad_v1(gen_random_uuid(),'Crew',$1::uuid,now())`, [me]);
      await q(`public.get_rewards_v1($1)`, [me]);
      await db.exec(`reset role; insert into public.activity_sessions(user_id, status, target_duration_seconds, duration_seconds, credit_result, completed_at) values ('${me}', 'completed', 3600, 3600, '{}', now());
        insert into liferpg_reward_private.inventory(user_id, item_id, source) values ('${me}', 'frame_streak_7', 'streak'), ('${me}', 'beret', 'find'), ('${me}', 'title_artist', 'set');`);
      await as(friend);
      await q(`public.join_squad_v1($1,$2::uuid,now())`, [made.squad.code, friend]);
      const list = await q(`public.list_squads_v1($1,now() - interval '1 day')`, [friend]);
      const mine = list[0].members.find(m => m.name === 'Me'), theirs = list[0].members.find(m => m.name === 'Ali');
      assert.equal(mine.look.look.skin, '3'); assert.equal(mine.look.frame, 'frame_streak_7', 'the frame their streak earned');
      assert.equal(theirs.look, null, 'no look until they open their character');
      const card = await q(`public.get_player_card_v1($1,$2)`, [friend, me]);
      assert.deepEqual([card.name, card.level, card.isYou, card.statsShared], ['Me', 12, false, true]);
      assert.deepEqual([card.stats.totalSeconds, card.stats.sessions, card.stats.collected], [3600, 1, 1], 'frames and badges are not counted as finds');
      await as(me);
      assert.deepEqual(await q(`public.get_stats_visibility_v1($1)`, [me]), { showStats: 'squads' }, 'shared with squads by default');
      await q(`public.set_stats_visibility_v1($1,'private')`, [me]);
      assert.ok((await q(`public.get_player_card_v1($1,$2)`, [me, me])).stats, 'you always see your own');
      await as(friend);
      const hidden = await q(`public.get_player_card_v1($1,$2)`, [friend, me]);
      assert.deepEqual([hidden.stats, hidden.statsShared, hidden.name], [null, false, 'Me'], 'picture, name and level still show');
      await assert.rejects(q(`public.set_stats_visibility_v1($1,'everyone')`, [friend]), /Invalid choice/);
      await assert.rejects(q(`public.get_player_card_v1($1,$2)`, [me, me]), /Account changed/);
      await as(stranger);
      await assert.rejects(q(`public.get_player_card_v1($1,$2)`, [stranger, me]), /Player not found/, 'only squad mates');
      await as(friend);
      await q(`public.leave_squad_v1($1::uuid,$2::uuid)`, [made.squad.id, friend]);
      await assert.rejects(q(`public.get_player_card_v1($1,$2)`, [friend, me]), /Player not found/, 'not after leaving');
    } finally { await db.close(); }
  });
}
