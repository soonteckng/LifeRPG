// Standalone PostgreSQL concurrency rehearsal; never loaded by npm test.
// Requires psql and an explicitly disposable fresh localhost database whose
// name begins liferpg_routine_test. No remote connection or database deletion.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const url = new URL(process.env.SESSION_SQL_POSTGRES_URL || 'postgresql://invalid/invalid');
if (process.env.SESSION_SQL_DISPOSABLE_DATABASE !== '1'
  || !['postgres:', 'postgresql:'].includes(url.protocol)
  || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  || !/^\/liferpg_routine_test[a-zA-Z0-9_]*$/.test(url.pathname)) {
  throw new Error('Use an explicitly disposable fresh localhost liferpg_routine_test database only.');
}
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const env = { ...process.env, PGHOST: url.hostname.replace(/[\[\]]/g, ''), PGPORT: url.port || '5432',
  PGDATABASE: url.pathname.slice(1), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
const id = n => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`;
const ownerId = n => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;
const quote = value => `'${value.replace(/'/g, "''")}'`;
const draft = { name: 'Learning routine', focusAreaId: null, durationSeconds: 60, reminder: { enabled: false, hour: 18, minute: 0 } };
let owner = ownerId(1);

function query(sql, marker) {
  let resolveReady, output = '', errors = '', matched = false;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const child = spawn(process.env.SESSION_SQL_PSQL || 'psql', ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], { env, shell: false });
  const complete = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); resolveReady(); reject(new Error('Disposable routine concurrency rehearsal timed out')); }, 20000);
    child.stdout.on('data', data => {
      output += data.toString();
      if (marker && output.split(/\r?\n/).includes(marker)) { matched = true; resolveReady(); }
    });
    child.stderr.on('data', data => { errors += data.toString(); });
    child.on('error', error => { clearTimeout(timeout); resolveReady(); reject(error); });
    child.on('close', code => {
      clearTimeout(timeout); resolveReady();
      if (code !== 0) reject(new Error(`Disposable routine SQL process failed: ${errors}`));
      else if (marker && !matched) reject(new Error('Routine SQL lock checkpoint not reached'));
      else resolve(output.trim().split(/\r?\n/).filter(Boolean));
    });
    child.stdin.end(sql);
  });
  // A failed first process can finish before the lock checkpoint is awaited.
  // Keep its rejection handled; race() still awaits the original promise.
  void complete.catch(() => {});
  return { ready, complete };
}
const run = sql => query(sql).complete;
const authenticated = (sql, tokenOwner = owner) => `set role authenticated; set request.jwt.claim.sub=${quote(tokenOwner)}; set statement_timeout='10s'; ${sql}`;
const change = (operation, routine, revision = 0, input = draft, deleted = false, expectedOwner = owner) =>
  `select public.change_saved_routine_v1('${id(operation)}','${id(routine)}',${revision},${quote(JSON.stringify(input))}::jsonb,${deleted},${quote(expectedOwner)}::uuid);`;
const receipt = lines => JSON.parse(lines.find(line => line.startsWith('{')));
async function freshOwner(n) {
  owner = ownerId(n);
  await run(`insert into auth.users(id) values('${owner}');`);
}
async function race(firstSql, secondSql) {
  const first = query(`begin isolation level read committed; ${authenticated(firstSql)} select 'ROUTINE_LOCK_READY'; select pg_sleep(1.2); commit;`, 'ROUTINE_LOCK_READY');
  await first.ready;
  const second = query(authenticated(`select 'ROUTINE_SECOND_READY'; ${secondSql}`), 'ROUTINE_SECOND_READY');
  const overlaps = await Promise.race([second.ready.then(() => true), first.complete.then(() => false)]);
  assert.equal(overlaps, true, 'second routine request must begin while the first transaction holds the owner lock');
  const [left, right] = await Promise.all([first.complete, second.complete]);
  return [receipt(left), receipt(right)];
}
async function counts(forOwner = owner) {
  return JSON.parse((await run(`select jsonb_build_object(
    'active',(select count(*) from liferpg_routine_private.routines where owner_id='${forOwner}' and deleted_at is null),
    'records',(select count(*) from liferpg_routine_private.routines where owner_id='${forOwner}'),
    'operations',(select count(*) from liferpg_routine_private.operations where owner_id='${forOwner}'));`))[0]);
}
async function main() {
  const empty = await run("select case when not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','liferpg_routine_private') and c.relkind in ('r','p')) and not exists(select 1 from pg_roles where rolname in ('anon','authenticated')) then 1 else 0 end;");
  assert.equal(empty[0], '1', 'fresh isolated cluster/database required; existing objects are never removed');
  await run(`${read('tests/sql/progression-bootstrap.sql')}\n${read('docs/saved-routines.sql')}`);

  await freshOwner(1);
  const replay = await race(change(1, 1), change(1, 1));
  assert.deepEqual(replay[0], replay[1]); assert.equal(replay[0].status, 'saved');
  assert.deepEqual(await counts(), { active: 1, records: 1, operations: 1 });
  console.log('PASS: concurrent identical routine creation commits one record and one exact receipt');

  await freshOwner(2);
  await run(authenticated(Array.from({ length: 31 }, (_, n) => change(100 + n, 100 + n, 0, { ...draft, name: `Routine ${n}` })).join('\n')));
  assert.equal((await counts()).active, 31);
  const capacity = await race(change(200, 200), change(201, 201));
  assert.deepEqual(capacity.map(item => item.status), ['saved', 'conflict']);
  assert.equal(capacity[1].reason, 'limit'); assert.equal(capacity[1].routine, null);
  assert.deepEqual(await counts(), { active: 32, records: 32, operations: 33 });
  console.log('PASS: two concurrent creates at capacity 31 leave exactly 32 active routines');

  await freshOwner(3);
  await run(authenticated(change(300, 300)));
  const edit = await race(change(301, 300, 1, { ...draft, name: 'First edit' }), change(302, 300, 1, { ...draft, name: 'Second edit' }));
  assert.deepEqual(edit.map(item => item.status), ['saved', 'conflict']);
  assert.equal(edit[0].routine.revision, 2); assert.deepEqual(edit[1].routine, edit[0].routine);
  const listed = JSON.parse((await run(authenticated(`select public.list_saved_routines_v1('${owner}'::uuid);`)))[0]);
  assert.equal(listed.length, 1); assert.equal(listed[0].name, 'First edit'); assert.equal(listed[0].revision, 2);
  assert.deepEqual(await counts(), { active: 1, records: 1, operations: 3 });
  console.log('PASS: simultaneous edits at one revision yield one saved edit and one explicit conflict');

  const expected = owner, before = await counts(expected);
  await freshOwner(4);
  await assert.rejects(run(authenticated(change(400, 400, 0, draft, false, expected))), /Account changed/);
  await assert.rejects(run(authenticated(`select public.list_saved_routines_v1('${expected}'::uuid);`)), /Account changed/);
  assert.deepEqual(await counts(expected), before); assert.deepEqual(await counts(), { active: 0, records: 0, operations: 0 });
  console.log('PASS: JWT B with expected account A cannot list or commit a routine under either account');

  await assert.rejects(run(`begin isolation level repeatable read; ${authenticated(change(401, 401))} commit;`), /Use read committed/);
  assert.deepEqual(await counts(), { active: 0, records: 0, operations: 0 });
  console.log('PASS: stale repeatable-read snapshots are refused before routine writes');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
