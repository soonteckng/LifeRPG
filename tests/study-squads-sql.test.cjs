const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261018140000_study_squads.sql'), 'utf8');
const limits = fs.readFileSync(path.join(root, 'supabase/migrations/20261018200000_squad_limits.sql'), 'utf8');
const users = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', ...Array.from({ length: 9 }, (_, i) => `3333333${i}-3333-4333-8333-333333333333`)];
const [me, friend] = users;
const rid = n => `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, '0')}`;

test('squad SQL is private, owner-checked and only exposes squad members', () => {
  assert.match(migration, /revoke all on schema liferpg_squad_private from public, anon, authenticated/);
  for (const table of ['squads', 'members', 'join_attempts']) assert.match(migration, new RegExp(`${table} enable row level security`));
  assert.doesNotMatch(migration, /grant[^;]*\bto anon\b/i);
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\./i, 'only private tables are written');
  assert.doesNotMatch(migration, /email|phone/i, 'no contact details leave the profile');
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  async function withDb(fn) {
    const db = new PGlite();
    try {
      await db.exec(fs.readFileSync(path.join(root, 'tests/sql/progression-bootstrap.sql'), 'utf8'));
      await db.exec(`insert into auth.users(id) values ${users.map(u => `('${u}')`).join(',')};
        insert into public.profiles(id, username, avatar) values ${users.map((u, i) => `('${u}', 'User ${i}', '🌱')`).join(',')} on conflict (id) do update set username = excluded.username;`);
      await db.exec(migration);
      await db.exec(limits);
      await db.exec(`set role authenticated;set request.jwt.claim.sub='${me}'`);
      await fn(db);
    } finally { await db.close(); }
  }
  const as = (db, user) => db.exec(`set request.jwt.claim.sub='${user}'`);
  const call = async (db, sql, args) => (await db.query(`select ${sql} as r`, args)).rows[0].r;
  const week = "now() - interval '3 days'";
  const create = (db, user, name = 'Calc crew', req = 1) => call(db, `public.create_squad_v1($1::uuid, $2, $3::uuid, ${week})`, [rid(req), name, user]);
  const join = (db, user, code) => call(db, `public.join_squad_v1($1, $2::uuid, ${week})`, [code, user]);
  const list = (db, user) => call(db, `public.list_squads_v1($1::uuid, ${week})`, [user]);

  test('SQL squads: create is idempotent, a friend joins by code and both see the week', () => withDb(async db => {
    const made = await create(db, me);
    assert.equal(made.status, 'saved'); assert.match(made.squad.code, /^[A-HJ-NP-Z2-9]{6}$/); assert.equal(made.squad.ownerIsYou, true);
    assert.deepEqual(await create(db, me), made, 'a retried create returns the same squad');
    await db.exec('reset role');
    await db.exec(`insert into public.activity_sessions(user_id,target_duration_seconds,duration_seconds,status,completed_at) values ('${friend}',1800,1800,'completed',now()),('${friend}',600,600,'completed',now()-interval '10 days');
      insert into public.activity_sessions(user_id,target_duration_seconds,duration_seconds,status,started_at) values ('${me}',1800,0,'active',now())`);
    await db.exec('set role authenticated');
    await as(db, friend);
    const joined = await join(db, friend, made.squad.code.toLowerCase());
    assert.equal(joined.status, 'saved'); assert.equal(joined.squad.members.length, 2);
    const mine = joined.squad.members.find(m => m.isYou), theirs = joined.squad.members.find(m => !m.isYou);
    assert.equal(mine.weekSeconds, 1800); assert.equal(theirs.focusingNow, true); assert.equal(theirs.isOwner, true);
    assert.deepEqual(Object.keys(theirs).sort(), ['avatar', 'focusingNow', 'id', 'isOwner', 'isYou', 'level', 'name', 'streak', 'weekSeconds']);
    assert.equal((await join(db, friend, made.squad.code)).squad.members.length, 2, 'joining twice changes nothing');
    await as(db, me);
    assert.equal((await list(db, me))[0].members.length, 2);
  }));
  test('SQL squads: wrong codes slow down, squads fill at 8, you lead one and belong to three', () => withDb(async db => {
    const made = await create(db, me);
    await as(db, friend);
    for (let n = 0; n < 10; n++) assert.equal((await join(db, friend, 'AAAAAA')).status, 'not_found');
    assert.equal((await join(db, friend, made.squad.code)).status, 'slow_down');
    for (const user of users.slice(2, 9)) { await as(db, user); assert.equal((await join(db, user, made.squad.code)).status, 'saved'); }
    await as(db, users[9]); assert.equal((await join(db, users[9], made.squad.code)).status, 'full');
    await as(db, me);
    assert.equal((await create(db, me, 'Second', 2)).status, 'lead_limit', 'you lead one squad at a time');
    const codes = [];
    for (const [n, user] of users.slice(2, 5).entries()) { await as(db, user); await call(db, `public.leave_squad_v1($1::uuid, $2::uuid)`, [made.squad.id, user]); codes.push((await create(db, user, `Theirs ${n}`, 10 + n)).squad.code); }
    await as(db, me);
    assert.equal((await join(db, me, codes[0])).status, 'saved'); assert.equal((await join(db, me, codes[1])).status, 'saved');
    assert.equal((await join(db, me, codes[2])).status, 'limit', 'three squads at most, counting your own');
    await call(db, `public.leave_squad_v1($1::uuid, $2::uuid)`, [made.squad.id, me]);
    assert.equal((await create(db, me, 'Fresh start', 3)).status, 'saved', 'leaving your squad lets you start another');
    await assert.rejects(create(db, me, ' spaced', 7), /Invalid squad name/);
  }));
  test('SQL squads: owners remove members; leaving passes ownership on and an empty squad ends', () => withDb(async db => {
    const made = await create(db, me), id = made.squad.id;
    await as(db, friend); await join(db, friend, made.squad.code);
    assert.equal((await call(db, 'public.remove_squad_member_v1($1::uuid, $2::uuid, $3::uuid)', [id, me, friend])).status, 'not_owner');
    await as(db, me);
    assert.equal((await call(db, 'public.remove_squad_member_v1($1::uuid, $2::uuid, $3::uuid)', [id, friend, me])).status, 'saved');
    await as(db, friend); assert.deepEqual(await list(db, friend), []);
    await join(db, friend, made.squad.code);
    await as(db, me); await call(db, 'public.leave_squad_v1($1::uuid, $2::uuid)', [id, me]);
    await as(db, friend);
    const left = await list(db, friend);
    assert.equal(left[0].ownerIsYou, true); assert.equal(left[0].members.length, 1);
    await call(db, 'public.leave_squad_v1($1::uuid, $2::uuid)', [id, friend]);
    await as(db, me); assert.equal((await join(db, me, made.squad.code)).status, 'not_found', 'an empty squad is gone');
  }));
  test('SQL squads: strangers, anon and direct reads are refused', () => withDb(async db => {
    await create(db, me);
    await as(db, friend);
    assert.deepEqual(await list(db, friend), [], 'non-members see nothing');
    await assert.rejects(list(db, me), /Account changed/);
    await assert.rejects(db.query('select * from liferpg_squad_private.squads'), /permission denied/);
    await db.exec('set role anon');
    await assert.rejects(list(db, friend), /permission denied/);
  }));
}

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  test('SQL squad extras: only the owner renames, sets a goal or gets a new code', async () => {
    const db = new PGlite();
    try {
      await db.exec(fs.readFileSync(path.join(root, 'tests/sql/progression-bootstrap.sql'), 'utf8'));
      await db.exec(`alter table public.activity_sessions add column if not exists client_session_id uuid; insert into auth.users(id) values('${me}'),('${friend}');`);
      await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261018120000_study_plan.sql'), 'utf8'));
      await db.exec(migration);
      await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261018140000_study_squads.sql').replace('20261018140000_study_squads', '20261018160000_study_extras'), 'utf8'));
      await db.exec(`set role authenticated;set request.jwt.claim.sub='${me}'`);
      const q = async (sql, args) => (await db.query(`select ${sql} as r`, args)).rows[0].r;
      const made = await q(`public.create_squad_v1($1::uuid,'Crew',$2::uuid,now())`, [rid(1), me]);
      assert.equal(made.squad.goalMinutes, null);
      const updated = await q(`public.update_squad_v1($1::uuid,'Calc crew',600,$2::uuid,now())`, [made.squad.id, me]);
      assert.equal(updated.squad.name, 'Calc crew'); assert.equal(updated.squad.goalMinutes, 600);
      await assert.rejects(q(`public.update_squad_v1($1::uuid,'Crew',30,$2::uuid,now())`, [made.squad.id, me]), /Invalid squad settings/);
      const fresh = await q(`public.new_squad_code_v1($1::uuid,$2::uuid,now())`, [made.squad.id, me]);
      assert.notEqual(fresh.squad.code, made.squad.code);
      await db.exec(`set request.jwt.claim.sub='${friend}'`);
      assert.equal((await q(`public.join_squad_v1($1,$2::uuid,now())`, [made.squad.code, friend])).status, 'not_found', 'the old code stops working');
      await q(`public.join_squad_v1($1,$2::uuid,now())`, [fresh.squad.code, friend]);
      assert.equal((await q(`public.update_squad_v1($1::uuid,'Mine',null,$2::uuid,now())`, [made.squad.id, friend])).status, 'not_owner');
      assert.equal((await q(`public.new_squad_code_v1($1::uuid,$2::uuid,now())`, [made.squad.id, friend])).status, 'not_owner');
    } finally { await db.close(); }
  });
}
