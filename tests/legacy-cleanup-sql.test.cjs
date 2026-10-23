// Old level-system leftovers: today's category names, Grooming & Vitality
// folded into Wellbeing with nothing lost, today's seven categories for new
// accounts, and the old class title no longer saved.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261023130000_legacy_category_cleanup.sql'), 'utf8');

test('the cleanup keeps every session and keeps older app versions working', () => {
  assert.match(sql, /complete_onboarding\(p_username text, p_avatar text, p_class_title text, p_daily_goal_minutes integer\)/, 'same signature for older app versions');
  assert.doesNotMatch(sql.slice(sql.indexOf('create or replace function public.complete_onboarding')), /class_title =/, 'the class title is no longer saved');
  assert.match(sql, /alter column class_title drop not null, alter column class_title drop default/);
  assert.doesNotMatch(sql, /drop column|delete from public\.activity_sessions|delete from public\.tasks/i, 'no column or session is removed');
  for (const name of ['Everyday focus', 'Learning', 'Revision', 'Work & projects', 'Creativity', 'Everyday life', 'Wellbeing'])
    assert.ok(sql.includes(`(new.id, '${name}', 1, 0,`), `new accounts get ${name}`);
  assert.doesNotMatch(sql.slice(sql.indexOf('create or replace function public.handle_new_user')), /Grooming|Knowledge|Fitness/);
});

test('the app no longer reads or sends the class title', () => {
  const user = fs.readFileSync(path.join(root, 'src/context/UserContext.tsx'), 'utf8');
  assert.doesNotMatch(user, /"id, username, avatar, class_title/);
  assert.doesNotMatch(user, /class_title: classTitle/);
  const onboarding = fs.readFileSync(path.join(root, 'src/services/onboardingService.ts'), 'utf8');
  assert.match(onboarding, /p_class_title: null/);
  const cache = fs.readFileSync(path.join(root, 'src/services/localAccountCache.ts'), 'utf8');
  assert.match(cache, /value\.class_title != null && !bounded\(value\.class_title, 100\)/, 'older saved copies with a title still open offline');
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
  test('SQL: old categories get today\'s names and Grooming & Vitality joins Wellbeing with its XP and sessions', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create schema auth; create schema liferpg_routine_private; create schema liferpg_study_private; create schema liferpg_session_private;
        create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
        create role authenticated; create role anon;
        create table public.profiles(id uuid primary key, username text, avatar text, class_title text not null default 'Novice Scholar 📚', daily_goal_minutes int, timezone text, username_claimed boolean default false);
        create table public.subjects(id serial primary key, user_id uuid, title text, level int default 1, current_xp int default 0, color_code text, xp_bank_seconds int default 0, unique(user_id, title));
        create table public.activity_sessions(id serial primary key, user_id uuid, subject_id int references public.subjects(id) on delete set null, duration_seconds int);
        create table public.tasks(id serial primary key, user_id uuid, subject_id int references public.subjects(id) on delete set null);
        create table liferpg_routine_private.routines(id serial primary key, owner_id uuid, focus_area_id int);
        create table liferpg_study_private.courses(id serial primary key, owner_id uuid, focus_area_id int);
        create table liferpg_session_private.start_requests(id serial primary key, user_id uuid, subject_id int);
        insert into public.profiles(id, username) values ('${a}', 'A'), ('${b}', 'B');
        insert into public.subjects(user_id, title, level, current_xp, xp_bank_seconds) values
          ('${a}', 'Knowledge', 2, 8, 0), ('${a}', 'General', 2, 24, 0), ('${a}', 'Life Admin', 1, 5, 0),
          ('${a}', 'Fitness & Health', 1, 40, 30), ('${a}', 'Grooming & Vitality', 2, 20, 45), ('${a}', 'Creativity', 1, 0, 0),
          ('${b}', 'Grooming & Vitality', 1, 3, 0), ('${b}', 'Learning', 1, 0, 0), ('${b}', 'Knowledge', 1, 9, 0);`);
      const id = async (user, title) => (await db.query('select id from public.subjects where user_id = $1 and title = $2', [user, title])).rows[0]?.id;
      const grooming = await id(a, 'Grooming & Vitality');
      await db.exec(`insert into public.activity_sessions(user_id, subject_id, duration_seconds) values ('${a}', ${grooming}, 600), ('${a}', ${grooming}, 300);
        insert into public.tasks(user_id, subject_id) values ('${a}', ${grooming});
        insert into liferpg_routine_private.routines(owner_id, focus_area_id) values ('${a}', ${grooming});
        insert into liferpg_study_private.courses(owner_id, focus_area_id) values ('${a}', ${grooming});`);
      await db.exec(sql);
      const titles = async user => (await db.query('select title from public.subjects where user_id = $1 order by title', [user])).rows.map(r => r.title);
      assert.deepEqual(await titles(a), ['Creativity', 'Everyday focus', 'Everyday life', 'Learning', 'Wellbeing'], 'one Wellbeing, today\'s names');
      const wellbeing = (await db.query(`select * from public.subjects where user_id = $1 and title = 'Wellbeing'`, [a])).rows[0];
      // Totals: Fitness 0+40 XP and 30 s, Grooming 50+20 XP and 45 s -> 110 XP + 1 minute from 75 s = 111 XP, 15 s left.
      // Levels: 50 to reach 2, 100 more to reach 3 -> level 2 with 61 XP.
      assert.equal(wellbeing.level, 2); assert.equal(wellbeing.current_xp, 61); assert.equal(wellbeing.xp_bank_seconds, 15);
      const moved = async q => (await db.query(q)).rows[0].n;
      assert.equal(await moved(`select count(*)::int n from public.activity_sessions where subject_id = ${wellbeing.id}`), 2, 'every session kept, now under Wellbeing');
      assert.equal(await moved(`select count(*)::int n from public.tasks where subject_id = ${wellbeing.id}`), 1);
      assert.equal(await moved(`select count(*)::int n from liferpg_routine_private.routines where focus_area_id = ${wellbeing.id}`), 1);
      assert.equal(await moved(`select count(*)::int n from liferpg_study_private.courses where focus_area_id = ${wellbeing.id}`), 1);
      assert.equal(await moved(`select coalesce(sum(duration_seconds), 0)::int n from public.activity_sessions`), 900, 'no time lost');
      // B had Grooming but no Wellbeing (renamed), and both Learning and Knowledge (merged, XP kept).
      assert.deepEqual(await titles(b), ['Learning', 'Wellbeing']);
      const learning = (await db.query(`select level, current_xp from public.subjects where user_id = $1 and title = 'Learning'`, [b])).rows[0];
      assert.deepEqual(learning, { level: 1, current_xp: 9 });
      // New accounts get today's seven.
      await db.exec(`create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
        create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
        insert into auth.users values ('33333333-3333-4333-8333-333333333333', '{"full_name":"New Person"}');`);
      assert.deepEqual(await titles('33333333-3333-4333-8333-333333333333'), ['Creativity', 'Everyday focus', 'Everyday life', 'Learning', 'Revision', 'Wellbeing', 'Work & projects']);
      assert.equal((await db.query(`select class_title from public.profiles where id = '33333333-3333-4333-8333-333333333333'`)).rows[0].class_title, null, 'no class title for new people');
    } finally { await db.close(); }
  });
}
