// Standalone disposable PostgreSQL rehearsal; never loaded by npm test.
// Requirements: psql, fresh localhost PostgreSQL, empty database whose name starts
// liferpg_offline_test, SESSION_SQL_DISPOSABLE_DATABASE=1 and
// SESSION_SQL_POSTGRES_URL. No remote host is accepted and no database is dropped.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const url = new URL(process.env.SESSION_SQL_POSTGRES_URL || 'postgresql://invalid/invalid');
if (process.env.SESSION_SQL_DISPOSABLE_DATABASE !== '1'
  || !['postgres:', 'postgresql:'].includes(url.protocol)
  || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  || !/^\/liferpg_offline_test[a-zA-Z0-9_]*$/.test(url.pathname)) {
  throw new Error('Use an explicitly disposable fresh localhost liferpg_offline_test database only.');
}
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const env = { ...process.env, PGHOST: url.hostname.replace(/[\[\]]/g, ''), PGPORT: url.port || '5432',
  PGDATABASE: url.pathname.slice(1), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
let owner = '11111111-1111-4111-8111-111111111111';
let subject = 1;
const id = n => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`;
const quote = text => `'${text.replace(/'/g, "''")}'`;
function query(sql, marker) {
  let resolveReady; let output = ''; let errors = ''; let matched = false;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const child = spawn(process.env.SESSION_SQL_PSQL || 'psql', ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], { env, shell: false });
  const complete = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Disposable concurrency rehearsal timed out')); }, 20000);
    child.stdout.on('data', data => {
      output += data.toString();
      if (marker && output.split(/\r?\n/).includes(marker)) { matched = true; resolveReady(); }
    });
    child.stderr.on('data', data => { errors += data.toString(); });
    child.on('error', error => { clearTimeout(timeout); resolveReady(); reject(error); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (!marker) resolveReady();
      if (code !== 0) reject(new Error(`Disposable SQL process failed: ${errors}`));
      else if (marker && !matched) reject(new Error('SQL lock checkpoint not reached'));
      else resolve(output.trim().split(/\r?\n/).filter(Boolean));
    });
    child.stdin.end(sql);
  });
  return { ready, complete };
}
async function run(sql) { return query(sql).complete; }
const asOwner = sql => `set request.jwt.claim.sub='${owner}'; set statement_timeout='10s'; ${sql}`;
const submit = payload => `select public.submit_client_session_v1('${payload.clientSessionId}',${quote(JSON.stringify(payload))}::jsonb);`;
function payload(n, start, target = 60) {
  return { policyVersion: 1, clientSessionId: id(n), serverSessionId: null, expectedRevision: null,
    setup: { targetSeconds: target, activityType: 'learning', taskId: null, subjectId: subject, notes: 'Synthetic concurrency', title: 'Synthetic concurrency' },
    startedAtMs: start, endedAtMs: start + target * 1000, serverConfirmedMs: 0, serverObservedAtMs: null,
    segments: [{ startedAtMs: start, endedAtMs: start + target * 1000 }], clockWarning: false, ending: 'completed' };
}
async function race(a, b) {
  const first = query(`begin; ${asOwner(submit(a))} select 'LOCK_READY'; select pg_sleep(0.8); commit;`, 'LOCK_READY');
  await first.ready;
  const second = query(asOwner(submit(b)));
  const [left, right] = await Promise.all([first.complete, second.complete]);
  return [JSON.parse(left.find(line => line.startsWith('{'))), JSON.parse(right.find(line => line.startsWith('{')))];
}
async function freshOwner(n) {
  owner = `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`; subject = null;
  await run(`insert into auth.users(id) values('${owner}'); insert into public.profiles(id,onboarding_completed,timezone) values('${owner}',true,'UTC');`);
}
async function mixed(n, seconds = 65) {
  const sessionId = id(n);
  await run(asOwner(`select public.start_activity_session_v2('${sessionId}',60,'learning',null,null,'Synthetic concurrency');
    update public.activity_sessions set started_at=clock_timestamp()-interval '${seconds} seconds',last_resumed_at=clock_timestamp()-interval '${seconds} seconds' where id='${sessionId}';`));
  const snapshot = JSON.parse((await run(asOwner(`select public.session_sync_snapshot_v1('${sessionId}');`)))[0]);
  const input = payload(n, Date.parse(snapshot.started_at)); input.serverSessionId = sessionId; input.expectedRevision = snapshot.sync_revision;
  input.serverConfirmedMs = snapshot.sync_handoff.confirmed_ms; input.serverObservedAtMs = snapshot.sync_handoff.observed_at_ms;
  input.endedAtMs = snapshot.sync_handoff.observed_at_ms; input.segments = [];
  return input;
}
async function orderedRace(firstSql, secondSql) {
  const first = query(`begin; ${asOwner(firstSql)} select 'RACE_READY'; select pg_sleep(0.8); commit;`, 'RACE_READY');
  await first.ready;
  const second = query(asOwner(secondSql));
  return Promise.all([first.complete, second.complete]);
}
async function main() {
  const empty = await run("select case when not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind in ('r','p')) and not exists(select 1 from pg_roles where rolname in ('anon','authenticated')) then 1 else 0 end;");
  assert.equal(empty[0], '1', 'fresh isolated cluster/database required; existing objects are never removed');
  await run([read('tests/sql/progression-bootstrap.sql'), read('tests/sql/session-start-stop-fixtures.sql'),
    "create unique index one_open_activity_session_per_user on public.activity_sessions(user_id) where status in ('active','paused')",
    read('docs/progression-live-contract.sql'), read('docs/goal-completion-base.sql'), read('docs/daily-goal-exact-credit.sql'),
    read('docs/session-start-stop-repair.sql'), read('docs/session-offline-sync.sql')].join('\n;\n'));
  const now = Number((await run('select floor(extract(epoch from clock_timestamp())*1000)::bigint;'))[0]);
  const a = payload(1, now - 6 * 86400000);
  const duplicate = await race(a, a);
  assert.deepEqual(duplicate.map(row => row.outcome), ['accepted', 'already_saved']);
  assert.equal(duplicate[0].session_id, duplicate[1].session_id);
  console.log('PASS: simultaneous identical imports commit one row and one receipt');
  const overlap = await race(payload(2, now - 5 * 86400000), payload(3, now - 5 * 86400000 + 1000));
  assert.equal(overlap[0].outcome, 'accepted'); assert.equal(overlap[1].reason_code, 'overlap');
  console.log('PASS: profile serialization prevents simultaneously overlapping claims');
  const mixedId = id(4);
  await run(asOwner(`select public.start_activity_session_v2('${mixedId}',60,'learning',null,1,'Synthetic concurrency');
    update public.activity_sessions set started_at=clock_timestamp()-interval '65 seconds',last_resumed_at=clock_timestamp()-interval '65 seconds' where id='${mixedId}';`));
  const snap = JSON.parse((await run(asOwner(`select public.session_sync_snapshot_v1('${mixedId}');`)))[0]);
  const mixedPayload = payload(4, new Date(snap.started_at).getTime());
  mixedPayload.serverSessionId = mixedId; mixedPayload.expectedRevision = snap.sync_revision;
  mixedPayload.serverConfirmedMs = snap.sync_handoff.confirmed_ms; mixedPayload.serverObservedAtMs = snap.sync_handoff.observed_at_ms;
  mixedPayload.endedAtMs = snap.sync_handoff.observed_at_ms; mixedPayload.segments = [];
  const completion = query(`begin; ${asOwner(`select public.complete_activity_session('${mixedId}');`)} select 'COMPLETE_READY'; select pg_sleep(0.8); commit;`, 'COMPLETE_READY');
  await completion.ready;
  const importReply = query(asOwner(submit(mixedPayload)));
  await completion.complete;
  const saved = JSON.parse((await importReply.complete)[0]);
  assert.equal(saved.outcome, 'already_saved'); assert.equal(saved.verification_class, 'server_timed');
  assert.equal(saved.receipt.already_completed, true);
  console.log('PASS: ordinary completion wins a concurrent mixed import without second credit');
  const counts = JSON.parse((await run(`select jsonb_build_object('sessions',(select count(*) from public.activity_sessions where status='completed'),
    'xp',(select current_xp from public.profiles where id='${owner}'),'submissions',(select count(*) from liferpg_session_private.client_submissions));`))[0]);
  assert.deepEqual(counts, { sessions: 3, xp: 3, submissions: 4 });
  console.log('PASS: final accounting contains exactly three credited sessions, no duplicate reward');
  await freshOwner(20);
  const day = Math.floor((now - 4 * 86400000) / 86400000) * 86400000;
  const seeded = JSON.parse((await run(asOwner(submit(payload(20, day, 28800)))))[0]); assert.equal(seeded.outcome, 'accepted');
  const cap = await race(payload(21, day + 8 * 3600000, 21600), payload(22, day + 14 * 3600000, 21600));
  assert.equal(cap[0].outcome, 'accepted'); assert.equal(cap[1].reason_code, 'daily_cap');
  console.log('PASS: simultaneous non-overlapping claims serialize the daily credit cap');

  await freshOwner(30); const cancelled = await mixed(30);
  const cancelFirst = await orderedRace(`select public.cancel_activity_session('${id(30)}');`, submit(cancelled));
  assert.equal(JSON.parse(cancelFirst[1][0]).reason_code, 'session_cancelled');
  assert.equal((await run(`select current_xp from public.profiles where id='${owner}';`))[0], '0');
  await freshOwner(31); const completed = await mixed(31);
  const importFirst = await orderedRace(submit(completed), `do $$begin perform public.cancel_activity_session('${id(31)}'); exception when others then if sqlerrm<>'Open session not found' then raise; end if; end;$$; select status from public.activity_sessions where id='${id(31)}';`);
  assert.equal(JSON.parse(importFirst[0].find(line => line.startsWith('{'))).outcome, 'accepted'); assert.equal(importFirst[1][0], 'completed');
  assert.equal((await run(`select current_xp from public.profiles where id='${owner}';`))[0], '1');
  console.log('PASS: cancellation/import races honor both terminal commit orders without duplicate credit');

  await freshOwner(40); const stalePause = await mixed(40);
  const pausedFirst = await orderedRace(`select public.pause_activity_session('${id(40)}');`, submit(stalePause));
  assert.equal(JSON.parse(pausedFirst[1][0]).reason_code, 'revision_conflict');
  assert.equal((await run(`select current_xp from public.profiles where id='${owner}';`))[0], '0');
  await freshOwner(41); const pausedLate = await mixed(41);
  const importedFirst = await orderedRace(submit(pausedLate), `do $$begin perform public.pause_activity_session('${id(41)}'); exception when others then if sqlerrm<>'Active session not found' then raise; end if; end;$$; select status from public.activity_sessions where id='${id(41)}';`);
  assert.equal(JSON.parse(importedFirst[0].find(line => line.startsWith('{'))).outcome, 'accepted'); assert.equal(importedFirst[1][0], 'completed');
  console.log('PASS: delayed old Pause cannot overwrite an imported ending, and prior Pause invalidates its handoff');

  await freshOwner(50);
  const stopArgs = `'${id(50)}',60,'learning',null,null,'Synthetic concurrency'`;
  const stoppedFirst = await orderedRace(`select public.confirm_activity_session_stop_v2(${stopArgs});`, `do $$begin perform public.start_activity_session_v2(${stopArgs}); exception when others then if sqlerrm not ilike '%stopped%' then raise; end if; end;$$; select count(*) from public.activity_sessions where id='${id(50)}' and status in ('active','paused');`);
  assert.ok(stoppedFirst[0].some(line => line.includes('cancelled'))); assert.equal(stoppedFirst[1][0], '0');
  await freshOwner(51);
  const startArgs = `'${id(51)}',60,'learning',null,null,'Synthetic concurrency'`;
  const startedFirst = await orderedRace(`select public.start_activity_session_v2(${startArgs});`, `select public.confirm_activity_session_stop_v2(${startArgs});`);
  assert.equal(JSON.parse(startedFirst[1][0]).status, 'cancelled');
  assert.equal((await run(`select status from public.activity_sessions where id='${id(51)}';`))[0], 'cancelled');
  console.log('PASS: Start/Stop fencing survives both simultaneous commit orders with the offline schema installed');

  await freshOwner(60); const admitted = payload(60, now - 2 * 86400000);
  const stoppingAdmissions = await orderedRace(submit(admitted), 'update liferpg_session_private.sync_policy set enabled=false where singleton;');
  assert.equal(JSON.parse(stoppingAdmissions[0].find(line => line.startsWith('{'))).outcome, 'accepted');
  assert.equal(JSON.parse((await run(asOwner(submit(admitted))))[0]).outcome, 'already_saved');
  const disabled = await run(asOwner(submit(payload(61, now - 86400000))));
  assert.equal(JSON.parse(disabled[0]).reason_code, 'policy_disabled');
  console.log('PASS: disabling admissions during an import preserves committed work and identical replay');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
