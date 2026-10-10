// In-memory SQL verification only. PGlite is a separate test tool, not an app dependency.
const { PGlite } = require('@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
(async () => {
  const db = new PGlite();
  const accountA = '00000000-0000-4000-8000-000000000001';
  const accountB = '00000000-0000-4000-8000-000000000002';
  const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  try {
    await db.exec(read('tests/sql/focus-catalog-bootstrap.sql'));
    await db.exec(`insert into auth.users(id) values('${accountA}'),('${accountB}');
      update public.subjects set level=3,current_xp=17,xp_bank_seconds=59 where user_id='${accountA}' and title='Knowledge';
      insert into public.subjects(user_id,title,level,current_xp,xp_bank_seconds) values('${accountA}','My ceramics',2,11,31);
      insert into public.tasks(user_id,title,subject_id) select '${accountA}','Existing quest',id from public.subjects where user_id='${accountA}' and title='Knowledge';
      insert into public.activity_sessions(user_id,subject_id,target_duration_seconds,duration_seconds,status,credit_result)
      select '${accountA}',id,60,60,'completed','{"xp_earned":1}' from public.subjects where user_id='${accountA}' and title='Knowledge';`);
    const before = (await db.query('select * from public.subjects order by id')).rows;
    const tasks = (await db.query('select * from public.tasks')).rows;
    const sessions = (await db.query('select * from public.activity_sessions')).rows;
    await db.exec(read('docs/focus-area-catalog-repair.sql'));
    await db.exec(read('docs/focus-area-catalog-repair.sql'));
    assert.equal((await db.query("select has_function_privilege('anon','public.ensure_focus_area_catalog(uuid)','execute') as allowed")).rows[0].allowed, false);
    await db.exec(`select set_config('request.jwt.claim.sub','${accountA}',false); set role authenticated;`);
    const first = (await db.query(`select * from public.ensure_focus_area_catalog('${accountA}') order by id`)).rows;
    const second = (await db.query(`select * from public.ensure_focus_area_catalog('${accountA}') order by id`)).rows;
    assert.equal(first.length, 8); assert.deepEqual(second, first);
    assert.ok(first.every(row => row.user_id === accountA));
    await assert.rejects(db.query(`select * from public.ensure_focus_area_catalog('${accountB}')`), /authenticated account/i);
    await db.exec("select set_config('request.jwt.claim.sub','',false);");
    await assert.rejects(db.query(`select * from public.ensure_focus_area_catalog('${accountA}')`), /authenticated account/i);
    await db.exec('reset role;');
    const after = (await db.query('select * from public.subjects order by id')).rows;
    for (const row of before) assert.deepEqual(after.find(item => item.id === row.id), row);
    assert.deepEqual((await db.query('select * from public.tasks')).rows, tasks);
    assert.deepEqual((await db.query('select * from public.activity_sessions')).rows, sessions);
    assert.equal(after.filter(row => row.user_id === accountB).length, 5);
    for (const row of after.filter(row => !before.some(old => old.id === row.id))) {
      assert.ok(['Work & projects', 'Creativity'].includes(row.title));
      assert.equal(row.level, 1); assert.equal(row.current_xp, 0); assert.equal(row.xp_bank_seconds, 0);
    }
    await db.exec(read('docs/focus-area-catalog-repair-rollback.sql'));
    assert.deepEqual((await db.query('select * from public.subjects order by id')).rows, after);
    console.log('PASS: repair idempotency, owner checks, anonymous denial, existing XP/IDs/custom areas/session/quest preservation, zero-XP missing defaults, and rollback retention');
  } finally { await db.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
