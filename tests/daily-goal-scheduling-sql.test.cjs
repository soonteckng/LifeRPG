const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// PostgreSQL stores the function body exactly; normalize checkout line endings
// to reproduce the reviewed live definition rather than a Windows CRLF variant.
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const proposal = read('docs/daily-goal-exact-credit.sql');
const expectedBaseline = 'f1610035d1eaeddcd2a9108eadcd8e33';
const rollback = read('docs/daily-goal-exact-credit-rollback.sql');

test('daily-goal proposal keeps a guarded two-assignment patch, owner ledger and authenticated-only scheduling', () => {
  assert.match(proposal, new RegExp(expectedBaseline));
  assert.match(proposal, /Unexpected goal selection/);
  assert.match(proposal, /alter table public\.daily_goal_changes enable row level security/i);
  assert.match(proposal, /using \(user_id=\(select auth\.uid\(\)\)\)/i);
  assert.match(proposal, /revoke all on public\.daily_goal_changes from public, anon, authenticated/i);
  assert.match(proposal, /for update/);
  assert.match(proposal, /interval '168 hours'/);
});

test('daily-goal rollback pauses scheduling without reverting accepted goals or reward accounting', () => {
  assert.doesNotMatch(rollback, /\b(?:drop|delete|truncate)\b/i);
  assert.doesNotMatch(rollback, /create(?: or replace)? function public\.(?:daily_goal_for_date|complete_activity_session)\s*\(/i);
  assert.match(rollback, /'scheduling_available',false/);
  assert.match(rollback, /'can_change_goal',false/);
  assert.match(rollback, /Goal changes are temporarily unavailable/);
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const sessionId = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
  async function baseline() {
    const db = new PGlite();
    await db.exec("set timezone='UTC'");
    await db.exec(read('tests/sql/progression-bootstrap.sql'));
    await db.exec(read('tests/sql/session-start-stop-fixtures.sql'));
    await db.exec(read('docs/goal-completion-base.sql'));
    await db.exec(`update public.profiles set onboarding_completed=true where id='${owner}';
      revoke all on function public.complete_activity_session(uuid) from public,anon;
      grant execute on function public.complete_activity_session(uuid) to authenticated;`);
    return db;
  }
  async function database() {
    const db = await baseline();
    try {
      await db.exec(proposal);
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`);
      return db;
    } catch (error) { await db.close(); throw error; }
  }
  async function admin(db, sql, values=[]) {
    await db.exec('reset role');
    try { return await db.query(sql, values); } finally { await db.exec('set role authenticated'); }
  }
  async function adminExec(db, sql) {
    await db.exec('reset role');
    try { return await db.exec(sql); } finally { await db.exec('set role authenticated'); }
  }
  async function settings(db) { return (await db.query('select public.get_daily_goal_settings() as result')).rows[0].result; }
  async function schedule(db, minutes) { return (await db.query('select public.schedule_daily_goal($1::integer) as result', [minutes])).rows[0].result; }
  async function withDatabase(fn) {
    const db = await database();
    try { await fn(db); } finally { await db.close(); }
  }

  test('SQL goals: normalized exact-credit snapshot reproduces the live guarded hash and changes only two goal assignments', async () => {
    const db = await baseline();
    try {
      const before = (await db.query("select pg_get_functiondef('public.complete_activity_session(uuid)'::regprocedure) as source, md5(pg_get_functiondef('public.complete_activity_session(uuid)'::regprocedure)) as hash")).rows[0];
      assert.equal(before.hash, expectedBaseline);
      await db.exec(proposal);
      const after = (await db.query("select pg_get_functiondef('public.complete_activity_session(uuid)'::regprocedure) as source")).rows[0].source;
      assert.equal(after, before.source.replaceAll('v_goal_minutes := v_profile.daily_goal_minutes;', 'v_goal_minutes := public.daily_goal_for_date(v_local_date);'));
    } finally { await db.close(); }
  });

  test('SQL goals: scheduling changes tomorrow only, advertises its cooldown and preserves profile/history byte-for-byte', async () => withDatabase(async db => {
    await admin(db, `insert into public.daily_progress(user_id,progress_date,goal_minutes,completed_minutes,completed_seconds,credit_version)
      values('${owner}',current_date,45,7,420,1),('${owner}',current_date-1,30,9,540,1)`);
    const beforeProfile = (await db.query('select to_jsonb(profiles) as row from public.profiles')).rows;
    const beforeHistory = (await db.query('select to_jsonb(daily_progress) as row from public.daily_progress order by progress_date')).rows;
    const result = await schedule(db, 75);
    assert.equal(result.today_goal_minutes, 45);
    assert.equal(result.next_goal_minutes, 75);
    assert.equal(result.pending, true);
    assert.equal(result.can_change_goal, false);
    assert.equal(result.scheduling_available, true);
    assert.ok(result.next_change_at);
    assert.deepEqual((await db.query('select to_jsonb(profiles) as row from public.profiles')).rows, beforeProfile);
    assert.deepEqual((await db.query('select to_jsonb(daily_progress) as row from public.daily_progress order by progress_date')).rows, beforeHistory);
    assert.equal((await db.query('select public.daily_goal_for_date(current_date-1) as value')).rows[0].value, 30);
    assert.equal((await db.query('select public.daily_goal_for_date(current_date+10) as value')).rows[0].value, 75);
    await assert.rejects(schedule(db, 90), /once every seven days/);
    assert.equal((await db.query('select count(*)::integer as n from public.daily_goal_changes')).rows[0].n, 1);
  }));

  test('SQL goals: null and out-of-range requests leave no ledger; inclusive 30 and 480 bounds work for their owners', async () => withDatabase(async db => {
    for (const minutes of [null, -1, 0, 29, 481, 2147483647])
      await assert.rejects(schedule(db, minutes), /Choose 30 to 480 minutes/);
    assert.equal((await db.query('select count(*)::integer as n from public.daily_goal_changes')).rows[0].n, 0);
    assert.equal((await schedule(db, 30)).next_goal_minutes, 30);
    await admin(db, `update public.profiles set onboarding_completed=true where id='${other}'`);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await schedule(db, 480)).next_goal_minutes, 480);
    assert.equal((await db.query('select count(*)::integer as n from public.daily_goal_changes')).rows[0].n, 1);
  }));

  test('SQL goals: exactly 168 elapsed hours is accepted and an instant before the boundary is denied', async () => withDatabase(async db => {
    await admin(db, `insert into public.daily_goal_changes(user_id,effective_date,goal_minutes,updated_at)
      values('${owner}',current_date-6,45,statement_timestamp()-interval '168 hours'+interval '1 minute')`);
    assert.equal((await settings(db)).can_change_goal, false);
    await assert.rejects(schedule(db, 60), /once every seven days/);
    // Both update and RPC use this DO statement's timestamp, making the boundary exact.
    await admin(db, `do $test$ declare result jsonb; begin
      update public.daily_goal_changes set updated_at=statement_timestamp()-interval '168 hours' where user_id='${owner}';
      result:=public.schedule_daily_goal(60);
      assert (result->>'next_goal_minutes')::integer=60;
      assert not (result->>'can_change_goal')::boolean;
    end;$test$;`);
    assert.equal((await db.query('select count(*)::integer as n from public.daily_goal_changes')).rows[0].n, 2);
  }));

  test('SQL goals: non-read-committed scheduling cannot use a stale ledger snapshot', async () => withDatabase(async db => {
    for (const isolation of ['repeatable read', 'serializable']) {
      await db.exec(`begin isolation level ${isolation}`);
      await assert.rejects(schedule(db, 60), /requires read committed/);
      await db.exec('rollback');
    }
    assert.equal((await db.query('select count(*)::integer as n from public.daily_goal_changes')).rows[0].n, 0);
    assert.equal((await settings(db)).can_change_goal, true);
    assert.equal((await schedule(db, 60)).next_goal_minutes, 60);
  }));

  test('SQL goals: authentication, onboarding, ledger writes and cross-account reads cannot bypass ownership', async () => withDatabase(async db => {
    await db.exec("set request.jwt.claim.sub=''");
    await assert.rejects(settings(db), /Not authenticated/);
    await assert.rejects(schedule(db, 60), /Not authenticated/);
    await db.exec("set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333'");
    await assert.rejects(settings(db), /Profile not found/);
    await assert.rejects(schedule(db, 60), /Finish onboarding first/);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await settings(db)).can_change_goal, false);
    await assert.rejects(schedule(db, 60), /Finish onboarding first/);
    await db.exec(`set request.jwt.claim.sub='${owner}'`);
    await schedule(db, 75);
    await assert.rejects(db.query('insert into public.daily_goal_changes(user_id,effective_date,goal_minutes) values($1,current_date+2,90)', [owner]), /permission denied/);
    await assert.rejects(db.query('update public.daily_goal_changes set goal_minutes=90'), /permission denied/);
    await assert.rejects(db.query('delete from public.daily_goal_changes'), /permission denied/);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query('select count(*)::integer as n from public.daily_goal_changes')).rows[0].n, 0);
    assert.equal((await settings(db)).next_goal_minutes, 30);
    await db.exec('set role anon');
    for (const sql of ['select public.schedule_daily_goal(60)', 'select public.get_daily_goal_settings()', 'select public.daily_goal_for_date(current_date)', 'select * from public.daily_goal_changes'])
      await assert.rejects(db.query(sql), /permission denied/);
    const privileges = (await admin(db, `select has_function_privilege('anon','public.schedule_daily_goal(integer)','EXECUTE') as anon,
      has_function_privilege('authenticated','public.schedule_daily_goal(integer)','EXECUTE') as authenticated`)).rows[0];
    assert.deepEqual(privileges, { anon: false, authenticated: true });
  }));

  test('SQL goals: the baseline guard blocks onboarded profile goal edits even when a legacy REST grant exists', async () => withDatabase(async db => {
    await adminExec(db, `grant update(daily_goal_minutes) on public.profiles to authenticated;
      create policy legacy_goal_update on public.profiles for update to authenticated using(auth.uid()=id) with check(auth.uid()=id)`);
    await assert.rejects(db.query('update public.profiles set daily_goal_minutes=75 where id=$1', [owner]), /Use schedule_daily_goal/);
    await db.query('update public.profiles set daily_goal_minutes=30 where id=$1', [owner]);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    await assert.rejects(db.query('update public.profiles set daily_goal_minutes=29 where id=$1', [other]), /Choose 30 to 480 minutes/);
    await db.query('update public.profiles set daily_goal_minutes=45 where id=$1', [other]);
    assert.equal((await db.query('select daily_goal_minutes from public.profiles')).rows[0].daily_goal_minutes, 45);
    await assert.rejects(db.query('update public.profiles set onboarding_completed=false where id=$1', [other]), /permission denied/);
  }));

  test('SQL goals: tomorrow is calculated in the account timezone, not the database UTC day', async () => withDatabase(async db => {
    const hour = (await admin(db, "select extract(hour from statement_timestamp() at time zone 'UTC')::integer as hour")).rows[0].hour;
    const zone = hour >= 10 ? 'Pacific/Kiritimati' : 'Etc/GMT+12';
    await admin(db, 'update public.profiles set timezone=$1 where id=$2', [zone, owner]);
    const expected = (await admin(db, "select (statement_timestamp() at time zone $1)::date::text as today, ((statement_timestamp() at time zone $1)::date+1)::text as tomorrow, (statement_timestamp() at time zone 'UTC')::date::text as utc", [zone])).rows[0];
    assert.notEqual(expected.today, expected.utc, 'fixture deliberately straddles account and database dates');
    const result = await schedule(db, 90);
    assert.equal(result.local_date, expected.today);
    assert.equal(result.next_effective_date, expected.tomorrow);
    assert.equal(result.today_goal_minutes, 30);
    assert.equal(result.next_goal_minutes, 90);
    assert.equal((await db.query('select effective_date::text as date from public.daily_goal_changes')).rows[0].date, expected.tomorrow);
  }));

  test('SQL goals: saved daily targets stay authoritative over later scheduling ledger entries', async () => withDatabase(async db => {
    await adminExec(db, `insert into public.daily_progress(user_id,progress_date,goal_minutes,completed_minutes) values('${owner}',current_date-3,45,4),('${owner}',current_date,60,2);
      insert into public.daily_goal_changes(user_id,effective_date,goal_minutes,updated_at) values('${owner}',current_date-5,90,statement_timestamp()-interval '8 days')`);
    assert.equal((await db.query('select public.daily_goal_for_date(current_date-3) as value')).rows[0].value, 45);
    assert.equal((await settings(db)).today_goal_minutes, 60);
    await schedule(db, 120);
    assert.equal((await settings(db)).today_goal_minutes, 60);
    assert.equal((await settings(db)).next_goal_minutes, 120);
    assert.equal((await db.query('select public.daily_goal_for_date(current_date-3) as value')).rows[0].value, 45);
  }));

  test('SQL goals: exact completion remains server-timed, capped, banked, owner-scoped and idempotent with the scheduled goal', async () => withDatabase(async db => {
    await adminExec(db, `insert into public.daily_goal_changes(user_id,effective_date,goal_minutes) values('${owner}',current_date,60);
      update public.profiles set xp_bank_seconds=30,gold=100 where id='${owner}';
      update public.subjects set xp_bank_seconds=45 where id=1;
      insert into public.activity_sessions(id,user_id,target_duration_seconds,elapsed_seconds,status,task_id,subject_id,last_resumed_at)
      values('${sessionId(1)}','${owner}',61,0,'active',1,1,statement_timestamp()-interval '120 seconds'),('${sessionId(2)}','${owner}',60,59,'paused',null,1,null),('${sessionId(3)}','${other}',60,60,'paused',null,2,null)`);
    await assert.rejects(db.query('select public.complete_activity_session($1) as result', [sessionId(2)]), /has not reached its target/);
    await assert.rejects(db.query('select public.complete_activity_session($1) as result', [sessionId(3)]), /Session not found/);
    const result = (await db.query('select public.complete_activity_session($1) as result', [sessionId(1)])).rows[0].result;
    assert.equal(result.daily_goal_minutes, 60);
    assert.equal(result.duration_seconds, 61);
    assert.equal(result.daily_completed_seconds, 61);
    assert.equal(result.character_xp_earned, 1);
    assert.equal(result.character_remainder_seconds, 31);
    assert.equal(result.area_xp_earned, 1);
    assert.equal(result.area_remainder_seconds, 46);
    assert.equal(result.gold_earned, 0);
    assert.equal(result.gold, 100);
    assert.equal((await admin(db, 'select is_completed from public.tasks where id=1')).rows[0].is_completed, true);
    const before = (await admin(db, `select to_jsonb(profiles) as row from public.profiles order by id`)).rows;
    const repeated = (await db.query('select public.complete_activity_session($1) as result', [sessionId(1)])).rows[0].result;
    assert.equal(repeated.already_completed, true);
    assert.equal(repeated.goal_reached_now, false);
    assert.equal(repeated.daily_completed_seconds, 61);
    assert.deepEqual((await admin(db, 'select to_jsonb(profiles) as row from public.profiles order by id')).rows, before);
    assert.equal((await db.query('select completed_seconds from public.daily_progress')).rows[0].completed_seconds, 61);
  }));

  test('SQL goals: completion-contract drift aborts the entire installation and retains the changed baseline', async () => {
    const db = await baseline();
    try {
      const modified = read('docs/goal-completion-base.sql').replace('-- Idempotent retry protection', '-- Simulated independently changed completion contract');
      await db.exec(modified);
      const before = (await db.query("select md5(pg_get_functiondef('public.complete_activity_session(uuid)'::regprocedure)) as hash")).rows[0].hash;
      assert.notEqual(before, expectedBaseline);
      await assert.rejects(db.exec(proposal), /Completion contract changed/);
      await db.exec('rollback');
      const after = (await db.query("select to_regclass('public.daily_goal_changes')::text as ledger, to_regprocedure('public.schedule_daily_goal(integer)')::text as scheduler, to_regprocedure('public.guard_onboarded_daily_goal()')::text as guard, md5(pg_get_functiondef('public.complete_activity_session(uuid)'::regprocedure)) as hash")).rows[0];
      assert.deepEqual(after, { ledger: null, scheduler: null, guard: null, hash: before });
    } finally { await db.close(); }
  });

  test('SQL goals: rollback rejects new scheduling while preserving pending dates, ledger, permissions and completion definition', async () => withDatabase(async db => {
    await schedule(db, 75);
    const before = (await admin(db, "select to_jsonb(daily_goal_changes) as ledger, md5(pg_get_functiondef('public.complete_activity_session(uuid)'::regprocedure)) as hash from public.daily_goal_changes")).rows;
    await db.exec('reset role');
    await db.exec(rollback);
    await db.exec('set role authenticated');
    const result = await settings(db);
    assert.equal(result.scheduling_available, false);
    assert.equal(result.can_change_goal, false);
    assert.equal(result.pending, true);
    assert.equal(result.next_goal_minutes, 75);
    await assert.rejects(schedule(db, 90), /temporarily unavailable/);
    assert.deepEqual((await admin(db, "select to_jsonb(daily_goal_changes) as ledger, md5(pg_get_functiondef('public.complete_activity_session(uuid)'::regprocedure)) as hash from public.daily_goal_changes")).rows, before);
    await db.exec('set role anon');
    await assert.rejects(settings(db), /permission denied/);
    await assert.rejects(schedule(db, 60), /permission denied/);
  }));
}
