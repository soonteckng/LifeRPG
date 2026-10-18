const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261018120000_study_plan.sql'), 'utf8');
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const id = n => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`;
const day = offset => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

test('study SQL is private, owner-checked and leaves session rewards alone', () => {
  assert.match(migration, /revoke all on schema liferpg_study_private from public, anon, authenticated/);
  for (const table of ['courses', 'exams', 'session_courses', 'operations']) assert.match(migration, new RegExp(`${table} enable row level security`));
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.equal((migration.match(/security definer set search_path = ''/g) || []).length, 3);
  assert.equal((migration.match(/owner<>p_expected_owner/g) || []).length, 3);
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\./i, 'only private tables are written');
  assert.doesNotMatch(migration, /grant[^;]*\bto anon\b/i);
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  async function withDb(fn) {
    const db = new PGlite();
    try {
      await db.exec(fs.readFileSync(path.join(root, 'tests/sql/progression-bootstrap.sql'), 'utf8'));
      await db.exec(`alter table public.activity_sessions add column if not exists client_session_id uuid;
        insert into auth.users(id) values('${owner}'),('${other}');
        insert into public.subjects(id,user_id,title) values(1,'${owner}','Learning'),(2,'${other}','Learning');`);
      await db.exec(migration);
      await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
      await fn(db);
    } finally { await db.close(); }
  }
  const change = async (db, op, kind, item, revision, draft, deleted = false, expected = owner) =>
    (await db.query('select public.change_study_item_v1($1::uuid,$2,$3::uuid,$4::bigint,$5::jsonb,$6,$7::uuid) as r', [id(op), kind, id(item), revision, JSON.stringify(draft), deleted, expected])).rows[0].r;
  const list = async (db, expected = owner) => (await db.query(`select public.list_study_plan_v1($1::uuid, now()-interval '7 days') as r`, [expected])).rows[0].r;
  const tag = async (db, session, course) => (await db.query('select public.tag_session_course_v1($1::uuid,$2::uuid,$3::uuid) as r', [session, course, owner])).rows[0].r;

  test('SQL study: subjects and exams save, replay and conflict like routines', () => withDb(async db => {
    const saved = await change(db, 1, 'course', 1, 0, { name: 'Maths', focusAreaId: 1 });
    assert.equal(saved.status, 'saved'); assert.equal(saved.item.revision, 1);
    assert.deepEqual(await change(db, 1, 'course', 1, 0, { name: 'Maths', focusAreaId: 1 }), saved);
    await assert.rejects(change(db, 1, 'course', 1, 0, { name: 'Physics', focusAreaId: 1 }), /Operation already used/);
    assert.equal((await change(db, 2, 'course', 1, 0, { name: 'Maths', focusAreaId: 1 })).status, 'conflict');
    const exam = await change(db, 3, 'exam', 2, 0, { title: 'Calculus final', courseId: id(1), examDate: day(12) });
    assert.equal(exam.status, 'saved'); assert.equal(exam.item.examDate, day(12));
    const plan = await list(db);
    assert.equal(plan.courses.length, 1); assert.equal(plan.courses[0].totalSeconds, 0); assert.equal(plan.exams[0].courseId, id(1));
  }));
  test('SQL study: bad input, foreign areas or subjects and past dates never save', () => withDb(async db => {
    for (const draft of [{ name: ' Maths', focusAreaId: 1 }, { name: 'Maths', focusAreaId: 1, extra: 1 }, { name: '', focusAreaId: null }, { name: 'x'.repeat(61), focusAreaId: null }])
      await assert.rejects(change(db, 9, 'course', 9, 0, draft), /Invalid study settings/);
    await assert.rejects(change(db, 9, 'exam', 9, 0, { title: 'X', courseId: null, examDate: '2026-02-30' }), /Invalid study settings/);
    assert.equal((await change(db, 10, 'course', 10, 0, { name: 'X', focusAreaId: 2 })).reason, 'area');
    assert.equal((await change(db, 11, 'exam', 11, 0, { title: 'X', courseId: id(99), examDate: day(3) })).reason, 'course');
    assert.equal((await change(db, 12, 'exam', 12, 0, { title: 'X', courseId: null, examDate: day(-5) })).reason, 'date');
    assert.deepEqual(await list(db), { courses: [], exams: [], recent: [] });
  }));
  test('SQL study: tagged completed sessions add up per subject; removal hides them', () => withDb(async db => {
    await change(db, 1, 'course', 1, 0, { name: 'Maths', focusAreaId: 1 });
    await db.exec('reset role');
    await db.exec(`insert into public.activity_sessions(user_id,client_session_id,target_duration_seconds,duration_seconds,status,completed_at) values
      ('${owner}','${id(50)}',1800,1800,'completed',now()),('${owner}','${id(51)}',600,600,'completed',now()-interval '20 days'),('${owner}','${id(52)}',600,0,'cancelled',now())`);
    await db.exec('set role authenticated');
    for (const session of [50, 51, 52]) assert.equal((await tag(db, id(session), id(1))).status, 'saved');
    const plan = await list(db);
    assert.equal(plan.courses[0].totalSeconds, 2400); assert.equal(plan.recent.length, 1); assert.equal(plan.recent[0].seconds, 1800);
    await change(db, 2, 'exam', 2, 0, { title: 'Final', courseId: id(1), examDate: day(4) });
    await change(db, 3, 'course', 1, 1, { name: 'Maths', focusAreaId: 1 }, true);
    const after = await list(db);
    assert.deepEqual(after.courses, []); assert.deepEqual(after.recent, []); assert.equal(after.exams[0].courseId, null);
    assert.equal((await tag(db, id(60), id(1))).reason, 'course');
  }));
  test('SQL study: other accounts, anon and direct table access are refused; orphan tags are capped', () => withDb(async db => {
    await change(db, 1, 'course', 1, 0, { name: 'Maths', focusAreaId: 1 });
    for (let n = 0; n < 20; n++) assert.equal((await tag(db, id(100 + n), id(1))).status, 'saved');
    assert.equal((await tag(db, id(200), id(1))).reason, 'limit');
    await assert.rejects(change(db, 2, 'course', 2, 0, { name: 'X', focusAreaId: null }, false, other), /Account changed/);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.deepEqual(await list(db, other), { courses: [], exams: [], recent: [] });
    assert.equal((await db.query('select public.tag_session_course_v1($1::uuid,$2::uuid,$3::uuid) as r', [id(300), id(1), other])).rows[0].r.reason, 'course');
    await assert.rejects(db.query('select * from liferpg_study_private.courses'), /permission denied/);
    await db.exec('set role anon');
    await assert.rejects(list(db, other), /permission denied/);
  }));
}

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  const extras = fs.readFileSync(path.join(root, 'supabase/migrations/20261018160000_study_extras.sql'), 'utf8');
  test('SQL study extras: exams keep an optional time and reminder; older drafts still save', async () => {
    const db = new PGlite();
    try {
      await db.exec(fs.readFileSync(path.join(root, 'tests/sql/progression-bootstrap.sql'), 'utf8'));
      await db.exec(`alter table public.activity_sessions add column if not exists client_session_id uuid; insert into auth.users(id) values('${owner}');`);
      await db.exec(migration);
      await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261018140000_study_squads.sql'), 'utf8'));
      await db.exec(extras);
      await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
      const change = async (op, item, draft) => (await db.query('select public.change_study_item_v1($1::uuid,$2,$3::uuid,0,$4::jsonb,false,$5::uuid) as r', [id(op), 'exam', id(item), JSON.stringify(draft), owner])).rows[0].r;
      const old = await change(1, 1, { title: 'Final', courseId: null, examDate: day(5) });
      assert.equal(old.item.examMinute, null); assert.equal(old.item.remind, true);
      const timed = await change(2, 2, { title: 'Paper 2', courseId: null, examDate: day(6), examMinute: 9 * 60 + 30, remind: false });
      assert.equal(timed.item.examMinute, 570); assert.equal(timed.item.remind, false);
      await assert.rejects(change(3, 3, { title: 'X', courseId: null, examDate: day(6), examMinute: 1440 }), /Invalid study settings/);
      await assert.rejects(change(4, 4, { title: 'X', courseId: null, examDate: day(6), remind: 'yes' }), /Invalid study settings/);
    } finally { await db.close(); }
  });
}
