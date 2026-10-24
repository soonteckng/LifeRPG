// Round 64 on the server: today's trail is the rewards. Every 20 focused
// minutes of the day is a stop with a find, up to 6 stops (120 minutes);
// reaching the end gives 50 Stardust once that day; past it, minutes still
// give Stardust but no more finds.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'supabase/migrations', f), 'utf8').replace(/\r\n/g, '\n');
const trail = read('20261025090000_round64_daily_trail.sql');

test('Round 64 SQL: only the events kind list changes; every write is the signed-in owner\'s', () => {
  assert.doesNotMatch(trail, /\bdelete\b|drop table|drop function/i);
  assert.match(trail, /drop constraint if exists events_kind_check/);
  assert.match(trail, /'trail'\)\);/);
  for (const statement of trail.match(/update liferpg_reward_private\.\w+[^;]*;/g)) assert.match(statement, /where user_id = owner/, statement);
  assert.match(trail, /'findSeconds', 1200, 'stops', 6, 'bonus', 50/);
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  const user = '22222222-2222-4222-8222-222222222222';
  // A time zone where it's around midday now, so the test's sessions all fall on one local day.
  const offset = Math.max(-12, Math.min(14, 12 - new Date().getUTCHours()));
  const zone = offset === 0 ? 'UTC' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
  async function setup() {
    const db = new PGlite();
    await db.exec(fs.readFileSync(path.join(root, 'tests/sql/progression-bootstrap.sql'), 'utf8'));
    await db.exec(`alter table public.activity_sessions add column if not exists client_session_id uuid; alter table public.activity_sessions add column if not exists credit_result jsonb;
      insert into auth.users(id) values('${user}');
      insert into public.profiles(id, username, timezone, level) values ('${user}','Ali','${zone}',3) on conflict (id) do nothing;
      create schema if not exists liferpg_auth_private; create table liferpg_auth_private.developers(user_id uuid primary key);`);
    for (const f of ['20261018120000_study_plan', '20261018140000_study_squads', '20261018160000_study_extras', '20261024090000_rewards_core', '20261024100000_rewards_dev_tools',
      '20261024110000_rewards_dev_unlocks', '20261024120000_rewards_auto_frames']) await db.exec(read(`${f}.sql`));
    const later = read('20261023090000_security_streak_dev_goal.sql'), at = later.indexOf('create or replace function liferpg_squad_private.focus_streak');
    await db.exec(later.slice(at, later.indexOf('$function$;', at) + 11).replace(/\$function\$/g, '$$$$'));
    for (const f of ['20261024130000_squad_player_cards', '20261024140000_round58_rewards_cards', '20261024140100_round58_dev_protection', '20261025090000_round64_daily_trail']) await db.exec(read(`${f}.sql`));
    return db;
  }
  const as = (db, u) => db.exec(`set role authenticated;set request.jwt.claim.sub='${u}'`);
  const q = async (db, text, args) => (await db.query(`select ${text} as r`, args)).rows[0].r;
  const session = (db, seconds, ago) => db.exec(`reset role; insert into public.activity_sessions(user_id, status, target_duration_seconds, duration_seconds, credit_result, completed_at)
    values ('${user}', 'completed', ${seconds}, ${seconds}, '{}', now() - interval '${ago}')`);
  const claim = async db => { await as(db, user); return q(db, `public.claim_session_rewards_v1($1)`, [user]); };

  test('SQL: a stop every 20 minutes of the day, several in one session, up to the end of the trail, then the bonus once', async () => {
    const db = await setup();
    try {
      await as(db, user);
      const start = await q(db, `public.get_rewards_v1($1)`, [user]);
      assert.deepEqual([start.findSeconds, start.trailSeconds, start.nextFindSeconds, start.today.seconds, start.today.trailComplete], [1200, 7200, 1200, 0, false]);
      await session(db, 1800, '200 minutes');
      let c = await claim(db);
      assert.deepEqual([c.sessions[0].finds.length, c.sessions[0].daySecondsBefore, c.sessions[0].trailStardust], [1, 0, 0], '30 minutes: one stop');
      assert.equal(c.state.nextFindSeconds, 600, '10 minutes to the next stop');
      await session(db, 3600, '150 minutes');
      c = await claim(db);
      assert.deepEqual([c.sessions[0].finds.length, c.sessions[0].daySecondsBefore], [3, 1800], 'an hour passes three stops, in one card');
      await session(db, 3000, '90 minutes');
      c = await claim(db);
      assert.deepEqual([c.sessions[0].finds.length, c.sessions[0].trailStardust], [2, 50], 'the last two stops, then the trail bonus');
      assert.deepEqual([c.state.today.seconds, c.state.nextFindSeconds, c.state.today.trailComplete, c.state.today.finds], [8400, 0, true, 6]);
      await session(db, 1800, '30 minutes');
      c = await claim(db);
      assert.deepEqual([c.sessions[0].finds.length, c.sessions[0].trailStardust, c.sessions[0].minutesStardust], [0, 0, 6], 'past the end: Stardust for minutes only');
      const wallet = await q(db, `public.get_rewards_v1($1)`, [user]);
      assert.equal(wallet.stardust >= 50 + 6 + 12 + 10 + 6, true, 'the bonus and every minute counted');
    } finally { await db.close(); }
  });

  test('SQL: sessions claimed together share the day in order, and yesterday never counts toward today', async () => {
    const db = await setup();
    try {
      await session(db, 7000, '2 days');
      await session(db, 1500, '120 minutes');
      await session(db, 1500, '60 minutes');
      const c = await claim(db);
      const today = c.sessions.slice(-2);
      assert.deepEqual(today.map(s => [s.daySecondsBefore, s.finds.length]), [[0, 1], [1500, 1]], '25 + 25 minutes: stops at 20 and 40');
      assert.equal(c.state.today.seconds, 3000);
      const again = await claim(db);
      assert.equal(again.sessions.length, 0, 'never claimed twice');
    } finally { await db.close(); }
  });
}
