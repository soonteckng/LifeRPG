/* global __dirname */
// Round 66: daily reward stops use saved sessions, not the legacy carry-over
// bank or developer gifts. The fixture is isolated and never sends emails.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), migrations = path.join(root, 'supabase/migrations');
const read = name => fs.readFileSync(path.join(migrations, name), 'utf8').replace(/\r\n/g, '\n');
const filename = fs.readdirSync(migrations).find(name => name.endsWith('_round66_daily_trail.sql'));
assert.ok(filename, 'the CLI-created migration is present');
const sql = read(filename);

test('Round 66 SQL: four 30-minute stops, private day summary, checked owner and no history reset', () => {
  assert.ok(filename > '20261025090000_round64_daily_trail.sql', 'a fresh migration replay must finish with Round 66 rules');
  assert.match(sql, /'findSeconds', 1800, 'stops', 4, 'bonus', 50/);
  assert.match(sql, /revoke all on function liferpg_reward_private\.trail_day\(uuid, date\) from public, anon, authenticated/);
  assert.match(sql, /signed_in\(p_expected_owner\)/);
  assert.match(sql, /wallet_for\(owner\)/);
  assert.match(sql, /\(p_day \+ 1\)::timestamp at time zone/);
  assert.doesNotMatch(sql, /\bdelete\b|\btruncate\b|drop table|drop function|set find_bank_seconds/i);
  for (const statement of sql.match(/update liferpg_reward_private\.\w+[^;]*;/g)) assert.match(statement, /where user_id = owner/, statement);
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  const user = '66666666-6666-4666-8666-666666666666', other = '77777777-7777-4777-8777-777777777777';
  // Keep the relative sessions safely inside a day regardless of test-host time.
  const offset = Math.max(-12, Math.min(14, 12 - new Date().getUTCHours()));
  const zone = offset === 0 ? 'UTC' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
  async function setup({ apply = true, round64 = false } = {}) {
    const db = new PGlite();
    await db.exec(fs.readFileSync(path.join(root, 'tests/sql/progression-bootstrap.sql'), 'utf8'));
    await db.exec(`alter table public.activity_sessions add column if not exists client_session_id uuid; alter table public.activity_sessions add column if not exists credit_result jsonb;
      insert into auth.users(id) values('${user}'),('${other}');
      insert into public.profiles(id, username, timezone, level) values ('${user}','Fixture','${zone}',3),('${other}','Other','${zone}',3) on conflict (id) do nothing;
      create schema if not exists liferpg_auth_private; create table liferpg_auth_private.developers(user_id uuid primary key);`);
    for (const f of ['20261018120000_study_plan', '20261018140000_study_squads', '20261018160000_study_extras', '20261024090000_rewards_core', '20261024100000_rewards_dev_tools',
      '20261024110000_rewards_dev_unlocks', '20261024120000_rewards_auto_frames']) await db.exec(read(`${f}.sql`));
    const later = read('20261023090000_security_streak_dev_goal.sql'), at = later.indexOf('create or replace function liferpg_squad_private.focus_streak');
    await db.exec(later.slice(at, later.indexOf('$function$;', at) + 11).replace(/\$function\$/g, '$$$$'));
    for (const f of ['20261024130000_squad_player_cards', '20261024140000_round58_rewards_cards', '20261024140100_round58_dev_protection']) await db.exec(read(`${f}.sql`));
    if (round64) await db.exec(read('20261025090000_round64_daily_trail.sql'));
    if (apply) await db.exec(sql);
    return db;
  }
  const as = (db, owner = user) => db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
  const q = async (db, text, args = []) => (await db.query(`select ${text} as r`, args)).rows[0].r;
  async function state(db) { await as(db); return q(db, 'public.get_rewards_v1($1)', [user]); }
  async function claim(db) { await as(db); return q(db, 'public.claim_session_rewards_v1($1)', [user]); }
  async function session(db, seconds, ago = '1 minute', options = {}) {
    await db.exec('reset role');
    return (await db.query(`insert into public.activity_sessions(user_id, status, target_duration_seconds, duration_seconds, credit_result, completed_at)
      values ($1,$2,$3,$3,$4,${options.at ? '$5::timestamptz' : 'now() - $5::interval'}) returning id`,
    [options.owner ?? user, options.status ?? 'completed', seconds, options.credited === false ? null : {}, options.at ?? ago])).rows[0].id;
  }
  const finds = result => result.sessions.reduce((n, s) => n + s.finds.length, 0);

  test('SQL Round 66: each one-minute completion advances saved daily time and the next-find countdown', async () => {
    const db = await setup();
    try {
      const start = await state(db);
      assert.deepEqual([start.findSeconds, start.trailSeconds, start.nextFindSeconds, start.today.finds], [1800, 7200, 1800, 0]);
      await session(db, 60, '2 minutes'); let r = await claim(db);
      assert.deepEqual([r.state.today.seconds, r.state.nextFindSeconds, r.state.today.finds, finds(r)], [60, 1740, 0, 0]);
      assert.deepEqual([r.sessions[0].daySecondsBefore, r.sessions[0].daySecondsAfter, r.sessions[0].creditedDate], [0, 60, r.state.today.date]);
      await session(db, 60); r = await claim(db);
      assert.deepEqual([r.state.today.seconds, r.state.nextFindSeconds, r.state.today.finds], [120, 1680, 0]);
      assert.deepEqual([r.sessions[0].daySecondsBefore, r.sessions[0].daySecondsAfter], [60, 120]);
      assert.equal((await state(db)).today.seconds, 120, 'a fresh Home read agrees with the claim');
    } finally { await db.close(); }
  });

  test('SQL Round 66: a saved but unclaimed stop is ready now, not another thirty minutes away', async () => {
    const db = await setup();
    try {
      await state(db); await session(db, 1800);
      const pending = await state(db);
      assert.deepEqual([pending.today.seconds, pending.today.finds, pending.today.pendingFinds, pending.today.findsComplete, pending.nextFindSeconds], [1800, 0, 1, false, 0]);
      const saved = await claim(db);
      assert.deepEqual([finds(saved), saved.state.today.finds, saved.state.today.pendingFinds, saved.state.nextFindSeconds], [1, 1, 0, 1800]);
    } finally { await db.close(); }
  });

  test('SQL Round 66: pre-cutoff sessions remain in history without promising an ineligible trail find', async () => {
    const db = await setup();
    try {
      await state(db); await db.exec('reset role');
      await db.query("update liferpg_reward_private.wallets set rewards_since=now()-interval '30 minutes' where user_id=$1", [user]);
      const earlier = await session(db, 1800, '45 minutes');
      const eligible = await session(db, 60, '1 minute');
      const pending = await state(db);
      assert.deepEqual([pending.today.seconds, pending.today.pendingFinds, pending.nextFindSeconds], [60, 0, 1740], 'the map uses the same eligible pool as the claim');
      const result = await claim(db);
      assert.deepEqual(result.sessions.map(s => s.sessionId), [eligible]);
      assert.deepEqual([result.state.today.seconds, result.state.today.pendingFinds, result.state.nextFindSeconds, finds(result)], [60, 0, 1740, 0]);
      await db.exec('reset role');
      assert.equal((await db.query('select count(*)::int n from public.activity_sessions where id in ($1,$2)', [earlier, eligible])).rows[0].n, 2, 'all original sessions and XP history stay stored');
      assert.equal((await db.query('select count(*)::int n from liferpg_reward_private.claimed_sessions where session_id=$1', [earlier])).rows[0].n, 0, 'old sessions are not retroactively awarded');
    } finally { await db.close(); }
  });

  test('SQL Round 66: 30/60/90/120 each roll one find, the end bonus occurs once, and later minutes still earn Stardust', async () => {
    const db = await setup();
    try {
      await state(db);
      for (let i = 0; i < 5; i++) {
        await session(db, 1800, `${200 - i * 30} minutes`); const r = await claim(db);
        assert.deepEqual([finds(r), r.sessions[0].trailStardust, r.sessions[0].minutesStardust], [i < 4 ? 1 : 0, i === 3 ? 50 : 0, 6]);
        assert.equal(r.state.today.finds, Math.min(4, i + 1));
        assert.equal(r.state.nextFindSeconds, i < 3 ? 1800 : 0);
        assert.equal(r.state.today.trailComplete, i >= 3);
      }
      const saved = await state(db), again = await claim(db);
      assert.equal(again.sessions.length, 0); assert.equal(again.state.stardust, saved.stardust);
      await db.exec('reset role');
      assert.equal((await db.query("select count(*)::int n from liferpg_reward_private.events where user_id=$1 and kind='trail'", [user])).rows[0].n, 1);
    } finally { await db.close(); }
  });

  test('SQL Round 66: yesterday\'s bank and six developer gifts do not change today\'s three-minute trail', async () => {
    const db = await setup();
    try {
      await state(db); await db.exec('reset role');
      await db.query('update liferpg_reward_private.wallets set find_bank_seconds=1020 where user_id=$1', [user]);
      for (let i = 0; i < 6; i++) await q(db, "liferpg_reward_private.give($1, 'tote', 'find', null, null)", [user]);
      await session(db, 180); const r = await claim(db);
      assert.deepEqual([r.state.today.seconds, r.state.today.finds, r.state.nextFindSeconds], [180, 0, 1620]);
      await db.exec('reset role');
      assert.equal((await db.query('select find_bank_seconds n from liferpg_reward_private.wallets where user_id=$1', [user])).rows[0].n, 1020, 'legacy bank is preserved, not reset');
      assert.equal((await db.query("select count(*)::int n from liferpg_reward_private.events where user_id=$1 and kind in ('find','duplicate')", [user])).rows[0].n, 6, 'manual gifts stay earned');
    } finally { await db.close(); }
  });

  test('SQL Round 66: a legacy 25-minute award remains owned and occupies stop one rather than awarding it again at 30', async () => {
    const db = await setup({ apply: false });
    try {
      await state(db); await session(db, 1500, '30 minutes'); const old = await claim(db);
      assert.equal(finds(old), 1);
      await db.exec('reset role');
      const saved = (await db.query('select row_to_json(w) r from liferpg_reward_private.wallets w where user_id=$1', [user])).rows[0].r;
      const counts = (await db.query(`select (select count(*) from liferpg_reward_private.inventory where user_id=$1)::int inventory,
        (select count(*) from liferpg_reward_private.claimed_sessions where user_id=$1)::int claimed,
        (select count(*) from liferpg_reward_private.events where user_id=$1)::int events`, [user])).rows[0];
      await db.exec(sql);
      assert.deepEqual((await db.query('select row_to_json(w) r from liferpg_reward_private.wallets w where user_id=$1', [user])).rows[0].r, saved);
      assert.deepEqual((await db.query(`select (select count(*) from liferpg_reward_private.inventory where user_id=$1)::int inventory,
        (select count(*) from liferpg_reward_private.claimed_sessions where user_id=$1)::int claimed,
        (select count(*) from liferpg_reward_private.events where user_id=$1)::int events`, [user])).rows[0], counts);
      let r = await state(db); assert.deepEqual([r.today.finds, r.nextFindSeconds], [1, 2100]);
      await session(db, 300); r = await claim(db);
      assert.deepEqual([finds(r), r.state.today.seconds, r.state.nextFindSeconds], [0, 1800, 1800]);
      await session(db, 1800, '30 seconds'); r = await claim(db);
      assert.deepEqual([finds(r), r.state.today.finds, r.state.nextFindSeconds], [1, 2, 1800]);
      await db.exec('reset role'); await db.exec(sql);
      assert.equal((await claim(db)).sessions.length, 0, 'reapplying the migration cannot replay claimed sessions');
    } finally { await db.close(); }
  });

  test('SQL Round 66: all four grandfathered finds can precede the end without promising a phantom next find', async () => {
    const db = await setup({ apply: false });
    try {
      await state(db); await session(db, 6000, '30 minutes'); const old = await claim(db); assert.equal(finds(old), 4);
      await db.exec('reset role'); await db.exec(sql);
      const progress = await state(db);
      assert.deepEqual([progress.today.seconds, progress.today.finds, progress.today.findsComplete, progress.today.trailComplete, progress.nextFindSeconds], [6000, 4, true, false, 0]);
      await session(db, 1200); const r = await claim(db);
      assert.deepEqual([finds(r), r.sessions[0].trailStardust, r.state.today.trailComplete], [0, 50, true]);
    } finally { await db.close(); }
  });

  test('SQL Round 66: a late earlier offline session fills only the unawarded daily stops', async () => {
    const db = await setup();
    try {
      await state(db); await session(db, 1500, '5 minutes'); assert.equal(finds(await claim(db)), 0);
      await session(db, 300, '10 minutes'); let r = await claim(db);
      assert.deepEqual([r.sessions[0].daySecondsBefore, r.sessions[0].daySecondsAfter, finds(r)], [1500, 1800, 1]);
      await session(db, 1800, '20 minutes'); r = await claim(db);
      assert.deepEqual([r.sessions[0].daySecondsBefore, r.sessions[0].daySecondsAfter, finds(r), r.state.today.finds], [1800, 3600, 1, 2]);
      assert.equal((await claim(db)).sessions.length, 0);
    } finally { await db.close(); }
  });

  test('SQL Round 66: historical claims made today do not inflate today\'s map, and both dates retain their progress', async () => {
    const db = await setup();
    try {
      await state(db); await db.exec('reset role');
      await db.query("update liferpg_reward_private.wallets set rewards_since=now()-interval '3 days' where user_id=$1", [user]);
      await session(db, 7200, '2 days'); let r = await claim(db);
      assert.deepEqual([finds(r), r.sessions[0].trailStardust], [4, 50]);
      assert.notEqual(r.sessions[0].creditedDate, r.state.today.date);
      assert.deepEqual([r.state.today.seconds, r.state.today.finds, r.state.nextFindSeconds, r.state.today.trailComplete], [0, 0, 1800, false]);
      await session(db, 1800); r = await claim(db);
      assert.deepEqual([finds(r), r.state.today.finds, r.state.today.seconds], [1, 1, 1800]);
    } finally { await db.close(); }
  });

  test('SQL Round 66: more than fifty pending sessions stay replay-safe while state reports all saved daily effort', async () => {
    const db = await setup();
    try {
      await state(db); await db.exec('reset role');
      await db.query(`insert into public.activity_sessions(user_id,status,target_duration_seconds,duration_seconds,credit_result,completed_at)
        select $1,'completed',60,60,'{}',now()-n*interval '1 minute' from generate_series(1,51) n`, [user]);
      const first = await claim(db);
      assert.equal(first.sessions.length, 50); assert.equal(finds(first), 1); assert.equal(first.state.today.seconds, 3060);
      const last = await claim(db);
      assert.equal(last.sessions.length, 1); assert.equal(finds(last), 0);
      assert.deepEqual([last.sessions[0].daySecondsBefore, last.sessions[0].daySecondsAfter], [3000, 3060]);
      assert.equal((await claim(db)).sessions.length, 0);
    } finally { await db.close(); }
  });

  test('SQL Round 66: uncredited, cancelled, future and other-owner rows are excluded; RPC and helper access remain fenced', async () => {
    const db = await setup();
    try {
      await state(db); await session(db, 1800, '1 minute', { credited: false }); await session(db, 1800, '1 minute', { status: 'cancelled' });
      await session(db, 1800, '-1 hour'); await session(db, 1800, '1 minute', { owner: other });
      let r = await claim(db); assert.equal(r.sessions.length, 0); assert.equal(r.state.today.seconds, 0);
      await assert.rejects(q(db, 'public.claim_session_rewards_v1($1)', [other]), /Account changed|account|owner/i);
      await assert.rejects(q(db, 'liferpg_reward_private.trail_day($1,current_date)', [user]), /permission denied/i);
      await db.exec('reset role; set role anon');
      await assert.rejects(q(db, 'public.claim_session_rewards_v1($1)', [user]), /permission denied/i);
      await db.exec('reset role');
      assert.equal((await db.query("select has_function_privilege('anon','public.claim_session_rewards_v1(uuid)','execute') allowed")).rows[0].allowed, false);
    } finally { await db.close(); }
  });

  test('SQL Round 66: local-midnight bounds cover the full spring/fall DST day and exclude both adjacent days', async () => {
    const db = await setup();
    try {
      await state(db); await db.exec('reset role'); await db.query("update public.profiles set timezone='America/New_York' where id=$1", [user]);
      await db.query("update liferpg_reward_private.wallets set rewards_since='2025-01-01'::timestamptz where user_id=$1", [user]);
      for (const [day, hours] of [['2026-03-08', 23], ['2025-11-02', 25]]) {
        const b = (await db.query(`select $1::date::timestamp at time zone 'America/New_York' starts,
          ($1::date+1)::timestamp at time zone 'America/New_York' ends`, [day])).rows[0];
        assert.equal((new Date(b.ends) - new Date(b.starts)) / 3600000, hours);
        for (const [seconds, at] of [[1800, b.starts], [1800, new Date(new Date(b.ends).getTime() - 1000).toISOString()],
          [6000, new Date(new Date(b.starts).getTime() - 1000).toISOString()], [6000, b.ends]]) await session(db, seconds, '', { at });
        await db.exec('reset role'); const progress = await q(db, 'liferpg_reward_private.trail_day($1,$2::date)', [user, day]);
        assert.equal(progress.seconds, 3600, `${day} counts exactly its local calendar day`);
      }
    } finally { await db.close(); }
  });

  test('SQL Round 66: simultaneous duplicate submissions claim once and keep each reward tied to the authenticated owner', async () => {
    const db = await setup();
    try {
      await state(db); await session(db, 7200); await as(db);
      const [a, b] = await Promise.all([q(db, 'public.claim_session_rewards_v1($1)', [user]), q(db, 'public.claim_session_rewards_v1($1)', [user])]);
      assert.equal(a.sessions.length + b.sessions.length, 1); assert.equal(finds(a) + finds(b), 4);
      assert.equal(a.sessions.concat(b.sessions).reduce((n,s) => n + s.trailStardust, 0), 50);
      await db.exec('reset role');
      assert.equal((await db.query('select count(*)::int n from liferpg_reward_private.claimed_sessions where user_id=$1', [user])).rows[0].n, 1);
    } finally { await db.close(); }
  });

  test('SQL Round 66: replacing an already-installed Round 64 preserves its six finds and already-paid bonus', async () => {
    const db = await setup({ apply: false, round64: true });
    try {
      await state(db); await session(db, 7200, '30 minutes'); const old = await claim(db); assert.equal(finds(old), 6); assert.equal(old.sessions[0].trailStardust, 50);
      await db.exec('reset role'); await db.exec(sql);
      const migrated = await state(db);
      assert.equal(migrated.stardust, old.state.stardust); assert.deepEqual(migrated.earned, old.state.earned);
      assert.deepEqual([migrated.today.finds, migrated.today.trailComplete, migrated.nextFindSeconds], [4, true, 0]);
      await session(db, 1800); const next = await claim(db);
      assert.deepEqual([finds(next), next.sessions[0].trailStardust], [0, 0]);
    } finally { await db.close(); }
  });
}
