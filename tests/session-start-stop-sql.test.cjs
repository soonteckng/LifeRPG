const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const proposal = read('docs/session-start-stop-repair.sql');
const rollback = read('docs/session-start-stop-repair-rollback.sql');

test('start/stop proposal leaves legacy and reward functions unchanged and private state inaccessible', () => {
  assert.doesNotMatch(proposal, /create(?: or replace)? function public\.(?:start_activity_session|complete_activity_session|cancel_activity_session)\s*\(/i);
  assert.match(proposal, /alter table liferpg_session_private\.start_requests enable row level security/i);
  assert.match(proposal, /revoke all on schema liferpg_session_private from public, anon, authenticated/i);
  assert.equal((proposal.match(/security definer set search_path = ''/gi) || []).length, 3);
  assert.equal((proposal.match(/v_user_id uuid := auth\.uid\(\)/g) || []).length, 2);
  assert.equal((proposal.match(/current_setting\('transaction_isolation'\) <> 'read committed'/g) || []).length, 2);
  assert.match(proposal, /has_column_privilege\('authenticated', 'public\.profiles', 'session_start_protocol_version', 'UPDATE'\)/);
  assert.doesNotMatch(rollback, /drop|delete|truncate|set session_start_protocol_version\s*=\s*1/i);
});

test('start fence is enforced at INSERT using the locked profile version, with NOWAIT for stop row locks', () => {
  assert.match(proposal, /before insert on public\.activity_sessions/i);
  assert.match(proposal, /select session_start_protocol_version into v_protocol_version\s+from public\.profiles where id = new\.user_id for update/i);
  assert.match(proposal, /update public\.profiles set session_start_protocol_version = 2/i);
  assert.match(proposal, /from public\.activity_sessions where id = p_client_session_id for update nowait/i);
  const stop = proposal.slice(proposal.indexOf('create function public.confirm_activity_session_stop_v2'));
  assert.ok(stop.indexOf('from public.profiles') < stop.indexOf('from public.activity_sessions'));
  assert.match(proposal, /row\(v_session\.target_duration_seconds, v_session\.activity_type, v_session\.task_id, v_session\.subject_id, v_session\.notes\)/);
  assert.match(proposal, /Another unfinished session must be reviewed/);
  const lastInsert = stop.lastIndexOf('insert into liferpg_session_private.start_requests');
  const afterInsert = stop.slice(lastInsert);
  assert.match(afterInsert, /on conflict \(client_session_id\) do nothing/);
  assert.ok(afterInsert.indexOf('v_request.user_id is distinct from v_user_id') < afterInsert.indexOf('update liferpg_session_private.start_requests'));
});

// SQL execution is explicit: this repository adds no production/test dependency.
// Set SESSION_SQL_PGLITE_ROOT to an independently installed @electric-sql/pglite
// package (or its parent node_modules directory) and run this file. Without that
// variable the ordinary suite runs only the two structural contract tests above.
if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const id = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
  const params = (clientId, changes = {}) => [clientId, changes.duration ?? 60, changes.activity ?? 'learning', changes.task ?? null, changes.subject ?? 1, changes.notes ?? 'Synthetic focus'];
  const legacyDefinition = read('docs/progression-live-contract.sql').slice(read('docs/progression-live-contract.sql').indexOf('CREATE OR REPLACE FUNCTION public.start_activity_session('));
  async function database() {
    const db = new PGlite();
    await db.exec(read('tests/sql/progression-bootstrap.sql'));
    await db.exec(read('tests/sql/session-start-stop-fixtures.sql'));
    await db.exec(legacyDefinition);
    await db.exec(read('docs/goal-completion-base.sql'));
    await db.exec(proposal);
    await db.exec("set role authenticated; set request.jwt.claim.sub = '" + owner + "'");
    return db;
  }
  async function rpc(db, name, values) {
    const result = await db.query(`select public.${name}($1::uuid,$2::integer,$3::text,$4::bigint,$5::bigint,$6::text) as result`, values);
    return result.rows[0].result;
  }
  async function admin(db, sql, values = []) {
    await db.exec('reset role');
    try { return await db.query(sql, values); } finally { await db.exec('set role authenticated'); }
  }
  async function row(db, clientId) {
    return (await db.query('select * from public.activity_sessions where id=$1', [clientId])).rows[0];
  }
  async function newTest(t, fn) {
    const db = await database();
    try { await fn(db); } finally { await db.close(); }
  }

  test('SQL: anonymous, absent-owner and cross-owner requests cannot alter sessions or protocol state', async t => newTest(t, async db => {
    await db.exec("set request.jwt.claim.sub = ''");
    await assert.rejects(rpc(db, 'start_activity_session_v2', params(id(1))), /Not authenticated/);
    await assert.rejects(rpc(db, 'confirm_activity_session_stop_v2', params(id(1))), /Not authenticated/);
    await db.exec("set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333'");
    await assert.rejects(rpc(db, 'start_activity_session_v2', params(id(1))), /Profile not found/);
    await db.exec(`set request.jwt.claim.sub = '${owner}'`);
    await rpc(db, 'start_activity_session_v2', params(id(1)));
    await db.exec(`set request.jwt.claim.sub = '${other}'`);
    await assert.rejects(rpc(db, 'start_activity_session_v2', params(id(1))), /conflicts/);
    await assert.rejects(rpc(db, 'confirm_activity_session_stop_v2', params(id(1))), /conflicts/);
    assert.equal((await db.query('select session_start_protocol_version as version from public.profiles')).rows[0].version, 1);
    assert.equal(await row(db, id(1)), undefined);
  }));

  test('SQL: private registrations, protocol downgrade and forged marked INSERT are denied', async t => newTest(t, async db => {
    await assert.rejects(db.query('select * from liferpg_session_private.start_requests'), /permission denied/);
    await assert.rejects(db.query('update public.profiles set session_start_protocol_version=1'), /permission denied/);
    await db.exec('set role anon');
    await assert.rejects(rpc(db, 'start_activity_session_v2', params(id(1))), /permission denied/);
    await db.exec('set role authenticated');
    await assert.rejects(admin(db, "insert into public.activity_sessions(id,client_start_id,user_id,target_duration_seconds,activity_type) values ($1,$1,$2,60,'learning')", [id(1), owner]), /not registered/);
    const permissions = await admin(db, "select has_function_privilege('anon','public.start_activity_session_v2(uuid,integer,text,bigint,bigint,text)','EXECUTE') as anon_start, has_function_privilege('authenticated','public.start_activity_session_v2(uuid,integer,text,bigint,bigint,text)','EXECUTE') as auth_start");
    assert.deepEqual(permissions.rows[0], { anon_start: false, auth_start: true });
  }));

  test('SQL: new RPCs reject stale repeatable-read and serializable transactions before mutation', async t => newTest(t, async db => {
    for (const isolation of ['repeatable read', 'serializable']) {
      for (const name of ['start_activity_session_v2', 'confirm_activity_session_stop_v2']) {
        await db.exec(`begin isolation level ${isolation}`);
        await assert.rejects(rpc(db, name, params(id(1))), /requires read committed/);
        await db.exec('rollback');
      }
    }
    assert.equal((await admin(db, 'select count(*)::integer as n from public.activity_sessions')).rows[0].n, 0);
    assert.equal((await admin(db, 'select count(*)::integer as n from liferpg_session_private.start_requests')).rows[0].n, 0);
    assert.equal((await db.query('select session_start_protocol_version as version from public.profiles')).rows[0].version, 1);
  }));

  test('SQL: Start retains duration, task ownership and subject ownership validation', async t => newTest(t, async db => {
    for (const duration of [0, 28801]) await assert.rejects(rpc(db, 'start_activity_session_v2', params(id(1), { duration })), /duration/);
    await assert.rejects(rpc(db, 'start_activity_session_v2', params(null)), /identity is required/);
    await assert.rejects(rpc(db, 'start_activity_session_v2', params(id(1), { task: 2 })), /Task is invalid/);
    await assert.rejects(rpc(db, 'start_activity_session_v2', params(id(1), { subject: 2 })), /Subject is invalid/);
    await admin(db, 'update public.tasks set is_completed=true where id=1');
    await assert.rejects(rpc(db, 'start_activity_session_v2', params(id(1), { task: 1 })), /Task is invalid/);
    await admin(db, 'update public.tasks set is_recurring=true, last_completed_date=null where id=1');
    assert.equal(await rpc(db, 'start_activity_session_v2', params(id(1), { task: 1 })), id(1));
  }));

  test('SQL: matching repeated Starts return one ID without changing elapsed state; payload changes reject', async t => newTest(t, async db => {
    assert.equal(await rpc(db, 'start_activity_session_v2', params(id(1))), id(1));
    const before = await row(db, id(1));
    assert.equal(await rpc(db, 'start_activity_session_v2', params(id(1), { activity: ' learning ' })), id(1));
    assert.deepEqual(await row(db, id(1)), before);
    for (const change of [{ duration: 61 }, { activity: 'general' }, { task: 1 }, { subject: 2 }, { notes: 'Changed' }]) {
      await assert.rejects(rpc(db, 'start_activity_session_v2', params(id(1), change)), /conflicts/);
      await assert.rejects(rpc(db, 'confirm_activity_session_stop_v2', params(id(1), change)), /conflicts/);
    }
    await assert.rejects(rpc(db, 'start_activity_session_v2', params(id(2))), /unfinished/);
    await admin(db, "update public.activity_sessions set status='paused',elapsed_seconds=12 where id=$1", [id(1)]);
    assert.equal(await rpc(db, 'start_activity_session_v2', params(id(1))), id(1));
    assert.equal((await row(db, id(1))).elapsed_seconds, 12);
  }));

  test('SQL: Start then Stop cancels once; another Start with that identity never revives it', async t => newTest(t, async db => {
    await rpc(db, 'start_activity_session_v2', params(id(1)));
    const stopped = await rpc(db, 'confirm_activity_session_stop_v2', params(id(1)));
    assert.deepEqual(stopped, { client_session_id: id(1), session_id: id(1), status: 'cancelled', legacy_starts_fenced: true });
    const before = await row(db, id(1));
    assert.deepEqual(await rpc(db, 'confirm_activity_session_stop_v2', params(id(1))), stopped);
    assert.equal(await rpc(db, 'start_activity_session_v2', params(id(1))), id(1));
    assert.deepEqual(await row(db, id(1)), before);
    assert.equal(before.xp_earned, 0);
    assert.equal(before.gold_earned, 0);
    assert.equal(await rpc(db, 'start_activity_session_v2', params(id(2))), id(2));
  }));

  test('SQL: Stop before Start persists a tombstone and blocks delayed legacy INSERT while fresh v2 works', async t => newTest(t, async db => {
    const stop = await rpc(db, 'confirm_activity_session_stop_v2', params(id(1)));
    assert.deepEqual(stop, { client_session_id: id(1), session_id: null, status: 'cancelled', legacy_starts_fenced: true });
    assert.deepEqual(await rpc(db, 'confirm_activity_session_stop_v2', params(id(1))), stop);
    await assert.rejects(rpc(db, 'start_activity_session_v2', params(id(1))), /already been stopped/);
    await assert.rejects(db.query("select public.start_activity_session(60,'learning',null,1,'Synthetic focus')"), /Legacy session starts are disabled/);
    // Simulate the INSERT statement from an already-entered old function body.
    await assert.rejects(admin(db, 'insert into public.activity_sessions(user_id,target_duration_seconds) values ($1,60)', [owner]), /Legacy session starts are disabled/);
    assert.equal(await rpc(db, 'start_activity_session_v2', params(id(2))), id(2));
    await rpc(db, 'confirm_activity_session_stop_v2', params(id(2)));
    await assert.rejects(rpc(db, 'start_activity_session_v2', params(id(1))), /already been stopped/);
    await db.exec(`set request.jwt.claim.sub = '${other}'`);
    const legacy = await db.query("select public.start_activity_session(60,'general',null,2,null) as id");
    assert.ok(legacy.rows[0].id);
    assert.equal((await row(db, legacy.rows[0].id)).client_start_id, null);
  }));

  test('SQL: unknown Stop refuses an unrelated open legacy row and rolls back its fence/tombstone', async t => newTest(t, async db => {
    const legacy = (await db.query("select public.start_activity_session(60,'learning',null,1,'Synthetic focus') as id")).rows[0].id;
    await assert.rejects(rpc(db, 'confirm_activity_session_stop_v2', params(id(1))), /Another unfinished session/);
    assert.equal((await row(db, legacy)).status, 'active');
    assert.equal((await db.query('select session_start_protocol_version as version from public.profiles')).rows[0].version, 1);
    assert.equal((await admin(db, 'select count(*)::integer as n from liferpg_session_private.start_requests')).rows[0].n, 0);
  }));

  test('SQL: a lost Stop reply can be acknowledged after a fresh other-device session starts', async t => newTest(t, async db => {
    const saved = await rpc(db, 'confirm_activity_session_stop_v2', params(id(1)));
    await rpc(db, 'start_activity_session_v2', params(id(2)));
    const freshBefore = await row(db, id(2));
    assert.deepEqual(await rpc(db, 'confirm_activity_session_stop_v2', params(id(1))), saved);
    assert.deepEqual(await row(db, id(2)), freshBefore);
    await db.exec(`set request.jwt.claim.sub = '${other}'`);
    await assert.rejects(rpc(db, 'confirm_activity_session_stop_v2', params(id(1), { subject: 2 })), /conflicts/);
    const tombstone = (await admin(db, 'select user_id,subject_id,stopped from liferpg_session_private.start_requests where client_session_id=$1', [id(1)])).rows[0];
    assert.deepEqual(tombstone, { user_id: owner, subject_id: 1, stopped: true });
  }));

  test('SQL: completed receipt and all rewards survive Stop and repeated Start unchanged', async t => newTest(t, async db => {
    await rpc(db, 'start_activity_session_v2', params(id(1)));
    await admin(db, "update public.activity_sessions set started_at=now()-interval '65 seconds',last_resumed_at=now()-interval '65 seconds' where id=$1", [id(1)]);
    const receipt = (await db.query('select public.complete_activity_session($1) as result', [id(1)])).rows[0].result;
    assert.equal(receipt.xp_earned, 1);
    const before = await row(db, id(1));
    const profileBefore = (await db.query('select current_xp,gold,xp_bank_seconds,level from public.profiles')).rows[0];
    assert.equal((await rpc(db, 'confirm_activity_session_stop_v2', params(id(1)))).status, 'completed');
    assert.equal(await rpc(db, 'start_activity_session_v2', params(id(1))), id(1));
    assert.deepEqual(await row(db, id(1)), before);
    assert.deepEqual((await db.query('select current_xp,gold,xp_bank_seconds,level from public.profiles')).rows[0], profileBefore);
    const repeat = (await db.query('select public.complete_activity_session($1) as result', [id(1)])).rows[0].result;
    assert.equal(repeat.already_completed, true);
    assert.deepEqual((await row(db, id(1))).credit_result, before.credit_result);
  }));

  test('SQL: installation aborts on unsafe broad profile UPDATE grants and leaves no partial schema', async () => {
    const db = new PGlite();
    try {
      await db.exec(read('tests/sql/progression-bootstrap.sql'));
      await db.exec('grant update on public.profiles to authenticated');
      await assert.rejects(db.exec(proposal), /profile UPDATE grants must exclude/);
      await db.exec('rollback');
      const rows = await db.query("select column_name from information_schema.columns where table_schema='public' and column_name='session_start_protocol_version'");
      assert.equal(rows.rows.length, 0);
    } finally { await db.close(); }
  });
}
