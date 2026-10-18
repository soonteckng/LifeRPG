const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20261019090000_revision_and_subject_history.sql');
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const id = n => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`;

test('revision SQL only adds categories and private study rows, owner-checked', () => {
  assert.equal((migration.match(/owner<>p_expected_owner/g) || []).length, 3);
  assert.match(migration, /expected_owner is distinct from v_owner/);
  assert.match(migration, /'Revision','#[0-9A-F]{6}',array\['revision'\]/);
  assert.doesNotMatch(migration, /(update|delete from) public\./i, 'no existing public rows change');
  assert.doesNotMatch(migration, /\b(drop|truncate|alter table)\b/i);
  assert.doesNotMatch(migration, /grant[^;]*\bto anon\b/i);
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  async function withDb(fn) {
    const db = new PGlite();
    try {
      await db.exec(read('tests/sql/progression-bootstrap.sql'));
      await db.exec(`alter table public.activity_sessions add column if not exists client_session_id uuid;
        alter table public.subjects add column if not exists xp_bank_seconds integer not null default 0;
        create sequence subject_ids start 100; alter table public.subjects alter column id set default nextval('subject_ids');
        grant usage on sequence subject_ids to authenticated;
        insert into auth.users(id) values('${owner}'),('${other}');
        insert into public.profiles(id) values('${owner}'),('${other}') on conflict do nothing;
        insert into public.subjects(id,user_id,title) values(1,'${owner}','Learning'),(2,'${owner}','Everyday focus'),(3,'${other}','Learning');`);
      await db.exec(read('supabase/migrations/20261018120000_study_plan.sql'));
      await db.exec(read('supabase/migrations/20261018140000_study_squads.sql'));
      await db.exec(read('supabase/migrations/20261018160000_study_extras.sql'));
      await db.exec(migration);
      await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
      await fn(db);
    } finally { await db.close(); }
  }
  const change = async (db, op, item, revision, draft, deleted = false) =>
    (await db.query('select public.change_study_item_v1($1::uuid,$2,$3::uuid,$4::bigint,$5::jsonb,$6,$7::uuid) as r', [id(op), 'course', id(item), revision, JSON.stringify(draft), deleted, owner])).rows[0].r;
  const list = async db => (await db.query(`select public.list_study_plan_v1($1::uuid, now()-interval '7 days') as r`, [owner])).rows[0].r;
  const restore = async (db, item, expected = owner) => (await db.query('select public.restore_study_course_v1($1::uuid,$2::uuid) as r', [id(item), expected])).rows[0].r;
  const lookup = async (db, from, to, expected = owner) => (await db.query(`select public.list_session_courses_v1($1::uuid, now()-$2::interval, now()-$3::interval) as r`, [expected, from, to])).rows[0].r;

  test('SQL revision: every account gains Revision once, alongside its own categories', () => withDb(async db => {
    const titles = async () => (await db.query(`select title from public.ensure_focus_area_catalog($1::uuid) order by title`, [owner])).rows.map(row => row.title);
    const first = await titles();
    assert.ok(first.includes('Revision')); assert.equal(first.filter(title => title === 'Learning').length, 1);
    assert.deepEqual(await titles(), first, 'asking again adds nothing');
    await assert.rejects(db.query(`select * from public.ensure_focus_area_catalog($1::uuid)`, [other]), /authenticated account/);
  }));

  test('SQL revision: a removed subject is listed and comes back with its minutes', () => withDb(async db => {
    await change(db, 1, 1, 0, { name: 'Maths', focusAreaId: 1 });
    await db.exec('reset role');
    await db.exec(`insert into public.activity_sessions(user_id,client_session_id,target_duration_seconds,duration_seconds,status,completed_at) values
      ('${owner}','${id(50)}',1800,1800,'completed',now())`);
    await db.exec('set role authenticated');
    await db.query('select public.tag_session_course_v1($1::uuid,$2::uuid,$3::uuid)', [id(50), id(1), owner]);
    await change(db, 2, 1, 1, { name: 'Maths', focusAreaId: 1 }, true);
    let plan = await list(db);
    assert.deepEqual(plan.courses, []); assert.deepEqual(plan.removed, [{ id: id(1), revision: 2, name: 'Maths' }]);
    const back = await restore(db, 1);
    assert.equal(back.status, 'saved'); assert.equal(back.item.revision, 3); assert.equal(back.item.totalSeconds, 1800);
    assert.deepEqual(await restore(db, 1), back, 'restoring again changes nothing');
    plan = await list(db);
    assert.equal(plan.courses[0].totalSeconds, 1800); assert.deepEqual(plan.removed, []); assert.equal(plan.recent.length, 1);
    assert.equal((await restore(db, 9)).reason, 'course');
    await assert.rejects(restore(db, 1, other), /Account changed/);
  }));

  test('SQL revision: restoring respects the 24 subject limit', () => withDb(async db => {
    for (let n = 1; n <= 24; n++) await change(db, n, n, 0, { name: `S${n}`, focusAreaId: null });
    await change(db, 30, 1, 1, { name: 'S1', focusAreaId: null }, true);
    await change(db, 31, 40, 0, { name: 'New', focusAreaId: null });
    assert.equal((await restore(db, 1)).reason, 'limit');
  }));

  test('SQL revision: Progress can see which subject each study session was for, removed ones included', () => withDb(async db => {
    await change(db, 1, 1, 0, { name: 'Maths', focusAreaId: 1 });
    await change(db, 2, 2, 0, { name: 'Physics', focusAreaId: 1 });
    await db.exec('reset role');
    await db.exec(`insert into public.activity_sessions(user_id,client_session_id,target_duration_seconds,duration_seconds,status,completed_at) values
      ('${owner}','${id(50)}',1800,1800,'completed',now()-interval '2 days'),('${owner}','${id(51)}',600,600,'completed',now()-interval '1 day'),
      ('${owner}','${id(52)}',600,0,'cancelled',now()),('${owner}','${id(53)}',600,600,'completed',now()-interval '20 days')`);
    await db.exec('set role authenticated');
    for (const [session, course] of [[50, 1], [51, 2], [52, 1], [53, 1]]) await db.query('select public.tag_session_course_v1($1::uuid,$2::uuid,$3::uuid)', [id(session), id(course), owner]);
    await change(db, 3, 2, 1, { name: 'Physics', focusAreaId: 1 }, true);
    assert.deepEqual(await lookup(db, '7 days', '0 days'), [
      { clientSessionId: id(50), courseId: id(1), name: 'Maths' }, { clientSessionId: id(51), courseId: id(2), name: 'Physics' }]);
    await assert.rejects(lookup(db, '60 days', '0 days'), /Invalid study window/);
    await assert.rejects(lookup(db, '7 days', '0 days', other), /Account changed/);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.deepEqual((await db.query(`select public.list_session_courses_v1($1::uuid, now()-interval '7 days', now()) as r`, [other])).rows[0].r, []);
  }));
}
