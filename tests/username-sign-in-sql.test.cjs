const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261021190000_usernames_and_sign_in.sql'), 'utf8');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';

test('username SQL keeps emails private, is rate-limited and never drops anything', () => {
  assert.doesNotMatch(migration, /\bdrop\s+(table|column|function|schema|index|constraint)/i, 'nothing is removed');
  assert.match(migration, /revoke all on schema liferpg_auth_private from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.username_available_v1\(text\) from public, anon/);
  assert.match(migration, /grant execute on function public\.username_sign_in_email_v1\(text, text\) to anon, authenticated/);
  assert.equal((migration.match(/security definer set search_path = ''/g) || []).length, 2, 'new functions pin an empty search path');
  assert.match(migration, /extensions\.crypt\(p_password, v_hash\) = v_hash/, 'the password is checked before any email is returned');
  assert.match(migration, />= 10/); assert.match(migration, />= 30/);
  assert.match(migration, /perform extensions\.crypt\(p_password, '\$2a\$10\$/, 'an unknown name takes as long as a real one');
});

let pglite = null;
if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const contrib = path.join(moduleRoot, 'dist', 'contrib', 'pgcrypto.cjs');
  if (fs.existsSync(contrib)) pglite = { PGlite: require(moduleRoot).PGlite, pgcrypto: require(contrib).pgcrypto };
}

if (pglite) {
  const bootstrap = `
    create role anon; create role authenticated;
    create schema extensions; create extension pgcrypto schema extensions;
    create schema auth;
    create table auth.users(id uuid primary key, email text, encrypted_password text, banned_until timestamptz,
      deleted_at timestamptz, email_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,
      username text not null default 'Hero', avatar text not null default '🧙‍♂️', class_title text not null default 'Novice',
      onboarding_completed boolean not null default false, daily_goal_minutes integer not null default 60,
      timezone text not null default 'Asia/Kuala_Lumpur');
    alter table public.profiles enable row level security;
    create policy own_select on public.profiles for select to authenticated using (auth.uid() = id);
    create policy own_update on public.profiles for update to authenticated using (auth.uid() = id);
    grant select on public.profiles to authenticated;
    grant update (username, avatar, class_title) on public.profiles to authenticated;
    create table public.subjects(id bigint generated always as identity primary key, user_id uuid not null, title text not null,
      level integer not null default 1, current_xp integer not null default 0, color_code text);
    create function public.handle_new_user() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();`;
  async function withDb(fn) {
    const db = new pglite.PGlite({ extensions: { pgcrypto: pglite.pgcrypto } });
    try {
      await db.exec(bootstrap);
      // An account that already finished the intro before this change.
      await db.exec(`insert into auth.users(id,email,encrypted_password) values('${A}','a@example.com',extensions.crypt('right password', extensions.gen_salt('bf', 4)));
        update public.profiles set username = 'Soon Teck', onboarding_completed = true where id = '${A}';`);
      await db.exec(`insert into public.profiles(id, username, onboarding_completed) select '${A}', 'Soon Teck', true where not exists (select 1 from public.profiles where id='${A}');`);
      await db.exec(migration);
      await fn(db);
    } finally { await db.close(); }
  }
  const as = async (db, who) => db.exec(who ? `reset role; set role authenticated; set request.jwt.claim.sub='${who}'` : `reset role; set role anon; set request.jwt.claim.sub=''`);
  const signIn = async (db, name, password, client = '10.0.0.1') => {
    await db.exec(`set request.headers = '${JSON.stringify({ 'cf-connecting-ip': client })}'`);
    return (await db.query('select public.username_sign_in_email_v1($1, $2) as email', [name, password])).rows[0].email;
  };
  const failsWith = async (promise, pattern) => { try { await promise; } catch (error) { assert.match(String(error.message ?? error), pattern); return; } assert.fail('expected an error'); };

  test('SQL usernames: sign-ups never collide, and a name is claimed only when chosen', () => withDb(async db => {
    const existing = (await db.query(`select username, username_claimed, username_key from public.profiles where id = $1`, [A])).rows[0];
    assert.deepEqual(existing, { username: 'Soon Teck', username_claimed: true, username_key: 'soon teck' }, 'finished accounts keep their name, now claimed');
    await db.exec(`insert into auth.users(id,email,encrypted_password) values('${B}','b@example.com',extensions.crypt('b password', extensions.gen_salt('bf', 4)));
      insert into auth.users(id,email,raw_user_meta_data) values('${C}','c@example.com','{"full_name":"  Ali@Home   Very  Long Google Name  "}');`);
    const fresh = (await db.query(`select id, username, username_claimed from public.profiles where id in ($1,$2) order by id`, [B, C])).rows;
    assert.deepEqual(fresh.map(row => row.username_claimed), [false, false], 'placeholders are not claimed');
    assert.equal(fresh[0].username, 'Hero');
    assert.equal(fresh[1].username, 'AliHome Very Lo', 'a Google name loses "@", extra spaces, and fits 15 characters');
    assert.equal((await db.query(`select count(*)::int as n from public.subjects where user_id = $1`, [B])).rows[0].n, 5, 'the five starting categories are still created');
    await db.exec(`insert into auth.users(id,email) values('44444444-4444-4444-8444-444444444444','d@example.com')`);
    assert.equal((await db.query(`select count(*)::int as n from public.profiles where username = 'Hero'`)).rows[0].n, 2, 'two placeholder names live side by side');
  }));

  test('SQL usernames: the intro checks a name, claims it, and a taken name fails cleanly', () => withDb(async db => {
    await db.exec(`insert into auth.users(id,email) values('${B}','b@example.com')`);
    await as(db, B);
    const available = async name => (await db.query('select public.username_available_v1($1) as ok', [name])).rows[0].ok;
    assert.equal(await available('SOON   teck'), false, 'capitals and spaces do not make a new name');
    assert.equal(await available('Brand New'), true);
    assert.equal(await available('me@mail'), false, '"@" is for emails');
    assert.equal(await available(''), false); assert.equal(await available('x'.repeat(16)), false);
    await failsWith(db.query(`select public.complete_onboarding('soon teck', '🌱', 'Adventurer', 45)`), /duplicate key|unique/i);
    const saved = (await db.query(`select (public.complete_onboarding('  Brand   New ', '🌱', 'Adventurer', 45)).username as name`)).rows[0].name;
    assert.equal(saved, 'Brand New', 'spaces are tidied');
    await as(db, A);
    assert.equal(await available('soon teck'), true, 'your own name counts as free for you');
    await failsWith(db.query(`update public.profiles set username = 'brand new' where id = '${A}'`), /duplicate key|unique/i);
    await failsWith(db.query(`update public.profiles set username = 'a@b' where id = '${A}'`), /check constraint|profiles_username_shape/i);
    await as(db, null);
    await failsWith(db.query(`select public.username_available_v1('anything')`), /permission denied/i);
  }));

  test('SQL usernames: signing in returns the email only for the right password', () => withDb(async db => {
    await db.exec(`insert into auth.users(id,email,encrypted_password) values('${B}','b@example.com',extensions.crypt('b password', extensions.gen_salt('bf', 4)))`);
    await as(db, null);
    assert.equal(await signIn(db, '  SOON   TECK ', 'right password'), 'a@example.com');
    assert.equal(await signIn(db, 'Soon Teck', 'wrong password'), null);
    assert.equal(await signIn(db, 'Nobody Here', 'right password'), null);
    assert.equal(await signIn(db, 'Hero', 'b password'), null, 'an unclaimed placeholder never signs anyone in');
    assert.equal(await signIn(db, 'Soon Teck', ''), null);
    await failsWith(db.query('select * from liferpg_auth_private.username_sign_in_failures'), /permission denied/i);
  }));

  test('SQL usernames: repeated wrong tries pause that name, and many from one connection pause it too', () => withDb(async db => {
    await as(db, null);
    for (let i = 0; i < 10; i++) assert.equal(await signIn(db, 'Soon Teck', `guess ${i}`, `10.0.1.${i}`), null);
    await failsWith(signIn(db, 'Soon Teck', 'right password', '10.0.9.9'), /too_many_attempts/);
    for (let i = 0; i < 30; i++) assert.equal(await signIn(db, `name ${i}`, 'guess', '10.0.2.1'), null);
    await failsWith(signIn(db, 'another name', 'guess', '10.0.2.1'), /too_many_attempts/);
    assert.equal(await signIn(db, 'another name', 'guess', '10.0.3.1'), null, 'other connections are not affected');
    await db.exec(`set request.headers = '{}'`);
    for (let i = 0; i < 35; i++) assert.equal((await db.query('select public.username_sign_in_email_v1($1, $2) as email', [`unknown ${i}`, 'guess'])).rows[0].email, null);
    assert.equal((await db.query('select public.username_sign_in_email_v1($1, $2) as email', ['Soon Teck ok', 'guess'])).rows[0].email, null,
      'unidentified connections are never lumped together, so nobody is paused for everyone');
  }));

  test('SQL usernames: a successful sign-in clears that name’s wrong tries', () => withDb(async db => {
    await as(db, null);
    for (let i = 0; i < 9; i++) await signIn(db, 'Soon Teck', `guess ${i}`, `10.0.4.${i}`);
    assert.equal(await signIn(db, 'Soon Teck', 'right password', '10.0.4.99'), 'a@example.com');
    for (let i = 0; i < 9; i++) assert.equal(await signIn(db, 'Soon Teck', `again ${i}`, `10.0.5.${i}`), null);
    assert.equal(await signIn(db, 'Soon Teck', 'right password', '10.0.5.99'), 'a@example.com', 'the count started over');
  }));
}
