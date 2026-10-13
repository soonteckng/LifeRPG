const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const proposal = read('docs/session-offline-sync.sql');
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const id = n => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`;

test('offline SQL is an unapplied proposal with private ownership, guarded extraction and bounded imports', () => {
  assert.match(proposal, /UNAPPLIED PROPOSAL/);
  assert.match(proposal, /a815c30a20323367da56df967740fe86/);
  assert.match(proposal, /pg_advisory_xact_lock/);
  assert.match(proposal, /for update/);
  assert.match(proposal, /57600/);
  assert.match(proposal, /86400000/);
  assert.match(proposal, /jsonb_array_length\(submission->'segments'\)>256/);
  assert.match(proposal, /sync_handoffs enable row level security/);
  assert.match(proposal, /revoke all on schema liferpg_session_private from public,anon,authenticated/);
  assert.doesNotMatch(proposal, /create(?: or replace)? function public\.(?:start_activity_session_v2|confirm_activity_session_stop_v2|pause_activity_session|resume_activity_session|cancel_activity_session)\(/i);
});

// Disposable SQL only. No production connection, credential, account or email.
if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  async function baseline() {
    const db = new PGlite();
    await db.exec("set timezone='UTC'");
    await db.exec(read('tests/sql/progression-bootstrap.sql'));
    await db.exec(read('tests/sql/session-start-stop-fixtures.sql'));
    await db.exec("create unique index one_open_activity_session_per_user on public.activity_sessions(user_id) where status in ('active','paused')");
    const legacy = read('docs/progression-live-contract.sql');
    await db.exec(legacy);
    await db.exec(read('docs/goal-completion-base.sql'));
    await db.exec(read('docs/daily-goal-exact-credit.sql'));
    await db.exec(read('docs/session-start-stop-repair.sql'));
    const current = (await db.query("select pg_get_functiondef('public.complete_activity_session(uuid)'::regprocedure) as source")).rows[0].source;
    await db.exec(current.replace('public.complete_activity_session(p_session_id uuid)', 'public.reference_complete_activity_session(p_session_id uuid)'));
    await db.exec(`update public.profiles set onboarding_completed=true where id='${owner}'; set role authenticated; set request.jwt.claim.sub='${owner}'`);
    return db;
  }
  async function database() {
    const db = await baseline();
    await db.exec('reset role');
    try { await db.exec(proposal); await db.exec('set role authenticated'); return db; } catch (error) { await db.close(); throw error; }
  }
  async function admin(db, sql, values = []) {
    await db.exec('reset role');
    try {
      if (values.length === 0 && sql.includes(';')) return (await db.exec(sql)).at(-1);
      return await db.query(sql, values);
    } finally { await db.exec('set role authenticated'); }
  }
  async function withDb(fn) { const db = await database(); try { await fn(db); } finally { await db.close(); } }
  async function clock(db) { return Number((await db.query('select floor(extract(epoch from clock_timestamp())*1000)::bigint as ms')).rows[0].ms); }
  async function payload(db, n, options = {}) {
    const end = options.end ?? (await clock(db)) - 120000;
    const target = options.target ?? 60;
    const start = options.start ?? end - target * 1000;
    return {
      policyVersion: 1, clientSessionId: id(n), serverSessionId: null, expectedRevision: null,
      setup: { targetSeconds: target, activityType: 'learning', taskId: null, subjectId: 1, notes: 'Synthetic offline', title: 'Synthetic task' },
      startedAtMs: start, endedAtMs: end, serverConfirmedMs: 0, serverObservedAtMs: null,
      segments: [{ startedAtMs: start, endedAtMs: end }], clockWarning: false, ending: 'completed', ...options.extra,
    };
  }
  async function submit(db, input) {
    return (await db.query('select public.submit_client_session_v1($1::uuid,$2::jsonb) as result', [input.clientSessionId, JSON.stringify(input)])).rows[0].result;
  }
  async function snapshot(db, serverId, clientId = null) {
    return (await db.query('select public.session_sync_snapshot_v1($1::uuid,$2::uuid) as result', [serverId, clientId])).rows[0].result;
  }
  async function progression(db) {
    return (await admin(db, `select jsonb_build_object(
      'profiles',(select jsonb_agg(to_jsonb(p) order by id) from public.profiles p),
      'subjects',(select jsonb_agg(to_jsonb(s) order by id) from public.subjects s),
      'daily',(select jsonb_agg(to_jsonb(d) order by progress_date,user_id) from public.daily_progress d),
      'tasks',(select jsonb_agg(to_jsonb(t) order by id) from public.tasks t),
      'sessions',(select jsonb_agg(to_jsonb(a)-array['sync_revision','client_session_id','verification_class','client_reported_started_at','client_reported_ended_at','server_received_at','client_clock_warning'] order by id) from public.activity_sessions a)
    ) as result`)).rows[0].result;
  }
  async function start(db, n, target = 60) {
    return (await db.query("select public.start_activity_session_v2($1,$2,'learning',null,1,'Synthetic offline') as result", [id(n), target])).rows[0].result;
  }
  async function mixed(db, n, options = {}) {
    const serverId = await start(db, n, options.target ?? 60);
    await admin(db, 'update public.activity_sessions set started_at=clock_timestamp()-interval \'30 seconds\',last_resumed_at=clock_timestamp()-interval \'30 seconds\' where id=$1', [serverId]);
    const row = await snapshot(db, serverId);
    const h = row.sync_handoff;
    const startAt = Math.floor(new Date(row.started_at).getTime());
    const finish = h.observed_at_ms + (options.localMs ?? 40000);
    return payload(db, n, { start: startAt, end: finish, target: options.target ?? 60, extra: {
      serverSessionId: serverId, expectedRevision: row.sync_revision,
      serverConfirmedMs: h.confirmed_ms, serverObservedAtMs: h.observed_at_ms,
      segments: [{ startedAtMs: h.observed_at_ms, endedAtMs: finish }], ...options.extra,
    } });
  }

  test('SQL offline: capability is authenticated, owner-bound and advertises agreed limits', async () => withDb(async db => {
    const value = (await db.query('select public.session_sync_capabilities_v1() as result')).rows[0].result;
    assert.equal(value.owner_id, owner); assert.equal(value.policy_version, 1); assert.equal(value.offline_enabled, true);
    assert.equal(value.max_span_seconds, 86400); assert.equal(value.max_segments, 256);
    assert.equal(value.max_age_seconds, 604800); assert.equal(value.max_cached_grant_age_seconds, 604800);
    assert.equal(value.max_client_reported_daily_seconds, 57600);
    await db.exec("set request.jwt.claim.sub=''");
    await assert.rejects(db.query('select public.session_sync_capabilities_v1()'), /Not authenticated/);
    await db.exec('set role anon');
    for (const name of ['session_sync_capabilities_v1()', `session_sync_snapshot_v1('${id(1)}')`, `submit_client_session_v1('${id(1)}','{}')`])
      await assert.rejects(db.query(`select public.${name}`), /permission denied/);
    const grants = (await admin(db, `select has_function_privilege('authenticated','liferpg_session_private.credit_session(uuid,boolean,timestamptz)','EXECUTE') as kernel,
      has_table_privilege('authenticated','liferpg_session_private.client_submissions','INSERT') as ledger,
      has_column_privilege('authenticated','public.activity_sessions','sync_revision','UPDATE') as revision`)).rows[0];
    assert.deepEqual(grants, { kernel: false, ledger: false, revision: false });
  }));

  test('SQL offline: pure import banks exact seconds, keeps server primary key separate and replays once', async () => withDb(async db => {
    await admin(db, `update public.profiles set xp_bank_seconds=30,gold=98 where id='${owner}'; update public.subjects set xp_bank_seconds=45 where id=1`);
    const input = await payload(db, 1, { target: 61 });
    const accepted = await submit(db, input);
    assert.equal(accepted.outcome, 'accepted'); assert.equal(accepted.client_session_id, id(1)); assert.notEqual(accepted.session_id, id(1));
    assert.equal(accepted.receipt.duration_seconds, 61); assert.equal(accepted.receipt.character_xp_earned, 1);
    assert.equal(accepted.receipt.character_remainder_seconds, 31); assert.equal(accepted.receipt.area_remainder_seconds, 46);
    assert.equal(accepted.receipt.gold, 98); assert.equal(accepted.receipt.gold_earned, 0);
    const before = await progression(db);
    const replay = await submit(db, input);
    assert.equal(replay.outcome, 'already_saved'); assert.equal(replay.session_id, accepted.session_id);
    assert.equal(replay.receipt.already_completed, true); assert.equal(replay.receipt.goal_reached_now, false);
    assert.deepEqual(await progression(db), before);
    assert.equal((await submit(db, { ...input, clockWarning: true })).reason_code, 'changed_submission');
    assert.deepEqual(await progression(db), before);
    assert.equal((await db.query('select count(*)::integer as n from public.activity_sessions')).rows[0].n, 1);
  }));

  test('SQL offline: original normal completion and extracted kernel are exactly equivalent across banks, goals, levels, legacy receipt and quest modes', async () => withDb(async db => {
    const cases = [
      { seconds: 1, bank: 0, daily: 0, recurring: false },
      { seconds: 61, bank: 59, daily: 1799, recurring: false },
      { seconds: 28800, bank: 30, daily: 2000, recurring: true },
      { seconds: 60, bank: 0, daily: 5000, recurring: false },
    ];
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      await db.exec('begin');
      try {
        await admin(db, `update public.profiles set xp_bank_seconds=${c.bank},current_xp=99,level=1,gold=100,streak_count=7,last_goal_completed_date=current_date-1 where id='${owner}';
          update public.subjects set xp_bank_seconds=${c.bank},current_xp=49 where id=1;
          update public.tasks set is_recurring=${c.recurring} where id=1;
          insert into public.daily_progress(user_id,progress_date,goal_minutes,completed_minutes,completed_seconds,goal_completed)
            values('${owner}',current_date,30,${Math.floor(c.daily / 60)},${c.daily},${c.daily >= 1800});
          insert into public.activity_sessions(id,user_id,target_duration_seconds,status,elapsed_seconds,task_id,subject_id,last_resumed_at)
            values('${id(100+i)}','${owner}',${c.seconds},'paused',${c.seconds + 100},1,1,null)`);
        await db.exec('savepoint differential');
        const old = (await db.query('select public.reference_complete_activity_session($1) as result', [id(100+i)])).rows[0].result;
        const oldRows = await progression(db);
        await db.exec('rollback to savepoint differential');
        const next = (await db.query('select public.complete_activity_session($1) as result', [id(100+i)])).rows[0].result;
        assert.deepEqual(next, old, `receipt case ${i}`);
        assert.deepEqual(await progression(db), oldRows, `all accounting rows case ${i}`);
        const replay = (await db.query('select public.complete_activity_session($1) as result', [id(100+i)])).rows[0].result;
        assert.equal(replay.already_completed, true); assert.equal(replay.goal_reached_now, false);
      } finally { await db.exec('rollback'); }
    }
    await admin(db, `insert into public.activity_sessions(id,user_id,target_duration_seconds,status,elapsed_seconds,duration_seconds,xp_earned,gold_earned)
      values('${id(199)}','${owner}',60,'completed',60,60,9,3)`);
    const old = (await db.query('select public.reference_complete_activity_session($1) as result', [id(199)])).rows[0].result;
    assert.deepEqual((await db.query('select public.complete_activity_session($1) as result', [id(199)])).rows[0].result, old);
  }));

  test('SQL offline: normal completion remains early-gated, owner-scoped and server-timed', async () => withDb(async db => {
    await start(db, 1);
    await assert.rejects(db.query('select public.complete_activity_session($1)', [id(1)]), /has not reached/);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    await assert.rejects(db.query('select public.complete_activity_session($1)', [id(1)]), /Session not found/);
    assert.equal(await snapshot(db, id(1)), null);
  }));

  test('SQL offline: malformed shape, changed identity, overlapping segments and a 1ms-short completion never credit', async () => withDb(async db => {
    const valid = await payload(db, 1);
    const cases = [
      { ...valid, extra: true },
      { ...valid, setup: { ...valid.setup, targetSeconds: null } },
      { ...valid, startedAtMs: '0' },
      { ...valid, endedAtMs: valid.startedAtMs },
      { ...valid, segments: [{ startedAtMs: valid.startedAtMs, endedAtMs: valid.endedAtMs - 1 }] },
      { ...valid, segments: [valid.segments[0], valid.segments[0]] },
      { ...valid, segments: [{ startedAtMs: valid.startedAtMs - 1, endedAtMs: valid.endedAtMs }] },
      { ...valid, serverConfirmedMs: 60000 },
    ];
    for (let i = 0; i < cases.length; i++) {
      cases[i].clientSessionId = id(i + 1);
      assert.equal((await submit(db, cases[i])).outcome, 'rejected', `invalid case ${i}`);
    }
    assert.equal((await db.query('select count(*)::integer as n from public.activity_sessions')).rows[0].n, 0);
    assert.equal((await db.query('select current_xp from public.profiles')).rows[0].current_xp, 0);
  }));

  test('SQL offline: seven-day expiry, wall-span and future bounds are enforced, small skew normalizes the entire span', async () => withDb(async db => {
    const now = await clock(db);
    assert.equal((await submit(db, await payload(db, 1, { end: now - 604800000 - 1000 }))).reason_code, 'expired');
    assert.equal((await submit(db, await payload(db, 2, { start: now - 86400001, end: now }))).reason_code, 'span_too_large');
    assert.equal((await submit(db, await payload(db, 3, { end: now + 121000 }))).reason_code, 'clock_skew');
    const shifted = await submit(db, await payload(db, 4, { end: now + 60000 }));
    assert.equal(shifted.outcome, 'accepted');
    const row = (await db.query('select client_reported_started_at,client_reported_ended_at,server_received_at from public.activity_sessions')).rows[0];
    assert.ok(new Date(row.client_reported_ended_at) <= new Date(row.server_received_at));
    assert.equal(new Date(row.client_reported_ended_at) - new Date(row.client_reported_started_at), 60000);
  }));

  test('SQL offline: half-open envelopes include paused gaps and terminal cancellation; adjacent records are allowed', async () => withDb(async db => {
    const now = await clock(db);
    const first = await payload(db, 1, { start: now - 600000, end: now - 420000, extra: { segments: [
      { startedAtMs: now - 600000, endedAtMs: now - 570000 }, { startedAtMs: now - 450000, endedAtMs: now - 420000 },
    ] } });
    assert.equal((await submit(db, first)).outcome, 'accepted');
    assert.equal((await submit(db, await payload(db, 2, { start: now - 540000, end: now - 480000 }))).reason_code, 'overlap');
    assert.equal((await submit(db, await payload(db, 3, { start: now - 420000, end: now - 360000 }))).outcome, 'accepted');
    await admin(db, `insert into public.activity_sessions(id,user_id,target_duration_seconds,status,started_at,completed_at)
      values('${id(10)}','${owner}',60,'cancelled',to_timestamp(${now - 300000}/1000.0),to_timestamp(${now - 180000}/1000.0))`);
    assert.equal((await submit(db, await payload(db, 4, { start: now - 270000, end: now - 210000 }))).reason_code, 'overlap');
    await start(db, 11);
    assert.equal((await submit(db, await payload(db, 5, { start: now, end: now + 60000 }))).reason_code, 'overlap');
  }));

  test('SQL offline: stale and foreign links fall back to character-only while owned one-off alone completes', async () => withDb(async db => {
    const now = await clock(db);
    const foreign = await payload(db, 1, { end: now - 600000 });
    foreign.setup.taskId = 2; foreign.setup.subjectId = 2;
    const result = await submit(db, foreign);
    assert.equal(result.outcome, 'accepted'); assert.equal(result.receipt.area_xp_earned, null);
    assert.equal((await admin(db, 'select is_completed from public.tasks where id=2')).rows[0].is_completed, false);
    const own = await payload(db, 2, { end: now - 400000 }); own.setup.taskId = 1;
    assert.equal((await submit(db, own)).outcome, 'accepted');
    assert.equal((await admin(db, 'select is_completed from public.tasks where id=1')).rows[0].is_completed, true);
    await admin(db, 'update public.tasks set is_completed=false,is_recurring=true,last_completed_date=null,completed_at=null where id=1');
    const recurring = await payload(db, 3, { end: now - 200000 }); recurring.setup.taskId = 1;
    assert.equal((await submit(db, recurring)).outcome, 'accepted');
    assert.deepEqual((await admin(db, 'select is_completed,last_completed_date,completed_at from public.tasks where id=1')).rows[0], { is_completed: false, last_completed_date: null, completed_at: null });
  }));

  test('SQL offline: backdating uses effective scheduled goal, preserves earned flags and does not move legacy dates/streak backward', async () => withDb(async db => {
    const now = await clock(db);
    await admin(db, `update public.profiles set streak_count=9,last_goal_completed_date=current_date,last_active_date=current_date where id='${owner}';
      insert into public.daily_goal_changes(user_id,effective_date,goal_minutes) values('${owner}',current_date-4,45),('${owner}',current_date,90);
      insert into public.daily_progress(user_id,progress_date,goal_minutes,completed_minutes,completed_seconds,goal_completed,goal_completed_at)
      values('${owner}',current_date-2,30,30,1800,true,now()-interval '2 days')`);
    const imported = await submit(db, await payload(db, 1, { end: now - 3 * 86400000, target: 2700 }));
    assert.equal(imported.receipt.daily_goal_minutes, 45); assert.equal(imported.receipt.goal_reached_now, true);
    const before = (await db.query('select streak_count,last_goal_completed_date,last_active_date from public.profiles')).rows[0];
    assert.equal(before.streak_count, 9);
    const priorFlag = (await db.query('select goal_completed_at from public.daily_progress where progress_date=current_date-2')).rows[0].goal_completed_at;
    const existing = await submit(db, await payload(db, 2, { end: now - 2 * 86400000 }));
    assert.equal(existing.receipt.daily_goal_minutes, 30); assert.equal(existing.receipt.goal_reached_now, false);
    assert.deepEqual((await db.query('select streak_count,last_goal_completed_date,last_active_date from public.profiles')).rows[0], before);
    assert.equal((await db.query('select goal_completed_at from public.daily_progress where progress_date=current_date-2')).rows[0].goal_completed_at.getTime(), priorFlag.getTime());
  }));

  test('SQL offline: 16-hour cap counts only client-reported accepted receipts for their credited day', async () => withDb(async db => {
    const now = await clock(db); const dayStart = Math.floor(now / 86400000) * 86400000;
    // Use yesterday so all 16h spans are wholly in the past.
    const end = dayStart - 86400000 + 16 * 3600000;
    assert.equal((await submit(db, await payload(db, 1, { target: 28800, start: end - 16 * 3600000, end: end - 8 * 3600000 }))).outcome, 'accepted');
    assert.equal((await submit(db, await payload(db, 2, { target: 28800, start: end - 8 * 3600000, end }))).outcome, 'accepted');
    assert.equal((await submit(db, await payload(db, 3, { target: 1, start: end, end: end + 1000 }))).reason_code, 'daily_cap');
  }));

  test('SQL offline: mixed finalization uses an authenticated immutable handoff, preserves its server row and replay identity', async () => withDb(async db => {
    const input = await mixed(db, 1);
    const rowBefore = (await db.query('select started_at,last_resumed_at from public.activity_sessions where id=$1', [id(1)])).rows[0];
    const accepted = await submit(db, input);
    assert.equal(accepted.outcome, 'accepted'); assert.equal(accepted.session_id, id(1));
    assert.equal(accepted.receipt.duration_seconds, 60); assert.equal(accepted.verification_class, 'client_reported');
    assert.deepEqual((await db.query('select started_at,last_resumed_at from public.activity_sessions where id=$1', [id(1)])).rows[0], rowBefore);
    assert.equal((await db.query('select count(*)::integer as n from public.activity_sessions')).rows[0].n, 1);
    assert.equal((await submit(db, input)).outcome, 'already_saved');
  }));

  test('SQL offline: forged mixed prefix and stale old-client state cannot receive credit', async () => withDb(async db => {
    const input = await mixed(db, 1);
    assert.equal((await submit(db, { ...input, serverConfirmedMs: input.serverConfirmedMs + 1000 })).reason_code, 'handoff_not_found');
    // A new identity cannot bind an arbitrary owned server row.
    assert.equal((await submit(db, { ...input, clientSessionId: id(2) })).reason_code, 'mapping_mismatch');
    // Stored rejected identity is immutable, so use another real server row.
    await admin(db, 'update public.activity_sessions set status=\'cancelled\',completed_at=now() where id=$1', [id(1)]);
    const next = await mixed(db, 3);
    await db.query('select public.pause_activity_session($1)', [id(3)]);
    assert.equal((await submit(db, next)).reason_code, 'revision_conflict');
    assert.equal((await db.query('select status from public.activity_sessions where id=$1', [id(3)])).rows[0].status, 'paused');
  }));

  test('SQL offline: mixed cancellation keeps actual End envelope, awards nothing and cannot resurrect', async () => withDb(async db => {
    const input = await mixed(db, 1, { localMs: 10000, extra: { ending: 'cancelled' } });
    const before = (await db.query('select current_xp,gold,xp_bank_seconds from public.profiles')).rows[0];
    const result = await submit(db, input);
    assert.equal(result.outcome, 'accepted'); assert.equal(result.ending, 'cancelled'); assert.equal(result.receipt, null);
    assert.deepEqual((await db.query('select current_xp,gold,xp_bank_seconds from public.profiles')).rows[0], before);
    assert.equal((await db.query('select status from public.activity_sessions')).rows[0].status, 'cancelled');
    assert.equal((await submit(db, input)).outcome, 'already_saved');
    assert.equal((await submit(db, { ...input, ending: 'completed' })).reason_code, 'changed_submission');
  }));

  test('SQL offline: existing server receipt wins over a cancellation claim before age, span and stale revision checks', async () => withDb(async db => {
    const input = await mixed(db, 1, { localMs: 10000, extra: { ending: 'cancelled' } });
    await admin(db, 'update public.activity_sessions set elapsed_seconds=60,status=\'paused\',paused_at=now() where id=$1', [id(1)]);
    const saved = (await db.query('select public.complete_activity_session($1) as result', [id(1)])).rows[0].result;
    const before = await progression(db);
    input.startedAtMs -= 9 * 86400000; input.endedAtMs -= 8 * 86400000;
    const result = await submit(db, input);
    assert.equal(result.outcome, 'already_saved'); assert.equal(result.ending, 'completed');
    assert.equal(result.verification_class, 'server_timed'); assert.equal(result.receipt.session_id, saved.session_id);
    assert.equal(result.receipt.already_completed, true); assert.equal(result.receipt.goal_reached_now, false);
    assert.deepEqual(await progression(db), before);
  }));

  test('SQL offline: exact 256 segment bound works and the 257th is rejected without a reward', async () => withDb(async db => {
    const end = (await clock(db)) - 600000; const startAt = end - 256000;
    const segments = Array.from({ length: 256 }, (_, i) => ({ startedAtMs: startAt + i * 1000, endedAtMs: startAt + (i + 1) * 1000 }));
    const input = await payload(db, 1, { target: 256, start: startAt, end, extra: { segments } });
    assert.equal((await submit(db, input)).outcome, 'accepted');
    const secondStart = end + 1000;
    const next = await payload(db, 2, { target: 257, start: secondStart, end: secondStart + 257000, extra: {
      segments: Array.from({ length: 257 }, (_, i) => ({ startedAtMs: secondStart + i * 1000, endedAtMs: secondStart + (i + 1) * 1000 })),
    } });
    assert.equal((await submit(db, next)).reason_code, 'segments_invalid');
    assert.equal((await db.query('select count(*)::integer as n from public.activity_sessions')).rows[0].n, 1);
  }));

  test('SQL offline: a stopped Start identity cannot resurrect as an unrelated pure import', async () => withDb(async db => {
    await db.query("select public.confirm_activity_session_stop_v2($1,60,'learning',null,1,'Synthetic offline')", [id(1)]);
    const input = await payload(db, 1);
    assert.equal((await submit(db, input)).reason_code, 'identity_conflict');
    assert.equal((await db.query('select count(*)::integer as n from public.activity_sessions')).rows[0].n, 0);
  }));

  test('SQL offline: harmless deleted-link nulling is accepted only with original setup and unchanged timing', async () => withDb(async db => {
    const input = await mixed(db, 1);
    await admin(db, 'delete from public.subjects where id=1');
    await admin(db, 'update public.activity_sessions set subject_id=null where id=$1', [id(1)]);
    assert.equal((await submit(db, input)).outcome, 'accepted');
    assert.equal((await db.query('select credit_result from public.activity_sessions')).rows[0].credit_result.area_xp_earned, null);
  }));

  test('SQL offline: restored historical submission replays beyond seven days and rollback disables only new admissions', async () => withDb(async db => {
    const input = await payload(db, 1); const result = await submit(db, input);
    const before = await progression(db);
    // Restore a synthetic already-accepted historical submission. This fixture
    // adjustment is admin-only; the tested RPC never rewrites original payloads.
    const age = 30 * 86400000;
    const historical = { ...input, startedAtMs: input.startedAtMs - age, endedAtMs: input.endedAtMs - age,
      segments: input.segments.map(s => ({ startedAtMs: s.startedAtMs - age, endedAtMs: s.endedAtMs - age })) };
    await admin(db, 'update liferpg_session_private.client_submissions set submission=$1::jsonb,created_at=now()-interval \'30 days\' where client_session_id=$2', [JSON.stringify(historical), id(1)]);
    await db.exec('reset role'); await db.exec(read('docs/session-offline-sync-rollback.sql')); await db.exec('set role authenticated');
    assert.equal((await submit(db, historical)).outcome, 'already_saved');
    assert.equal((await submit(db, await payload(db, 2))).reason_code, 'policy_disabled');
    assert.equal((await snapshot(db, result.session_id)).status, 'completed');
    assert.deepEqual(await progression(db), before);
    const next = await start(db, 3);
    await admin(db, 'update public.activity_sessions set status=\'paused\',elapsed_seconds=60 where id=$1', [next]);
    assert.equal((await db.query('select public.complete_activity_session($1) as result', [next])).rows[0].result.duration_seconds, 60);
  }));

  test('SQL offline: a long-paused mixed session always permits trusted End without relaxing rewarded span limits', async () => withDb(async db => {
    await start(db, 1);
    await admin(db, 'update public.activity_sessions set status=\'paused\',elapsed_seconds=30000/1000,started_at=clock_timestamp()-interval \'2 days\',last_resumed_at=null,paused_at=clock_timestamp()-interval \'1 day\' where id=$1', [id(1)]);
    const row = await snapshot(db, id(1)); const h = row.sync_handoff;
    const input = await payload(db, 1, { start: new Date(row.started_at).getTime(), end: h.observed_at_ms + 1000, extra: {
      serverSessionId: row.id, expectedRevision: row.sync_revision, serverConfirmedMs: h.confirmed_ms,
      serverObservedAtMs: h.observed_at_ms, segments: [], ending: 'cancelled',
    } });
    assert.equal((await submit(db, input)).outcome, 'accepted');
    assert.equal((await db.query('select status from public.activity_sessions')).rows[0].status, 'cancelled');
    assert.equal((await db.query('select current_xp from public.profiles')).rows[0].current_xp, 0);
  }));

  test('SQL offline: legacy server row can be bound once without changing its ID or overwriting another mapping', async () => withDb(async db => {
    await admin(db, `insert into public.activity_sessions(id,user_id,target_duration_seconds,status,elapsed_seconds,started_at,last_resumed_at)
      values('${id(1)}','${owner}',60,'active',0,now()-interval '30 seconds',now()-interval '30 seconds')`);
    const first = await snapshot(db, id(1), id(2));
    assert.equal(first.id, id(1)); assert.equal(first.client_session_id, id(2)); assert.ok(first.sync_handoff);
    await assert.rejects(snapshot(db, id(1), id(3)), /mapping conflicts/);
    assert.equal((await snapshot(db, id(1), id(2))).client_session_id, id(2));
  }));

  test('SQL offline: historical imports preserve the actual one-open index beside a distinct running timer', async () => withDb(async db => {
    const input = await payload(db, 88);
    await start(db, 87);
    assert.equal((await submit(db, input)).outcome, 'accepted');
    assert.equal((await db.query("select count(*)::integer as n from public.activity_sessions where status in ('active','paused')")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::integer as n from public.activity_sessions where status='completed'")).rows[0].n, 1);
  }));
  test('SQL offline: free sessions accept null titles and preserve the full existing notes limit', async () => withDb(async db => {
    const input = await payload(db, 89);
    input.setup.title = null; input.setup.notes = 'x'.repeat(10000); input.setup.subjectId = null;
    const result = await submit(db, input);
    assert.equal(result.outcome, 'accepted'); assert.equal(result.receipt.xp_earned, 1);
    assert.equal(result.receipt.area_xp_earned, null);
  }));

  test('SQL offline: policy pause retains retryability and still permits owner-bound End', async () => withDb(async db => {
    const input = await payload(db, 90);
    await admin(db, 'update liferpg_session_private.sync_policy set enabled=false');
    const disabled = await submit(db, input);
    assert.equal(disabled.reason_code, 'policy_disabled'); assert.equal(disabled.sync_revision, null); assert.equal(disabled.verification_class, null);
    assert.equal((await admin(db, 'select count(*)::integer as n from liferpg_session_private.client_submissions')).rows[0].n, 0);
    await admin(db, 'update liferpg_session_private.sync_policy set enabled=true');
    assert.equal((await submit(db, input)).outcome, 'accepted');
    const stop = await mixed(db, 91, { localMs: 10000, extra: { ending: 'cancelled' } });
    await admin(db, 'update liferpg_session_private.sync_policy set enabled=false');
    assert.equal((await submit(db, stop)).ending, 'cancelled');
  }));

  test('SQL offline: rejection responses retain the transport identity fields', async () => withDb(async db => {
    const input = await payload(db, 92, { end: (await clock(db)) - 8 * 86400000 });
    const result = await submit(db, input);
    assert.equal(result.outcome, 'rejected'); assert.equal(result.client_session_id, input.clientSessionId);
    assert.equal(result.sync_revision, null); assert.equal(result.verification_class, null);
  }));

  test('SQL offline: disabled admission preserves identical replay and all existing reward history', async () => withDb(async db => {
    const input = await payload(db, 1); const result = await submit(db, input);
    const before = await progression(db);
    await admin(db, 'update liferpg_session_private.sync_policy set enabled=false');
    assert.equal((await submit(db, input)).outcome, 'already_saved');
    assert.equal((await submit(db, await payload(db, 2))).reason_code, 'policy_disabled');
    assert.deepEqual(await progression(db), before);
    assert.equal((await snapshot(db, result.session_id)).status, 'completed');
  }));

  test('SQL offline: definition drift or broad client writes abort the entire installation', async () => {
    for (const drift of ['definition', 'grants']) {
      const db = await baseline();
      try {
        await db.exec('reset role');
        if (drift === 'definition') {
          const source = (await db.query("select pg_get_functiondef('public.complete_activity_session(uuid)'::regprocedure) as source")).rows[0].source;
          await db.exec(source.replace('-- Idempotent retry protection', '-- Independently changed body'));
        } else await db.exec('grant update on public.activity_sessions to authenticated');
        await assert.rejects(db.exec(proposal), drift === 'definition' ? /definition changed/ : /must exclude offline authority/);
        await db.exec('rollback');
        assert.equal((await db.query("select to_regclass('liferpg_session_private.client_submissions')::text as value")).rows[0].value, null);
        assert.equal((await db.query("select count(*)::integer as n from information_schema.columns where table_schema='public' and table_name='activity_sessions' and column_name='sync_revision'")).rows[0].n, 0);
      } finally { await db.close(); }
    }
  });
}
